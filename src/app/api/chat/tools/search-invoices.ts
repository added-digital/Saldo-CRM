import { mapInvoicesToDetailRows } from "@/lib/reports";

import type { ToolHandler } from "./types";

export type SearchInvoicesInput = {
  customer_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  limit?: number;
};

/**
 * Returns invoices matching the given filters, with turnover normalised the
 * same way the reports page computes it (strict ex-VAT via
 * invoiceTurnoverStrictExVat). Sorted newest first. The default limit is 25
 * to keep the tool result compact for Claude.
 */
export const searchInvoices: ToolHandler<SearchInvoicesInput> = async (
  input,
  { supabase },
) => {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 1000);

  let query = supabase
    .from("invoices")
    .select(
      "id, document_number, customer_id, customer_name, invoice_date, " +
        "final_pay_date, total_ex_vat, total, currency_code",
    )
    .order("invoice_date", { ascending: false })
    .limit(limit);

  if (input.customer_id) {
    query = query.eq("customer_id", input.customer_id);
  }
  if (input.date_from) {
    query = query.gte("invoice_date", input.date_from);
  }
  if (input.date_to) {
    query = query.lte("invoice_date", input.date_to);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message, invoices: [] };
  }

  type InvoiceRow = {
    id: string;
    document_number: string | null;
    invoice_date: string | null;
    final_pay_date: string | null;
    total_ex_vat: number | null;
    total: number | null;
    currency_code: string;
  };
  const rawRows = (data ?? []) as unknown as InvoiceRow[];
  const rows = rawRows.map((row) => ({
    id: row.id,
    document_number: row.document_number ?? null,
    invoice_date: row.invoice_date,
    due_date: row.final_pay_date ?? null,
    total_ex_vat: row.total_ex_vat,
    total: row.total,
    currency_code: row.currency_code,
  }));

  const normalised = mapInvoicesToDetailRows(rows, {
    fallbackDocumentNumber: "-",
    includeDueDate: true,
  });

  return {
    filters: {
      customer_id: input.customer_id ?? null,
      date_from: input.date_from ?? null,
      date_to: input.date_to ?? null,
      limit,
    },
    count: normalised.length,
    invoices: normalised,
  };
};
