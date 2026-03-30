"use client"

import { DashboardAskQuestion } from "@/components/app/dashboard-ask-question"
import { PageHeader } from "@/components/app/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslation } from "@/hooks/use-translation"

type DashboardOption = {
  id: string
  label: string
  subLabel?: string
}

type DashboardHomeContentProps = {
  customers: DashboardOption[]
  users: DashboardOption[]
}

function DashboardHomeContent({ customers, users }: DashboardHomeContentProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.home.title", "Home")}
        description={t("dashboard.home.description", "Overview of your operations")}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{t("dashboard.home.askQuestion", "Ask a question")}</CardTitle>
          <Badge variant="outline">{t("dashboard.home.beta", "Beta")}</Badge>
        </CardHeader>
        <CardContent>
          <DashboardAskQuestion customers={customers} users={users} />
        </CardContent>
      </Card>
    </div>
  )
}

export { DashboardHomeContent }
