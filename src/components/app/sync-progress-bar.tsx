"use client"

import { X } from "lucide-react"
import { useSync } from "@/hooks/use-sync"
import { Button } from "@/components/ui/button"

function SyncProgressBar() {
  const { syncing, progress, stopSync } = useSync()

  if (!syncing || !progress) return null

  const percent =
    progress.total > 0
      ? Math.round((progress.synced / progress.total) * 100)
      : 0

  return (
    <div className="flex items-center gap-3 border-b border-border bg-bg-secondary px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <p className="shrink-0 text-sm text-muted-foreground">
          {progress.step}
        </p>
        {progress.total > 0 && (
          <>
            <div className="h-1.5 min-w-24 max-w-48 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand-primary transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {progress.synced}/{progress.total}
            </span>
          </>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={stopSync}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

export { SyncProgressBar }
