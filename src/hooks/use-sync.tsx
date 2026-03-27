"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

type SyncStep =
  | "customers"
  | "employees"
  | "invoices"
  | "invoice-rows"
  | "articles"
  | "time-reports"
  | "contracts"
  | "generate-kpis"

type InvoiceSyncMode = "full" | "incomplete"

interface StartSyncOptions {
  invoiceSyncMode?: InvoiceSyncMode
}

const SYNC_STEPS: SyncStep[] = [
  "customers",
  "employees",
  "invoices",
  "invoice-rows",
  "articles",
  "time-reports",
  "contracts",
  "generate-kpis",
]

const STEP_LABELS: Record<SyncStep, string> = {
  customers: "Customers",
  employees: "Employees",
  invoices: "Invoices",
  "invoice-rows": "Invoice Rows",
  articles: "Articles",
  "time-reports": "Time Reports",
  contracts: "Contracts",
  "generate-kpis": "Generate KPIs",
}

const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000

interface SyncContextValue {
  syncing: boolean
  startSync: (steps: SyncStep[], options?: StartSyncOptions) => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

function SyncProvider({ children }: { children: ReactNode }) {
  const [syncing, setSyncing] = useState(false)

  const cleanUpStaleJobs = useCallback(async () => {
    const supabase = createClient()
    const cutoff = new Date(Date.now() - STALE_JOB_TIMEOUT_MS).toISOString()

    await supabase
      .from("sync_jobs")
      .update({
        status: "failed",
        error_message: "Job timed out (stale)",
        dispatch_lock: false,
        batch_phase: null,
      } as never)
      .in("status", ["pending", "processing"] as never)
      .lt("updated_at", cutoff as never)
  }, [])

  useEffect(() => {
    cleanUpStaleJobs()
  }, [cleanUpStaleJobs])

  const startSync = useCallback(
    async (steps: SyncStep[], options?: StartSyncOptions) => {
      if (syncing) return
      setSyncing(true)

      const supabase = createClient()

      try {
        for (const step of steps) {
          const label = STEP_LABELS[step]
          const payload: Record<string, unknown> = {
            step_name: step,
            step_label: label,
          }

          if (step === "invoices" && options?.invoiceSyncMode) {
            payload.sync_mode = options.invoiceSyncMode
          }

          const { error: insertError } = await supabase
            .from("sync_jobs")
            .insert({
              status: "pending",
              progress: 0,
              current_step: `Waiting for ${label}...`,
              total_items: 0,
              processed_items: 0,
              step_name: step,
              batch_phase: "list",
              batch_offset: 0,
              dispatch_lock: false,
              payload,
            } as never)

          if (insertError) {
            toast.error(`Failed to create ${label} sync job`)
          } else {
            toast.success(`${label} sync started`)
          }
        }
      } catch {
        toast.error("Failed to start sync")
      }

      setSyncing(false)
    },
    [syncing]
  )

  return (
    <SyncContext.Provider value={{ syncing, startSync }}>
      {children}
    </SyncContext.Provider>
  )
}

function useSync() {
  const context = useContext(SyncContext)
  if (!context) {
    throw new Error("useSync must be used within a SyncProvider")
  }
  return context
}

export { SyncProvider, useSync, SYNC_STEPS, STEP_LABELS }
export type { SyncStep, InvoiceSyncMode, StartSyncOptions }
