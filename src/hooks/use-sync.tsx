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

const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000

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
  const channelsRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]>[]>([])

  useEffect(() => {
    cleanUpStaleJobs()
    return () => {
      const supabase = createClient()
      for (const ch of channelsRef.current) {
        supabase.removeChannel(ch)
      }
      channelsRef.current = []
    }
  }, [])

  async function cleanUpStaleJobs() {
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
  }

  const startSync = useCallback(
    async (steps?: SyncStep[]) => {
      if (syncing) return
      setSyncing(true)
      setProgress(null)
      abortRef.current = false

      const supabase = createClient()
      const stepsToRun = steps ?? SYNC_STEPS
      const jobIds: string[] = []
      const completedSteps = new Set<string>()

      try {
        for (let i = 0; i < stepsToRun.length; i++) {
          if (abortRef.current) break

          const step = stepsToRun[i]
          const label = STEP_LABELS[step]

          const { data: jobRow, error: insertError } = await supabase
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
              payload: { step_name: step, step_label: label },
            } as never)
            .select("id")
            .single()

          if (insertError || !jobRow) {
            toast.error(`Failed to create ${label} sync job`)
            continue
          }

          jobIds.push((jobRow as unknown as { id: string }).id)
        }

        if (jobIds.length === 0) {
          setSyncing(false)
          return
        }

        setProgress({
          total: jobIds.length,
          synced: 0,
          step: `Starting ${STEP_LABELS[stepsToRun[0]]}...`,
        })

        await new Promise<void>((resolve) => {
          for (let i = 0; i < jobIds.length; i++) {
            const jobId = jobIds[i]
            const step = stepsToRun[i]
            const label = STEP_LABELS[step]

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

                  if (job.status === "completed" || job.status === "failed") {
                    completedSteps.add(jobId)

                    if (job.status === "failed" && job.error_message) {
                      toast.error(`${label} sync failed: ${job.error_message}`)
                    }

                    setProgress({
                      total: jobIds.length,
                      synced: completedSteps.size,
                      step: completedSteps.size >= jobIds.length
                        ? "Complete"
                        : `${label}: ${job.current_step ?? "Done"}`,
                    })

                    if (completedSteps.size >= jobIds.length) {
                      resolve()
                    }
                    return
                  }

                  setProgress({
                    total: jobIds.length,
                    synced: completedSteps.size,
                    step: `${label}: ${job.current_step ?? "Processing..."} (${job.progress}%)`,
                  })
                }
              )
              .subscribe()

            channelsRef.current.push(channel)
          }

          if (abortRef.current) {
            resolve()
          }
        })

        const supabaseCleanup = createClient()
        for (const ch of channelsRef.current) {
          supabaseCleanup.removeChannel(ch)
        }
        channelsRef.current = []

        const allCompleted = completedSteps.size >= jobIds.length
        if (allCompleted && !abortRef.current) {
          toast.success("Sync completed")
        } else if (abortRef.current) {
          toast.info("Sync stopped")
        }
      } catch {
        toast.error("Failed to sync")
      }

      setSyncing(false)
      setProgress(null)
    },
    [syncing]
  )

  const stopSync = useCallback(async () => {
    abortRef.current = true

    const supabase = createClient()
    await supabase
      .from("sync_jobs")
      .update({
        status: "failed",
        error_message: "Cancelled by user",
        dispatch_lock: false,
        batch_phase: null,
      } as never)
      .in("status", ["pending", "processing"] as never)

    for (const ch of channelsRef.current) {
      supabase.removeChannel(ch)
    }
    channelsRef.current = []
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
