import { Badge } from "@/components/ui/badge"
import type { RiskLevel } from "@/lib/finance-ai/schemas"

const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  critical: "Kritik",
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <Badge variant={risk === "high" || risk === "critical" ? "destructive" : risk === "medium" ? "outline" : "secondary"}>
      {RISK_LABELS[risk]}
    </Badge>
  )
}
