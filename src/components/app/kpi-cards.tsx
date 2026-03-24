"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type KpiValues = {
  turnover: number;
  invoices: number;
  hours: number;
  contractValue: number;
};

interface KpiCardsProps {
  values: KpiValues;
  compact?: boolean;
}

const sekFormatter = new Intl.NumberFormat("sv-SE", {
  style: "decimal",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("sv-SE");

const hoursFormatter = new Intl.NumberFormat("sv-SE", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

function KpiCards({ values, compact = false }: KpiCardsProps) {
  const valueClassName = compact
    ? "text-base font-semibold leading-tight"
    : "text-2xl font-semibold";
  const cardHeaderClassName = compact ? "p-6 pb-1 pt-0" : "p-6 pb-0";
  const cardContentClassName = compact ? "p-6 pt-0 pb-0" : "p-6 pt-0";
  const gridClassName = compact
    ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
    : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";

  return (
    <div className={gridClassName}>
      <Card className={compact ? "gap-2" : ""}>
        <CardHeader className={cardHeaderClassName}>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Turnover
          </CardTitle>
        </CardHeader>
        <CardContent className={cardContentClassName}>
          <p className={valueClassName}>
            {sekFormatter.format(values.turnover)}
            <span className="ml-1">kr</span>
          </p>
        </CardContent>
      </Card>

      <Card className={compact ? "gap-2" : ""}>
        <CardHeader className={cardHeaderClassName}>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className={cardContentClassName}>
          <p className={valueClassName}>
            {numberFormatter.format(values.invoices)}
            <span className="ml-1">pcs</span>
          </p>
        </CardContent>
      </Card>

      <Card className={compact ? "gap-2" : ""}>
        <CardHeader className={cardHeaderClassName}>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Hours
          </CardTitle>
        </CardHeader>
        <CardContent className={cardContentClassName}>
          <p className={valueClassName}>
            {hoursFormatter.format(values.hours)}
            <span className="ml-1">h</span>
          </p>
        </CardContent>
      </Card>

      <Card className={compact ? "gap-2" : ""}>
        <CardHeader className={cardHeaderClassName}>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Contract Value
          </CardTitle>
        </CardHeader>
        <CardContent className={cardContentClassName}>
          <p className={valueClassName}>
            {sekFormatter.format(values.contractValue)}
            <span className="ml-1">kr</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export { KpiCards, type KpiCardsProps };
