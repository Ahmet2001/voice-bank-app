import type { BankState } from "@/lib/sandbox-bank/types"
import type { FinanceContext, FinanceGateResult, PersonaProfile } from "@/lib/finance-ai/schemas"

export const demoPersona: PersonaProfile = {
  financialLiteracy: "low",
  preferredTone: "simple_calm",
  voiceFirst: true,
  locale: "tr-TR",
}

export function buildFinanceContext(state: BankState, gate: FinanceGateResult): FinanceContext {
  const base: FinanceContext = {
    persona: demoPersona,
    pendingConfirmation: state.pendingConfirmation
      ? {
          id: state.pendingConfirmation.id,
          status: state.pendingConfirmation.status,
          summary: state.pendingConfirmation.summary,
          payloadKind: state.pendingConfirmation.payload.kind,
        }
      : undefined,
    updatedAt: state.updatedAt,
  }

  if (gate.intent === "balance_query") {
    return {
      ...base,
      accounts: state.accounts,
    }
  }

  if (gate.intent === "transaction_request") {
    return {
      ...base,
      accounts: state.accounts,
      contacts: state.contacts,
    }
  }

  if (gate.intent === "portfolio_analysis" || gate.intent === "market_query") {
    return {
      ...base,
      budgets: state.budgets,
      holdings: state.holdings,
      marketQuotes: state.marketQuotes,
    }
  }

  if (gate.intent === "card_management") {
    return {
      ...base,
      cards: state.cards,
    }
  }

  if (gate.intent === "customer_support") {
    return {
      ...base,
      accounts: state.accounts.map((account) => ({
        ...account,
        balance: 0,
        available: 0,
      })),
      cards: state.cards.map((card) => ({
        ...card,
        last4: card.last4,
      })),
    }
  }

  return base
}
