import "server-only"

import fs from "node:fs"
import path from "node:path"

import type { FinanceOrchestrationTrace } from "@/lib/finance-ai/schemas"

const DATA_DIR = path.join(process.cwd(), "data")
const AUDIT_PATH = path.join(DATA_DIR, "finance-ai-audit.jsonl")

const traces = new Map<string, FinanceOrchestrationTrace>()
let latestTraceId: string | undefined

export async function recordAuditTrace(trace: FinanceOrchestrationTrace) {
  traces.set(trace.traceId, trace)
  latestTraceId = trace.traceId

  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true })
    await fs.promises.appendFile(AUDIT_PATH, `${JSON.stringify(trace)}\n`, "utf8")
  } catch {
    // The in-memory trace remains available even if local file persistence fails.
  }
}

export function getAuditTrace(traceId: string) {
  if (traceId === "latest") {
    return latestTraceId ? traces.get(latestTraceId) : readLatestTraceFromDisk()
  }

  return traces.get(traceId) ?? readTraceFromDisk(traceId)
}

function readTraceFromDisk(traceId: string) {
  try {
    const lines = fs.readFileSync(AUDIT_PATH, "utf8").trim().split("\n").reverse()
    for (const line of lines) {
      const parsed = JSON.parse(line) as FinanceOrchestrationTrace
      if (parsed.traceId === traceId) return parsed
    }
  } catch {
    return undefined
  }
}

function readLatestTraceFromDisk() {
  try {
    const lines = fs.readFileSync(AUDIT_PATH, "utf8").trim().split("\n")
    const line = lines.at(-1)
    return line ? (JSON.parse(line) as FinanceOrchestrationTrace) : undefined
  } catch {
    return undefined
  }
}
