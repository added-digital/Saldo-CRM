"use client"

import * as React from "react"
import { List, LayoutGrid, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { ActionBarAction } from "@/components/app/action-bar"

interface CustomerToolbarProps {
  view: "list" | "kpi"
  onViewChange: (view: "list" | "kpi") => void
  selectedCount: number
  onClear: () => void
  actions: ActionBarAction[]
  className?: string
}

function CustomerToolbar({
  view,
  onViewChange,
  selectedCount,
  onClear,
  actions,
  className,
}: CustomerToolbarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-4 z-50 mx-auto max-w-[700px] rounded-lg border bg-background/95 px-6 py-3 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/80",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewChange("list")}
            aria-label="List view"
          >
            <List className="size-4" />
            List
          </Button>
          <Button
            variant={view === "kpi" ? "default" : "ghost"}
            size="sm"
            onClick={() => onViewChange("kpi")}
            aria-label="KPI view"
          >
            <LayoutGrid className="size-4" />
            KPIs
          </Button>
        </div>

        {selectedCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {selectedCount} selected
            </span>
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="size-4" />
              Clear
            </Button>
            <div className="flex items-center gap-2">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  variant={action.variant ?? "default"}
                  size="sm"
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.icon && <action.icon className="size-4" />}
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export { CustomerToolbar, type CustomerToolbarProps }
