import { NextResponse } from "next/server"

import { getAuditTrace } from "@/lib/finance-ai/audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ traceId: string }> }
) {
  const { traceId } = await context.params
  const trace = getAuditTrace(traceId)

  if (!trace) {
    return NextResponse.json({ error: "Trace bulunamadı." }, { status: 404 })
  }

  return NextResponse.json(trace)
}
