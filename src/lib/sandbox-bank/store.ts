import "server-only"

import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import { formatMoney, normalizeText } from "@/lib/sandbox-bank/format"
import { fallbackMarketQuotes, getMarketQuotes } from "@/lib/sandbox-bank/market"
import type {
  Account,
  AgentEvent,
  BankAgentResult,
  BankCard,
  BankState,
  BankTransaction,
  Budget,
  ConfirmationPayload,
  Contact,
  Currency,
  Holding,
  PendingConfirmation,
} from "@/lib/sandbox-bank/types"

const DB_VERSION = "voice-bank-v2"
const DATA_DIR = path.join(process.cwd(), "data")
const DB_PATH = path.join(DATA_DIR, "sandbox-bank.sqlite")

type Row = Record<string, unknown>

let database: DatabaseSync | undefined

function db() {
  if (database) return database
  fs.mkdirSync(DATA_DIR, { recursive: true })
  database = new DatabaseSync(DB_PATH)
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL,
      balance REAL NOT NULL,
      available REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      relation TEXT NOT NULL,
      account_label TEXT NOT NULL,
      currency TEXT NOT NULL,
      avatar TEXT NOT NULL,
      trust_level TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contact_aliases (
      alias TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      account_id TEXT NOT NULL,
      counterparty_id TEXT,
      status TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last4 TEXT NOT NULL,
      network TEXT NOT NULL,
      status TEXT NOT NULL,
      limit_amount REAL NOT NULL,
      spent REAL NOT NULL,
      currency TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      spent REAL NOT NULL,
      limit_amount REAL NOT NULL,
      currency TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS holdings (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      change_percent REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS confirmations (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
  `)
  seedIfNeeded(database)
  return database
}

function seedIfNeeded(database: DatabaseSync) {
  const current = database.prepare("SELECT value FROM meta WHERE key = ?").get("seed_version") as Row | undefined
  if (current?.value === DB_VERSION) return

  database.exec(`
    DELETE FROM accounts;
    DELETE FROM contacts;
    DELETE FROM contact_aliases;
    DELETE FROM transactions;
    DELETE FROM cards;
    DELETE FROM budgets;
    DELETE FROM holdings;
    DELETE FROM confirmations;
  `)

  const accounts: Account[] = [
    { id: "acc-usd", name: "Günlük USD Hesabı", type: "checking", currency: "USD", balance: 8420, available: 8420 },
    { id: "acc-try", name: "TL Vadesiz", type: "checking", currency: "TRY", balance: 184250, available: 184250 },
    { id: "acc-savings", name: "Acil Durum Birikimi", type: "savings", currency: "USD", balance: 12600, available: 12600 },
    { id: "acc-invest", name: "Yatırım Portföyü", type: "investment", currency: "USD", balance: 28300, available: 9500 },
  ]
  const contacts: Contact[] = [
    {
      id: "deniz",
      name: "Deniz Yılmaz",
      relation: "Oğlunuz",
      accountLabel: "Genç hesap",
      currency: "USD",
      avatar: "/avatars/1.jpg",
      trustLevel: "family",
      aliases: ["oğlum", "oglum", "çocuğum", "cocugum", "deniz", "oğluma", "ogluma"],
    },
    {
      id: "zeynep",
      name: "Zeynep Yılmaz",
      relation: "Çocuğunuz",
      accountLabel: "Çocuk birikim hesabı",
      currency: "USD",
      avatar: "/avatars/2.jpg",
      trustLevel: "family",
      aliases: ["kızım", "kizim", "çocuğum", "cocugum", "çocuk", "cocuk", "zeynep", "kızıma", "kizima"],
    },
    {
      id: "ayse",
      name: "Ayşe Yılmaz",
      relation: "Anneniz",
      accountLabel: "Aile transfer hesabı",
      currency: "TRY",
      avatar: "/avatars/9.jpg",
      trustLevel: "family",
      aliases: ["anne", "annem", "anneme", "ayşe", "ayse", "anneye"],
    },
    {
      id: "mehmet",
      name: "Mehmet Yılmaz",
      relation: "Babanız",
      accountLabel: "Aile transfer hesabı",
      currency: "TRY",
      avatar: "/avatars/10.jpg",
      trustLevel: "family",
      aliases: ["baba", "babam", "babama", "mehmet", "babaya"],
    },
    {
      id: "kemal",
      name: "Kemal Yılmaz",
      relation: "Amcanız",
      accountLabel: "Aile transfer hesabı",
      currency: "TRY",
      avatar: "/avatars/11.jpg",
      trustLevel: "family",
      aliases: ["amca", "amcam", "amcama", "kemal", "amcaya"],
    },
    {
      id: "elif",
      name: "Elif Yılmaz",
      relation: "Eşiniz",
      accountLabel: "Ortak aile hesabı",
      currency: "TRY",
      avatar: "/avatars/5.jpg",
      trustLevel: "family",
      aliases: ["eşim", "esim", "elif", "hanım", "hanim"],
    },
    {
      id: "rent",
      name: "Murat Kaya",
      relation: "Ev sahibi",
      accountLabel: "Kira IBAN",
      currency: "TRY",
      avatar: "/avatars/8.jpg",
      trustLevel: "verified",
      aliases: ["kira", "ev sahibi", "murat", "kiraya"],
    },
    {
      id: "school",
      name: "Northstar School",
      relation: "Okul",
      accountLabel: "Okul ödeme hesabı",
      currency: "USD",
      avatar: "/logos/google-com.png",
      trustLevel: "merchant",
      aliases: ["okul", "school", "northstar", "okula"],
    },
  ]
  const transactions: BankTransaction[] = [
    {
      id: "txn-seed-1",
      type: "income",
      title: "Stripe Payout",
      subtitle: "Müşteri ödemesi",
      amount: 4250,
      currency: "USD",
      accountId: "acc-usd",
      status: "completed",
      category: "Gelir",
      createdAt: "2026-06-26T09:15:00.000Z",
    },
    {
      id: "txn-seed-2",
      type: "card",
      title: "Apple iCloud+",
      subtitle: "Kart harcaması",
      amount: -2.99,
      currency: "USD",
      accountId: "acc-usd",
      status: "completed",
      category: "Teknoloji",
      createdAt: "2026-06-25T13:32:00.000Z",
    },
    {
      id: "txn-seed-3",
      type: "sent",
      title: "Deniz Yılmaz",
      subtitle: "Haftalık harçlık",
      amount: -75,
      currency: "USD",
      accountId: "acc-usd",
      counterpartyId: "deniz",
      status: "completed",
      category: "Aile",
      createdAt: "2026-06-24T18:10:00.000Z",
      note: "Haftalık harçlık",
    },
  ]
  const cards: BankCard[] = [
    { id: "card-main", name: "Ana Kart", last4: "4589", network: "Visa", status: "active", limitAmount: 6000, spent: 2180, currency: "USD" },
    { id: "card-family", name: "Aile Kartı", last4: "9012", network: "Mastercard", status: "active", limitAmount: 95000, spent: 27140, currency: "TRY" },
  ]
  const budgets: Budget[] = [
    { id: "budget-home", name: "Ev ve kira", spent: 47200, limitAmount: 65000, currency: "TRY" },
    { id: "budget-family", name: "Aile transferleri", spent: 420, limitAmount: 900, currency: "USD" },
    { id: "budget-invest", name: "Yatırım ayırma", spent: 1300, limitAmount: 2000, currency: "USD" },
  ]
  const holdings: Holding[] = [
    { symbol: "AAPL", name: "Apple", kind: "stock", quantity: 18, price: 226.41, currency: "USD", changePercent: 0.62 },
    { symbol: "MSFT", name: "Microsoft", kind: "stock", quantity: 10, price: 486.18, currency: "USD", changePercent: 0.34 },
    { symbol: "SPY", name: "S&P 500 ETF", kind: "fund", quantity: 22, price: 612.2, currency: "USD", changePercent: 0.18 },
    { symbol: "BTC-USD", name: "Bitcoin", kind: "crypto", quantity: 0.12, price: 106850, currency: "USD", changePercent: -0.42 },
  ]

  const insertAccount = database.prepare("INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)")
  accounts.forEach((account) => insertAccount.run(account.id, account.name, account.type, account.currency, account.balance, account.available))

  const insertContact = database.prepare("INSERT INTO contacts VALUES (?, ?, ?, ?, ?, ?, ?)")
  const insertAlias = database.prepare("INSERT OR IGNORE INTO contact_aliases VALUES (?, ?)")
  contacts.forEach((contact) => {
    insertContact.run(contact.id, contact.name, contact.relation, contact.accountLabel, contact.currency, contact.avatar, contact.trustLevel)
    contact.aliases.forEach((alias) => insertAlias.run(normalizeText(alias), contact.id))
  })

  const insertTransaction = database.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
  transactions.forEach((transaction) =>
    insertTransaction.run(
      transaction.id,
      transaction.type,
      transaction.title,
      transaction.subtitle,
      transaction.amount,
      transaction.currency,
      transaction.accountId,
      transaction.counterpartyId ?? null,
      transaction.status,
      transaction.category,
      transaction.createdAt,
      transaction.note ?? null
    )
  )

  const insertCard = database.prepare("INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
  cards.forEach((card) => insertCard.run(card.id, card.name, card.last4, card.network, card.status, card.limitAmount, card.spent, card.currency))

  const insertBudget = database.prepare("INSERT INTO budgets VALUES (?, ?, ?, ?, ?)")
  budgets.forEach((budget) => insertBudget.run(budget.id, budget.name, budget.spent, budget.limitAmount, budget.currency))

  const insertHolding = database.prepare("INSERT INTO holdings VALUES (?, ?, ?, ?, ?, ?, ?)")
  holdings.forEach((holding) => insertHolding.run(holding.symbol, holding.name, holding.kind, holding.quantity, holding.price, holding.currency, holding.changePercent))

  database.prepare("INSERT OR REPLACE INTO meta VALUES (?, ?)").run("seed_version", DB_VERSION)
}

function rows<T>(sql: string, ...params: unknown[]) {
  return db().prepare(sql).all(...params) as T[]
}

function row<T>(sql: string, ...params: unknown[]) {
  return db().prepare(sql).get(...params) as T | undefined
}

function mapAccount(value: Row): Account {
  return {
    id: String(value.id),
    name: String(value.name),
    type: value.type as Account["type"],
    currency: value.currency as Currency,
    balance: Number(value.balance),
    available: Number(value.available),
  }
}

function mapContact(value: Row): Contact {
  const aliases = rows<Row>("SELECT alias FROM contact_aliases WHERE contact_id = ? ORDER BY alias", value.id).map((alias) => String(alias.alias))
  return {
    id: String(value.id),
    name: String(value.name),
    relation: String(value.relation),
    accountLabel: String(value.account_label),
    currency: value.currency as Currency,
    avatar: String(value.avatar),
    trustLevel: value.trust_level as Contact["trustLevel"],
    aliases,
  }
}

function mapTransaction(value: Row): BankTransaction {
  return {
    id: String(value.id),
    type: value.type as BankTransaction["type"],
    title: String(value.title),
    subtitle: String(value.subtitle),
    amount: Number(value.amount),
    currency: value.currency as Currency,
    accountId: String(value.account_id),
    counterpartyId: value.counterparty_id ? String(value.counterparty_id) : undefined,
    status: value.status as BankTransaction["status"],
    category: String(value.category),
    createdAt: String(value.created_at),
    note: value.note ? String(value.note) : undefined,
  }
}

function mapCard(value: Row): BankCard {
  return {
    id: String(value.id),
    name: String(value.name),
    last4: String(value.last4),
    network: value.network as BankCard["network"],
    status: value.status as BankCard["status"],
    limitAmount: Number(value.limit_amount),
    spent: Number(value.spent),
    currency: value.currency as Currency,
  }
}

function mapBudget(value: Row): Budget {
  return {
    id: String(value.id),
    name: String(value.name),
    spent: Number(value.spent),
    limitAmount: Number(value.limit_amount),
    currency: value.currency as Currency,
  }
}

function mapHolding(value: Row): Holding {
  return {
    symbol: String(value.symbol),
    name: String(value.name),
    kind: value.kind as Holding["kind"],
    quantity: Number(value.quantity),
    price: Number(value.price),
    currency: value.currency as Currency,
    changePercent: Number(value.change_percent),
  }
}

function mapConfirmation(value: Row | undefined): PendingConfirmation | undefined {
  if (!value) return undefined
  return {
    id: String(value.id),
    payload: JSON.parse(String(value.payload_json)) as ConfirmationPayload,
    status: value.status as PendingConfirmation["status"],
    summary: String(value.summary),
    createdAt: String(value.created_at),
    resolvedAt: value.resolved_at ? String(value.resolved_at) : undefined,
  }
}

export async function readBankState(): Promise<BankState> {
  const marketQuotes = await getMarketQuotes()
  return {
    accounts: rows<Row>("SELECT * FROM accounts ORDER BY id").map(mapAccount),
    contacts: rows<Row>("SELECT * FROM contacts ORDER BY trust_level, name").map(mapContact),
    transactions: rows<Row>("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 20").map(mapTransaction),
    cards: rows<Row>("SELECT * FROM cards ORDER BY id").map(mapCard),
    budgets: rows<Row>("SELECT * FROM budgets ORDER BY id").map(mapBudget),
    holdings: rows<Row>("SELECT * FROM holdings ORDER BY symbol").map(mapHolding),
    marketQuotes,
    pendingConfirmation: mapConfirmation(
      row<Row>("SELECT * FROM confirmations WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1")
    ),
    updatedAt: new Date().toISOString(),
  }
}

function parseAmount(input: string): { amount?: number; currency: Currency } {
  const normalized = normalizeText(input)
  const amount = normalized.match(/(?:\$|usd|dolar|euro|eur|tl|try|lira)?\s*(\d+(?:[.,]\d+)?)/)?.[1]
  let currency: Currency = "USD"
  if (/\b(tl|try|lira)\b/.test(normalized)) currency = "TRY"
  if (/\b(eur|euro)\b/.test(normalized)) currency = "EUR"
  if (/\b(btc|bitcoin)\b/.test(normalized)) currency = "BTC"
  if (/\b(eth|ethereum)\b/.test(normalized)) currency = "ETH"
  return { amount: amount ? Number(amount.replace(",", ".")) : undefined, currency }
}

function resolveContact(input: string): Contact | undefined {
  const normalized = normalizeText(input)
  const contacts = rows<Row>("SELECT * FROM contacts").map(mapContact)
  return contacts.find((contact) => {
    const haystack = [contact.name, contact.relation, ...contact.aliases]
      .map(normalizeText)
      .join(" ")
    return haystack.split(" ").some((token) => token.length > 2 && normalized.includes(token))
  })
}

function accountFor(currency: Currency) {
  return (
    row<Row>("SELECT * FROM accounts WHERE currency = ? AND type = 'checking' ORDER BY balance DESC LIMIT 1", currency) ??
    row<Row>("SELECT * FROM accounts WHERE currency = 'USD' ORDER BY balance DESC LIMIT 1")
  )
}

function matchQuote(input: string, quotes = fallbackMarketQuotes) {
  const normalized = normalizeText(input)
  return quotes.find((quote) => {
    const symbol = normalizeText(quote.symbol)
    const name = normalizeText(quote.name)
    return normalized.includes(symbol) || normalized.includes(name)
  })
}

function parseTradeQuantity(input: string, price: number) {
  const normalized = normalizeText(input)
  const raw = normalized.match(/(\d+(?:[.,]\d+)?)/)?.[1]
  if (!raw) return 1
  const value = Number(raw.replace(",", "."))
  if (!Number.isFinite(value) || value <= 0) return 1
  if (/\b(usd|dolar|dollarlik|dolarlik|try|tl|lira)\b/.test(normalized) && !/\b(adet|lot|pay)\b/.test(normalized)) {
    return Number((value / price).toFixed(6))
  }
  return value
}

function createConfirmation(payload: ConfirmationPayload, summary: string) {
  const id = `conf-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  db()
    .prepare("INSERT INTO confirmations VALUES (?, ?, 'pending', ?, ?, NULL)")
    .run(id, JSON.stringify(payload), summary, new Date().toISOString())
  return mapConfirmation(row<Row>("SELECT * FROM confirmations WHERE id = ?", id))!
}

function latestPending() {
  return mapConfirmation(row<Row>("SELECT * FROM confirmations WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1"))
}

function response(message: string, userText: string, events: AgentEvent[], state: BankState): BankAgentResult {
  const now = new Date().toISOString()
  return {
    message,
    events,
    state,
    transcript: [
      { role: "user", text: userText, at: now },
      { role: "assistant", text: message, at: now },
    ],
  }
}

export async function runBankCommand(userText: string): Promise<BankAgentResult> {
  const normalized = normalizeText(userText)
  const pending = latestPending()

  if (pending && /\b(evet|onay|onayliyorum|tamam|gonder|yolla|baslat)\b/.test(normalized)) {
    return confirmAction(pending.id, true, userText)
  }

  if (pending && /\b(hayir|iptal|vazgec|dur)\b/.test(normalized)) {
    return confirmAction(pending.id, false, userText)
  }

  if (/\b(gonder|yolla|transfer|havale|eft)\b/.test(normalized)) {
    const contact = resolveContact(userText)
    const { amount, currency } = parseAmount(userText)
    const events: AgentEvent[] = [
      { type: "bank.tool_progress", label: "Arıyorum", detail: "Search: sandbox kişi defteri taranıyor." },
    ]

    if (!contact) {
      return response(
        "Alıcıyı net bulamadım. Oğlum, çocuk, anne, baba, amca, eşim, kira veya okul gibi kayıtlı bir kişiyi söyleyebilirsiniz.",
        userText,
        events,
        await readBankState()
      )
    }

    if (!amount || amount <= 0) {
      return response(
        `${contact.relation} ${contact.name} bulundu. Göndermek istediğiniz tutarı da söyler misiniz?`,
        userText,
        [...events, { type: "bank.tool_progress", label: "Buldum", detail: contact.name }],
        await readBankState()
      )
    }

    const source = accountFor(currency) as Row | undefined
    if (!source) {
      return response("Bu para birimi için uygun sandbox hesabı bulamadım.", userText, events, await readBankState())
    }

    if (Number(source.available) < amount) {
      return response(
        `${String(source.name)} bakiyesi bu işlem için yeterli değil. Kullanılabilir bakiye ${formatMoney(Number(source.available), currency)}.`,
        userText,
        events,
        await readBankState()
      )
    }

    const confirmation = createConfirmation(
      {
        kind: "transfer",
        fromAccountId: String(source.id),
        contactId: contact.id,
        amount,
        currency,
        note: normalized.includes("harclik") ? "Harçlık" : undefined,
      },
      `${contact.name} hesabına ${formatMoney(amount, currency)} gönder`
    )

    return response(
      `${contact.relation} ${contact.name} hesabını buldum. ${formatMoney(amount, currency)} göndermek için onayınızı bekliyorum.`,
      userText,
      [
        ...events,
        { type: "bank.tool_progress", label: "Buldum", detail: `${contact.name} - ${contact.accountLabel}` },
        { type: "bank.confirmation_required", label: "Onay gerekiyor", detail: confirmation.summary },
      ],
      await readBankState()
    )
  }

  if (normalized.includes("bakiye") || /\b(hesap|para durum|ne kadar)\b/.test(normalized)) {
    const state = await readBankState()
    const summary = state.accounts
      .slice(0, 3)
      .map((account) => `${account.name}: ${formatMoney(account.available, account.currency)}`)
      .join(", ")
    return response(`Güncel sandbox bakiyeleriniz: ${summary}.`, userText, [
      { type: "bank.tool_progress", label: "Hesaplar okundu", detail: "SQLite sandbox state" },
    ], state)
  }

  if (/\b(dondur|kilitle)\b/.test(normalized) && /\b(kart)\b/.test(normalized)) {
    const card = row<Row>("SELECT * FROM cards WHERE status = 'active' ORDER BY id LIMIT 1")
    if (!card) return response("Dondurulacak aktif kart bulamadım.", userText, [], await readBankState())
    const confirmation = createConfirmation(
      { kind: "card_status", cardId: String(card.id), status: "frozen" },
      `${String(card.name)} kartını dondur`
    )
    return response(`${String(card.name)} kartını dondurmak için onayınızı bekliyorum.`, userText, [
      { type: "bank.confirmation_required", label: "Kart onayı gerekiyor", detail: confirmation.summary },
    ], await readBankState())
  }

  if (/\b(ac|aç|coz|çöz)\b/.test(normalized) && /\b(kart)\b/.test(normalized)) {
    const card = row<Row>("SELECT * FROM cards WHERE status = 'frozen' ORDER BY id LIMIT 1")
    if (!card) return response("Açılacak dondurulmuş kart bulamadım.", userText, [], await readBankState())
    const confirmation = createConfirmation(
      { kind: "card_status", cardId: String(card.id), status: "active" },
      `${String(card.name)} kartını tekrar aç`
    )
    return response(`${String(card.name)} kartını tekrar açmak için onayınızı bekliyorum.`, userText, [
      { type: "bank.confirmation_required", label: "Kart onayı gerekiyor", detail: confirmation.summary },
    ], await readBankState())
  }

  if (/\b(al|alım|alim|sat|satım|satim|buy|sell)\b/.test(normalized) && /\b(hisse|fon|kripto|bitcoin|ethereum|apple|tesla|aapl|tsla|btc|eth)\b/.test(normalized)) {
    const state = await readBankState()
    const quote = matchQuote(userText, state.marketQuotes) ?? matchQuote(userText)
    if (!quote) {
      return response("İşlem yapılacak hisse, fon veya kriptoyu net bulamadım. AAPL, TSLA, BTC veya ETH gibi söyleyebilirsiniz.", userText, [
        { type: "bank.tool_progress", label: "Piyasa arandı", detail: "Sembol bulunamadı" },
      ], state)
    }

    const side = /\b(sat|satım|satim|sell)\b/.test(normalized) ? "sell" : "buy"
    const quantity = parseTradeQuantity(userText, quote.price)
    const account = row<Row>("SELECT * FROM accounts WHERE type = 'investment' AND currency = ? ORDER BY available DESC LIMIT 1", quote.currency) ??
      row<Row>("SELECT * FROM accounts WHERE id = 'acc-invest' LIMIT 1") ??
      accountFor(quote.currency)
    const gross = quote.price * quantity

    if (!account) {
      return response("Bu trade için uygun sandbox yatırım hesabı bulamadım.", userText, [], state)
    }

    if (side === "buy" && Number(account.available) < gross) {
      return response(
        `${quote.symbol} alımı için kullanılabilir bakiye yeterli değil. Gereken yaklaşık tutar ${formatMoney(gross, quote.currency)}.`,
        userText,
        [{ type: "bank.tool_progress", label: "Bakiye kontrolü", detail: "Yetersiz yatırım bakiyesi" }],
        state
      )
    }

    const confirmation = createConfirmation(
      {
        kind: "trade",
        side,
        symbol: quote.symbol,
        quantity,
        estimatedPrice: quote.price,
        currency: quote.currency,
        accountId: String(account.id),
      },
      `${quantity} ${quote.symbol} ${side === "buy" ? "al" : "sat"}`
    )

    return response(
      `${quote.symbol} için ${side === "buy" ? "alım" : "satım"} emrini hazırladım. Yaklaşık ${formatMoney(gross, quote.currency)} için onayınızı bekliyorum.`,
      userText,
      [
        { type: "bank.tool_progress", label: "Piyasa arandı", detail: `${quote.symbol} ${formatMoney(quote.price, quote.currency)}` },
        { type: "bank.tool_progress", label: "Trade hazır", detail: `${quantity} adet ${quote.symbol}` },
        { type: "bank.confirmation_required", label: "Onay gerekiyor", detail: confirmation.summary },
      ],
      await readBankState()
    )
  }

  if (/\b(piyasa|borsa|hisse|fon|kripto|bitcoin|portfoy|portföy)\b/.test(normalized)) {
    const state = await readBankState()
    const quotes = state.marketQuotes.slice(0, 4).map((quote) => `${quote.symbol} ${formatMoney(quote.price, quote.currency)} (${quote.changePercent.toFixed(2)}%)`).join(", ")
    return response(`Canlı piyasa ekranı hazır: ${quotes}.`, userText, [
      { type: "bank.tool_progress", label: "Piyasa verisi çekildi", detail: state.marketQuotes[0]?.source === "live" ? "Canlı kaynak" : "Seed fallback" },
    ], state)
  }

  if (/\b(islem|işlem|gecmis|geçmiş|son harcama)\b/.test(normalized)) {
    const state = await readBankState()
    const latest = state.transactions
      .slice(0, 3)
      .map((transaction) => `${transaction.title}: ${formatMoney(transaction.amount, transaction.currency)}`)
      .join(", ")
    return response(`Son sandbox işlemleri: ${latest}.`, userText, [
      { type: "bank.tool_progress", label: "İşlem geçmişi arandı" },
    ], state)
  }

  const state = await readBankState()
  return response(
    "Hazırım. Para gönderebilir, bakiyeleri okuyabilir, kartları yönetebilir ve piyasa/portföy durumunu sorabilirsiniz.",
    userText,
    [{ type: "bank.tool_progress", label: "Komut yorumlandı", detail: "Genel banka ajanı" }],
    state
  )
}

export async function confirmAction(confirmationId: string, approved: boolean, userText = approved ? "Onayla" : "Reddet"): Promise<BankAgentResult> {
  const confirmation = mapConfirmation(row<Row>("SELECT * FROM confirmations WHERE id = ?", confirmationId))
  if (!confirmation || confirmation.status !== "pending") {
    return response("Bu onay artık geçerli değil.", userText, [], await readBankState())
  }

  if (!approved) {
    db().prepare("UPDATE confirmations SET status = 'declined', resolved_at = ? WHERE id = ?").run(new Date().toISOString(), confirmationId)
    return response("İşlem iptal edildi. Sandbox bakiyeleri değişmedi.", userText, [
      { type: "bank.state_changed", label: "Onay reddedildi", detail: confirmation.summary },
    ], await readBankState())
  }

  const payload = confirmation.payload
  const database = db()

  if (payload.kind === "transfer") {
    const account = row<Row>("SELECT * FROM accounts WHERE id = ?", payload.fromAccountId)
    const contact = row<Row>("SELECT * FROM contacts WHERE id = ?", payload.contactId)
    if (!account || !contact || Number(account.available) < payload.amount) {
      database.prepare("UPDATE confirmations SET status = 'expired', resolved_at = ? WHERE id = ?").run(new Date().toISOString(), confirmationId)
      return response("İşlem tamamlanamadı; hesap veya bakiye artık uygun değil.", userText, [], await readBankState())
    }

    const transactionId = `txn-${Date.now()}`
    database.prepare("UPDATE accounts SET balance = balance - ?, available = available - ? WHERE id = ?").run(payload.amount, payload.amount, payload.fromAccountId)
    database.prepare("INSERT INTO transactions VALUES (?, 'sent', ?, ?, ?, ?, ?, ?, 'completed', 'Aile', ?, ?)").run(
      transactionId,
      String(contact.name),
      `${String(contact.relation)} - ${String(contact.account_label)}`,
      -payload.amount,
      payload.currency,
      payload.fromAccountId,
      payload.contactId,
      new Date().toISOString(),
      payload.note ?? null
    )
    database.prepare("UPDATE confirmations SET status = 'approved', resolved_at = ? WHERE id = ?").run(new Date().toISOString(), confirmationId)
    return response(`${String(contact.name)} hesabına ${formatMoney(payload.amount, payload.currency)} gönderildi.`, userText, [
      { type: "bank.state_changed", label: "Transfer tamamlandı", detail: transactionId },
    ], await readBankState())
  }

  if (payload.kind === "card_status") {
    database.prepare("UPDATE cards SET status = ? WHERE id = ?").run(payload.status, payload.cardId)
    database.prepare("UPDATE confirmations SET status = 'approved', resolved_at = ? WHERE id = ?").run(new Date().toISOString(), confirmationId)
    return response(`Kart durumu ${payload.status === "frozen" ? "donduruldu" : "aktif"} olarak güncellendi.`, userText, [
      { type: "bank.state_changed", label: "Kart güncellendi", detail: payload.cardId },
    ], await readBankState())
  }

  if (payload.kind === "card_limit") {
    database.prepare("UPDATE cards SET limit_amount = ?, currency = ? WHERE id = ?").run(payload.limitAmount, payload.currency, payload.cardId)
    database.prepare("UPDATE confirmations SET status = 'approved', resolved_at = ? WHERE id = ?").run(new Date().toISOString(), confirmationId)
    return response("Kart limiti güncellendi.", userText, [
      { type: "bank.state_changed", label: "Limit güncellendi", detail: payload.cardId },
    ], await readBankState())
  }

  const quotes = await getMarketQuotes()
  const quote = quotes.find((item) => item.symbol === payload.symbol) ?? fallbackMarketQuotes.find((item) => item.symbol === payload.symbol)
  const price = quote?.price ?? payload.estimatedPrice
  const gross = price * payload.quantity
  const sign = payload.side === "buy" ? -1 : 1
  database.prepare("UPDATE accounts SET balance = balance + ?, available = available + ? WHERE id = ?").run(sign * gross, sign * gross, payload.accountId)
  database.prepare("INSERT INTO transactions VALUES (?, 'trade', ?, ?, ?, ?, ?, NULL, 'completed', 'Yatırım', ?, NULL)").run(
    `txn-${Date.now()}`,
    `${payload.side === "buy" ? "Alım" : "Satım"} ${payload.symbol}`,
    "Sandbox piyasa emri",
    sign * gross,
    payload.currency,
    payload.accountId,
    new Date().toISOString()
  )
  database.prepare("UPDATE confirmations SET status = 'approved', resolved_at = ? WHERE id = ?").run(new Date().toISOString(), confirmationId)
  return response(`${payload.symbol} için sandbox ${payload.side === "buy" ? "alım" : "satım"} emri tamamlandı.`, userText, [
    { type: "bank.state_changed", label: "Trade tamamlandı", detail: payload.symbol },
  ], await readBankState())
}
