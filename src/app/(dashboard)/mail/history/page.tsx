"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Download, Mail } from "lucide-react"
import { type ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { useTranslation } from "@/hooks/use-translation"
import { useUser } from "@/hooks/use-user"
import { useCachedData } from "@/hooks/use-cached-data"
import { DataTable } from "@/components/app/data-table"
import { SearchInput } from "@/components/app/search-input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

const MAIL_HISTORY_PAGE_SIZE = 15
const HISTORY_FETCH_LIMIT = 500

type SentEmailEntry = {
  id: string
  subject: string
  recipientName: string | null
  recipientEmail: string
  recipientType: "customers" | "contacts" | "manual" | string
  preview: string
  sentAt: string
  status: "sent" | "failed"
}

type SentEmailRow = {
  id: string
  subject: string
  body_preview: string | null
  recipient_email: string
  recipient_name: string | null
  recipient_type: string
  status: "sent" | "failed"
  sent_at: string
}

function formatSentAt(iso: string, locale: string = "sv-SE"): string {
  try {
    const date = new Date(iso)
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date)
  } catch {
    return iso
  }
}

function recipientLabel(entry: SentEmailEntry): string {
  if (entry.recipientName) return `${entry.recipientName} <${entry.recipientEmail}>`
  return entry.recipientEmail
}

type EmailBodyState =
  | { status: "loading" }
  | { status: "ready"; html: string }
  | { status: "error"; message: string }

function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function toCsvRow(values: string[]): string {
  return values.map(escapeCsvValue).join(",")
}

export default function MailHistoryPage() {
  const { t } = useTranslation()
  const { user } = useUser()

  const fetchHistory = React.useCallback(async (): Promise<SentEmailEntry[]> => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("sent_emails")
      .select(
        "id, subject, body_preview, recipient_email, recipient_name, recipient_type, status, sent_at",
      )
      .order("sent_at", { ascending: false })
      .limit(HISTORY_FETCH_LIMIT)

    if (error) {
      throw new Error(error.message)
    }

    const rows = (data ?? []) as unknown as SentEmailRow[]
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      recipientName: row.recipient_name,
      recipientEmail: row.recipient_email,
      recipientType: row.recipient_type,
      preview: row.body_preview ?? "",
      sentAt: row.sent_at,
      status: row.status,
    }))
  }, [])

  const {
    data: cachedHistory,
    loading,
    error: fetchError,
  } = useCachedData<SentEmailEntry[]>({
    key: `mail.history.v1.${user.id}`,
    fetcher: fetchHistory,
  })

  const emails = React.useMemo(() => cachedHistory ?? [], [cachedHistory])

  const [searchQuery, setSearchQuery] = React.useState("")
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(MAIL_HISTORY_PAGE_SIZE)
  const [activeEmail, setActiveEmail] = React.useState<SentEmailEntry | null>(
    null,
  )
  const [bodyCache, setBodyCache] = React.useState<
    Record<string, EmailBodyState>
  >({})

  const openEmailDetail = React.useCallback(
    (entry: SentEmailEntry) => {
      setActiveEmail(entry)

      // Already fetched? Don't refetch.
      if (bodyCache[entry.id]?.status === "ready") return

      setBodyCache((prev) => ({ ...prev, [entry.id]: { status: "loading" } }))

      const supabase = createClient()
      void supabase
        .from("sent_emails")
        .select("body_html")
        .eq("id", entry.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            setBodyCache((prev) => ({
              ...prev,
              [entry.id]: { status: "error", message: error.message },
            }))
            return
          }
          const row = data as { body_html: string | null } | null
          setBodyCache((prev) => ({
            ...prev,
            [entry.id]: { status: "ready", html: row?.body_html ?? "" },
          }))
        })
    },
    [bodyCache],
  )

  const activeBody = activeEmail ? bodyCache[activeEmail.id] : undefined

  const filteredEmails = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return emails
    return emails.filter((email) => {
      return (
        email.subject.toLowerCase().includes(q) ||
        email.preview.toLowerCase().includes(q) ||
        email.recipientEmail.toLowerCase().includes(q) ||
        (email.recipientName?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [emails, searchQuery])

  const pageCount = React.useMemo(
    () => Math.max(1, Math.ceil(filteredEmails.length / pageSize)),
    [filteredEmails.length, pageSize],
  )

  React.useEffect(() => {
    setPageIndex((current) => {
      if (current < 0) return 0
      if (current >= pageCount) return pageCount - 1
      return current
    })
  }, [pageCount])

  const paginatedEmails = React.useMemo(() => {
    const from = pageIndex * pageSize
    return filteredEmails.slice(from, from + pageSize)
  }, [filteredEmails, pageIndex, pageSize])

  const columns = React.useMemo<ColumnDef<SentEmailEntry, unknown>[]>(
    () => [
      {
        id: "subject",
        accessorKey: "subject",
        size: 240,
        minSize: 140,
        header: t("mail.history.columns.subject", "Subject"),
        cell: ({ row }) => {
          const entry = row.original
          return (
            <div className="flex flex-col gap-0.5">
              <span className="truncate font-medium">{entry.subject}</span>
              {entry.status === "failed" ? (
                <span className="text-xs text-destructive">
                  {t("mail.history.statusFailed", "failed")}
                </span>
              ) : null}
            </div>
          )
        },
      },
      {
        id: "preview",
        accessorKey: "preview",
        size: 360,
        minSize: 180,
        header: t("mail.history.columns.preview", "Preview"),
        cell: ({ row }) => (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {row.original.preview || "—"}
          </p>
        ),
      },
      {
        id: "recipient",
        accessorKey: "recipientEmail",
        size: 240,
        minSize: 160,
        header: t("mail.history.columns.recipient", "Recipient"),
        cell: ({ row }) => {
          const entry = row.original
          return (
            <div className="flex flex-col gap-0.5">
              <span className="truncate text-sm">
                {entry.recipientName ?? entry.recipientEmail}
              </span>
              {entry.recipientName ? (
                <span className="truncate text-xs text-muted-foreground">
                  {entry.recipientEmail}
                </span>
              ) : null}
            </div>
          )
        },
      },
      {
        id: "sentAt",
        accessorKey: "sentAt",
        size: 180,
        minSize: 140,
        header: t("mail.history.columns.sentAt", "Sent"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatSentAt(row.original.sentAt)}
          </span>
        ),
      },
    ],
    [t],
  )

  function handleExportCsv() {
    if (filteredEmails.length === 0) return

    const headers = [
      t("mail.history.columns.subject", "Subject"),
      t("mail.history.columns.preview", "Preview"),
      t("mail.history.columns.recipientName", "Recipient name"),
      t("mail.history.columns.recipientEmail", "Recipient email"),
      t("mail.history.columns.recipientType", "Recipient type"),
      t("mail.history.columns.status", "Status"),
      t("mail.history.columns.sentAt", "Sent"),
    ]

    const rows = filteredEmails.map((email) => [
      email.subject,
      email.preview,
      email.recipientName ?? "",
      email.recipientEmail,
      email.recipientType,
      email.status,
      email.sentAt,
    ])

    const csv = [toCsvRow(headers), ...rows.map(toCsvRow)].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const timestamp = new Date().toISOString().slice(0, 10)
    const link = document.createElement("a")
    link.href = url
    link.download = `mail-history-${timestamp}.csv`
    link.click()
    URL.revokeObjectURL(url)

    toast.success(t("mail.history.export.success", "Mail history CSV exported"))
  }

  const paginationControl = (
    <div className="flex items-center gap-2">
      <select
        value={pageSize}
        onChange={(event) => {
          setPageSize(Number(event.target.value))
          setPageIndex(0)
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
        aria-label={t("mail.history.pagination.rowsPerPage", "Rows per page")}
      >
        <option value={15}>{t("mail.history.pagination.perPage15", "15 / page")}</option>
        <option value={30}>{t("mail.history.pagination.perPage30", "30 / page")}</option>
        <option value={50}>{t("mail.history.pagination.perPage50", "50 / page")}</option>
      </select>
      <span className="text-sm text-muted-foreground">
        {pageIndex + 1} {t("mail.history.pagination.of", "of")} {pageCount}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-9"
        onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
        disabled={pageIndex === 0}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-9"
        onClick={() => setPageIndex((current) => Math.min(current + 1, pageCount - 1))}
        disabled={pageIndex >= pageCount - 1}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )

  const toolbar = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={t("mail.history.searchPlaceholder", "Search sent emails...")}
        className="w-full lg:max-w-sm"
      />
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={handleExportCsv}
          disabled={loading || filteredEmails.length === 0}
        >
          <Download className="size-3.5" />
          {t("mail.history.export.csv", "Export CSV")}
        </Button>
        {paginationControl}
      </div>
    </div>
  )

  const emptyState = fetchError
    ? {
        icon: Mail,
        title: t("mail.history.error.title", "Failed to load history"),
        description: fetchError.message,
      }
    : searchQuery.trim().length > 0 && filteredEmails.length === 0
      ? {
          icon: Mail,
          title: t("mail.history.empty.searchTitle", "No matching emails"),
          description: t(
            "mail.history.empty.searchDescription",
            "No sent emails match your search.",
          ),
          action: {
            label: t("mail.history.empty.clearSearch", "Clear search"),
            onClick: () => setSearchQuery(""),
          },
        }
      : {
          icon: Mail,
          title: t("mail.history.empty.title", "No sent emails yet"),
          description: t(
            "mail.history.empty.description",
            "Emails you send from this app will appear here.",
          ),
        }

  return (
    <div className="space-y-6">
      {toolbar}

      <DataTable
        columns={columns}
        data={paginatedEmails}
        loading={loading}
        pageSize={pageSize}
        emptyState={emptyState}
        hideRowCount
        onRowNavigate={openEmailDetail}
      />

      <Dialog
        open={activeEmail !== null}
        onOpenChange={(open) => {
          if (!open) setActiveEmail(null)
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {activeEmail?.subject ?? ""}
            </DialogTitle>
            <DialogDescription className="space-y-1 pt-1 text-left">
              <span className="block">
                {t("mail.history.detail.toLabel", "To")}:{" "}
                {activeEmail ? recipientLabel(activeEmail) : ""}
              </span>
              <span className="block text-xs text-muted-foreground">
                {activeEmail ? formatSentAt(activeEmail.sentAt) : ""}
                {activeEmail?.status === "failed" ? (
                  <span className="ml-2 text-destructive">
                    ({t("mail.history.statusFailed", "failed")})
                  </span>
                ) : null}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-white">
            {activeBody?.status === "ready" ? (
              activeBody.html.length > 0 ? (
                <iframe
                  title={t("mail.history.detail.bodyTitle", "Email body")}
                  srcDoc={activeBody.html}
                  className="h-[600px] w-full rounded-md"
                />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  {t(
                    "mail.history.detail.emptyBody",
                    "No body content was stored for this email.",
                  )}
                </p>
              )
            ) : activeBody?.status === "error" ? (
              <p className="p-4 text-sm text-destructive">
                {t(
                  "mail.history.detail.loadFailed",
                  "Failed to load email body",
                )}
                : {activeBody.message}
              </p>
            ) : (
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-64 w-full" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
