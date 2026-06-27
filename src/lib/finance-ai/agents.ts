import { runComplianceAgent } from "@/lib/finance-ai/agents/compliance"
import { runFinanceAnalystAgent } from "@/lib/finance-ai/agents/finance-analyst"
import { runFraudRiskAgent } from "@/lib/finance-ai/agents/fraud-risk"
import { runPoetAgent } from "@/lib/finance-ai/agents/poet"
import { runProfessorAgent } from "@/lib/finance-ai/agents/professor"
import { runResearcherAgent } from "@/lib/finance-ai/agents/researcher"
import type { AgentInput, AgentReport, AgentRole } from "@/lib/finance-ai/schemas"

export async function runSpecialistAgent(role: AgentRole, input: AgentInput): Promise<AgentReport> {
  if (role === "researcher") return runResearcherAgent(input)
  if (role === "professor") return runProfessorAgent(input)
  if (role === "poet") return runPoetAgent(input)
  if (role === "finance_analyst") return runFinanceAnalystAgent(input)
  if (role === "compliance") return runComplianceAgent(input)
  return runFraudRiskAgent(input)
}
