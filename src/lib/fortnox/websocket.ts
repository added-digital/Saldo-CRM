import type { FortnoxWebsocketEvent } from "@/types/fortnox"

/**
 * Stub: Fortnox websocket event handler.
 *
 * Fortnox uses Apache Kafka-backed websockets for real-time events.
 * This handler should run as a long-lived process (NOT a Next.js API route).
 *
 * Events contain:
 * - topic: "customers"
 * - offset: Kafka offset for resume capability
 * - type: "created" | "updated" | "deleted"
 * - entityId: Fortnox CustomerNumber
 *
 * Strategy:
 * - On "created"/"updated": fetch customer from Fortnox API, upsert into DB
 * - On "deleted": soft delete (set status = 'removed')
 * - Store last processed offset in fortnox_connection.websocket_offset
 * - On reconnect, resume from stored offset (up to 2 weeks replay)
 */
export async function handleWebsocketEvent(_event: FortnoxWebsocketEvent): Promise<void> {
  // TODO: Implement event handling
}

/**
 * Stub: Connect to Fortnox websocket.
 */
export async function connectWebsocket(_tenantId: string, _fromOffset?: string): Promise<void> {
  // TODO: Implement websocket connection
}
