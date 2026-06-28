import { normalizeText } from "@/lib/sandbox-bank/format"
import type { FinanceGateResult, FinanceIntent, RiskLevel } from "@/lib/finance-ai/schemas"

const FINANCE_TERMS = [
  "bakiye",
  "hesap",
  "para",
  "gonder",
  "yolla",
  "transfer",
  "havale",
  "eft",
  "odeme",
  "butce",
  "butcem",
  "portfoy",
  "portfolio",
  "yatirim",
  "piyasa",
  "borsa",
  "hisse",
  "fon",
  "etf",
  "tahvil",
  "faiz",
  "enflasyon",
  "risk",
  "kart",
  "limit",
  "kredi",
  "borc",
  "emeklilik",
  "sigorta",
  "kripto",
  "bitcoin",
  "ethereum",
  "apple",
  "aapl",
  "microsoft",
  "msft",
  "nvidia",
  "nvda",
  "tesla",
  "tsla",
  "spy",
  "dolar",
  "usd",
  "tl",
  "try",
  "euro",
  "eur",
  "islem",
  "harcama",
]

const MARKET_TERM_PATTERN = /\b(piyasa\w*|borsa\w*|hisse\w*|fon\w*|etf\w*|kripto\w*|bitcoin|ethereum|apple|aapl|microsoft|msft|nvidia|nvda|tesla|tsla|spy|yatirim\w*)\b/
const RECOMMENDATION_PATTERN = /\b(oner\w*|tavsiye\w*|hangisi\w*|hangi\w*|secmeliyim|secsem)\b/

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term))
}

function parseAmount(normalized: string) {
  const raw = normalized.match(/(\d+(?:[.,]\d+)?)/)?.[1]
  if (!raw) return undefined
  const amount = Number(raw.replace(",", "."))
  return Number.isFinite(amount) ? amount : undefined
}

function classifyRisk(normalized: string, intent: FinanceIntent): RiskLevel {
  const amount = parseAmount(normalized)
  const urgent = /\b(acil|hemen|simdi|acele|cabuk|zorundayim|patron|polis|savci)\b/.test(normalized)

  if (intent === "transaction_request" || intent === "card_management") {
    if (urgent || (amount !== undefined && amount >= 100000)) return "critical"
    if (amount !== undefined && /\b(usd|dolar|eur|euro)\b/.test(normalized) && amount >= 5000) return "critical"
    return "high"
  }

  if (intent === "portfolio_analysis") return "medium"
  if (intent === "market_query" && RECOMMENDATION_PATTERN.test(normalized)) return "medium"
  if (intent === "market_query" && /\b(al|alim|sat|satim|buy|sell)\b/.test(normalized)) return "high"
  return "low"
}

export function runFinanceGate(userPrompt: string): FinanceGateResult {
  const normalized = normalizeText(userPrompt)
  const confirmationOnly = /\b(evet|onay|onayliyorum|tamam|baslat|hayir|iptal|vazgec|dur)\b/.test(normalized)
  const isFinanceRelated = confirmationOnly || hasAny(normalized, FINANCE_TERMS)

  if (!isFinanceRelated) {
    return {
      isFinanceRelated: false,
      intent: "out_of_scope",
      riskLevel: "low",
      reason: "Prompt finance or banking domain terms did not match the local gate.",
    }
  }

  let intent: FinanceIntent = "customer_support"

  if (confirmationOnly) {
    intent = "transaction_request"
  } else if (/\b(kart|limit|dondur|kilitle|ac|coz)\b/.test(normalized)) {
    intent = "card_management"
  } else if (/\b(gonder|yolla|transfer|havale|eft|ode|odeme|al|alim|sat|satim|buy|sell)\b/.test(normalized)) {
    intent = "transaction_request"
  } else if (/\b(bakiye\w*|hesap\w*|para durum\w*|ne kadar param|bakiyem)\b/.test(normalized)) {
    intent = "balance_query"
  } else if (/\b(portfoy|portfolio|dagilim|cesitlendirme|riskli mi)\b/.test(normalized)) {
    intent = "portfolio_analysis"
  } else if (MARKET_TERM_PATTERN.test(normalized)) {
    intent = /\b(nedir|ne demek|anlat|ogren|acikla)\b/.test(normalized)
      ? "financial_education"
      : "market_query"
  } else if (RECOMMENDATION_PATTERN.test(normalized) && /\b(yatirim\w*|portfoy\w*)\b/.test(normalized)) {
    intent = "market_query"
  } else if (/\b(nedir|ne demek|anlat|ogren|acikla|faiz|enflasyon|kredi|borc|sigorta|emeklilik)\b/.test(normalized)) {
    intent = "financial_education"
  }

  const riskLevel = classifyRisk(normalized, intent)
  return {
    isFinanceRelated: true,
    intent,
    riskLevel,
    reason: `Deterministic finance gate matched ${intent} with ${riskLevel} risk.`,
  }
}
