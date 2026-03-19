import { BarChart3 } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Analytics and reporting overview"
      />

      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <BarChart3 className="size-5 text-muted-foreground" />
          <CardTitle>Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Reports view is ready. Add report widgets here.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
