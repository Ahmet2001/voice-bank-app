import type { Currency, MarketQuote } from "@/lib/sandbox-bank/types"

const WATCHED_SYMBOLS = ["AAPL", "MSFT", "NVDA", "SPY", "BTC-USD", "ETH-USD"]

export const fallbackMarketQuotes: MarketQuote[] = [
  {
    symbol: "AAPL",
    name: "Apple",
    price: 226.41,
    currency: "USD",
    changePercent: 0.62,
    source: "seed",
    updatedAt: "2026-06-27T00:00:00.000Z",
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    price: 486.18,
    currency: "USD",
    changePercent: 0.34,
    source: "seed",
    updatedAt: "2026-06-27T00:00:00.000Z",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA",
    price: 154.09,
    currency: "USD",
    changePercent: 1.2,
    source: "seed",
    updatedAt: "2026-06-27T00:00:00.000Z",
  },
  {
    symbol: "SPY",
    name: "S&P 500 ETF",
    price: 612.2,
    currency: "USD",
    changePercent: 0.18,
    source: "seed",
    updatedAt: "2026-06-27T00:00:00.000Z",
  },
  {
    symbol: "BTC-USD",
    name: "Bitcoin",
    price: 106850,
    currency: "USD",
    changePercent: -0.42,
    source: "seed",
    updatedAt: "2026-06-27T00:00:00.000Z",
  },
  {
    symbol: "ETH-USD",
    name: "Ethereum",
    price: 5340,
    currency: "USD",
    changePercent: 0.88,
    source: "seed",
    updatedAt: "2026-06-27T00:00:00.000Z",
  },
]

type YahooQuote = {
  symbol?: string
  shortName?: string
  longName?: string
  regularMarketPrice?: number
  regularMarketChangePercent?: number
  currency?: string
}

export async function getMarketQuotes(): Promise<MarketQuote[]> {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${WATCHED_SYMBOLS.join(",")}`,
      { next: { revalidate: 60 } }
    )

    if (!response.ok) {
      throw new Error(`Market API returned ${response.status}`)
    }

    const payload = (await response.json()) as {
      quoteResponse?: { result?: YahooQuote[] }
    }

    const now = new Date().toISOString()
    const live: MarketQuote[] = (payload.quoteResponse?.result ?? [])
      .filter((quote) => quote.symbol && typeof quote.regularMarketPrice === "number")
      .map((quote) => ({
        symbol: quote.symbol!,
        name: quote.shortName ?? quote.longName ?? quote.symbol!,
        price: quote.regularMarketPrice!,
        currency: (quote.currency === "TRY" || quote.currency === "EUR" ? quote.currency : "USD") as Currency,
        changePercent: quote.regularMarketChangePercent ?? 0,
        source: "live" as const,
        updatedAt: now,
      }))

    return live.length >= 3 ? live : fallbackMarketQuotes
  } catch {
    return fallbackMarketQuotes
  }
}
