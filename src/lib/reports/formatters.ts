export const SWEDISH_MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Maj",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec",
] as const;

export const sekFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

export const hoursFormatter = new Intl.NumberFormat("sv-SE", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

export function formatSwedishMonthShort(date: Date): string {
  return SWEDISH_MONTH_SHORT[date.getMonth()] ?? "";
}

export function formatSwedishMonthYear(date: Date): string {
  return `${formatSwedishMonthShort(date)} ${date.getFullYear()}`;
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function getInitials(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "--";

  const parts = normalized.split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) return "--";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function toPossessive(name: string): string {
  const normalized = name.trim();
  if (!normalized) return "";
  const suffix = normalized.endsWith("s") ? "'" : "'s";
  return `${normalized}${suffix}`;
}

export function toPossessiveLabel(name: string): string {
  const possessive = toPossessive(name);
  if (!possessive) return "All customers";
  return `${possessive} customers`;
}

export function prefixFilterScore(value: string, search: string): number {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return 1;
  return normalizedValue.startsWith(normalizedSearch) ? 1 : 0;
}

export function getNiceStep(roughStep: number): number {
  if (!Number.isFinite(roughStep) || roughStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;

  if (residual <= 1) return magnitude;
  if (residual <= 2) return 2 * magnitude;
  if (residual <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export function getRoundedChartMax(dataMax: number): number {
  if (!Number.isFinite(dataMax) || dataMax <= 0) {
    return 1;
  }

  const targetSegments = 5;
  const step = getNiceStep(dataMax / targetSegments);
  const highestCoveredLine = Math.ceil(dataMax / step);
  return Math.max(step * 2, (highestCoveredLine + 1) * step);
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
