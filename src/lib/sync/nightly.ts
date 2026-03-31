import type { NextRequest } from "next/server"

type NightlySyncStep =
  | "customers"
  | "invoices"
  | "time-reports"
  | "contracts"
  | "articles"
  | "generate-kpis"

const NIGHTLY_SYNC_STEPS: NightlySyncStep[] = [
  "customers",
  "invoices",
  "time-reports",
  "contracts",
  "articles",
  "generate-kpis",
]

const STEP_LABELS: Record<NightlySyncStep, string> = {
  customers: "Customers",
  invoices: "Invoices",
  "time-reports": "Time Reports",
  contracts: "Contracts",
  articles: "Articles",
  "generate-kpis": "Generate KPIs",
}

function getStockholmClock(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const year = parts.find((part) => part.type === "year")?.value ?? "0000"
  const month = parts.find((part) => part.type === "month")?.value ?? "01"
  const day = parts.find((part) => part.type === "day")?.value ?? "01"
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0")

  return {
    date: `${year}-${month}-${day}`,
    hour,
  }
}

function getNightlyChainId(now: Date): string {
  const stockholm = getStockholmClock(now)
  return `nightly-sync-${stockholm.date}`
}

function shouldStartNightlyChain(now: Date): boolean {
  const stockholm = getStockholmClock(now)
  return stockholm.hour >= 1
}

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return process.env.NODE_ENV !== "production"
  }

  return request.headers.get("authorization") === `Bearer ${secret}`
}

export {
  NIGHTLY_SYNC_STEPS,
  STEP_LABELS,
  getNightlyChainId,
  shouldStartNightlyChain,
  isCronAuthorized,
}

export type { NightlySyncStep }
