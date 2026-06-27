import { callQwenAgentDetailed, safeThinkingSummary } from "@/lib/finance-ai/local-qwen"
import { getSystemPrompt } from "@/lib/finance-ai/system-prompts"
import type { AgentInput, AgentReport } from "@/lib/finance-ai/schemas"
import { fallbackReport, textToFindings } from "@/lib/finance-ai/agents/utils"

export async function runResearcherAgent(input: AgentInput): Promise<AgentReport> {
  try {
    const result = await callQwenAgentDetailed({
      role: "researcher",
      messages: [
        { role: "system", content: getSystemPrompt("researcher") },
        {
          role: "user",
          content: JSON.stringify({
            userPrompt: input.userPrompt,
            gate: input.gate,
            context: input.context,
            task: "Produce a concise Turkish research report for the orchestrator.",
          }),
        },
      ],
      temperature: 0.2,
    })

    return {
      role: "researcher",
      summary: result.content.trim(),
      findings: textToFindings(result.content),
      confidence: 0.82,
      thinkingSummary: safeThinkingSummary("researcher", result.thinking),
    }
  } catch {
    return fallbackReport("researcher", fallbackResearchSummary(input.userPrompt), [
      "Educational finance answers should stay general and avoid direct investment commands.",
    ])
  }
}

function fallbackResearchSummary(userPrompt: string) {
  const lower = userPrompt.toLocaleLowerCase("tr-TR")
  if (lower.includes("etf")) {
    return "ETF, bir sepet varlığı tek ürün gibi alıp satmayı sağlayan borsa yatırım fonudur. Riski, içindeki varlıklara göre değişir."
  }
  if (lower.includes("faiz")) {
    return "Faiz, paranın belirli süre kullanılmasının maliyeti veya getirisidir. Kredi ve mevduatta farklı etkiler yaratır."
  }
  return "Konu finans alanında değerlendirildi. Eksik bilgi varsa kullanıcıya bunu açıkça söylemek gerekir."
}
