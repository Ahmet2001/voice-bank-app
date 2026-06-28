import { callQwenAgentDetailed, safeThinkingSummary } from "@/lib/finance-ai/local-qwen"
import { getSystemPrompt } from "@/lib/finance-ai/system-prompts"
import type { AgentInput, AgentReport } from "@/lib/finance-ai/schemas"
import { fallbackReport, textToFindings } from "@/lib/finance-ai/agents/utils"

export async function runPoetAgent(input: AgentInput): Promise<AgentReport> {
  try {
    const result = await callQwenAgentDetailed({
      role: "poet",
      messages: [
        { role: "system", content: getSystemPrompt("poet") + "\n\nYou MUST think out loud step-by-step. Your response must begin with <think> and end with </think> before you write the final Turkish response." },
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
        { role: "assistant", content: "<think>\n" }
      ],
      temperature: 0.3,
      onChunk: input.onChunk,
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
