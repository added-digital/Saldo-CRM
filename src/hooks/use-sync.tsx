"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import { createClient } from "@/lib/supabase/client"
import type { SyncJob } from "@/types/database"
import { toast } from "sonner"

type SyncStep = "customers" | "employees" | "invoices" | "time-reports" | "contracts"

const SYNC_STEPS: SyncStep[] = [
  "customers",
  "employees",
  "invoices",
  "time-reports",
  "contracts",
]

const STEP_LABELS: Record<SyncStep, string> = {
  customers: "Customers",
  employees: "Employees",
  invoices: "Invoices",
  "time-reports": "Time Reports",
  contracts: "Contracts",
}

interface SyncProgress {
  total: number
  synced: number
  step: string
}

interface SyncContextValue {
  syncing: boolean
  progress: SyncProgress | null
  startSync: (steps?: SyncStep[]) => Promise<void>
  stopSync: () => void
  resetSyncStatus: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

function SyncProvider({ children }: { children: ReactNode }) {
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const abortRef = useRef(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        const supabase = createClient()
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [])

  const invokeEdgeFunction = useCallback(
    async (
      supabase: ReturnType<typeof createClient>,
      functionName: string,
      jobId: string
    ) => {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token

      if (!token) {
        throw new Error("Not authenticated")
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

      const response = await fetch(
        `${supabaseUrl}/functions/v1/${functionName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ job_id: jobId }),
        }
      )

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Edge Function ${functionName} failed: ${text}`)
      }

      return response.json()
    },
    []
  )

  const startSync = useCallback(
    async (steps?: SyncStep[]) => {
      if (syncing) return
      setSyncing(true)
      setProgress(null)
      abortRef.current = false

      const supabase = createClient()
      const stepsToRun = steps ?? SYNC_STEPS

      try {
        for (let i = 0; i < stepsToRun.length; i++) {
          if (abortRef.current) {
            toast.info("Sync stopped")
            break
          }

          const step = stepsToRun[i]
          const label = STEP_LABELS[step]

          setProgress({
            total: stepsToRun.length,
            synced: i,
            step: `Starting ${label}...`,
          })

          const { data: jobRow, error: insertError } = await supabase
            .from("sync_jobs")
            .insert({
              status: "pending",
              progress: 0,
              current_step: `Waiting for ${label}...`,
              total_items: 0,
              processed_items: 0,
            } as never)
            .select("id")
            .single()

          if (insertError || !jobRow) {
            console.error("Failed to create sync job:", insertError)
            continue
          }

          const jobId = (jobRow as unknown as { id: string }).id

          const channel = supabase
            .channel(`sync-job-${jobId}`)
            .on(
              "postgres_changes" as never,
              {
                event: "UPDATE",
                schema: "public",
                table: "sync_jobs",
                filter: `id=eq.${jobId}`,
              } as never,
              (payload: { new: SyncJob }) => {
                const job = payload.new
                setProgress({
                  total: stepsToRun.length,
                  synced: i,
                  step: `${label}: ${job.current_step ?? "Processing..."} (${job.progress}%)`,
                })
              }
            )
            .subscribe()

          channelRef.current = channel

          try {
            await invokeEdgeFunction(supabase, `sync-${step}`, jobId)
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            console.error(`Sync step ${step} failed:`, message)
            toast.error(`${label} sync failed: ${message}`)
          }

          supabase.removeChannel(channel)
          channelRef.current = null
        }

        if (!abortRef.current) {
          setProgress({
            total: stepsToRun.length,
            synced: stepsToRun.length,
            step: "Complete",
          })
          toast.success("Sync completed")
        }
      } catch {
        toast.error("Failed to sync")
      }

      setSyncing(false)
      setProgress(null)
    },
    [syncing, invokeEdgeFunction]
  )

  const stopSync = useCallback(() => {
    abortRef.current = true
  }, [])

  const resetSyncStatus = useCallback(async () => {
    const supabase = createClient()
    await supabase
      .from("fortnox_connection")
      .update({ sync_status: "idle", sync_error: null } as never)
      .not("id", "is", null as never)

    toast.success("Sync status reset")
  }, [])

  return (
    <SyncContext.Provider
      value={{ syncing, progress, startSync, stopSync, resetSyncStatus }}
    >
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
export type { SyncProgress, SyncStep }
