"use client"

import * as React from "react"

import type { CustomerWithRelations } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const sekFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat("sv-SE")

const hoursFormatter = new Intl.NumberFormat("sv-SE", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})

interface CustomerKpiCardsProps {
  customers: CustomerWithRelations[]
}

function CustomerKpiCards({ customers }: CustomerKpiCardsProps) {
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Turnover
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{sekFormatter.format(totals.turnover)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{numberFormatter.format(totals.invoices)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{hoursFormatter.format(totals.hours)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Contract Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            {sekFormatter.format(totals.contractValue)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export { CustomerKpiCards, type CustomerKpiCardsProps }
