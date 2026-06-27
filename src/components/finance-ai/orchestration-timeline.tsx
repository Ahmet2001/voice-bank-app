import { CheckCircle2Icon, CircleDashedIcon, ShieldCheckIcon, WorkflowIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { FinanceOrchestrationTrace } from "@/lib/finance-ai/schemas"

export function OrchestrationTimeline({ trace }: { trace?: FinanceOrchestrationTrace | null }) {
  const steps = trace
    ? [
        { label: "Domain Gate", detail: trace.gate.intent },
        { label: "Agents", detail: trace.selectedAgents.join(", ") || "Yok" },
        { label: "Tools", detail: `${trace.toolCalls.filter((tool) => tool.status === "called").length}/${trace.toolCalls.length} çağrı` },
        { label: "Judge", detail: trace.judge.approved ? "Onaylandı" : "Bloklandı" },
      ]
    : [
        { label: "Domain Gate", detail: "İz bekleniyor" },
        { label: "Agents", detail: "İz bekleniyor" },
        { label: "Tools", detail: "İz bekleniyor" },
        { label: "Judge", detail: "İz bekleniyor" },
      ]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <WorkflowIcon className="size-4 text-muted-foreground" />
          Orchestration Timeline
        </CardTitle>
        <ShieldCheckIcon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-4">
          {steps.map((step, index) => {
            const complete = Boolean(trace) && index <= 3
            return (
              <div key={step.label} className="min-h-20 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {complete ? <CheckCircle2Icon className="size-4 text-emerald-500" /> : <CircleDashedIcon className="size-4 text-muted-foreground" />}
                  <span>{step.label}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{step.detail}</p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
