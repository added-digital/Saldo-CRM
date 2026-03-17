"use client"

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import { createClient } from "@/lib/supabase/client"
import type { FortnoxConnection } from "@/types/database"
import { toast } from "sonner"

interface SyncProgress {
  total: number
  synced: number
  step: string
}

interface SyncContextValue {
  syncing: boolean
  progress: SyncProgress | null
  startSync: () => Promise<void>
  stopSync: () => void
  resetSyncStatus: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

function SyncProvider({ children }: { children: ReactNode }) {
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const abortRef = useRef(false)

  const startSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    setProgress(null)
    abortRef.current = false

    try {
      setProgress({ total: 0, synced: 0, step: "Fetching customer list..." })

      const initRes = await fetch("/api/fortnox/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "init" }),
      })

      if (!initRes.ok) throw new Error("Init failed")

      const initData = await initRes.json()
      const customerNumbers: string[] = initData.customerNumbers ?? []
      const total = initData.total ?? 0

      setProgress({ total, synced: 0, step: "Syncing customers..." })

      let fromIndex = 0
      let totalSynced = 0

      while (fromIndex < customerNumbers.length) {
        if (abortRef.current) {
          await fetch("/api/fortnox/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ step: "link" }),
          })
          toast.info(`Sync stopped at ${totalSynced}/${total} customers`)
          break
        }

        const batchRes = await fetch("/api/fortnox/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "customers",
            customerNumbers,
            fromIndex,
            batchSize: 20,
          }),
        })

        if (!batchRes.ok) throw new Error("Batch sync failed")

        const batchData = await batchRes.json()
        totalSynced += batchData.synced ?? 0
        setProgress({ total, synced: totalSynced, step: "Syncing customers..." })

        if (batchData.nextIndex === null) break
        fromIndex = batchData.nextIndex
      }

      if (!abortRef.current) {
        setProgress({ total, synced: totalSynced, step: "Linking cost centers..." })

        const linkRes = await fetch("/api/fortnox/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "link" }),
        })

        if (!linkRes.ok) throw new Error("Link step failed")
        toast.success(`Synced ${totalSynced} of ${total} customers`)
      }
    } catch {
      toast.error("Failed to sync")
    }

    setSyncing(false)
    setProgress(null)
  }, [syncing])

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

export { SyncProvider, useSync }
export type { SyncProgress }
