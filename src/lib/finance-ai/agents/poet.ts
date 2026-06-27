import { callQwenAgentDetailed, safeThinkingSummary } from "@/lib/finance-ai/local-qwen"
import { getSystemPrompt } from "@/lib/finance-ai/system-prompts"
import type { AgentInput, AgentReport } from "@/lib/finance-ai/schemas"
import { fallbackReport, textToFindings } from "@/lib/finance-ai/agents/utils"

export async function runPoetAgent(input: AgentInput): Promise<AgentReport> {
  try {
    const result = await callQwenAgentDetailed({
      role: "poet",
      messages: [
        { role: "system", content: getSystemPrompt("poet") },
        {
          role: "user",
          content: JSON.stringify({
            userPrompt: input.userPrompt,
            gate: input.gate,
            plan: input.plan,
            reports: input.reports,
            draft: input.draft,
            task: "Write the final Turkish user-facing answer. Keep it short, calm, and TTS-friendly.",
          }),
        },
      ],
      temperature: 0.2,
    })

    return {
      role: "poet",
      summary: result.content.trim(),
      findings: textToFindings(result.content),
      confidence: 0.8,
      thinkingSummary: safeThinkingSummary("poet", result.thinking),
      requiresHumanApproval: input.plan?.requiresHumanApproval,
    }
  } catch {
    return fallbackReport("poet", input.draft ?? "İstek güvenli şekilde değerlendirildi.", [
      input.plan?.requiresHumanApproval
        ? "Onay gereken işlemler insan onayı olmadan tamamlanmaz."
        : "Yanıt kısa ve kullanıcıya dönük tutuldu.",
    ])
  }
}
