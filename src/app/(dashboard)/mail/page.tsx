"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { CustomerMultiSelect } from "@/components/app/customer-multi-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useTranslation } from "@/hooks/use-translation"
import type { MailTemplate } from "@/types/database"
import { toast } from "sonner"

type MailTemplateType = "plain" | "plain_os"

type MailRecipientCustomer = {
  id: string
  name: string
  fortnox_customer_number: string | null
  email: string | null
  primaryContactName: string | null
}

type PlainForm = {
  subject: string
  body: string
}

type PlainOsForm = {
  subject: string
  title: string
  previewText: string
  greeting: string
  paragraphs: string
  ctaLabel: string
  ctaUrl: string
  footnote: string
  brandName: string
}

function toParagraphs(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function defaultPlainForm(t: (key: string, fallback?: string) => string): PlainForm {
  return {
    subject: t("mail.send.defaults.plainSubject", "Message from Saldo"),
    body: "",
  }
}

function defaultPlainOsForm(t: (key: string, fallback?: string) => string): PlainOsForm {
  return {
    subject: "",
    title: t("settings.mail.defaults.title", "Headline"),
    previewText: t("settings.mail.defaults.previewText", "Quick update from Saldo"),
    greeting: "",
    paragraphs: t(
      "settings.mail.defaults.paragraphs",
      "This is a preview of your custom email content.",
    ),
    ctaLabel: t("settings.mail.defaults.ctaLabel", "Call to action"),
    ctaUrl: process.env.NEXT_PUBLIC_APP_URL || "",
    footnote: "",
    brandName: "Saldo Redovisning",
  }
}

function parseTemplatePayload(payload: Record<string, unknown> | null): {
  plain: Partial<PlainForm>
  plainOs: Partial<PlainOsForm>
} {
  const source = payload ?? {}
  return {
    plain: {
      subject: typeof source.subject === "string" ? source.subject : undefined,
      body: typeof source.body === "string" ? source.body : undefined,
    },
    plainOs: {
      subject: typeof source.subject === "string" ? source.subject : undefined,
      title: typeof source.title === "string" ? source.title : undefined,
      previewText: typeof source.previewText === "string" ? source.previewText : undefined,
      greeting: typeof source.greeting === "string" ? source.greeting : undefined,
      paragraphs: Array.isArray(source.paragraphs)
        ? source.paragraphs.filter((entry): entry is string => typeof entry === "string").join("\n")
        : typeof source.paragraphs === "string"
          ? source.paragraphs
          : undefined,
      ctaLabel: typeof source.ctaLabel === "string" ? source.ctaLabel : undefined,
      ctaUrl: typeof source.ctaUrl === "string" ? source.ctaUrl : undefined,
      footnote: typeof source.footnote === "string" ? source.footnote : undefined,
      brandName: typeof source.brandName === "string" ? source.brandName : undefined,
    },
  }
}

function replaceTemplateTokens(
  value: string,
  customerName: string,
  companyName: string,
): string {
  return value
    .replace(/@customer/gi, customerName)
    .replace(/@company|@compay/gi, companyName)
}

function personalizePayload(
  payload: Record<string, unknown>,
  templateType: MailTemplateType,
  customerName: string,
  companyName: string,
): Record<string, unknown> {
  if (templateType === "plain") {
    return {
      subject: replaceTemplateTokens(String(payload.subject ?? ""), customerName, companyName),
      body: replaceTemplateTokens(String(payload.body ?? ""), customerName, companyName),
    }
  }

  const paragraphsSource = Array.isArray(payload.paragraphs)
    ? payload.paragraphs.filter((entry): entry is string => typeof entry === "string")
    : []

  return {
    subject: replaceTemplateTokens(String(payload.subject ?? ""), customerName, companyName),
    title: replaceTemplateTokens(String(payload.title ?? ""), customerName, companyName),
    previewText: replaceTemplateTokens(String(payload.previewText ?? ""), customerName, companyName),
    greeting: replaceTemplateTokens(String(payload.greeting ?? ""), customerName, companyName),
    paragraphs: paragraphsSource.map((paragraph) =>
      replaceTemplateTokens(paragraph, customerName, companyName),
    ),
    ctaLabel: replaceTemplateTokens(String(payload.ctaLabel ?? ""), customerName, companyName),
    ctaUrl: replaceTemplateTokens(String(payload.ctaUrl ?? ""), customerName, companyName),
    footnote: replaceTemplateTokens(String(payload.footnote ?? ""), customerName, companyName),
    brandName: replaceTemplateTokens(String(payload.brandName ?? ""), customerName, companyName),
  }
}

export default function MailPage() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const [customerOptions, setCustomerOptions] = React.useState<MailRecipientCustomer[]>([])
  const [selectedCustomerIds, setSelectedCustomerIds] = React.useState<string[]>([])
  const [selectedTemplateValue, setSelectedTemplateValue] = React.useState<string>("plain_os")
  const [templateType, setTemplateType] = React.useState<MailTemplateType>("plain_os")
  const [plainForm, setPlainForm] = React.useState<PlainForm>(() => defaultPlainForm(t))
  const [plainOsForm, setPlainOsForm] = React.useState<PlainOsForm>(() => defaultPlainOsForm(t))
  const [templates, setTemplates] = React.useState<MailTemplate[]>([])
  const [previewHtml, setPreviewHtml] = React.useState("")
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [previewCustomerIndex, setPreviewCustomerIndex] = React.useState(0)

  const selectedSavedTemplate = React.useMemo(
    () =>
      selectedTemplateValue === "plain" || selectedTemplateValue === "plain_os"
        ? null
        : templates.find((template) => template.id === selectedTemplateValue) ?? null,
    [selectedTemplateValue, templates],
  )

  const selectedCustomers = React.useMemo(
    () => {
      const byId = new Map(customerOptions.map((customer) => [customer.id, customer]))
      return selectedCustomerIds
        .map((id) => byId.get(id))
        .filter((customer): customer is MailRecipientCustomer => Boolean(customer))
    },
    [customerOptions, selectedCustomerIds],
  )

  React.useEffect(() => {
    setPreviewCustomerIndex((current) => {
      if (selectedCustomers.length === 0) return 0
      return Math.min(current, selectedCustomers.length - 1)
    })
  }, [selectedCustomers])

  React.useEffect(() => {
    const customerIdsParam = searchParams.get("customerIds")
    if (!customerIdsParam) return

    const ids = customerIdsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)

    if (ids.length === 0) return
    setSelectedCustomerIds(ids)
  }, [searchParams])

  React.useEffect(() => {
    async function loadCustomers() {
      const supabase = createClient()
      const { data } = await supabase
        .from("customers")
        .select("id, name, fortnox_customer_number, email, contact_name")
        .order("name", { ascending: true })

      setCustomerOptions(
        ((data ?? []) as Array<{
          id: string
          name: string
          fortnox_customer_number: string | null
          email: string | null
          contact_name: string | null
        }>).map((customer) => ({
          id: customer.id,
          name: customer.name,
          fortnox_customer_number: customer.fortnox_customer_number,
          email: customer.email,
          primaryContactName: customer.contact_name,
        })),
      )
    }

    void loadCustomers()
  }, [])

  React.useEffect(() => {
    async function loadTemplates() {
      const supabase = createClient()
      const { data } = await supabase
        .from("mail_templates")
        .select("id, name, template_type, payload, is_active, created_by, created_at, updated_at")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })

      setTemplates((data ?? []) as MailTemplate[])
    }

    void loadTemplates()
  }, [])

  React.useEffect(() => {
    setPlainForm(defaultPlainForm(t))
    setPlainOsForm(defaultPlainOsForm(t))

    if (selectedTemplateValue === "plain") {
      setTemplateType("plain")
      return
    }
    if (selectedTemplateValue === "plain_os") {
      setTemplateType("plain_os")
      return
    }

    const selected = templates.find((template) => template.id === selectedTemplateValue)
    if (!selected) return

    setTemplateType(selected.template_type)
  }, [selectedTemplateValue, t, templates])

  const plainPayload = React.useMemo(
    () => ({
      subject: plainForm.subject,
      body: plainForm.body,
    }),
    [plainForm],
  )

  const plainOsPayload = React.useMemo(
    () => ({
      subject: plainOsForm.subject,
      title: plainOsForm.title,
      previewText: plainOsForm.previewText,
      greeting: plainOsForm.greeting,
      paragraphs: toParagraphs(plainOsForm.paragraphs),
      ctaLabel: plainOsForm.ctaLabel,
      ctaUrl: plainOsForm.ctaUrl,
      footnote: plainOsForm.footnote,
      brandName: plainOsForm.brandName,
    }),
    [plainOsForm],
  )

  const activePayload = React.useMemo(() => {
    if (selectedSavedTemplate) {
      const parsed = parseTemplatePayload(selectedSavedTemplate.payload)
      if (selectedSavedTemplate.template_type === "plain") {
        return {
          subject: parsed.plain.subject ?? "",
          body: parsed.plain.body ?? "",
        }
      }

      return {
        subject: parsed.plainOs.subject ?? "",
        title: parsed.plainOs.title ?? "",
        previewText: parsed.plainOs.previewText ?? "",
        greeting: parsed.plainOs.greeting ?? "",
        paragraphs: toParagraphs(parsed.plainOs.paragraphs ?? ""),
        ctaLabel: parsed.plainOs.ctaLabel ?? "",
        ctaUrl: parsed.plainOs.ctaUrl ?? "",
        footnote: parsed.plainOs.footnote ?? "",
        brandName: parsed.plainOs.brandName ?? "",
      }
    }

    return templateType === "plain" ? plainPayload : plainOsPayload
  }, [plainOsPayload, plainPayload, selectedSavedTemplate, templateType])

  React.useEffect(() => {
    const abortController = new AbortController()
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const previewCustomer = selectedCustomers[previewCustomerIndex] ?? null
        const previewRecipient = previewCustomer?.email?.trim() || "preview@example.com"
        const previewCustomerName =
          previewCustomer?.primaryContactName?.trim() ||
          previewCustomer?.name ||
          t("mail.send.fallbackCustomer", "Customer")
        const previewCompanyName =
          previewCustomer?.name || t("mail.send.fallbackCompany", "Company")

        const response = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [previewRecipient],
            template: templateType === "plain" ? "plain" : "content",
            mode: "preview",
            data: personalizePayload(
              activePayload,
              templateType,
              previewCustomerName,
              previewCompanyName,
            ),
          }),
          signal: abortController.signal,
        })

        const result = (await response.json()) as { html?: string }
        if (!response.ok) {
          setPreviewHtml("")
          return
        }
        setPreviewHtml(result.html ?? "")
      } catch {
        if (!abortController.signal.aborted) {
          setPreviewHtml("")
        }
      } finally {
        if (!abortController.signal.aborted) {
          setPreviewLoading(false)
        }
      }
    }, 280)

    return () => {
      abortController.abort()
      window.clearTimeout(timeout)
    }
  }, [activePayload, previewCustomerIndex, selectedCustomers, t, templateType])

  async function handleSend() {
    if (selectedCustomers.length === 0) {
      toast.error(t("mail.send.toast.customerRequired", "Select at least one customer"))
      return
    }

    const recipients = selectedCustomers
      .map((customer) => ({
        customer,
        email: customer.email?.trim() || "",
      }))
      .filter((item) => item.email.length > 0)

    if (recipients.length === 0) {
      toast.error(t("mail.send.toast.noEmails", "No selected customers have an email"))
      return
    }

    setSending(true)
    try {
      let sentCount = 0

      for (const { customer, email } of recipients) {
        const customerName =
          customer.primaryContactName?.trim() ||
          customer.name ||
          t("mail.send.fallbackCustomer", "Customer")
        const companyName = customer.name || t("mail.send.fallbackCompany", "Company")

        const response = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [email],
            template: templateType === "plain" ? "plain" : "content",
            mode: "send",
            deliveryMode: "separate",
            data: personalizePayload(
              activePayload,
              templateType,
              customerName,
              companyName,
            ),
          }),
        })

        const result = (await response.json()) as {
          error?: string
          message?: string
          sent_count?: number
        }

        if (!response.ok) {
          toast.error(result.message || result.error || t("settings.mail.toast.sendFailed", "Failed to send email"))
          return
        }

        sentCount += result.sent_count ?? 1
      }

      toast.success(
        `${t("settings.mail.toast.sentPrefix", "Sent")} ${sentCount} ${
          sentCount === 1
            ? t("settings.mail.toast.separateEmailSingular", "separate email")
            : t("settings.mail.toast.separateEmailPlural", "separate emails")
        }`,
      )
    } catch {
      toast.error(t("settings.mail.toast.sendFailed", "Failed to send email"))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("mail.send.title", "Mail")}</CardTitle>
          <CardDescription>
            {t("mail.send.description", "Select template and send emails to selected recipients.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mail-template-select">
              {t("mail.send.templateSelect", "Template")}
            </Label>
            <Select value={selectedTemplateValue} onValueChange={setSelectedTemplateValue}>
              <SelectTrigger id="mail-template-select">
                <SelectValue placeholder={t("mail.send.templateSelect", "Template")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plain">{t("mail.send.optionPlain", "Plain")}</SelectItem>
                <SelectItem value="plain_os">{t("mail.send.optionPlainOs", "Plain OS")}</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("mail.send.sendToCustomers", "Send to customers")}</Label>
            <CustomerMultiSelect
              customers={customerOptions}
              selectedIds={selectedCustomerIds}
              onChange={setSelectedCustomerIds}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "mail.send.customerTokenHelp",
                "@customer is replaced with each selected customer's primary contact name. @company is replaced with the company name.",
              )}
            </p>
          </div>

          {selectedSavedTemplate ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              {t(
                "mail.send.savedTemplateLocked",
                "Using saved template content. To edit fields, switch to Plain or Plain OS.",
              )}
            </div>
          ) : templateType === "plain" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="mail-plain-subject">{t("settings.mail.subject", "Subject")}</Label>
                <Input
                  id="mail-plain-subject"
                  value={plainForm.subject}
                  onChange={(event) =>
                    setPlainForm((current) => ({ ...current, subject: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mail-plain-body">{t("mail.send.body", "Body")}</Label>
                <Textarea
                  id="mail-plain-body"
                  className="min-h-36"
                  value={plainForm.body}
                  onChange={(event) =>
                    setPlainForm((current) => ({ ...current, body: event.target.value }))
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="mail-subject">{t("settings.mail.subject", "Subject")}</Label>
                <Input
                  id="mail-subject"
                  value={plainOsForm.subject}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, subject: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-title">{t("settings.mail.emailTitle", "Title")}</Label>
                <Input
                  id="mail-title"
                  value={plainOsForm.title}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-preview-text">
                  {t("settings.mail.previewText", "Preview text")}
                </Label>
                <Input
                  id="mail-preview-text"
                  value={plainOsForm.previewText}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, previewText: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-greeting">{t("settings.mail.greeting", "Greeting")}</Label>
                <Input
                  id="mail-greeting"
                  value={plainOsForm.greeting}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, greeting: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-paragraphs">
                  {t("settings.mail.contentParagraphs", "Content paragraphs (one line per paragraph)")}
                </Label>
                <Textarea
                  id="mail-paragraphs"
                  className="min-h-32"
                  value={plainOsForm.paragraphs}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, paragraphs: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mail-cta-label">{t("settings.mail.ctaLabel", "CTA label")}</Label>
                  <Input
                    id="mail-cta-label"
                    value={plainOsForm.ctaLabel}
                    onChange={(event) =>
                      setPlainOsForm((current) => ({ ...current, ctaLabel: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mail-cta-url">{t("settings.mail.ctaUrl", "CTA URL")}</Label>
                  <Input
                    id="mail-cta-url"
                    value={plainOsForm.ctaUrl}
                    onChange={(event) =>
                      setPlainOsForm((current) => ({ ...current, ctaUrl: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-footnote">{t("settings.mail.footnote", "Footnote")}</Label>
                <Textarea
                  id="mail-footnote"
                  className="min-h-20"
                  value={plainOsForm.footnote}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, footnote: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mail-brand-name">{t("settings.mail.brandName", "Brand name")}</Label>
                <Input
                  id="mail-brand-name"
                  value={plainOsForm.brandName}
                  onChange={(event) =>
                    setPlainOsForm((current) => ({ ...current, brandName: event.target.value }))
                  }
                />
              </div>
            </>
          )}

          <Button onClick={handleSend} disabled={sending || previewLoading}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("settings.mail.sendEmail", "Send email")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("settings.mail.previewTitle", "Rendered HTML preview")}
          </CardTitle>
          <CardDescription>
            {t("settings.mail.previewDescription", "Live server-rendered template output.")}
          </CardDescription>
          {selectedCustomers.length > 1 ? (
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPreviewCustomerIndex((current) =>
                    current <= 0 ? selectedCustomers.length - 1 : current - 1,
                  )
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("mail.send.previewFor", "Preview for")}: {selectedCustomers[previewCustomerIndex]?.name} ({previewCustomerIndex + 1}/{selectedCustomers.length})
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPreviewCustomerIndex((current) =>
                    current >= selectedCustomers.length - 1 ? 0 : current + 1,
                  )
                }
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="flex h-[875px] items-center justify-center rounded-md border bg-muted/20">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <iframe
              title={t("settings.mail.previewIframeTitle", "Mail preview")}
              className="h-[875px] w-full rounded-md border bg-white"
              srcDoc={previewHtml}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
