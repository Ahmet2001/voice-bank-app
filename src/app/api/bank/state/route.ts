import { NextResponse } from "next/server"

import { readBankState } from "@/lib/sandbox-bank/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(await readBankState())
}
