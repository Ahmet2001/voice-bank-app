export type Currency = "USD" | "EUR" | "TRY" | "BTC" | "ETH"

export type Account = {
  id: string
  name: string
  type: "checking" | "savings" | "investment" | "crypto"
  currency: Currency
  balance: number
  available: number
}

export type Contact = {
  id: string
  name: string
  relation: string
  accountLabel: string
  currency: Currency
  avatar: string
  trustLevel: "family" | "verified" | "merchant"
  aliases: string[]
}

export type BankTransaction = {
  id: string
  type: "sent" | "received" | "card" | "trade" | "income"
  title: string
  subtitle: string
  amount: number
  currency: Currency
  accountId: string
  counterpartyId?: string
  status: "completed" | "pending" | "failed" | "cancelled"
  category: string
  createdAt: string
  note?: string
}

export type BankCard = {
  id: string
  name: string
  last4: string
  network: "Visa" | "Mastercard"
  status: "active" | "frozen"
  limitAmount: number
  spent: number
  currency: Currency
}

export type Budget = {
  id: string
  name: string
  spent: number
  limitAmount: number
  currency: Currency
}

export type Holding = {
  symbol: string
  name: string
  kind: "stock" | "fund" | "crypto"
  quantity: number
  price: number
  currency: Currency
  changePercent: number
}

export type MarketQuote = {
  symbol: string
  name: string
  price: number
  currency: Currency
  changePercent: number
  source: "live" | "seed"
  updatedAt: string
}

export type TransferPayload = {
  kind: "transfer"
  fromAccountId: string
  contactId: string
  amount: number
  currency: Currency
  note?: string
}

export type CardStatusPayload = {
  kind: "card_status"
  cardId: string
  status: BankCard["status"]
}

export type CardLimitPayload = {
  kind: "card_limit"
  cardId: string
  limitAmount: number
  currency: Currency
}

export type TradePayload = {
  kind: "trade"
  side: "buy" | "sell"
  symbol: string
  quantity: number
  estimatedPrice: number
  currency: Currency
  accountId: string
}

export type ConfirmationPayload =
  | TransferPayload
  | CardStatusPayload
  | CardLimitPayload
  | TradePayload

export type PendingConfirmation = {
  id: string
  payload: ConfirmationPayload
  status: "pending" | "approved" | "declined" | "expired"
  summary: string
  createdAt: string
  resolvedAt?: string
}

export type BankState = {
  accounts: Account[]
  contacts: Contact[]
  transactions: BankTransaction[]
  cards: BankCard[]
  budgets: Budget[]
  holdings: Holding[]
  marketQuotes: MarketQuote[]
  pendingConfirmation?: PendingConfirmation
  updatedAt: string
}

export type AgentEvent = {
  type: "bank.tool_progress" | "bank.confirmation_required" | "bank.state_changed"
  label: string
  detail?: string
}

export type BankAgentResult = {
  message: string
  transcript: { role: "user" | "assistant"; text: string; at: string }[]
  events: AgentEvent[]
  state: BankState
}
