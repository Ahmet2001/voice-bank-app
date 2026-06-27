import { callQwenAgentDetailed, safeThinkingSummary } from "@/lib/finance-ai/local-qwen"
import { getSystemPrompt } from "@/lib/finance-ai/system-prompts"
import type { AgentInput, AgentReport } from "@/lib/finance-ai/schemas"
import { fallbackReport, textToFindings } from "@/lib/finance-ai/agents/utils"

export async function runProfessorAgent(input: AgentInput): Promise<AgentReport> {
  try {
    const result = await callQwenAgentDetailed({
      role: "professor",
      messages: [
        { role: "system", content: getSystemPrompt("professor") },
        {
          role: "user",
          content: JSON.stringify({
            userPrompt: input.userPrompt,
            gate: input.gate,
            context: input.context,
            task: "Compute concise portfolio, budget, balance, or trade math for the orchestrator.",
          }),
        },
      ],
      temperature: 0.1,
    })

    return {
      role: "professor",
      summary: result.content.trim(),
      findings: textToFindings(result.content),
      confidence: 0.8,
      thinkingSummary: safeThinkingSummary("professor", result.thinking),
    }
  } catch {
    const holdings = input.context.holdings ?? []
    const total = holdings.reduce((sum, holding) => sum + holding.quantity * holding.price, 0)
    const largest = holdings
      .map((holding) => ({ holding, value: holding.quantity * holding.price }))
      .sort((left, right) => right.value - left.value)[0]

    return fallbackReport("professor", "Temel hesaplama yerel kurallarla yapıldı.", [
      holdings.length ? `Portföy yaklaşık toplamı ${total.toFixed(2)} USD seviyesinde.` : "Hesaplama için yeterli portföy verisi yok.",
      largest ? `En büyük pozisyon yaklaşık ${largest.holding.symbol} (${largest.value.toFixed(2)} USD).` : "Baskın pozisyon bulunamadı.",
    ])
  }
}
