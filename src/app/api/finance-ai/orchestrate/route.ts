import { NextResponse } from "next/server"

import { runLocalFinanceOrchestration } from "@/lib/finance-ai/orchestrator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string }
  const text = body.text?.trim()

  if (!text) {
    return NextResponse.json({ error: "text gerekli." }, { status: 400 })
  }

  return NextResponse.json(await runLocalFinanceOrchestration(text))
}
