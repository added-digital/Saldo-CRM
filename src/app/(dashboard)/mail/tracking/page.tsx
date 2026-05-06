"use client"

import * as React from "react"
import NumberFlow from "@number-flow/react"

import { createClient } from "@/lib/supabase/client"
import { useTranslation } from "@/hooks/use-translation"
import { useUser } from "@/hooks/use-user"
import { useCachedData } from "@/hooks/use-cached-data"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { EmptyState } from "@/components/app/empty-state"
import { Info, LineChart } from "lucide-react"

type TrackingStats = {
  totalSent: number
  totalFailed: number
  uniqueOpens: number
  uniqueClicks: number
  totalOpens: number
  totalClicks: number
}

type SentRow = { id: string; status: "sent" | "failed" }
type EventRow = {
  sent_email_id: string
  event_type: "open" | "click"
}

const EMPTY_STATS: TrackingStats = {
  totalSent: 0,
  totalFailed: 0,
  uniqueOpens: 0,
  uniqueClicks: 0,
  totalOpens: 0,
  totalClicks: 0,
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return `${value.toFixed(1)}%`
}

export default function MailTrackingPage() {
  const { t } = useTranslation()
  const { user } = useUser()

  const fetchStats = React.useCallback(async (): Promise<TrackingStats> => {
    const supabase = createClient()

    // Pull every sent_emails row for this user. The user-scoped client
    // honours RLS so this is automatically filtered to their own rows.
    const { data: sentData, error: sentError } = await supabase
      .from("sent_emails")
      .select("id, status")

    if (sentError) throw new Error(sentError.message)

    const sentRows = (sentData ?? []) as unknown as SentRow[]
    const sentIds = sentRows.filter((row) => row.status === "sent").map((row) => row.id)
    const totalSent = sentIds.length
    const totalFailed = sentRows.filter((row) => row.status === "failed").length

    if (sentIds.length === 0) {
      return EMPTY_STATS
    }

    // email_events RLS already restricts to events for the caller's
    // sent_emails. Pull all open + click events for the in-scope sent ids.
    const { data: eventsData, error: eventsError } = await supabase
      .from("email_events")
      .select("sent_email_id, event_type")
      .in("sent_email_id", sentIds)
      .in("event_type", ["open", "click"])

    if (eventsError) throw new Error(eventsError.message)

    const events = (eventsData ?? []) as unknown as EventRow[]
    const opens = events.filter((event) => event.event_type === "open")
    const clicks = events.filter((event) => event.event_type === "click")
    const uniqueOpens = new Set(opens.map((event) => event.sent_email_id)).size
    const uniqueClicks = new Set(clicks.map((event) => event.sent_email_id)).size

    return {
      totalSent,
      totalFailed,
      uniqueOpens,
      uniqueClicks,
      totalOpens: opens.length,
      totalClicks: clicks.length,
    }
  }, [])

  const {
    data,
    loading,
    error: fetchError,
  } = useCachedData<TrackingStats>({
    key: `mail.tracking.v1.${user.id}`,
    fetcher: fetchStats,
  })

  const stats = data ?? EMPTY_STATS
  const openRate =
    stats.totalSent > 0 ? (stats.uniqueOpens / stats.totalSent) * 100 : 0
  const clickRate =
    stats.totalSent > 0 ? (stats.uniqueClicks / stats.totalSent) * 100 : 0
  const ctr =
    stats.uniqueOpens > 0
      ? (stats.uniqueClicks / stats.uniqueOpens) * 100
      : 0

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <EmptyState
        icon={LineChart}
        title={t("mail.tracking.error.title", "Failed to load tracking data")}
        description={fetchError.message}
      />
    )
  }

  if (stats.totalSent === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title={t("mail.tracking.empty.title", "No sent emails to track yet")}
        description={t(
          "mail.tracking.empty.description",
          "Once you send your first email from Send mail, opens and clicks will start showing up here.",
        )}
      />
    )
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="p-6 pb-0">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("mail.tracking.cards.sent", "Skickade")}
                </CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={t(
                        "mail.tracking.cards.sentTooltipLabel",
                        "Mer information",
                      )}
                      className="text-muted-foreground/70 transition-colors hover:text-foreground"
                    >
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {t(
                      "mail.tracking.cards.sentTooltip",
                      "Det totala antalet unika mottagare som mailet har skickats till via Microsoft Graph.",
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 p-6 pt-0">
              <p className="text-4xl font-semibold leading-tight">
                <NumberFlow
                  value={stats.totalSent}
                  locales="sv-SE"
                  format={{ style: "decimal", maximumFractionDigits: 0 }}
                />
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.totalFailed > 0
                  ? `${stats.totalFailed} ${t("mail.tracking.cards.failedSuffix", "misslyckades")}`
                  : `${stats.totalSent} ${t("mail.tracking.cards.allDelivered", "st levererade")}`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-6 pb-0">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("mail.tracking.cards.openRate", "Öppningsgrad")}
                </CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={t(
                        "mail.tracking.cards.openRateTooltipLabel",
                        "Mer information",
                      )}
                      className="text-muted-foreground/70 transition-colors hover:text-foreground"
                    >
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      {t(
                        "mail.tracking.cards.openRateTooltip",
                        "Andelen mottagare som har öppnat mailet. Detta är det bästa måttet på hur effektiv din ärenderad (subject line) var.",
                      )}
                    </p>
                    <p className="mt-1 opacity-80">
                      {t(
                        "mail.tracking.cards.openRateTooltipNote",
                        "Notera: siffran kan variera något då vissa mailklienter (t.ex. Apple Mail) ibland förladdar bilder automatiskt.",
                      )}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 p-6 pt-0">
              <p className="text-4xl font-semibold leading-tight">
                {formatPercent(openRate)}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.uniqueOpens} {t("mail.tracking.cards.of", "av")}{" "}
                {stats.totalSent}{" "}
                {t("mail.tracking.cards.opensFraction", "öppnade")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-6 pb-0">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("mail.tracking.cards.clickRate", "Klickfrekvens")}
                </CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={t(
                        "mail.tracking.cards.clickRateTooltipLabel",
                        "Mer information",
                      )}
                      className="text-muted-foreground/70 transition-colors hover:text-foreground"
                    >
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {t(
                      "mail.tracking.cards.clickRateTooltip",
                      "Hur stor del av alla mottagare som klickade på din knapp eller länk. Detta mäter hur stort genomslag hela utskicket hade i din totala målgrupp.",
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 p-6 pt-0">
              <p className="text-4xl font-semibold leading-tight">
                {formatPercent(clickRate)}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.uniqueClicks} {t("mail.tracking.cards.of", "av")}{" "}
                {stats.totalSent}{" "}
                {t("mail.tracking.cards.clickedRecipients", "klickade")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-6 pb-0">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("mail.tracking.cards.ctor", "Relevansgrad")}
                </CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={t(
                        "mail.tracking.cards.ctorTooltipLabel",
                        "Mer information",
                      )}
                      className="text-muted-foreground/70 transition-colors hover:text-foreground"
                    >
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {t(
                      "mail.tracking.cards.ctorTooltip",
                      "Hur många av de som faktiskt öppnade mailet som också valde att klicka. Detta är det mest precisa måttet på hur relevant ditt innehåll och ditt erbjudande var för läsaren.",
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 p-6 pt-0">
              <p className="text-4xl font-semibold leading-tight">
                {formatPercent(ctr)}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.uniqueClicks} {t("mail.tracking.cards.of", "av")}{" "}
                {stats.uniqueOpens}{" "}
                {t(
                  "mail.tracking.cards.clickedOfOpeners",
                  "öppnare klickade",
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("mail.tracking.totals.title", "Aktivitet totalt")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">
                {t("mail.tracking.totals.totalOpens", "Totala öppningar")}
              </p>
              <p className="text-2xl font-semibold leading-tight">
                <NumberFlow
                  value={stats.totalOpens}
                  locales="sv-SE"
                  format={{ style: "decimal", maximumFractionDigits: 0 }}
                />
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "mail.tracking.totals.totalOpensHint",
                  "inkl. upprepade öppningar",
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("mail.tracking.totals.totalClicks", "Totala klick")}
              </p>
              <p className="text-2xl font-semibold leading-tight">
                <NumberFlow
                  value={stats.totalClicks}
                  locales="sv-SE"
                  format={{ style: "decimal", maximumFractionDigits: 0 }}
                />
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "mail.tracking.totals.totalClicksHint",
                  "inkl. upprepade klick",
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("mail.tracking.totals.uniqueOpens", "Unika öppningar")}
              </p>
              <p className="text-2xl font-semibold leading-tight">
                <NumberFlow
                  value={stats.uniqueOpens}
                  locales="sv-SE"
                  format={{ style: "decimal", maximumFractionDigits: 0 }}
                />
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "mail.tracking.totals.uniqueOpensHint",
                  "unika mottagare",
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("mail.tracking.totals.uniqueClicks", "Unika klick")}
              </p>
              <p className="text-2xl font-semibold leading-tight">
                <NumberFlow
                  value={stats.uniqueClicks}
                  locales="sv-SE"
                  format={{ style: "decimal", maximumFractionDigits: 0 }}
                />
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "mail.tracking.totals.uniqueClicksHint",
                  "unika mottagare",
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
