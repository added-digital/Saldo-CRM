import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { system } from "@/config/system"
import { ContentTemplateEmail } from "@/emails/content-template"
import { render } from "@react-email/components"
import type { Profile } from "@/types/database"

interface EmailRequest {
  to: string
  template: "content"
  data: Record<string, unknown>
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
      .split(/\r?\n/)
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
}

async function sendMicrosoftGraphMail(
  providerToken: string,
  to: string,
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
          {
            emailAddress: {
              address: to,
            },
          },
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<Pick<Profile, "role">>()

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      )
    }

    const body: EmailRequest = await request.json()
    const { to, template, data } = body

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

    const renderTemplate = templateRenderers[template]
    if (!renderTemplate) {
      return NextResponse.json({ error: "Invalid template" }, { status: 400 })
    }

    const { subject, html } = await renderTemplate(data ?? {})

    await sendMicrosoftGraphMail(providerToken, to, subject, html)

    return NextResponse.json({ success: true })
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
