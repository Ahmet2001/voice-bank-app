"use client"

import { useEffect, useMemo, useState } from "react"
import { LandmarkIcon, RadioIcon, RefreshCwIcon, ShieldCheckIcon, WalletCardsIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatMoney } from "@/lib/sandbox-bank/format"
import type { BankState } from "@/lib/sandbox-bank/types"

export function SandboxBankOverview() {
  const [state, setState] = useState<BankState | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/bank/state", { cache: "no-store" })
      setState(await response.json())
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

  const totalUsd = useMemo(() => {
    if (!state) return 0
    return state.accounts
      .filter((account) => account.currency === "USD")
      .reduce((sum, account) => sum + account.available, 0)
  }, [state])

  const familyBudget = state?.budgets.find((budget) => budget.id === "budget-family")
  const budgetRatio = familyBudget
    ? Math.min(100, Math.round((familyBudget.spent / familyBudget.limitAmount) * 100))
    : 0

  return (
    <div className="grid grid-cols-1 gap-3 px-4 pb-2 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium">VoiceBank Sandbox</CardTitle>
          <LandmarkIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-semibold tabular-nums">
            {state ? formatMoney(totalUsd, "USD") : "..."}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-emerald-500" />
            Gerçek para yok, tüm işlemler onaylı sandbox.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium">Aile transfer bütçesi</CardTitle>
          <WalletCardsIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div className="text-2xl font-semibold tabular-nums">{budgetRatio}%</div>
            {familyBudget ? (
              <div className="text-xs text-muted-foreground">
                {formatMoney(familyBudget.spent, familyBudget.currency)} / {formatMoney(familyBudget.limitAmount, familyBudget.currency)}
              </div>
            ) : null}
          </div>
          <Progress value={budgetRatio} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium">Agent durumu</CardTitle>
          <Button variant="ghost" size="icon-sm" onClick={refresh} disabled={loading}>
            <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={state?.pendingConfirmation ? "destructive" : "secondary"}>
              {state?.pendingConfirmation ? "Onay bekliyor" : "Hazır"}
            </Badge>
            <Badge variant="outline">
              <RadioIcon className="size-3" />
              {state?.marketQuotes[0]?.source === "live" ? "Canlı piyasa" : "Seed piyasa"}
            </Badge>
          </div>
          <p className="min-h-8 text-xs text-muted-foreground">
            {state?.pendingConfirmation?.summary ?? "Mikrofon düğmesiyle Türkçe komut verebilirsiniz."}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
