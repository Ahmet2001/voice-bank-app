import { callQwenAgentDetailed, safeThinkingSummary } from "@/lib/finance-ai/local-qwen"
import { getSystemPrompt } from "@/lib/finance-ai/system-prompts"
import type { AgentInput, AgentReport } from "@/lib/finance-ai/schemas"
import { fallbackReport, textToFindings } from "@/lib/finance-ai/agents/utils"

export async function runFinanceAnalystAgent(input: AgentInput): Promise<AgentReport> {
  try {
    const result = await callQwenAgentDetailed({
      role: "finance_analyst",
      messages: [
        { role: "system", content: getSystemPrompt("finance_analyst") },
        {
          role: "user",
          content: JSON.stringify({
            userPrompt: input.userPrompt,
            gate: input.gate,
            context: input.context,
            task: "Analyze the provided sandbox financial context without direct investment advice.",
          }),
        },
      ],
      temperature: 0.2,
    })

    return {
      role: "finance_analyst",
      summary: result.content.trim(),
      findings: textToFindings(result.content),
      confidence: 0.78,
      thinkingSummary: safeThinkingSummary("finance_analyst", result.thinking),
    }
  } catch {
    const accounts = input.context.accounts ?? []
    const holdings = input.context.holdings ?? []
    const budgets = input.context.budgets ?? []
    const accountFinding = accounts.length
      ? `Okunan hesap sayısı ${accounts.length}; kullanıcıya yalnız gerekli özet verilmeli.`
      : "Hesap özeti bu görev için gerekli değil veya seçilmedi."
    const holdingFinding = holdings.length
      ? `Portföyde ${holdings.length} varlık var; yoğunlaşma danışmanla değerlendirilmeli.`
      : "Portföy analizi için varlık verisi yok."
    const budgetFinding = budgets.length
      ? `Bütçe satırları risk ve harcama bağlamı için kullanılabilir.`
      : "Bütçe verisi seçilmedi."

    return fallbackReport("finance_analyst", "Finans analizi yerel kurallarla özetlendi.", [
      accountFinding,
      holdingFinding,
      budgetFinding,
    ])
  }
}
