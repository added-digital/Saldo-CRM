import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/types/database"

export const maxDuration = 300

const VALID_STEPS = new Set([
  "customers",
  "employees",
  "invoices",
  "time-reports",
  "contracts",
])

async function authorize() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>()

  return profile?.role === "admin" ? user : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ step: string }> }
) {
  try {
    const user = await authorize()
    if (!user) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      )
    }

    const { step } = await params

    if (!VALID_STEPS.has(step)) {
      return NextResponse.json(
        { error: `Invalid sync step: ${step}` },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const jobId = (body.job_id as string) ?? null

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const functionName = `sync-${step}`
    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ job_id: jobId }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      return NextResponse.json(
        { error: `Edge Function ${functionName} failed`, detail: errorBody },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      {
        error: "Sync proxy failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
