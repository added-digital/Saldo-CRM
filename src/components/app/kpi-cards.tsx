"use client";

import NumberFlow from "@number-flow/react";
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
  hoursMode?: "hours" | "turnoverPerHour";
  turnoverPerHour?: number;
}

function KpiCards({
  values,
  compact = false,
  hoursMode = "hours",
  turnoverPerHour = 0,
}: KpiCardsProps) {
  const valueClassName = compact
    ? "text-2xl font-semibold leading-tight"
    : "text-4xl font-semibold leading-tight";
  const cardHeaderClassName = compact ? "p-6 pb-1 pt-0" : "p-6 pb-0";
  const cardContentClassName = compact ? "p-6 pt-0 pb-0" : "p-6 pt-0";
  const gridClassName = compact
    ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
    : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";

  const thirdKpiLabel =
    hoursMode === "turnoverPerHour" ? "Turnover / Hours Avg (kr/h)" : "Hours (h)";

  return (
    <div className={gridClassName}>
      <Card className={compact ? "gap-2" : ""}>
        <CardHeader className={cardHeaderClassName}>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Turnover (kr)
          </CardTitle>
        </CardHeader>
        <CardContent className={cardContentClassName}>
          <p className={valueClassName}>
            <NumberFlow
              value={values.turnover}
              locales="sv-SE"
              format={{
                style: "decimal",
                maximumFractionDigits: 0,
              }}
            />
          </p>
        </CardContent>
      </Card>

      <Card className={compact ? "gap-2" : ""}>
        <CardHeader className={cardHeaderClassName}>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Invoices (pcs)
          </CardTitle>
        </CardHeader>
        <CardContent className={cardContentClassName}>
          <p className={valueClassName}>
            <NumberFlow
              value={values.invoices}
              locales="sv-SE"
              format={{
                style: "decimal",
                maximumFractionDigits: 0,
              }}
            />
          </p>
        </CardContent>
      </Card>

      <Card className={compact ? "gap-2" : ""}>
        <CardHeader className={cardHeaderClassName}>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {thirdKpiLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className={cardContentClassName}>
          <p className={valueClassName}>
            <NumberFlow
              value={hoursMode === "turnoverPerHour" ? turnoverPerHour : values.hours}
              locales="sv-SE"
              format={{
                maximumFractionDigits: hoursMode === "turnoverPerHour" ? 0 : 1,
                minimumFractionDigits: hoursMode === "turnoverPerHour" ? 0 : 1,
              }}
            />
          </p>
        </CardContent>
      </Card>

      <Card className={compact ? "gap-2" : ""}>
        <CardHeader className={cardHeaderClassName}>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Contract Value (kr)
          </CardTitle>
        </CardHeader>
        <CardContent className={cardContentClassName}>
          <p className={valueClassName}>
            <NumberFlow
              value={values.contractValue}
              locales="sv-SE"
              format={{
                style: "decimal",
                maximumFractionDigits: 0,
              }}
            />
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export { KpiCards, type KpiCardsProps };
