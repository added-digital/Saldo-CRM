import type {
  InvoiceDetailRow,
  InvoiceDetailSource,
  RollingMonth,
  TurnoverMonthRow,
} from "./types";

export function invoiceTurnoverStrictExVat(input: {
  total_ex_vat: number | null;
}): { amount: number | null; fromTotal: boolean } {
  if (input.total_ex_vat != null) {
    return { amount: Number(input.total_ex_vat), fromTotal: false };
  }

  return { amount: null, fromTotal: false };
}

export function mapInvoicesToDetailRows(
  invoices: InvoiceDetailSource[],
  options?: { fallbackDocumentNumber?: string; includeDueDate?: boolean },
): InvoiceDetailRow[] {
  const fallbackDocumentNumber = options?.fallbackDocumentNumber ?? "-";
  const includeDueDate = options?.includeDueDate ?? false;

  return invoices.map((invoice) => {
    const turnover = invoiceTurnoverStrictExVat(invoice);
    return {
      id: invoice.id,
      documentNumber: invoice.document_number ?? fallbackDocumentNumber,
      invoiceDate: invoice.invoice_date,
      dueDate: includeDueDate ? invoice.due_date ?? null : null,
      turnover: turnover.amount,
      turnoverFromTotal: turnover.fromTotal,
      currencyCode: invoice.currency_code ?? "SEK",
    };
  });
}

export function createEmptyTurnoverRows(
  months: RollingMonth[],
): TurnoverMonthRow[] {
  return months.map((month) => ({
    monthKey: month.key,
    monthLabel: `${month.label} ${String(month.year).slice(-2)}`,
    turnover: 0,
    invoiceCount: 0,
  }));
}
