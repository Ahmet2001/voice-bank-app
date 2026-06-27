export type FinanceIntent =
  | "financial_education"
  | "balance_query"
  | "portfolio_analysis"
  | "transaction_request"
  | "card_management"
  | "market_query"
  | "customer_support"
  | "out_of_scope"

export type RiskLevel = "low" | "medium" | "high" | "critical"

export type FinanceGateResult = {
  isFinanceRelated: boolean
  intent: FinanceIntent
  riskLevel: RiskLevel
  reason: string
}

export type AgentRole =
  | "researcher"
  | "professor"
  | "poet"
  | "finance_analyst"
  | "compliance"
  | "fraud_risk"

export type FinalAnswerMode =
  | "direct"
  | "advisor_review"
  | "confirmation_required"
  | "safe_rejection"

export type ToolRisk =
  | "safe_read"
  | "sensitive_read"
  | "approval_required"
  | "blocked"

export type ToolRequest = {
  name: string
  risk: ToolRisk
  reason: string
  requiresHumanApproval: boolean
}

export type OrchestratorPlan = {
  taskId: string
  intent: FinanceGateResult["intent"]
  riskLevel: FinanceGateResult["riskLevel"]
  selectedAgents: AgentRole[]
  toolPlan: ToolRequest[]
  requiresHumanApproval: boolean
  finalAnswerMode: FinalAnswerMode
}

export type AgentReport = {
  role: AgentRole
  summary: string
  findings: string[]
  confidence: number
  thinkingSummary?: string
  requiresHumanApproval?: boolean
}

export type ToolCallTrace = {
  name: string
  risk: ToolRisk
  reason: string
  status: "planned" | "called" | "skipped" | "blocked" | "fallback"
  requiresHumanApproval: boolean
  detail?: string
  createdAt: string
}

export type JudgeResult = {
  approved: boolean
  score: number
  failedComponent?: string
  issues: string[]
  requiredFix?: string
  nextStep: "finalize" | "retry_orchestration" | "human_review" | "block"
}

export type PersonaProfile = {
  financialLiteracy: "low"
  preferredTone: "simple_calm"
  voiceFirst: true
  locale: "tr-TR"
}

export type FinanceContext = {
  persona: PersonaProfile
  accounts?: {
    id: string
    name: string
    type: string
    currency: string
    balance: number
    available: number
  }[]
  contacts?: {
    id: string
    name: string
    relation: string
    accountLabel: string
    currency: string
    trustLevel: string
    aliases: string[]
  }[]
  transactions?: {
    id: string
    type: string
    title: string
    subtitle: string
    amount: number
    currency: string
    status: string
    category: string
    createdAt: string
  }[]
  cards?: {
    id: string
    name: string
    last4: string
    network: string
    status: string
    limitAmount: number
    spent: number
    currency: string
  }[]
  budgets?: {
    id: string
    name: string
    spent: number
    limitAmount: number
    currency: string
  }[]
  holdings?: {
    symbol: string
    name: string
    kind: string
    quantity: number
    price: number
    currency: string
    changePercent: number
  }[]
  marketQuotes?: {
    symbol: string
    name: string
    price: number
    currency: string
    changePercent: number
    source: string
    updatedAt: string
  }[]
  pendingConfirmation?: {
    id: string
    status: string
    summary: string
    payloadKind: string
  }
  updatedAt: string
}

export type AgentInput = {
  userPrompt: string
  gate: FinanceGateResult
  context: FinanceContext
  plan?: OrchestratorPlan
  reports?: AgentReport[]
  draft?: string
}

export type FinanceOrchestrationTrace = {
  traceId: string
  taskId: string
  userPrompt: string
  gate: FinanceGateResult
  selectedAgents: AgentRole[]
  toolCalls: ToolCallTrace[]
  agentReports: AgentReport[]
  judge: JudgeResult
  requiresHumanApproval: boolean
  finalMessage: string
  fallbackUsed: boolean
  createdAt: string
}
