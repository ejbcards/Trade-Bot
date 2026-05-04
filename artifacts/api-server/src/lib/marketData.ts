import YahooFinanceClass from "yahoo-finance2";
import { logger } from "./logger";

// yahoo-finance2 v3: default export is the class, must be instantiated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

export interface OHLCVBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataResult {
  symbol: string;
  currentPrice: number;
  rsi: number | null;
  maCondition: "above" | "below" | null;
  volumeCondition: "high" | "normal" | "low" | null;
  trendCondition: "bullish" | "bearish" | "neutral" | null;
  priceChangePercent: number | null;
  candlestickPattern: string | null;
  timeFrame: string | null;
  volumeIncreaseLevel: "S" | "M" | "L" | null;
}

export interface OptionsContract {
  contractSymbol: string;
  optionType: "call" | "put";
  strike: number;
  expiry: Date;
  lastPrice: number;
  bid: number;
  ask: number;
  midPrice: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  volume: number;
}

function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function detectCandlestickPattern(bars: OHLCVBar[]): string | null {
  if (bars.length < 2) return null;
  const curr = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const range = curr.high - curr.low;
  if (range === 0) return null;
  const body = Math.abs(curr.close - curr.open);
  const upperShadow = curr.high - Math.max(curr.open, curr.close);
  const lowerShadow = Math.min(curr.open, curr.close) - curr.low;

  const lowDiffPct = Math.abs(curr.low - prev.low) / (prev.low || 1);
  const highDiffPct = Math.abs(curr.high - prev.high) / (prev.high || 1);

  if (lowDiffPct < 0.003 && prev.close < prev.open && curr.close > curr.open) return "TB";
  if (highDiffPct < 0.003 && prev.close > prev.open && curr.close < curr.open) return "TT";
  if (lowerShadow >= 2 * body && upperShadow <= 0.1 * range && body / range < 0.4) return "H";
  if (upperShadow >= 2 * body && lowerShadow <= 0.1 * range && body / range < 0.4) return "IH";
  if (lowerShadow >= 1.5 * body && upperShadow <= 0.15 * range && curr.close > prev.close) return "CH";
  return null;
}

function detectTimeFrame(bars: OHLCVBar[]): string | null {
  if (bars.length < 2) return null;
  const curr = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const range = curr.high - curr.low;
  const body = Math.abs(curr.close - curr.open);
  if (range > 0 && body / range > 0.6) return "FT";
  if (curr.high <= prev.high && curr.low >= prev.low) return "DF";
  if (curr.high > prev.high && curr.low < prev.low) return "DFI";
  return null;
}

function detectVolumeLevel(bars: OHLCVBar[]): "S" | "M" | "L" | null {
  if (bars.length < 21) return null;
  const avgVolume = calculateSMA(bars.slice(-21, -1).map((b) => b.volume), 20);
  if (!avgVolume || avgVolume === 0) return null;
  const ratio = bars[bars.length - 1].volume / avgVolume;
  if (ratio > 1.75) return "L";
  if (ratio > 1.30) return "M";
  if (ratio > 1.10) return "S";
  return null;
}

export async function fetchMarketData(symbol: string): Promise<MarketDataResult | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 60);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historical: any[] = await (yahooFinance.historical as any)(symbol, { period1: startDate, period2: endDate, interval: "1d" });
    if (!historical || historical.length < 15) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await (yahooFinance.quote as any)(symbol);

    const bars: OHLCVBar[] = historical
      .filter((b: any) => b.open != null && b.high != null && b.low != null && b.close != null && b.volume != null)
      .map((b: any) => ({ date: new Date(b.date), open: b.open as number, high: b.high as number, low: b.low as number, close: b.close as number, volume: b.volume as number }))
      .sort((a: OHLCVBar, b: OHLCVBar) => a.date.getTime() - b.date.getTime());

    const closes = bars.map((b) => b.close);
    const volumes = bars.map((b) => b.volume);

    const currentPrice = quote.regularMarketPrice ?? closes[closes.length - 1];
    const prevClose = quote.regularMarketPreviousClose ?? closes[closes.length - 2];
    const priceChangePercent = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : null;

    const rsi = calculateRSI(closes);
    const sma20 = calculateSMA(closes, 20);
    const maCondition: "above" | "below" | null = sma20 !== null ? (currentPrice > sma20 ? "above" : "below") : null;

    const avgVol = calculateSMA(volumes.slice(-21, -1), 20);
    const currVol = quote.regularMarketVolume ?? bars[bars.length - 1].volume;
    let volumeCondition: "high" | "normal" | "low" | null = null;
    if (avgVol) {
      const r = currVol / avgVol;
      volumeCondition = r > 1.5 ? "high" : r < 0.7 ? "low" : "normal";
    }

    let trendCondition: "bullish" | "bearish" | "neutral" | null = null;
    if (rsi !== null && maCondition !== null) {
      if (maCondition === "above" && rsi > 50) trendCondition = "bullish";
      else if (maCondition === "below" && rsi < 50) trendCondition = "bearish";
      else trendCondition = "neutral";
    }

    return {
      symbol,
      currentPrice,
      rsi,
      maCondition,
      volumeCondition,
      trendCondition,
      priceChangePercent,
      candlestickPattern: detectCandlestickPattern(bars),
      timeFrame: detectTimeFrame(bars),
      volumeIncreaseLevel: detectVolumeLevel(bars),
    };
  } catch (err) {
    logger.warn({ symbol, err }, "Failed to fetch market data for symbol");
    return null;
  }
}

// ─── SPY Options Chain ────────────────────────────────────────────────────

/** Find the contract in a list whose strike is closest to the target price */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findAtmContract(contracts: any[], targetPrice: number): any | null {
  if (!contracts || contracts.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return contracts.reduce((best: any, c: any) => {
    if (!best) return c;
    return Math.abs(c.strike - targetPrice) < Math.abs(best.strike - targetPrice) ? c : best;
  }, null);
}

/**
 * Fetches the SPY options chain and returns the best ATM call and put
 * for the next expiry at least `minDaysOut` calendar days from now.
 *
 * Step 1: fetch the base chain (no date) to get all available expirationDates.
 * Step 2: pick the first expiry that is >= minDaysOut days from today.
 * Step 3: re-fetch the chain for that specific date to get calls/puts.
 */
export async function fetchSpyOptionsChain(currentPrice: number, minDaysOut = 10): Promise<{
  call: OptionsContract | null;
  put: OptionsContract | null;
  expiryDate: Date;
} | null> {
  try {
    // Step 1 — discover available expiry dates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base: any = await (yahooFinance.options as any)("SPY");
    const expirationDates: Date[] = base?.expirationDates ?? [];
    if (expirationDates.length === 0) {
      logger.warn("SPY options: no expirationDates returned");
      return null;
    }

    // Step 2 — pick first expiry >= minDaysOut days from now
    const cutoff = new Date(Date.now() + minDaysOut * 24 * 60 * 60 * 1000);
    const targetDate = expirationDates.find((d) => new Date(d) >= cutoff) ?? expirationDates[expirationDates.length - 1];
    const expiryDate = new Date(targetDate);

    // Step 3 — fetch the chain for that expiry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = await (yahooFinance.options as any)("SPY", { date: expiryDate });
    const optionSet = chain?.options?.[0];
    if (!optionSet) {
      logger.warn({ expiryDate }, "SPY options: no option set for target expiry");
      return null;
    }

    const rawCall = findAtmContract(optionSet.calls ?? [], currentPrice);
    const rawPut = findAtmContract(optionSet.puts ?? [], currentPrice);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function parseContract(raw: any, type: "call" | "put"): OptionsContract | null {
      if (!raw) return null;
      const bid = raw.bid ?? 0;
      const ask = raw.ask ?? 0;
      const last = raw.lastPrice ?? 0;
      const mid = bid && ask ? (bid + ask) / 2 : last;
      return {
        contractSymbol: raw.contractSymbol as string,
        optionType: type,
        strike: raw.strike as number,
        expiry: expiryDate,
        lastPrice: last,
        bid,
        ask,
        midPrice: parseFloat(mid.toFixed(4)),
        impliedVolatility: raw.impliedVolatility ?? 0,
        inTheMoney: raw.inTheMoney ?? false,
        volume: raw.volume ?? 0,
      };
    }

    logger.info(
      { expiryDate: expiryDate.toISOString().slice(0, 10), calls: optionSet.calls?.length ?? 0, puts: optionSet.puts?.length ?? 0 },
      "SPY options chain fetched",
    );

    return {
      call: parseContract(rawCall, "call"),
      put: parseContract(rawPut, "put"),
      expiryDate,
    };
  } catch (err) {
    logger.warn({ err }, "Failed to fetch SPY options chain");
    return null;
  }
}
