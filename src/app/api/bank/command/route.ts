import { NextResponse } from "next/server"

import { runLocalFinanceOrchestration } from "@/lib/finance-ai/orchestrator"
import { runGroqBankCommand } from "@/lib/sandbox-bank/groq-agent"
import { runBankCommand } from "@/lib/sandbox-bank/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string }
  const text = body.text?.trim()

  if (!text) {
    return NextResponse.json({ error: "Komut boş olamaz." }, { status: 400 })
  }

  const agentServiceUrl = process.env.AGENT_SERVICE_URL
  if (agentServiceUrl) {
    try {
      const upstream = await fetch(new URL("/finance/orchestrate", agentServiceUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(20000),
      })

      if (upstream.ok) {
        return NextResponse.json(await upstream.json())
      }
    } catch {
      // Local sandbox agent stays available when the external service is off.
    }
  }

  try {
    return NextResponse.json(await runLocalFinanceOrchestration(text))
  } catch {
    if (process.env.ENABLE_LEGACY_GROQ_FALLBACK === "true") {
      const groqResult = await runGroqBankCommand(text)
      if (groqResult) return NextResponse.json(groqResult)
    }

    return NextResponse.json(await runBankCommand(text))
  }
}
