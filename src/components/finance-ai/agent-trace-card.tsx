import { BotIcon, BrainCircuitIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AgentReport, AgentRole } from "@/lib/finance-ai/schemas"

const ROLE_LABELS: Record<AgentRole, string> = {
  researcher: "Researcher",
  professor: "Professor",
  poet: "Poet",
  finance_analyst: "Finance Analyst",
  compliance: "Compliance",
  fraud_risk: "Fraud / Risk",
}

export function agentRoleLabel(role: AgentRole) {
  return ROLE_LABELS[role]
}

export function AgentTraceCard({
  report,
  role,
  showThinking = false,
}: {
  report?: AgentReport
  role?: AgentRole
  showThinking?: boolean
}) {
  const displayRole = report?.role ?? role
  if (!displayRole) return null

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
          <BotIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{agentRoleLabel(displayRole)}</span>
        </CardTitle>
        {report ? <span className="text-xs tabular-nums text-muted-foreground">{Math.round(report.confidence * 100)}%</span> : null}
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        {report ? (
          <>
            <p className="line-clamp-3 text-foreground">{report.summary}</p>
            {report.findings.slice(0, 2).map((finding) => (
              <p key={finding} className="break-words">
                {finding}
              </p>
            ))}
            {showThinking && report.thinkingSummary ? (
              <div className="rounded-lg border bg-muted/30 p-2">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                  <BrainCircuitIcon className="size-3.5" />
                  Thinking
                </div>
                <p className="line-clamp-4 break-words">{report.thinkingSummary}</p>
              </div>
            ) : null}
          </>
        ) : (
          <p>Seçildi, iz bekleniyor.</p>
        )}
      </CardContent>
    </Card>
  )
}
