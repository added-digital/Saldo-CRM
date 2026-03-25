"use client"

import * as React from "react"
import { Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"

import { cn } from "@/lib/utils"

type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    color?: string
  }
>

type ChartContextValue = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextValue | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a ChartContainer")
  }
  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof ResponsiveContainer>["children"]
}) {
  const uniqueId = React.useId().replace(/:/g, "")
  const chartId = `chart-${id ?? uniqueId}`

  const style = React.useMemo(() => {
    const vars: Record<string, string> = {}
    for (const [key, item] of Object.entries(config)) {
      if (item.color) {
        vars[`--color-${key}`] = item.color
      }
    }
    return vars as React.CSSProperties
  }, [config])

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn("h-[260px] w-full", className)}
        style={style}
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartTooltip = RechartsTooltip

function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  className,
}: {
  active?: boolean
  payload?: Array<{
    dataKey?: string | number
    name?: string | number
    color?: string | number
    value?: number | string | null
  }>
  label?: string | number
  className?: string
  hideLabel?: boolean
}) {
  const { config } = useChart()
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null
  }

  return (
    <div className={cn("grid min-w-[10rem] gap-1.5 rounded-md border bg-background px-3 py-2 text-xs shadow-xl", className)}>
      {!hideLabel && label != null ? <div className="font-medium">{String(label)}</div> : null}
      <div className="grid gap-1">
        {payload.map((item, index) => {
          const key = String(item.dataKey ?? item.name ?? "value")
          const color = String(item.color ?? `var(--color-${key})`)
          const value = Number(item.value ?? 0)
          return (
            <div key={`${key}-${index}`} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ backgroundColor: color }} />
                <span className="text-muted-foreground">{config[key]?.label ?? item.name ?? key}</span>
              </div>
              <span className="font-medium tabular-nums">{value.toLocaleString("sv-SE")}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { ChartContainer, ChartTooltip, ChartTooltipContent }
export type { ChartConfig }
