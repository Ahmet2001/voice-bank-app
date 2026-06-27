"use client"

import { useEffect, useState } from "react"
import { BrainCircuitIcon, CheckCircle2Icon, RefreshCwIcon, ServerIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react"

import { AgentTraceCard, agentRoleLabel } from "@/components/finance-ai/agent-trace-card"
import { HumanApprovalCard } from "@/components/finance-ai/human-approval-card"
import { OrchestrationTimeline } from "@/components/finance-ai/orchestration-timeline"
import { RiskBadge } from "@/components/finance-ai/risk-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import type { FinanceOrchestrationTrace } from "@/lib/finance-ai/schemas"
import type { BankState } from "@/lib/sandbox-bank/types"

const THINKING_SUMMARY_STORAGE_KEY = "voicebank-show-thinking-summary"

export function AiTrustPanel() {
  const [trace, setTrace] = useState<FinanceOrchestrationTrace | null>(null)
  const [state, setState] = useState<BankState | null>(null)
  const [loading, setLoading] = useState(true)
  const [showThinking, setShowThinking] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const [stateResponse, traceResponse] = await Promise.all([
        fetch("/api/bank/state", { cache: "no-store" }),
        fetch("/api/finance-ai/trace/latest", { cache: "no-store" }),
      ])
      if (stateResponse.ok) setState((await stateResponse.json()) as BankState)
      setTrace(traceResponse.ok ? ((await traceResponse.json()) as FinanceOrchestrationTrace) : null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener("voice-bank-state-changed", handler)
    return () => window.removeEventListener("voice-bank-state-changed", handler)
  }, [])

  useEffect(() => {
    setShowThinking(window.localStorage.getItem(THINKING_SUMMARY_STORAGE_KEY) === "true")
  }, [])

  const updateShowThinking = (checked: boolean) => {
    setShowThinking(checked)
    window.localStorage.setItem(THINKING_SUMMARY_STORAGE_KEY, String(checked))
  }

  const reportsByRole = new Map(trace?.agentReports.map((report) => [report.role, report]))

  return (
    <section className="space-y-3 px-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">AI Trust Panel</h2>
          <p className="text-xs text-muted-foreground">Ollama yerel model: qwen3:4b. Thinking güvenli özet olarak gösterilir.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
            <BrainCircuitIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium">Thinking özeti</span>
            <Switch
              checked={showThinking}
              onCheckedChange={updateShowThinking}
              aria-label="Thinking özetlerini göster"
            />
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} />
            Yenile
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheckIcon className="size-4 text-muted-foreground" />
              Finance Domain Gate
            </CardTitle>
            {trace ? <RiskBadge risk={trace.gate.riskLevel} /> : <Badge variant="secondary">Bekliyor</Badge>}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant={trace?.gate.isFinanceRelated ? "outline" : "secondary"}>
                {trace ? trace.gate.intent : "Henüz iz yok"}
              </Badge>
              {trace?.fallbackUsed ? <Badge variant="outline">local fallback</Badge> : null}
            </div>
            <p className="min-h-10 text-xs text-muted-foreground">
              {trace?.gate.reason ?? "Bir komut çalıştığında domain gate sonucu burada görünür."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              {trace?.judge.approved ? <CheckCircle2Icon className="size-4 text-emerald-500" /> : <TriangleAlertIcon className="size-4 text-muted-foreground" />}
              Judge
            </CardTitle>
            <Badge variant={trace?.judge.approved ? "secondary" : "destructive"}>
              {trace ? (trace.judge.approved ? "Onaylandı" : "Bloklandı") : "Bekliyor"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>Skor: {trace ? Math.round(trace.judge.score * 100) : 0}%</p>
            <p className="line-clamp-2">{trace?.judge.issues[0] ?? "Tutarlılık, güvenlik ve onay kontrolü yapılmadı."}</p>
          </CardContent>
        </Card>

        <HumanApprovalCard state={state} required={trace?.requiresHumanApproval} />
      </div>

      <OrchestrationTimeline trace={trace} />

      <div className="grid gap-3 xl:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ServerIcon className="size-4 text-muted-foreground" />
              Tool Calls
            </CardTitle>
            <Badge variant="outline">{trace?.toolCalls.length ?? 0}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {(trace?.toolCalls.length ? trace.toolCalls : []).map((toolCall) => (
              <div key={`${toolCall.name}-${toolCall.createdAt}`} className="rounded-lg border bg-muted/20 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{toolCall.name}</span>
                  <Badge variant={toolCall.requiresHumanApproval ? "destructive" : "secondary"}>{toolCall.status}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-muted-foreground">{toolCall.detail ?? toolCall.reason}</p>
              </div>
            ))}
            {!trace?.toolCalls.length ? <p className="text-xs text-muted-foreground">Araç çağrısı izi bekleniyor.</p> : null}
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(trace?.selectedAgents.length ? trace.selectedAgents : []).map((role) => (
            <AgentTraceCard
              key={role}
              role={role}
              report={reportsByRole.get(role)}
              showThinking={showThinking}
            />
          ))}
          {!trace?.selectedAgents.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Selected Agents</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {["researcher", "professor", "poet", "finance_analyst", "compliance", "fraud_risk"]
                  .map((role) => agentRoleLabel(role as Parameters<typeof agentRoleLabel>[0]))
                  .join(", ")}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  )
}
