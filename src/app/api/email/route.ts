import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { system } from "@/config/system"
import { ContentTemplateEmail } from "@/emails/content-template"
import { render } from "@react-email/components"

interface EmailRequest {
  to: string | string[]
  template: "content" | "plain"
  data: Record<string, unknown>
  mode?: "send" | "preview"
  deliveryMode?: "grouped" | "separate"
  recipient_metadata?: {
    type?: "customers" | "contacts" | "manual"
    name?: string | null
    customer_id?: string | null
    contact_id?: string | null
  }
}

function htmlToPreview(html: string, maxLength = 240): string {
  const text = html
    // Strip <style>/<script> blocks first so their bodies don't leak in.
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    // Replace block-level tags with newlines so paragraphs separate cleanly.
    .replace(/<\/(p|div|li|h[1-6]|tr|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    // Drop remaining tags.
    .replace(/<[^>]+>/g, " ")
    // Collapse whitespace.
    .replace(/\s+/g, " ")
    .trim()

  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}…`
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return fallback
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item).trim())
      .filter((item) => item.length > 0)
  }

  if (typeof value === "string") {
    return value
      .split(/[\r\n,;]+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  return []
}

type EmailRenderResult = {
  subject: string
  html: string
}

type TemplateRenderer = (data: Record<string, unknown>, appUrl: string) => Promise<EmailRenderResult>

function normalizeBaseUrl(value: string): string {
  const candidate = value.trim()
  if (!candidate) return ""
  return candidate.endsWith("/") ? candidate.slice(0, -1) : candidate
}

function toHttpsUrl(value: string): string {
  const candidate = value.trim()
  if (!candidate) return ""
  if (/^https?:\/\//i.test(candidate)) return normalizeBaseUrl(candidate)
  return normalizeBaseUrl(`https://${candidate}`)
}

function resolveAppUrl(request: NextRequest, data: Record<string, unknown>): string {
  const fromPayload = asString(data.appUrl, "")
  if (fromPayload) {
    return normalizeBaseUrl(fromPayload)
  }

  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL
  if (publicAppUrl?.trim()) {
    return normalizeBaseUrl(publicAppUrl)
  }

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercelProductionUrl?.trim()) {
    return toHttpsUrl(vercelProductionUrl)
  }

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl?.trim()) {
    return toHttpsUrl(vercelUrl)
  }

  const requestOrigin = request.nextUrl.origin
  if (requestOrigin?.trim()) {
    return normalizeBaseUrl(requestOrigin)
  }

  return normalizeBaseUrl(system.url)
}

const templateRenderers: Record<EmailRequest["template"], TemplateRenderer> = {
  content: async (data, appUrl) => {
    const title = asString(data.title, "Information from Saldo")
    const subject = asString(data.subject, title)
    const paragraphs = asStringArray(data.paragraphs)
    const html = await render(
      ContentTemplateEmail({
        title,
        previewText: asString(data.previewText, title),
        greeting: asString(data.greeting, ""),
        paragraphs,
        ctaLabel: asString(data.ctaLabel, ""),
        ctaUrl: asString(data.ctaUrl, ""),
        footnote: asString(data.footnote, ""),
        appUrl,
        brandName: asString(data.brandName, system.companyName),
      })
    )
    return { subject, html }
  },
  plain: async (data) => {
    const subject = asString(data.subject, "Message from Saldo")
    const body = asString(data.body, "")
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${body
      .split(/\r?\n/)
      .map((line) =>
        line.trim().length === 0
          ? "<p style=\"margin:0 0 12px;\">&nbsp;</p>"
          : `<p style=\"margin:0 0 12px;\">${line
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</p>`
      )
      .join("")}</div>`
    return { subject, html }
  },
}

async function sendMicrosoftGraphMail(
  providerToken: string,
  recipients: string[],
  subject: string,
  html: string,
) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: html,
        },
        toRecipients: [
          ...recipients.map((recipient) => ({
            emailAddress: {
              address: recipient,
            },
          })),
        ],
      },
      saveToSentItems: true,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Microsoft Graph sendMail failed (${response.status}): ${errorText}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: EmailRequest = await request.json()
    const { to, template, data, mode = "send", recipient_metadata } = body
    const deliveryMode = "separate"
    const recipients = asStringArray(to)

    if (recipients.length === 0) {
      return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 })
    }

    const invalidRecipients = recipients.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    if (invalidRecipients.length > 0) {
      return NextResponse.json(
        {
          error: "Invalid recipient email address",
          invalid_recipients: invalidRecipients,
        },
        { status: 400 }
      )
    }

    const renderTemplate = templateRenderers[template]
    if (!renderTemplate) {
      return NextResponse.json({ error: "Invalid template" }, { status: 400 })
    }

    const payload = data ?? {}
    const appUrl = resolveAppUrl(request, payload)
    const { subject, html } = await renderTemplate(payload, appUrl)

    if (mode === "preview") {
      return NextResponse.json({ success: true, subject, html, recipients })
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const providerToken = session?.provider_token
    if (!providerToken) {
      return NextResponse.json(
        {
          error: "Microsoft token missing",
          message: "Please sign in again with Microsoft to enable sending mail.",
        },
        { status: 412 }
      )
    }

    const bodyPreview = htmlToPreview(html)
    const recipientType =
      recipient_metadata?.type === "customers" ||
      recipient_metadata?.type === "contacts"
        ? recipient_metadata.type
        : "manual"
    const sentLogRows: Array<{
      user_id: string
      subject: string
      body_preview: string
      body_html: string
      recipient_email: string
      recipient_name: string | null
      recipient_type: "customers" | "contacts" | "manual"
      customer_id: string | null
      contact_id: string | null
      template_key: string
      delivery_mode: string
      status: "sent"
    }> = []

    for (const recipient of recipients) {
      await sendMicrosoftGraphMail(providerToken, [recipient], subject, html)
      sentLogRows.push({
        user_id: user.id,
        subject,
        body_preview: bodyPreview,
        body_html: html,
        recipient_email: recipient,
        recipient_name: recipient_metadata?.name ?? null,
        recipient_type: recipientType,
        customer_id: recipient_metadata?.customer_id ?? null,
        contact_id: recipient_metadata?.contact_id ?? null,
        template_key: template,
        delivery_mode: deliveryMode,
        status: "sent",
      })
    }

    if (sentLogRows.length > 0) {
      // Persistence is best-effort — a failure here shouldn't fail the send.
      const { error: logError } = await supabase
        .from("sent_emails")
        .insert(sentLogRows as never)
      if (logError) {
        console.error("Failed to log sent_emails:", logError)
      }
    }

    return NextResponse.json({
      success: true,
      subject,
      recipients,
      delivery_mode: deliveryMode,
      sent_count: recipients.length,
    })
  } catch (error) {
    console.error("Email send error:", error)
    return NextResponse.json(
      {
        error: "Failed to send email",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
