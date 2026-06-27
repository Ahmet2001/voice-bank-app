import { callQwenAgentDetailed, extractJson, safeThinkingSummary } from "@/lib/finance-ai/local-qwen"
import { getSystemPrompt } from "@/lib/finance-ai/system-prompts"
import type { AgentInput, AgentReport } from "@/lib/finance-ai/schemas"
import { clampConfidence, fallbackReport } from "@/lib/finance-ai/agents/utils"

type FraudRiskModelResult = {
  summary?: string
  findings?: string[]
  confidence?: number
  requiresHumanApproval?: boolean
}

export async function runFraudRiskAgent(input: AgentInput): Promise<AgentReport> {
  try {
    const result = await callQwenAgentDetailed({
      role: "fraud_risk",
      messages: [
        { role: "system", content: getSystemPrompt("fraud_risk") },
        {
          role: "user",
          content: JSON.stringify({
            userPrompt: input.userPrompt,
            gate: input.gate,
            context: input.context,
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
    const parsed = extractJson<FraudRiskModelResult>(result.content)

    return {
      role: "fraud_risk",
      summary: parsed?.summary ?? result.content.trim(),
      findings: parsed?.findings?.length ? parsed.findings.slice(0, 4) : ["Risk sinyali modeli yapılandırılmış bulgu döndürmedi."],
      confidence: clampConfidence(parsed?.confidence, 0.74),
      thinkingSummary: safeThinkingSummary("fraud_risk", result.thinking),
      requiresHumanApproval: parsed?.requiresHumanApproval ?? (input.gate.riskLevel === "high" || input.gate.riskLevel === "critical"),
    }
  } catch {
    const prompt = input.userPrompt.toLocaleLowerCase("tr-TR")
    const highRiskWords = /\b(acil|hemen|patron|polis|savci|bilinmeyen|yeni iban)\b/.test(prompt)
    return fallbackReport("fraud_risk", "Dolandırıcılık/risk sinyalleri yerel kurallarla tarandı.", [
      highRiskWords ? "Acil veya baskı içeren ifade görüldü; ekstra dikkat gerekir." : "Belirgin aciliyet veya baskı sinyali yok.",
      input.gate.riskLevel === "high" || input.gate.riskLevel === "critical"
        ? "İşlem yüksek riskli olduğu için insan onayı gerekir."
        : "Bu istek yüksek riskli işlem gibi görünmüyor.",
    ])
  }
}
