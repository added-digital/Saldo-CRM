"use client"

import * as React from "react"
import { X } from "lucide-react"
import { type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface ActionBarAction {
  label: string
  icon?: LucideIcon
  onClick: () => void
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost"
  disabled?: boolean
}

interface ActionBarProps {
  selectedCount: number
  actions: ActionBarAction[]
  onClear: () => void
  className?: string
}

function ActionBar({ selectedCount, actions, onClear, className }: ActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-4 z-50 mx-auto max-w-[700px] rounded-lg border bg-background/95 px-6 py-3 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/80",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedCount} selected
          </span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="size-4" />
            Clear
          </Button>
        </div>
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
    </div>
  )
}

export { ActionBar }
