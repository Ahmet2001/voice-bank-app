import { NextResponse } from "next/server"

import { confirmAction } from "@/lib/sandbox-bank/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    confirmationId?: string
    approved?: boolean
  }

  if (!body.confirmationId || typeof body.approved !== "boolean") {
    return NextResponse.json({ error: "confirmationId ve approved gerekli." }, { status: 400 })
  }

  const agentServiceUrl = process.env.AGENT_SERVICE_URL
  if (agentServiceUrl) {
    try {
      const upstream = await fetch(new URL("/bank/confirm", agentServiceUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      })

      if (upstream.ok) {
        return NextResponse.json(await upstream.json())
      }
    } catch {
      // Fall through to local SQLite sandbox.
    }
  }

  return NextResponse.json(await confirmAction(body.confirmationId, body.approved))
}
