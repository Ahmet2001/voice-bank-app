import { LockKeyholeIcon, ShieldAlertIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BankState } from "@/lib/sandbox-bank/types"

export function HumanApprovalCard({ state, required }: { state?: BankState | null; required?: boolean }) {
  const pending = state?.pendingConfirmation

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
          <LockKeyholeIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">Human Approval</span>
        </CardTitle>
        <Badge variant={pending || required ? "destructive" : "secondary"}>
          {pending ? "Bekliyor" : required ? "Gerekli" : "Gerekmez"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-start gap-2 text-sm">
          <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="break-words text-muted-foreground">
            {pending?.summary ?? "Yüksek riskli işlemler insan onayı olmadan yapılmaz."}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
