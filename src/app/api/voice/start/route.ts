import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const agentServiceUrl = process.env.AGENT_SERVICE_URL

  if (!agentServiceUrl) {
    return NextResponse.json(
      {
        error: "AGENT_SERVICE_URL ayarlı değil.",
        fallback: "Tarayıcı mikrofonu ve metin komutları aktif.",
      },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => ({}))

  try {
    const upstream = await fetch(new URL("/start", agentServiceUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    const payload = await upstream.json().catch(() => ({}))
    return NextResponse.json(payload, { status: upstream.status })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Voice agent servisine ulaşılamadı.",
        fallback: "Tarayıcı mikrofonu ve metin komutları aktif.",
      },
      { status: 503 }
    )
  }
}
