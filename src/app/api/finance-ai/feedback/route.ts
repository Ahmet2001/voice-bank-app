import { NextResponse } from "next/server"

import { saveFinanceAiFeedback } from "@/lib/finance-ai/feedback-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    traceId?: string
    rating?: number
    correction?: string
    approved?: boolean
  }

  const entry = await saveFinanceAiFeedback({
    traceId: body.traceId,
    rating: typeof body.rating === "number" ? body.rating : undefined,
    correction: typeof body.correction === "string" ? body.correction : undefined,
    approved: typeof body.approved === "boolean" ? body.approved : undefined,
  })

  return NextResponse.json({ ok: true, feedback: entry })
}
