import YahooFinanceClass from "yahoo-finance2";
import { db, brokersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { SCHWAB_BROKER_TYPE, getValidAccessToken } from "./schwabBroker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

const SCHWAB_MARKET_DATA_BASE = "https://api.schwabapi.com/marketdata/v1";

export interface LiveQuote {
  bid: number | null;
  ask: number | null;
  mark: number;
  last: number;
  change: number;
  changePercent: number;
  source: "schwab" | "yahoo";
}

// ─── Schwab Market Data API ───────────────────────────────────────────────

async function fetchSchwabQuotes(symbols: string[], accessToken: string): Promise<Record<string, LiveQuote>> {
  const url = `${SCHWAB_MARKET_DATA_BASE}/quotes?symbols=${encodeURIComponent(symbols.join(","))}&fields=quote`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!resp.ok) {
    logger.warn({ status: resp.status }, "Schwab quotes fetch failed");
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await resp.json() as Record<string, any>;
  const result: Record<string, LiveQuote> = {};

  for (const symbol of symbols) {
    const entry = data[symbol];
    if (!entry?.quote) continue;
    const q = entry.quote;
    const bid = q.bidPrice > 0 ? (q.bidPrice as number) : null;
    const ask = q.askPrice > 0 ? (q.askPrice as number) : null;
    result[symbol] = {
      bid,
      ask,
      mark: q.mark ?? (bid && ask ? (bid + ask) / 2 : q.lastPrice ?? 0),
      last: q.lastPrice ?? 0,
      change: q.netChange ?? 0,
      changePercent: q.netPercentChange ?? 0,
      source: "schwab",
    };
  }

  return result;
}

// ─── Yahoo Finance fallback ───────────────────────────────────────────────

async function fetchYahooQuotes(symbols: string[]): Promise<Record<string, LiveQuote>> {
  const result: Record<string, LiveQuote> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quote = await (yahooFinance.quote as any)(symbol) as any;
        if (!quote) return;

        const bid = quote.bid > 0 ? (quote.bid as number) : null;
        const ask = quote.ask > 0 ? (quote.ask as number) : null;
        const last = quote.regularMarketPrice ?? 0;
        // Use mid when both sides are quoted, otherwise fall back to last traded price
        const mark = bid && ask ? (bid + ask) / 2 : last;

        result[symbol] = {
          bid,
          ask,
          mark,
          last,
          change: quote.regularMarketChange ?? 0,
          changePercent: quote.regularMarketChangePercent ?? 0,
          source: "yahoo",
        };
      } catch (err) {
        logger.warn({ symbol, err }, "Yahoo Finance quote failed for contract");
      }
    }),
  );

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────
//
// Tries Schwab first (if OAuth tokens exist), falls back to Yahoo Finance.
//

export async function fetchLiveOptionPrices(contractSymbols: string[]): Promise<Record<string, LiveQuote>> {
  if (contractSymbols.length === 0) return {};

  // Try Schwab if there's a connected broker with refresh token
  try {
    const [schwabBroker] = await db
      .select()
      .from(brokersTable)
      .where(eq(brokersTable.brokerType, SCHWAB_BROKER_TYPE));

    if (schwabBroker?.refreshToken) {
      const accessToken = await getValidAccessToken(schwabBroker.id);
      if (accessToken) {
        const quotes = await fetchSchwabQuotes(contractSymbols, accessToken);
        if (Object.keys(quotes).length > 0) {
          logger.info({ count: Object.keys(quotes).length }, "Live quotes from Schwab");
          return quotes;
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "Schwab quotes unavailable — falling back to Yahoo Finance");
  }

  // Yahoo Finance fallback
  const quotes = await fetchYahooQuotes(contractSymbols);
  logger.info({ count: Object.keys(quotes).length }, "Live quotes from Yahoo Finance");
  return quotes;
}
