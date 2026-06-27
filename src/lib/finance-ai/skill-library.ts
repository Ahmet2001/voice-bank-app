import type { FinanceIntent } from "@/lib/finance-ai/schemas"

const SKILL_LIBRARY: Record<FinanceIntent, string[]> = {
  financial_education: [
    "Explain concepts with simple Turkish examples.",
    "Avoid buy/sell commands and guaranteed outcome language.",
  ],
  balance_query: [
    "Read only the account summary needed for the answer.",
    "Use short TTS-friendly balance summaries.",
  ],
  portfolio_analysis: [
    "Discuss concentration and diversification cautiously.",
    "Suggest advisor review for personalized investment decisions.",
  ],
  transaction_request: [
    "Never execute a transfer or trade without explicit human approval.",
    "Use the sandbox confirmation flow for every mutation.",
  ],
  card_management: [
    "Card freeze, unfreeze, and limit changes require confirmation.",
    "Keep card information minimal in user-facing text.",
  ],
  market_query: [
    "Use market data as informational context, not a recommendation.",
    "Include risk language for market and crypto discussion.",
  ],
  customer_support: [
    "Give short next steps and stay inside banking support.",
  ],
  out_of_scope: [
    "Reject politely and redirect to banking or finance topics.",
  ],
}

export function getSkillLibraryForIntent(intent: FinanceIntent): string[] {
  return SKILL_LIBRARY[intent]
}
