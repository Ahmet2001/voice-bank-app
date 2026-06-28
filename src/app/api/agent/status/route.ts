import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const agentServiceUrl = process.env.AGENT_SERVICE_URL
  const groqConfigured = Boolean(process.env.GROQ_API_KEY)

  if (!agentServiceUrl) {
    return NextResponse.json({
      commandRuntime: "local-orchestrator",
      commandLabel: groqConfigured ? "Yerel finance orchestrator + Groq fallback" : "Yerel finance orchestrator",
      hermes: groqConfigured ? "connected" : "fallback",
    })
  }

  try {
    const response = await fetch(new URL("/health", agentServiceUrl), {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    })
    const health = (await response.json().catch(() => ({}))) as { hermes?: boolean }

    return NextResponse.json({
      commandRuntime: "local-orchestrator",
      commandLabel: "Yerel finance orchestrator",
      hermes: health.hermes ? "connected" : "service-fallback",
    })
  } catch {
    return NextResponse.json({
      commandRuntime: "local-orchestrator",
      commandLabel: "Yerel finance orchestrator",
      hermes: "service-offline",
    })
  }
}
