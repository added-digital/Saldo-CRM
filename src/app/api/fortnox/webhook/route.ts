import { NextRequest, NextResponse } from "next/server"
import { handleWebsocketEvent } from "@/lib/fortnox/websocket"
import type { FortnoxWebsocketEvent } from "@/types/fortnox"

export async function POST(request: NextRequest) {
  try {
    const event: FortnoxWebsocketEvent = await request.json()

    await handleWebsocketEvent(event)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ success: true })
  }
}
