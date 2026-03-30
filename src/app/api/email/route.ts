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

type TemplateRenderer = (data: Record<string, unknown>) => Promise<EmailRenderResult>

const templateRenderers: Record<EmailRequest["template"], TemplateRenderer> = {
  content: async (data) => {
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
        appUrl: asString(data.appUrl, process.env.NEXT_PUBLIC_APP_URL || system.url),
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
    const { to, template, data, mode = "send" } = body
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

    const { subject, html } = await renderTemplate(data ?? {})

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

    for (const recipient of recipients) {
      await sendMicrosoftGraphMail(providerToken, [recipient], subject, html)
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
