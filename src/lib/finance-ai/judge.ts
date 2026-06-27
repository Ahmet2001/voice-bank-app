import { callQwenAgent, extractJson } from "@/lib/finance-ai/local-qwen"
import { getSystemPrompt } from "@/lib/finance-ai/system-prompts"
import type {
  AgentReport,
  FinanceContext,
  FinanceGateResult,
  JudgeResult,
  OrchestratorPlan,
  ToolCallTrace,
} from "@/lib/finance-ai/schemas"

type JudgeInput = {
  userPrompt: string
  gate: FinanceGateResult
  context: FinanceContext
  plan: OrchestratorPlan
  agentReports: AgentReport[]
  toolCalls: ToolCallTrace[]
  finalDraft: string
}

export async function runJudge(input: JudgeInput): Promise<JudgeResult> {
  try {
    const content = await callQwenAgent({
      role: "judge",
      messages: [
        { role: "system", content: getSystemPrompt("judge") },
        {
          role: "user",
          content: JSON.stringify({
            ...input,
            schema: {
              approved: "boolean",
              score: "number 0..1",
              failedComponent: "optional string",
              issues: ["string"],
              requiredFix: "optional string",
              nextStep: "finalize | retry_orchestration | human_review | block",
            },
          }),
        },
      ],
      temperature: 0.1,
      json: true,
    })

    const parsed = extractJson<JudgeResult>(content)
    if (!parsed) return fallbackJudge(input)

    return {
      approved: Boolean(parsed.approved),
      score: typeof parsed.score === "number" ? Math.min(1, Math.max(0, parsed.score)) : 0.7,
      failedComponent: parsed.failedComponent,
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 5) : [],
      requiredFix: parsed.requiredFix,
      nextStep: parsed.nextStep ?? "finalize",
    }
  } catch {
    return fallbackJudge(input)
  }
}

function fallbackJudge(input: JudgeInput): JudgeResult {
  const issues: string[] = []
  const highRisk = input.gate.riskLevel === "high" || input.gate.riskLevel === "critical"
  const approvalTool = input.toolCalls.some((toolCall) => toolCall.requiresHumanApproval)
  const hasPendingApproval = Boolean(input.context.pendingConfirmation)
  const executedAfterApproval = input.toolCalls.some((toolCall) => toolCall.name === "executeConfirmedAction")
  const finalLooksExecuted = /\b(gonderildi|tamamlandi|guncellendi|emri tamamlandi)\b/i.test(input.finalDraft)

  if (!input.gate.isFinanceRelated && input.plan.finalAnswerMode !== "safe_rejection") {
    issues.push("Out-of-scope prompt was not safely rejected.")
  }

  if (highRisk && !input.plan.requiresHumanApproval) {
    issues.push("High-risk request did not require human approval.")
  }

  if (highRisk && finalLooksExecuted && !hasPendingApproval && !executedAfterApproval) {
    issues.push("High-risk action appears executed without an existing pending confirmation.")
  }

  if (approvalTool && !input.finalDraft.toLocaleLowerCase("tr-TR").includes("onay")) {
    issues.push("Approval requirement is not clear in the final answer.")
  }

  const approved = issues.length === 0
  return {
    approved,
    score: approved ? 0.82 : 0.35,
    failedComponent: approved ? undefined : "fallback_judge",
    issues,
    requiredFix: approved ? undefined : "Yanıtı güvenli hale getir ve onay gerekliliğini açık söyle.",
    nextStep: approved
      ? highRisk && input.plan.requiresHumanApproval
        ? "human_review"
        : "finalize"
      : "block",
  }
}
