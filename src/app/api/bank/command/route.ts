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

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(data: any) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      try {
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
              sendEvent({ type: "result", payload: await upstream.json() })
              return
            }
          } catch {
            // Local sandbox agent stays available when the external service is off.
          }
        }

        try {
          const result = await runLocalFinanceOrchestration(text, (event) => {
            sendEvent(event)
          })
          sendEvent({ type: "result", payload: result })
        } catch {
          if (process.env.ENABLE_LEGACY_GROQ_FALLBACK === "true") {
            const groqResult = await runGroqBankCommand(text)
            if (groqResult) {
              sendEvent({ type: "result", payload: groqResult })
              return
            }
          }

          const fallbackResult = await runBankCommand(text)
          sendEvent({ type: "result", payload: fallbackResult })
        }
      } finally {
        try {
          controller.close()
        } catch {}
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
