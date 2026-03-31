import { createAdminClient } from "../_shared/supabase.ts";
import {
  getFortnoxClient,
  updateSyncJob,
  delay,
  corsHeaders,
} from "../_shared/sync-helpers.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const RATE_LIMIT_DELAY_MS = 100;
const CUSTOMERS_PER_BATCH = 25;
const INVOICE_PAGE_SIZE = 15;
const INVOICE_FROM_DATE = "2025-01-01";
const KPI_BATCH_SIZE = 3000;
const INVOICE_DETAIL_DELAY_MS = 50;
const CUSTOMER_DB_PAGE_SIZE = 1000;

type InvoiceSyncMode = "full" | "incomplete";

type InvoiceRowInsert = {
  invoice_number: string;
  article_number: string | null;
  article_name: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_ex_vat: number | null;
  total: number | null;
};

type InvoiceInsert = {
  document_number: string;
  customer_id: string | null;
  fortnox_customer_number: string;
  customer_name: string | null;
  invoice_date: string | null;
  due_date: string | null;
  final_pay_date: string | null;
  booked: boolean;
  total_vat: number | null;
  total_ex_vat: number | null;
  total: number | null;
  balance: number | null;
  currency_code: string;
};

function logSyncEvent(event: string, context: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: "sync-invoices",
      event,
      ...context,
    }),
  );
}

function compareCustomerNumbers(a: string, b: string): number {
  const aNumber = Number(a);
  const bNumber = Number(b);
  const aIsNumeric = !Number.isNaN(aNumber);
  const bIsNumeric = !Number.isNaN(bNumber);

  if (aIsNumeric && bIsNumeric) {
    return aNumber - bNumber;
  }

  return a.localeCompare(b);
}

function readNumberField(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (value == null) continue;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }

  return null;
}

function resolveInvoiceTotals(record: Record<string, unknown>): {
  total: number | null;
  totalVat: number | null;
  totalExVat: number | null;
} {
  const total = readNumberField(record, ["Total", "TotalToPay", "TotalAmount"]);
  const totalVat = readNumberField(record, ["TotalVAT", "TotalVat", "VatTotal", "VATTotal"]);

  const totalExVat = total != null && totalVat != null
    ? total - totalVat
    : null;

  return {
    total,
    totalVat,
    totalExVat,
  };
}

function resolveInvoiceRowExVatTotal(record: Record<string, unknown>): number | null {
  const explicitExVat = readNumberField(record, [
    "PriceExcludingVAT",
    "PriceExcludingVat",
    "RowAmountExcludingVAT",
    "RowAmountExcludingVat",
    "TotalExcludingVAT",
    "TotalExcludingVat",
    "TotalExVAT",
    "TotalExVat",
    "Net",
    "NetAmount",
    "TotalNet",
  ]);

  if (explicitExVat != null) {
    return explicitExVat;
  }

  const price = readNumberField(record, ["Price", "UnitPrice"]);
  return price;
}

function toMappedInvoice(input: {
  invoiceDetail: Record<string, unknown>;
  customerMap: Map<string, string>;
}): {
  mapped: InvoiceInsert | null;
  skipped: boolean;
  skipReason: "missing_document_number" | "missing_customer_mapping" | null;
} {
  const detail = input.invoiceDetail;
  const documentNumber =
    detail.DocumentNumber != null ? String(detail.DocumentNumber) : null;
  if (!documentNumber) {
    return {
      mapped: null,
      skipped: true,
      skipReason: "missing_document_number",
    };
  }

  const customerNumber =
    detail.CustomerNumber != null ? String(detail.CustomerNumber) : null;
  if (!customerNumber || !input.customerMap.has(customerNumber)) {
    return {
      mapped: null,
      skipped: true,
      skipReason: "missing_customer_mapping",
    };
  }

  const totals = resolveInvoiceTotals(detail);

  const mapped: InvoiceInsert = {
    document_number: documentNumber,
    customer_id: input.customerMap.get(customerNumber) ?? null,
    fortnox_customer_number: customerNumber,
    customer_name:
      detail.CustomerName != null ? String(detail.CustomerName) : null,
    invoice_date:
      detail.InvoiceDate != null ? String(detail.InvoiceDate) : null,
    due_date: detail.DueDate != null ? String(detail.DueDate) : null,
    final_pay_date:
      detail.FinalPayDate != null ? String(detail.FinalPayDate) : null,
    booked: detail.Booked != null ? Boolean(detail.Booked) : false,
    total_vat: totals.totalVat,
    total_ex_vat: totals.totalExVat,
    total: totals.total,
    balance: detail.Balance != null ? Number(detail.Balance) : null,
    currency_code: detail.Currency != null ? String(detail.Currency) : "SEK",
  };

  return { mapped, skipped: false, skipReason: null };
}

function toInvoiceRows(
  invoiceNumber: string,
  invoicePayload: Record<string, unknown> | null | undefined,
): InvoiceRowInsert[] {
  const rawRows = (invoicePayload?.InvoiceRows ?? invoicePayload?.Rows ?? []) as unknown[];
  if (!Array.isArray(rawRows)) return [];

  return rawRows
    .filter(
      (row): row is Record<string, unknown> => Boolean(row && typeof row === "object"),
    )
    .map((row) => {
      const price = readNumberField(row, ["Price", "UnitPrice"]);
      if (price === 0) {
        return null;
      }

      return {
      invoice_number: invoiceNumber,
      article_number:
        row.ArticleNumber != null
          ? String(row.ArticleNumber)
          : row.ArticleNo != null
            ? String(row.ArticleNo)
            : null,
      article_name: row.ArticleName != null ? String(row.ArticleName) : null,
      description: row.Description != null ? String(row.Description) : null,
      quantity:
        row.DeliveredQuantity != null
          ? Number(row.DeliveredQuantity)
          : row.Quantity != null
            ? Number(row.Quantity)
            : null,
      unit_price: price,
      total_ex_vat: resolveInvoiceRowExVatTotal(row),
      total: row.Total != null ? Number(row.Total) : null,
    };
    })
    .filter((row): row is InvoiceRowInsert => row !== null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  const supabase = createAdminClient();
  let jobId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    jobId = body.job_id ?? null;
    const phase: string = body.phase ?? "list";
    const offset: number = body.offset ?? 0;
    const syncMode: InvoiceSyncMode =
      body.sync_mode === "incomplete" ? "incomplete" : "full";
    const requestedStartCustomerNumber: string | null =
      body.start_customer_number != null
        ? String(body.start_customer_number)
        : null;
    const debugInvoiceNumber: string | null =
      body.debug_invoice_number != null
        ? String(body.debug_invoice_number)
        : null;

    logSyncEvent("request_received", {
      job_id: jobId,
      phase,
      offset,
      sync_mode: syncMode,
      start_customer_number: requestedStartCustomerNumber,
      debug_invoice_number: debugInvoiceNumber,
    });

    const client = await getFortnoxClient(supabase);

    if (phase === "list") {
      let listFromDate = INVOICE_FROM_DATE;
      if (syncMode === "incomplete") {
        const { data: latestCompletedInvoice } = await supabase
          .from("invoices")
          .select("invoice_date")
          .not("final_pay_date", "is", null)
          .not("due_date", "is", null)
          .not("invoice_date", "is", null)
          .order("invoice_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: earliestIncompleteInvoice } = await supabase
          .from("invoices")
          .select("invoice_date")
          .or("due_date.is.null,final_pay_date.is.null")
          .not("invoice_date", "is", null)
          .order("invoice_date", { ascending: true })
          .limit(1)
          .maybeSingle();

        const latestCompletedDate = (
          latestCompletedInvoice as unknown as {
            invoice_date: string | null;
          } | null
        )?.invoice_date;
        const earliestIncompleteDate = (
          earliestIncompleteInvoice as unknown as {
            invoice_date: string | null;
          } | null
        )?.invoice_date;

        if (earliestIncompleteDate) {
          listFromDate = earliestIncompleteDate;
        } else if (latestCompletedDate) {
          listFromDate = latestCompletedDate;
        }
      }

      logSyncEvent("list_from_date_resolved", {
        job_id: jobId,
        sync_mode: syncMode,
        list_from_date: listFromDate,
      });

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          status: "processing",
          current_step: `Fetching ${syncMode} invoices from ${listFromDate}...`,
        });
      }

      const customerMap = new Map<string, string>();

      let customerOffset = 0;
      while (true) {
        const { data: customerRows, error: customerError } = await supabase
          .from("customers")
          .select("id, fortnox_customer_number")
          .order("id", { ascending: true })
          .range(customerOffset, customerOffset + CUSTOMER_DB_PAGE_SIZE - 1);

        if (customerError) {
          throw new Error(`Failed to read customers: ${customerError.message}`);
        }

        const rows = (customerRows ?? []) as Array<{
          id: string;
          fortnox_customer_number: string | null;
        }>;

        if (rows.length === 0) {
          break;
        }

        for (const c of rows) {
          if (c.fortnox_customer_number) {
            customerMap.set(c.fortnox_customer_number, c.id);
          }
        }

        if (rows.length < CUSTOMER_DB_PAGE_SIZE) {
          break;
        }

        customerOffset += CUSTOMER_DB_PAGE_SIZE;
      }

      logSyncEvent("customer_scope_loaded", {
        job_id: jobId,
        customer_count: customerMap.size,
      });

      let prevSynced = 0;
      let prevErrors = 0;
      let prevTotal = 0;

      let jobPayload: Record<string, unknown> | null = null;
      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload")
          .eq("id", jobId)
          .maybeSingle();

        jobPayload =
          (jobRow as unknown as { payload: Record<string, unknown> } | null)
            ?.payload ?? null;
      }

      const startCustomerNumber =
        requestedStartCustomerNumber ??
        (typeof jobPayload?.start_customer_number === "string"
          ? jobPayload.start_customer_number
          : null);

      if (offset > 0) {
        prevSynced = (jobPayload?.synced as number) ?? 0;
        prevErrors = (jobPayload?.errors as number) ?? 0;
        prevTotal = (jobPayload?.total as number) ?? 0;
      }

      let synced = prevSynced;
      let errors = prevErrors;
      let totalFetched = prevTotal;
      let totalResources = 0;
      let skipped = 0;
      let firstError: string | null = null;

      const customerNumbers = Array.from(customerMap.keys()).sort(
        compareCustomerNumbers,
      );
      totalResources = customerNumbers.length;
      let currentCustomerIndex = offset;
      if (offset === 0 && startCustomerNumber) {
        const requestedIndex = customerNumbers.indexOf(startCustomerNumber);
        if (requestedIndex >= 0) {
          currentCustomerIndex = requestedIndex;
          logSyncEvent("start_customer_applied", {
            job_id: jobId,
            start_customer_number: startCustomerNumber,
            start_customer_index: requestedIndex,
          });
        } else {
          logSyncEvent("start_customer_not_found", {
            job_id: jobId,
            start_customer_number: startCustomerNumber,
          });
        }
      }
      let customersThisBatch = 0;

      while (
        currentCustomerIndex < customerNumbers.length &&
        customersThisBatch < CUSTOMERS_PER_BATCH
      ) {
        const customerNumber = customerNumbers[currentCustomerIndex];
        let customerPage = 1;
        let customerTotalPages = 1;

        do {
          const response = await client.getInvoices(
            customerPage,
            INVOICE_PAGE_SIZE,
            {
              fromDate: listFromDate,
              customerNumber,
              sortBy: "invoicedate",
            },
          );
          customerTotalPages = response.MetaInformation["@TotalPages"];
          const rawInvoices = response.Invoices ?? [];
          const invoices = rawInvoices.filter((invoice) =>
            invoice.CustomerNumber != null
              ? String(invoice.CustomerNumber) === customerNumber
              : false,
          );

          logSyncEvent("invoice_page_fetched", {
            job_id: jobId,
            sync_mode: syncMode,
            customer_number: customerNumber,
            customer_index: currentCustomerIndex + 1,
            total_customers: customerNumbers.length,
            page: customerPage,
            total_pages: customerTotalPages,
            invoice_count: invoices.length,
            invoice_count_raw: rawInvoices.length,
            total_resources: totalResources,
          });

          const invoiceNumbers = invoices
            .map((invoice) =>
              invoice.DocumentNumber != null
                ? String(invoice.DocumentNumber)
                : null,
            )
            .filter((value): value is string => Boolean(value));

          const finalizedInvoiceNumbers = new Set<string>();
          if (syncMode === "incomplete" && invoiceNumbers.length > 0) {
            const { data: existingRows } = await supabase
              .from("invoices")
              .select("document_number, due_date, final_pay_date")
              .in("document_number", invoiceNumbers as never);

            const rows = (existingRows ?? []) as Array<{
              document_number: string;
              due_date: string | null;
              final_pay_date: string | null;
            }>;
            for (const row of rows) {
              if (row.document_number && row.due_date && row.final_pay_date) {
                finalizedInvoiceNumbers.add(row.document_number);
              }
            }
          }

          if (syncMode === "incomplete") {
            logSyncEvent("incomplete_page_precheck", {
              job_id: jobId,
              customer_number: customerNumber,
              page: customerPage,
              prechecked_invoice_count: invoiceNumbers.length,
              finalized_skip_candidates: finalizedInvoiceNumbers.size,
            });
          }

          const mapped: Array<{
            document_number: string;
            customer_id: string | null;
            fortnox_customer_number: string;
            customer_name: string | null;
            invoice_date: string | null;
            due_date: string | null;
            final_pay_date: string | null;
            booked: boolean;
            total_vat: number | null;
            total_ex_vat: number | null;
            total: number | null;
            balance: number | null;
            currency_code: string;
          }> = [];
          const rowInserts: InvoiceRowInsert[] = [];
          const detailFetchedInvoiceNumbers: string[] = [];

          for (const [invoiceIndex, invoice] of invoices.entries()) {
            const documentNumber =
              invoice.DocumentNumber != null
                ? String(invoice.DocumentNumber)
                : null;
            if (!documentNumber) {
              skipped += 1;
              logSyncEvent("invoice_skipped", {
                job_id: jobId,
                customer_number: customerNumber,
                page: customerPage,
                reason: "missing_document_number_in_list",
              });
              continue;
            }

            if (
              syncMode === "incomplete" &&
              finalizedInvoiceNumbers.has(documentNumber)
            ) {
              skipped += 1;
              if (
                !debugInvoiceNumber ||
                debugInvoiceNumber === documentNumber
              ) {
                logSyncEvent("invoice_skipped", {
                  job_id: jobId,
                  customer_number: customerNumber,
                  page: customerPage,
                  document_number: documentNumber,
                  reason: "already_finalized_in_db",
                });
              }
              continue;
            }

            try {
              const invoiceResponse = await client.getInvoice(documentNumber);
              const detail = (invoiceResponse.Invoice ?? null) as Record<
                string,
                unknown
              > | null;
              const mappedResult = detail
                ? toMappedInvoice({ invoiceDetail: detail, customerMap })
                : {
                    mapped: null,
                    skipped: true,
                    skipReason: "missing_document_number" as const,
                  };

              if (detail) {
                detailFetchedInvoiceNumbers.push(documentNumber);
                rowInserts.push(...toInvoiceRows(documentNumber, detail));
              }

              if (
                debugInvoiceNumber &&
                debugInvoiceNumber === documentNumber &&
                detail
              ) {
                logSyncEvent("debug_invoice_detail", {
                  job_id: jobId,
                  customer_number: customerNumber,
                  page: customerPage,
                  document_number: documentNumber,
                  booked: detail.Booked ?? null,
                  due_date: detail.DueDate ?? null,
                  final_pay_date: detail.FinalPayDate ?? null,
                  has_net: detail.Net != null,
                  has_total_excluding_vat: detail.TotalExcludingVAT != null,
                  has_total: detail.Total != null,
                  has_total_vat: detail.TotalVAT != null,
                });
              }

              if (mappedResult.skipped || !mappedResult.mapped) {
                skipped += 1;
                if (
                  !debugInvoiceNumber ||
                  debugInvoiceNumber === documentNumber
                ) {
                  logSyncEvent("invoice_skipped", {
                    job_id: jobId,
                    customer_number: customerNumber,
                    page: customerPage,
                    document_number: documentNumber,
                    reason: mappedResult.skipReason ?? "mapping_result_null",
                  });
                }
              } else {
                mapped.push(mappedResult.mapped);
                if (
                  !debugInvoiceNumber ||
                  debugInvoiceNumber === documentNumber
                ) {
                  logSyncEvent("invoice_mapped", {
                    job_id: jobId,
                    customer_number: customerNumber,
                    page: customerPage,
                    document_number: documentNumber,
                    booked: mappedResult.mapped.booked,
                    due_date: mappedResult.mapped.due_date,
                    final_pay_date: mappedResult.mapped.final_pay_date,
                    total_ex_vat: mappedResult.mapped.total_ex_vat,
                    total: mappedResult.mapped.total,
                  });
                }
              }
            } catch (detailError) {
              if (!firstError) {
                firstError =
                  detailError instanceof Error
                    ? detailError.message
                    : "Invoice detail fetch failed";
              }
              errors += 1;
              logSyncEvent("invoice_detail_fetch_error", {
                job_id: jobId,
                customer_number: customerNumber,
                page: customerPage,
                document_number: documentNumber,
                error:
                  detailError instanceof Error
                    ? detailError.message
                    : "Invoice detail fetch failed",
              });
            }

            if (invoiceIndex < invoices.length - 1) {
              await delay(INVOICE_DETAIL_DELAY_MS);
            }
          }

          if (mapped.length > 0) {
            const { error: upsertError } = await supabase
              .from("invoices")
              .upsert(mapped as never, { onConflict: "document_number" });

            if (upsertError) {
              console.error(
                "Invoice upsert error:",
                upsertError.message,
                upsertError.details,
              );
              if (!firstError) firstError = upsertError.message;
              errors += invoices.length;
              logSyncEvent("invoice_upsert_error", {
                job_id: jobId,
                customer_number: customerNumber,
                page: customerPage,
                upsert_count: mapped.length,
                error: upsertError.message,
              });
            } else {
              synced += mapped.length;
              logSyncEvent("invoice_upsert_success", {
                job_id: jobId,
                customer_number: customerNumber,
                page: customerPage,
                upsert_count: mapped.length,
                synced_total: synced,
              });
            }
          }

          if (detailFetchedInvoiceNumbers.length > 0) {
            const uniqueInvoiceNumbers = Array.from(
              new Set(detailFetchedInvoiceNumbers),
            );
            const { error: deleteRowsError } = await supabase
              .from("invoice_rows")
              .delete()
              .in("invoice_number", uniqueInvoiceNumbers as never);

            if (deleteRowsError) {
              if (!firstError) firstError = deleteRowsError.message;
              errors += uniqueInvoiceNumbers.length;
              logSyncEvent("invoice_rows_delete_error", {
                job_id: jobId,
                customer_number: customerNumber,
                page: customerPage,
                invoice_count: uniqueInvoiceNumbers.length,
                error: deleteRowsError.message,
              });
            } else if (rowInserts.length > 0) {
              const { error: insertRowsError } = await supabase
                .from("invoice_rows")
                .insert(rowInserts as never);

              if (insertRowsError) {
                if (!firstError) firstError = insertRowsError.message;
                errors += rowInserts.length;
                logSyncEvent("invoice_rows_insert_error", {
                  job_id: jobId,
                  customer_number: customerNumber,
                  page: customerPage,
                  row_count: rowInserts.length,
                  error: insertRowsError.message,
                });
              } else {
                logSyncEvent("invoice_rows_insert_success", {
                  job_id: jobId,
                  customer_number: customerNumber,
                  page: customerPage,
                  row_count: rowInserts.length,
                });
              }
            }
          }

          totalFetched += invoices.length;

          if (customerPage < customerTotalPages) {
            await delay(RATE_LIMIT_DELAY_MS);
          }

          customerPage++;
        } while (customerPage <= customerTotalPages);

        customersThisBatch += 1;
        currentCustomerIndex += 1;

        if (
          currentCustomerIndex < customerNumbers.length &&
          customersThisBatch < CUSTOMERS_PER_BATCH
        ) {
          await delay(RATE_LIMIT_DELAY_MS);
        }
      }

      const morePages = currentCustomerIndex < customerNumbers.length;

      if (jobId) {
        const updatePayload: Record<string, unknown> = {
          step_name: "invoices",
          step_label: "Invoices",
          sync_mode: syncMode,
          start_customer_number: startCustomerNumber,
          synced,
          errors,
          skipped,
          total: totalFetched,
        };
        if (firstError) updatePayload.upsert_error = firstError;

        if (morePages) {
          await updateSyncJob(supabase, jobId, {
            current_step: `Syncing invoices (customers ${currentCustomerIndex}/${customerNumbers.length}, ${synced} saved, ${skipped} skipped)...`,
            total_items: customerNumbers.length,
            processed_items: currentCustomerIndex,
            progress:
              customerNumbers.length > 0
                ? Math.round(
                    (currentCustomerIndex / customerNumbers.length) * 80,
                  )
                : 80,
            payload: updatePayload,
            batch_phase: "list",
            batch_offset: currentCustomerIndex,
            dispatch_lock: false,
          });
        } else {
          await updateSyncJob(supabase, jobId, {
            total_items: totalFetched,
            processed_items: totalFetched,
            progress: 90,
            current_step:
              errors > 0
                ? `Synced with ${errors} errors (${skipped} skipped), computing KPIs...`
                : `${synced} invoices saved (${skipped} skipped), computing KPIs...`,
            payload: updatePayload,
            batch_phase: "finalize",
            batch_offset: 0,
            dispatch_lock: false,
          });
        }
      }

      logSyncEvent("list_phase_completed", {
        job_id: jobId,
        sync_mode: syncMode,
        synced,
        errors,
        skipped,
        total_fetched: totalFetched,
        more_pages: morePages,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          phase: "list",
          morePages,
          synced,
          errors,
          skipped,
        }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
      );
    }

    if (phase === "finalize") {
      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          current_step: "Computing invoice KPIs...",
          progress: 92,
        });
      }

      const turnoverByCustomer = new Map<
        string,
        { turnover: number; count: number }
      >();
      let offset = 0;

      while (true) {
        const { data: kpiRows, error: kpiError } = await supabase
          .from("invoices")
          .select("fortnox_customer_number, total_ex_vat")
          .range(offset, offset + KPI_BATCH_SIZE - 1);

        if (kpiError) {
          throw new Error(`Failed to fetch invoice KPIs: ${kpiError.message}`);
        }

        const rows = (kpiRows ?? []) as Array<{
          fortnox_customer_number: string | null;
          total_ex_vat: number | null;
        }>;
        if (rows.length === 0) break;

        for (const row of rows) {
          if (!row.fortnox_customer_number) continue;
          const existing = turnoverByCustomer.get(
            row.fortnox_customer_number,
          ) ?? { turnover: 0, count: 0 };
          existing.turnover += Number(row.total_ex_vat ?? 0);
          existing.count += 1;
          turnoverByCustomer.set(row.fortnox_customer_number, existing);
        }

        if (rows.length < KPI_BATCH_SIZE) break;
        offset += KPI_BATCH_SIZE;
      }

      for (const [customerNumber, kpi] of turnoverByCustomer) {
        await supabase
          .from("customers")
          .update({
            total_turnover: kpi.turnover,
            invoice_count: kpi.count,
          } as never)
          .eq("fortnox_customer_number", customerNumber as never);
      }

      let finalSynced = 0;
      let finalErrors = 0;
      let finalTotal = 0;

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single();

        const payload = (
          jobRow as unknown as { payload: Record<string, unknown> } | null
        )?.payload;
        finalSynced = (payload?.synced as number) ?? 0;
        finalErrors = (payload?.errors as number) ?? 0;
        finalTotal =
          (jobRow as unknown as { total_items: number } | null)?.total_items ??
          0;

        await updateSyncJob(supabase, jobId, {
          status: "completed",
          progress: 100,
          current_step: "Done",
          processed_items: finalTotal,
          payload: {
            step_name: "invoices",
            step_label: "Invoices",
            sync_mode: syncMode,
            synced: finalSynced,
            errors: finalErrors,
            total: finalTotal,
          },
          batch_phase: null,
          dispatch_lock: false,
        });
      }

      logSyncEvent("finalize_phase_completed", {
        job_id: jobId,
        sync_mode: syncMode,
        synced: finalSynced,
        errors: finalErrors,
        total: finalTotal,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          done: true,
          synced: finalSynced,
          errors: finalErrors,
          total: finalTotal,
        }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: `Unknown phase: ${phase}` }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logSyncEvent("sync_error", {
      job_id: jobId,
      error: message,
    });

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "failed",
        error_message: message,
        dispatch_lock: false,
        batch_phase: null,
      });
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
