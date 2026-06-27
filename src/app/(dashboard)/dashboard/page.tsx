import { DashboardCustomizer } from "@/components/dashboard/dashboard-customizer"
import { AiTrustPanel } from "@/components/finance-ai/ai-trust-panel"
import { SandboxBankOverview } from "@/components/voice/sandbox-bank-overview"

export default function Page() {
  return (
    <>
      <SandboxBankOverview />
      <AiTrustPanel />
      <DashboardCustomizer />
    </>
  )
}
