"use client"

import * as React from "react"

import type { CustomerWithRelations } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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

function formatSek(value: number | null): string {
  if (value == null) return "—"
  return sekFormatter.format(value)
}

function formatNumber(value: number | null): string {
  if (value == null) return "—"
  return numberFormatter.format(value)
}

function formatHours(value: number | null): string {
  if (value == null) return "—"
  return hoursFormatter.format(value)
}

interface CustomerKpiViewProps {
  customers: CustomerWithRelations[]
}

function CustomerKpiView({ customers }: CustomerKpiViewProps) {
  const totals = React.useMemo(() => {
    let turnover = 0
    let invoices = 0
    let hours = 0
    let contractValue = 0

    for (const c of customers) {
      turnover += c.total_turnover ?? 0
      invoices += c.invoice_count ?? 0
      hours += c.total_hours ?? 0
      contractValue += c.contract_value ?? 0
    }

    return { turnover, invoices, hours, contractValue }
  }, [customers])

  const sorted = React.useMemo(
    () =>
      [...customers].sort(
        (a, b) => (b.total_turnover ?? 0) - (a.total_turnover ?? 0)
      ),
    [customers]
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Turnover
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {sekFormatter.format(totals.turnover)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {numberFormatter.format(totals.invoices)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {hoursFormatter.format(totals.hours)}
            </p>
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

      <div className="rounded-md border">
        <Table style={{ width: "100%", tableLayout: "fixed" }}>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: "30%" }}>Customer</TableHead>
              <TableHead style={{ width: "15%" }}>Turnover</TableHead>
              <TableHead style={{ width: "12%" }}>Invoices</TableHead>
              <TableHead style={{ width: "12%" }}>Hours</TableHead>
              <TableHead style={{ width: "15%" }}>Contract Value</TableHead>
              <TableHead style={{ width: "16%" }}>Customer Manager</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length > 0 ? (
              sorted.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{formatSek(customer.total_turnover)}</TableCell>
                  <TableCell>{formatNumber(customer.invoice_count)}</TableCell>
                  <TableCell>{formatHours(customer.total_hours)}</TableCell>
                  <TableCell>{formatSek(customer.contract_value)}</TableCell>
                  <TableCell>
                    {customer.account_manager
                      ? customer.account_manager.full_name ?? customer.account_manager.email
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No customers with KPI data.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export { CustomerKpiView, type CustomerKpiViewProps }
