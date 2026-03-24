"use client"

import * as React from "react"

import type { CustomerWithRelations } from "@/types/database"
import { KpiCards } from "@/components/app/kpi-cards"

interface CustomerKpiCardsProps {
  customers: CustomerWithRelations[]
  compact?: boolean
}

function CustomerKpiCards({ customers, compact = false }: CustomerKpiCardsProps) {
  const totals = React.useMemo(() => {
    let turnover = 0
    let invoices = 0
    let hours = 0
    let contractValue = 0

    for (const customer of customers) {
      turnover += customer.total_turnover ?? 0
      invoices += customer.invoice_count ?? 0
      hours += customer.total_hours ?? 0
      contractValue += customer.contract_value ?? 0
    }

    return { turnover, invoices, hours, contractValue }
  }, [customers])

  return (
    <KpiCards values={totals} compact={compact} />
  )
}

export { CustomerKpiCards, type CustomerKpiCardsProps }
