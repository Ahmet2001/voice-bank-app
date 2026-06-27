import "server-only"

import fs from "node:fs"
import path from "node:path"

const DATA_DIR = path.join(process.cwd(), "data")
const FEEDBACK_PATH = path.join(DATA_DIR, "finance-ai-feedback.jsonl")

export type FinanceAiFeedback = {
  traceId?: string
  rating?: number
  correction?: string
  approved?: boolean
  createdAt: string
}

export async function saveFinanceAiFeedback(input: Omit<FinanceAiFeedback, "createdAt">) {
  const entry: FinanceAiFeedback = {
    traceId: input.traceId,
    rating: input.rating,
    correction: input.correction,
    approved: input.approved,
    createdAt: new Date().toISOString(),
  }

  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true })
    await fs.promises.appendFile(FEEDBACK_PATH, `${JSON.stringify(entry)}\n`, "utf8")
  } catch {
    // Feedback is best effort for the local hackathon sandbox.
  }

  return entry
}
