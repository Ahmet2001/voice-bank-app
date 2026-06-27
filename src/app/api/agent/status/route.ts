import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const agentServiceUrl = process.env.AGENT_SERVICE_URL
  const pipecatStartUrl = process.env.PIPECAT_BOT_START_URL
  const groqConfigured = Boolean(process.env.GROQ_API_KEY)

  if (!agentServiceUrl) {
    return NextResponse.json({
      commandRuntime: groqConfigured ? "groq-sandbox" : "local-sandbox",
      commandLabel: groqConfigured ? "Groq + banking toolset" : "Yerel sandbox agent",
      hermes: groqConfigured ? "connected" : "fallback",
      pipecat: pipecatStartUrl ? "configured" : "browser-fallback",
    })
  }

  try {
    const response = await fetch(new URL("/health", agentServiceUrl), {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    })
    const health = (await response.json().catch(() => ({}))) as { hermes?: boolean }

    return NextResponse.json({
      commandRuntime: "agent-service",
      commandLabel: "Agent service",
      hermes: health.hermes ? "connected" : "service-fallback",
      pipecat: pipecatStartUrl ? "configured" : "browser-fallback",
    })
  } catch {
    return NextResponse.json({
      commandRuntime: "local-sandbox",
      commandLabel: "Yerel sandbox agent",
      hermes: "service-offline",
      pipecat: pipecatStartUrl ? "configured" : "browser-fallback",
    })
  }
}
