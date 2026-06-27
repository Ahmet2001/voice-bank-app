import { callQwenAgentDetailed, extractJson, safeThinkingSummary } from "@/lib/finance-ai/local-qwen"
import { getSystemPrompt } from "@/lib/finance-ai/system-prompts"
import type { AgentInput, AgentReport } from "@/lib/finance-ai/schemas"
import { clampConfidence, fallbackReport } from "@/lib/finance-ai/agents/utils"

type ComplianceModelResult = {
  summary?: string
  findings?: string[]
  confidence?: number
  requiresHumanApproval?: boolean
}

export async function runComplianceAgent(input: AgentInput): Promise<AgentReport> {
  try {
    const result = await callQwenAgentDetailed({
      role: "compliance",
      messages: [
        { role: "system", content: getSystemPrompt("compliance") },
        {
          role: "user",
          content: JSON.stringify({
            userPrompt: input.userPrompt,
            gate: input.gate,
            plan: input.plan,
            reports: input.reports,
            draft: input.draft,
            schema: {
              summary: "string",
              findings: ["string"],
              confidence: "number 0..1",
              requiresHumanApproval: "boolean",
            },
          }),
        },
      ],
      temperature: 0.1,
      json: true,
    })
    const parsed = extractJson<ComplianceModelResult>(result.content)

    return {
      role: "compliance",
      summary: parsed?.summary ?? result.content.trim(),
      findings: parsed?.findings?.length ? parsed.findings.slice(0, 4) : ["Compliance modeli yapılandırılmış bulgu döndürmedi."],
      confidence: clampConfidence(parsed?.confidence, 0.78),
      thinkingSummary: safeThinkingSummary("compliance", result.thinking),
      requiresHumanApproval: parsed?.requiresHumanApproval ?? input.plan?.requiresHumanApproval,
    }
  } catch {
    return fallbackReport("compliance", "Uygunluk kontrolü yerel kurallarla yapıldı.", [
      input.plan?.requiresHumanApproval
        ? "Yüksek riskli işlem için insan onayı planlandı."
        : "İnsan onayı gerektiren bir araç planı yok.",
      "Yatırım ifadeleri doğrudan al/sat tavsiyesi olmamalı.",
    ])
  }
}
