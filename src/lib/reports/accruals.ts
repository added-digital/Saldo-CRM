export function annualizeContractTotal(
  total: number | null,
  period: string | null,
): number {
  const base = Number(total ?? 0);
  const periodNumber = Number(period ?? "");

  if (periodNumber === 1) return base * 12;
  if (periodNumber === 3) return base * 4;
  return base;
}
