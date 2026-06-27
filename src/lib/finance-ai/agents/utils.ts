import type { AgentReport, AgentRole } from "@/lib/finance-ai/schemas"

export function textToFindings(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 4)
}

export function clampConfidence(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback
}

export function fallbackReport(role: AgentRole, summary: string, findings: string[]): AgentReport {
  return {
    role,
    summary: `[local fallback] ${summary}`,
    findings: findings.map((finding) => `[local fallback] ${finding}`),
    confidence: 0.62,
    thinkingSummary: "Local fallback kullanıldı; model thinking üretmedi.",
  }
}
