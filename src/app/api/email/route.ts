import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getResend } from "@/lib/resend/client"
import { system } from "@/config/system"
import { WelcomeEmail } from "@/emails/welcome"
import { TeamInviteEmail } from "@/emails/team-invite"
import { render } from "@react-email/components"
import type { Profile } from "@/types/database"

interface EmailRequest {
  to: string
  template: "welcome" | "team-invite"
  data: Record<string, string>
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

    let emailHtml: string
    let subject: string

    if (template === "welcome") {
      subject = `Welcome to ${data.systemName || system.name}`
      emailHtml = await render(
        WelcomeEmail({
          userName: data.userName || "there",
          systemName: data.systemName || system.name,
          dashboardUrl:
            data.dashboardUrl ||
            `${process.env.NEXT_PUBLIC_APP_URL}/`,
        })
      )
    } else if (template === "team-invite") {
      subject = `You've been added to ${data.teamName}`
      emailHtml = await render(
        TeamInviteEmail({
          userName: data.userName || "there",
          teamName: data.teamName || "a team",
          invitedBy: data.invitedBy || "An administrator",
          dashboardUrl:
            data.dashboardUrl ||
            `${process.env.NEXT_PUBLIC_APP_URL}/`,
        })
      )
    } else {
      return NextResponse.json({ error: "Invalid template" }, { status: 400 })
    }

    const result = await getResend().emails.send({
      from: `${system.name} <${system.supportEmail}>`,
      to,
      subject,
      html: emailHtml,
    })

    return NextResponse.json({ success: true, result })
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
