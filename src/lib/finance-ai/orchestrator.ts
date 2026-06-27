import "server-only"

import { runSpecialistAgent } from "@/lib/finance-ai/agents"
import { recordAuditTrace } from "@/lib/finance-ai/audit-log"
import { buildFinanceContext } from "@/lib/finance-ai/context-builder"
import { runFinanceGate } from "@/lib/finance-ai/gate"
import { runJudge } from "@/lib/finance-ai/judge"
import { callQwenAgent, extractJson } from "@/lib/finance-ai/local-qwen"
import {
  getToolPlanForIntent,
  requiresHumanApproval as planRequiresHumanApproval,
} from "@/lib/finance-ai/tool-governor"
import { getSkillLibraryForIntent } from "@/lib/finance-ai/skill-library"
import { getSystemPrompt } from "@/lib/finance-ai/system-prompts"
import { formatMoney } from "@/lib/sandbox-bank/format"
import { readBankState, runBankCommand } from "@/lib/sandbox-bank/store"
import type { AgentEvent, BankAgentResult, BankState, Currency } from "@/lib/sandbox-bank/types"
import type {
  AgentReport,
  AgentRole,
  FinanceContext,
  FinanceGateResult,
  FinanceIntent,
  FinanceOrchestrationTrace,
  FinalAnswerMode,
  OrchestratorPlan,
  RiskLevel,
  ToolCallTrace,
  ToolRequest,
} from "@/lib/finance-ai/schemas"

const AGENT_ROLES: AgentRole[] = [
  "researcher",
  "professor",
  "poet",
  "finance_analyst",
  "compliance",
  "fraud_risk",
]

const AGENTS_BY_INTENT: Record<FinanceIntent, AgentRole[]> = {
  financial_education: ["researcher", "poet"],
  balance_query: ["finance_analyst", "poet"],
  portfolio_analysis: ["finance_analyst", "professor", "poet"],
  transaction_request: ["fraud_risk", "compliance", "poet"],
  card_management: ["fraud_risk", "compliance", "poet"],
  market_query: ["researcher", "finance_analyst", "poet"],
  customer_support: ["researcher", "poet"],
  out_of_scope: [],
}

type PlanModelResult = Partial<OrchestratorPlan>

export async function runLocalFinanceOrchestration(userText: string): Promise<BankAgentResult> {
  const traceId = `trace-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const createdAt = new Date().toISOString()
  const gate = runFinanceGate(userText)
  const initialState = await readBankState()
  const context = buildFinanceContext(initialState, gate)

  if (!gate.isFinanceRelated) {
    const finalMessage = "Bu asistan yalnızca bankacılık, finans, bütçe, kart, transfer ve yatırım okuryazarlığı konularında yardımcı olabilir."
    const plan = fallbackPlan(traceId, gate, true)
    const judge = {
      approved: true,
      score: 0.95,
      issues: [],
      nextStep: "finalize" as const,
    }
    const toolCalls = toToolCallTrace(plan.toolPlan, "blocked")
    const trace: FinanceOrchestrationTrace = {
      traceId,
      taskId: plan.taskId,
      userPrompt: userText,
      gate,
      selectedAgents: [],
      toolCalls,
      agentReports: [],
      judge,
      requiresHumanApproval: false,
      finalMessage,
      fallbackUsed: false,
      createdAt,
    }
    await recordAuditTrace(trace)
    return makeResult(finalMessage, userText, initialState, trace, [
      { type: "bank.tool_progress", label: "Finance Domain Gate", detail: gate.reason },
      { type: "bank.tool_progress", label: "Judge", detail: "Out-of-scope request safely rejected." },
    ])
  }

  const plan = await createOrchestratorPlan(userText, gate, context, traceId)
  const toolCalls = toToolCallTrace(plan.toolPlan, "planned")
  markReadToolsCalled(toolCalls)

  const reports: AgentReport[] = []
  for (const role of plan.selectedAgents.filter((role) => role !== "compliance" && role !== "poet")) {
    reports.push(await runSpecialistAgent(role, { userPrompt: userText, gate, context, plan, reports }))
  }

  const bankToolResult = shouldUseBankCommand(gate)
    ? await runBankCommand(userText)
    : undefined

  if (bankToolResult) {
    toolCalls.push(...toolCallsFromBankResult(bankToolResult, context, gate))
  }

  const state = bankToolResult?.state ?? initialState
  const nextContext = bankToolResult ? buildFinanceContext(state, gate) : context
  const draft = buildDraftAnswer(userText, gate, nextContext, reports, bankToolResult)

  if (plan.selectedAgents.includes("compliance")) {
    reports.push(await runSpecialistAgent("compliance", { userPrompt: userText, gate, context: nextContext, plan, reports, draft }))
  }

  let finalMessage = draft
  if (plan.selectedAgents.includes("poet")) {
    const poetReport = await runSpecialistAgent("poet", { userPrompt: userText, gate, context: nextContext, plan, reports, draft })
    reports.push(poetReport)
    finalMessage = poetReport.summary
  }

  finalMessage = enforceFinalSafety(finalMessage, gate, plan, bankToolResult)
  const judge = await runJudge({
    userPrompt: userText,
    gate,
    context: nextContext,
    plan,
    agentReports: reports,
    toolCalls,
    finalDraft: finalMessage,
  })

  if (!judge.approved || judge.nextStep === "block") {
    finalMessage = safeCorrection(gate, judge.issues)
  }

  finalMessage = cleanUserFacingFallbackPrefix(finalMessage)

  const trace: FinanceOrchestrationTrace = {
    traceId,
    taskId: plan.taskId,
    userPrompt: userText,
    gate,
    selectedAgents: plan.selectedAgents,
    toolCalls,
    agentReports: reports,
    judge,
    requiresHumanApproval: plan.requiresHumanApproval,
    finalMessage,
    fallbackUsed: usedFallback(plan, reports),
    createdAt,
  }
  await recordAuditTrace(trace)

  return makeResult(finalMessage, userText, state, trace, [
    { type: "bank.tool_progress", label: "Finance Domain Gate", detail: gate.reason },
    { type: "bank.tool_progress", label: "Context Builder", detail: `${Object.keys(nextContext).length} context section(s)` },
    { type: "bank.tool_progress", label: "Orchestrator", detail: `${plan.selectedAgents.join(", ")} selected` },
    ...(bankToolResult?.events ?? []),
    { type: "bank.tool_progress", label: "Judge", detail: judge.approved ? "Approved" : judge.issues.join("; ") },
    ...(plan.requiresHumanApproval && !bankToolResult?.events.some((event) => event.type === "bank.confirmation_required")
      ? [{ type: "bank.confirmation_required" as const, label: "Onay gerekiyor", detail: "Yüksek riskli finans işlemi" }]
      : []),
    ...(usedFallback(plan, reports)
      ? [{ type: "bank.tool_progress" as const, label: "local fallback", detail: "Local model call failed or timed out; deterministic sandbox logic answered safely." }]
      : []),
  ])
}

async function createOrchestratorPlan(
  userPrompt: string,
  gate: FinanceGateResult,
  context: FinanceContext,
  traceId: string
): Promise<OrchestratorPlan> {
  const deterministic = fallbackPlan(traceId, gate, false)

  try {
    const content = await callQwenAgent({
      role: "orchestrator",
      messages: [
        { role: "system", content: getSystemPrompt("orchestrator") },
        {
          role: "user",
          content: JSON.stringify({
            userPrompt,
            gate,
            context,
            deterministicSafetyPlan: deterministic,
            skillLibrary: getSkillLibraryForIntent(gate.intent),
            schema: {
              taskId: "string",
              intent: gate.intent,
              riskLevel: gate.riskLevel,
              selectedAgents: AGENT_ROLES,
              toolPlan: deterministic.toolPlan,
              requiresHumanApproval: "boolean",
              finalAnswerMode: "direct | advisor_review | confirmation_required | safe_rejection",
            },
          }),
        },
      ],
      temperature: 0.1,
      json: true,
    })
    const parsed = extractJson<PlanModelResult>(content)
    if (!parsed) return deterministic

    const selectedAgents = sanitizeAgents(parsed.selectedAgents, deterministic.selectedAgents)
    return {
      taskId: parsed.taskId?.trim() || deterministic.taskId,
      intent: gate.intent,
      riskLevel: gate.riskLevel,
      selectedAgents: ensureRequiredAgents(gate, selectedAgents),
      toolPlan: deterministic.toolPlan,
      requiresHumanApproval: deterministic.requiresHumanApproval || Boolean(parsed.requiresHumanApproval),
      finalAnswerMode: sanitizeMode(parsed.finalAnswerMode, deterministic.finalAnswerMode),
    }
  } catch {
    return {
      ...deterministic,
      taskId: `${deterministic.taskId}-local-fallback`,
    }
  }
}

function fallbackPlan(traceId: string, gate: FinanceGateResult, safeRejection: boolean): OrchestratorPlan {
  const toolPlan = getToolPlanForIntent(gate)
  const requiresHumanApproval = planRequiresHumanApproval(toolPlan, gate.riskLevel)
  return {
    taskId: `${traceId}-task`,
    intent: gate.intent,
    riskLevel: gate.riskLevel,
    selectedAgents: safeRejection ? [] : AGENTS_BY_INTENT[gate.intent],
    toolPlan,
    requiresHumanApproval,
    finalAnswerMode: safeRejection ? "safe_rejection" : modeFor(gate.intent, gate.riskLevel, requiresHumanApproval),
  }
}

function modeFor(intent: FinanceIntent, riskLevel: RiskLevel, requiresHumanApproval: boolean): FinalAnswerMode {
  if (intent === "out_of_scope") return "safe_rejection"
  if (requiresHumanApproval || riskLevel === "high" || riskLevel === "critical") return "confirmation_required"
  if (intent === "portfolio_analysis" || intent === "market_query") return "advisor_review"
  return "direct"
}

function sanitizeMode(value: unknown, fallback: FinalAnswerMode): FinalAnswerMode {
  return value === "direct" ||
    value === "advisor_review" ||
    value === "confirmation_required" ||
    value === "safe_rejection"
    ? value
    : fallback
}

function sanitizeAgents(value: unknown, fallback: AgentRole[]) {
  if (!Array.isArray(value)) return fallback
  const roles = value.filter((item): item is AgentRole => AGENT_ROLES.includes(item as AgentRole))
  return roles.length ? roles : fallback
}

function ensureRequiredAgents(gate: FinanceGateResult, roles: AgentRole[]) {
  const next = new Set<AgentRole>(roles)
  AGENTS_BY_INTENT[gate.intent].forEach((role) => next.add(role))
  if (gate.riskLevel === "high" || gate.riskLevel === "critical") {
    next.add("compliance")
    next.add("fraud_risk")
  }
  return Array.from(next)
}

function shouldUseBankCommand(gate: FinanceGateResult) {
  return (
    gate.intent === "balance_query" ||
    gate.intent === "transaction_request" ||
    gate.intent === "card_management" ||
    gate.intent === "market_query"
  )
}

function toToolCallTrace(toolPlan: ToolRequest[], status: ToolCallTrace["status"]): ToolCallTrace[] {
  return toolPlan.map((request) => ({
    name: request.name,
    risk: request.risk,
    reason: request.reason,
    status,
    requiresHumanApproval: request.requiresHumanApproval,
    createdAt: new Date().toISOString(),
  }))
}

function markReadToolsCalled(toolCalls: ToolCallTrace[]) {
  toolCalls.forEach((toolCall) => {
    if (toolCall.name === "getBankState") {
      toolCall.status = "called"
      toolCall.detail = "Sandbox BankState read locally."
    }
  })
}

function toolCallsFromBankResult(
  result: BankAgentResult,
  context: FinanceContext,
  gate: FinanceGateResult
): ToolCallTrace[] {
  const now = new Date().toISOString()
  const pendingKind = result.state.pendingConfirmation?.payload.kind
  const stateChanged = result.events.some((event) => event.type === "bank.state_changed")
  const confirmationRequired = result.events.some((event) => event.type === "bank.confirmation_required")

  if (stateChanged && context.pendingConfirmation) {
    return [
      {
        name: "executeConfirmedAction",
        risk: "approval_required",
        reason: "Existing pending confirmation was resolved by explicit user approval.",
        status: "called",
        requiresHumanApproval: true,
        detail: result.events.find((event) => event.type === "bank.state_changed")?.detail,
        createdAt: now,
      },
    ]
  }

  if (!confirmationRequired) {
    return [
      {
        name: gate.intent === "market_query" ? "getBankState" : "runBankCommand",
        risk: gate.riskLevel === "low" ? "safe_read" : "sensitive_read",
        reason: "Existing deterministic bank command handled a read or clarification.",
        status: "called",
        requiresHumanApproval: false,
        detail: result.message,
        createdAt: now,
      },
    ]
  }

  const name =
    pendingKind === "trade"
      ? "prepareTrade"
      : pendingKind === "card_status"
        ? "updateCardStatus"
        : pendingKind === "card_limit"
          ? "updateCardLimit"
          : "prepareTransfer"

  return [
    {
      name,
      risk: "approval_required",
      reason: "Existing sandbox command prepared a high-risk action for human confirmation.",
      status: "called",
      requiresHumanApproval: true,
      detail: result.state.pendingConfirmation?.summary,
      createdAt: now,
    },
  ]
}

function buildDraftAnswer(
  userPrompt: string,
  gate: FinanceGateResult,
  context: FinanceContext,
  reports: AgentReport[],
  bankToolResult?: BankAgentResult
) {
  if (bankToolResult) {
    return bankToolResult.message
  }

  if (gate.intent === "financial_education") {
    return reports.find((report) => report.role === "researcher")?.summary ??
      "Bu finans kavramını basitçe açıklayabilirim; doğrudan al/sat tavsiyesi vermem."
  }

  if (gate.intent === "portfolio_analysis") {
    return portfolioDraft(context)
  }

  if (gate.intent === "customer_support") {
    return "Bu konuda bankacılık desteği kapsamında yardımcı olabilirim. Güvenliğiniz için hassas işlemler onay gerektirir."
  }

  return `${userPrompt} isteği finans alanında değerlendirildi. Güvenli yanıt için işlem adımları kontrol edildi.`
}

function portfolioDraft(context: FinanceContext) {
  const holdings = context.holdings ?? []
  if (!holdings.length) return "Portföy riskini değerlendirmek için yeterli sandbox varlık verisi yok."

  const values = holdings.map((holding) => ({
    ...holding,
    value: holding.quantity * holding.price,
  }))
  const total = values.reduce((sum, holding) => sum + holding.value, 0)
  const largest = [...values].sort((left, right) => right.value - left.value)[0]
  const concentration = total > 0 && largest ? (largest.value / total) * 100 : 0

  return [
    `Sandbox portföyünüzün yaklaşık toplamı ${formatCurrency(total, "USD")}.`,
    largest
      ? `En büyük ağırlık ${largest.symbol} tarafında; yaklaşık payı %${concentration.toFixed(0)}.`
      : "Belirgin tekil yoğunlaşma hesaplanamadı.",
    "Bu bir yatırım tavsiyesi değildir. Kişisel kararlar için danışmanınızla değerlendirmeniz uygun olur.",
  ].join(" ")
}

function formatCurrency(amount: number, currency: string) {
  const safeCurrency: Currency = currency === "TRY" || currency === "EUR" || currency === "BTC" || currency === "ETH" ? currency : "USD"
  return formatMoney(amount, safeCurrency)
}

function enforceFinalSafety(
  message: string,
  gate: FinanceGateResult,
  plan: OrchestratorPlan,
  bankToolResult?: BankAgentResult
) {
  const normalized = message.toLocaleLowerCase("tr-TR")
  const completed = bankToolResult?.events.some((event) => event.type === "bank.state_changed") ?? false
  const pending = Boolean(bankToolResult?.state.pendingConfirmation)
  const parts = [message.trim()]

  if (plan.requiresHumanApproval && !completed && !normalized.includes("onay")) {
    parts.push("Bu işlem insan onayı olmadan tamamlanmaz.")
  }

  if (plan.requiresHumanApproval && pending && !normalized.includes("bekliyor")) {
    parts.push("Onayınızı bekliyor.")
  }

  if ((gate.intent === "market_query" || gate.intent === "portfolio_analysis" || gate.intent === "transaction_request") &&
    /\b(al|sat|hisse|fon|etf|portfoy|piyasa|trade|emir)\b/.test(normalized) &&
    !normalized.includes("yatırım tavsiyesi")) {
    parts.push("Bu bir yatırım tavsiyesi değildir; riskleri danışmanınızla değerlendirmeniz uygun olur.")
  }

  return parts.join(" ")
}

function cleanUserFacingFallbackPrefix(message: string) {
  return message.replace(/\[local fallback\]\s*/gi, "").trim()
}

function safeCorrection(gate: FinanceGateResult, issues: string[]) {
  if (!gate.isFinanceRelated) {
    return "Bu asistan yalnızca bankacılık ve finans konularında yardımcı olabilir."
  }

  const issueText = issues[0] ? ` Güvenlik kontrolü: ${issues[0]}` : ""
  return `Bu isteği şu anda güvenli şekilde tamamlayamıyorum.${issueText} Yüksek riskli işlemler insan onayı olmadan yapılmaz.`
}

function usedFallback(plan: OrchestratorPlan, reports: AgentReport[]) {
  return plan.taskId.includes("local-fallback") ||
    reports.some((report) => report.summary.includes("[local fallback]") || report.findings.some((finding) => finding.includes("[local fallback]")))
}

function makeResult(
  message: string,
  userText: string,
  state: BankState,
  trace: FinanceOrchestrationTrace,
  events: AgentEvent[]
): BankAgentResult {
  const now = new Date().toISOString()
  return {
    message,
    events,
    state,
    orchestration: {
      traceId: trace.traceId,
      gate: trace.gate,
      selectedAgents: trace.selectedAgents,
      judge: trace.judge,
      requiresHumanApproval: trace.requiresHumanApproval,
      toolCalls: trace.toolCalls,
    },
    transcript: [
      { role: "user", text: userText, at: now },
      { role: "assistant", text: message, at: now },
    ],
  }
}
