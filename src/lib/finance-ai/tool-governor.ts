import type {
  FinanceGateResult,
  RiskLevel,
  ToolRequest,
  ToolRisk,
} from "@/lib/finance-ai/schemas"

export const financeToolRegistry: Record<
  string,
  {
    risk: ToolRisk
    requiresHumanApproval: boolean
  }
> = {
  getBankState: {
    risk: "safe_read",
    requiresHumanApproval: false,
  },
  getTransactions: {
    risk: "sensitive_read",
    requiresHumanApproval: false,
  },
  prepareTransfer: {
    risk: "approval_required",
    requiresHumanApproval: true,
  },
  prepareTrade: {
    risk: "approval_required",
    requiresHumanApproval: true,
  },
  updateCardStatus: {
    risk: "approval_required",
    requiresHumanApproval: true,
  },
  updateCardLimit: {
    risk: "approval_required",
    requiresHumanApproval: true,
  },
  executeConfirmedAction: {
    risk: "approval_required",
    requiresHumanApproval: true,
  },
  rejectOutOfScope: {
    risk: "blocked",
    requiresHumanApproval: false,
  },
}

function tool(name: keyof typeof financeToolRegistry, reason: string): ToolRequest {
  const entry = financeToolRegistry[name]
  return {
    name,
    risk: entry.risk,
    reason,
    requiresHumanApproval: entry.requiresHumanApproval,
  }
}

export function getToolPlanForIntent(gate: FinanceGateResult): ToolRequest[] {
  if (!gate.isFinanceRelated) {
    return [tool("rejectOutOfScope", "Prompt is outside the finance domain.")]
  }

  if (gate.intent === "balance_query") {
    return [tool("getBankState", "Read sandbox account balances.")]
  }

  if (gate.intent === "transaction_request") {
    return [
      tool("getBankState", "Read sandbox accounts before preparing an action."),
      tool("prepareTransfer", "Prepare money movement or trade through existing confirmation flow."),
      tool("prepareTrade", "Prepare buy/sell trade through existing confirmation flow."),
    ]
  }

  if (gate.intent === "card_management") {
    return [
      tool("getBankState", "Read sandbox cards before preparing a card action."),
      tool("updateCardStatus", "Prepare card status changes through confirmation flow."),
      tool("updateCardLimit", "Prepare card limit changes through confirmation flow."),
    ]
  }

  if (gate.intent === "portfolio_analysis") {
    return [
      tool("getBankState", "Read portfolio holdings and budgets for analysis."),
      tool("getTransactions", "Optionally inspect recent sandbox transaction context."),
    ]
  }

  if (gate.intent === "market_query") {
    return [tool("getBankState", "Read current sandbox market quotes.")]
  }

  return [tool("getBankState", "Use minimal sandbox context for a safe finance answer.")]
}

export function requiresHumanApproval(toolPlan: ToolRequest[], riskLevel: RiskLevel): boolean {
  return (
    riskLevel === "high" ||
    riskLevel === "critical" ||
    toolPlan.some((request) => request.requiresHumanApproval)
  )
}
