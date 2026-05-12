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

function calculateEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
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

// ─── VIX (Volatility Index) ───────────────────────────────────────────────

// ─── 5-Minute Intraday Momentum ──────────────────────────────────────────────
//
// Used during elevated-VIX regimes to confirm downward momentum before entering
// a PUT. The daily trend can still be bullish while the 5-min chart rolls over —
// this catches that intraday shift earlier than the daily signal does.
//

export interface IntradayMomentum {
  trend: "bearish" | "bullish" | "neutral";
  /** How many consecutive bearish 5-min bars at the tip of the chart */
  consecutiveDown: number;
  /** How many consecutive bullish 5-min bars at the tip of the chart */
  consecutiveUp: number;
  /** Price change % over the last 5 bars (~25 minutes) */
  momentum25m: number | null;
  /** Current price vs 8-bar EMA */
  belowEma8: boolean;
  barsAnalyzed: number;
}

export async function fetchIntraday5mMomentum(symbol: string): Promise<IntradayMomentum | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - 5); // last ~5 hours covers the full trading session

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await (yahooFinance.chart as any)(symbol, {
      period1: startDate,
      period2: endDate,
      interval: "5m",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawQuotes: any[] = result?.quotes ?? [];
    const bars = rawQuotes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) => q.open != null && q.close != null && q.high != null && q.low != null)
      .slice(-24); // last ~2 hours of 5-min bars

    if (bars.length < 8) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const closes = bars.map((b: any) => b.close as number);

    const ema8 = calculateEMA(closes, 8);
    const currentClose = closes[closes.length - 1];
    const belowEma8 = ema8 !== null && currentClose < ema8;

    // Price change over last 5 bars (~25 minutes)
    const price5barsAgo = bars.length >= 5 ? closes[closes.length - 5] : null;
    const momentum25m = price5barsAgo && price5barsAgo > 0
      ? ((currentClose - price5barsAgo) / price5barsAgo) * 100
      : null;

    // Count consecutive bearish / bullish candles from the most recent bar back
    let consecutiveDown = 0;
    let consecutiveUp = 0;
    for (let i = bars.length - 1; i >= 0; i--) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bar = bars[i] as any;
      if (bar.close < bar.open) {
        if (consecutiveUp > 0) break;
        consecutiveDown++;
      } else if (bar.close > bar.open) {
        if (consecutiveDown > 0) break;
        consecutiveUp++;
      } else {
        break; // doji — stop counting
      }
    }

    // Bearish: below 8-EMA AND (≥2 consecutive down bars OR price fell >0.1% in 25 min)
    const isBearish = belowEma8 && (consecutiveDown >= 2 || (momentum25m !== null && momentum25m < -0.1));
    // Bullish: above 8-EMA AND (≥2 consecutive up bars OR price rose >0.1% in 25 min)
    const isBullish = !belowEma8 && ema8 !== null && (consecutiveUp >= 2 || (momentum25m !== null && momentum25m > 0.1));

    logger.info(
      { symbol, belowEma8, ema8: ema8?.toFixed(2), currentClose: currentClose.toFixed(2), consecutiveDown, consecutiveUp, momentum25m: momentum25m?.toFixed(3), barsAnalyzed: bars.length },
      "5-min intraday momentum",
    );

    return {
      trend: isBearish ? "bearish" : isBullish ? "bullish" : "neutral",
      consecutiveDown,
      consecutiveUp,
      momentum25m,
      belowEma8,
      barsAnalyzed: bars.length,
    };
  } catch (err) {
    logger.warn({ symbol, err }, "Failed to fetch 5-min intraday momentum");
    return null;
  }
}

export interface VixData {
  price: number;
  dayChangePercent: number;
  isHighVolatility: boolean;
  /**
   * True when VIX is falling meaningfully today (dayChangePercent < -1.5%).
   * A falling VIX — especially on high volume — signals fear is unwinding,
   * which is a bullish market confirmation. This is NOT a high-vol regime.
   */
  isFearUnwinding: boolean;
}

/**
 * Fetch live VIX data from Yahoo Finance (ticker: ^VIX).
 *
 * "High volatility" (CALL-blocking regime) is defined as:
 *   - VIX price is ABOVE the threshold AND rising (not falling), OR
 *   - VIX has SPIKED more than +2% on the day (sudden fear spike).
 *
 * NOTE: VIX elevated but FALLING is NOT high-volatility — it means fear is
 * releasing, which is actually a bullish signal (especially on high volume).
 *
 * "Fear unwinding" is defined as:
 *   - VIX falling more than -1.5% on the day.
 */
export async function fetchVixData(): Promise<VixData | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await (yahooFinance.quote as any)("^VIX");
    const price: number = quote.regularMarketPrice ?? 0;
    const prevClose: number = quote.regularMarketPreviousClose ?? price;
    const dayChangePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    // Absolute CALL-block rule (three independent conditions — any one is sufficient):
    //   1. VIX > $18 AND rising  — fear building above warning level
    //   2. VIX day spike > +2%   — sudden fear surge
    //   3. VIX price > $23       — sustained high-fear regime
    const isHighVolatility = (price > 18 && dayChangePercent > 0) || dayChangePercent > 2 || price > 23;
    const isFearUnwinding = dayChangePercent < -1.5;

    logger.info(
      { vixPrice: price.toFixed(2), dayChangePct: dayChangePercent.toFixed(2), isHighVolatility, isFearUnwinding },
      "VIX fetched",
    );

    return { price, dayChangePercent, isHighVolatility, isFearUnwinding };
  } catch (err) {
    logger.warn({ err }, "Failed to fetch VIX data — proceeding without volatility filter");
    return null;
  }
}

// ─── SPY Options Chain ────────────────────────────────────────────────────

/**
 * Find the best OTM contract within a dollar budget.
 *
 * Strategy:
 *  - Calls: strikes strictly above currentPrice (OTM)
 *  - Puts:  strikes strictly below currentPrice (OTM)
 *  - Rank by which 1-contract cost (mid × 100) is closest to budgetUsd
 *    so we get the highest-delta strike we can actually afford.
 *  - Exclude illiquid / zero-bid contracts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findOtmContract(contracts: any[], currentPrice: number, type: "call" | "put", budgetUsd: number): any | null {
  if (!contracts || contracts.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withMid = contracts.map((c: any) => {
    const bid = (c.bid as number) ?? 0;
    const ask = (c.ask as number) ?? 0;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : ((c.lastPrice as number) ?? 0);
    return { ...c as object, _mid: mid, _cost: mid * 100 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }).filter((c: any) => {
    if (c._mid <= 0) return false;
    return type === "call" ? (c.strike as number) > currentPrice : (c.strike as number) < currentPrice;
  });

  if (withMid.length === 0) return null;

  // Sort closest-OTM-first so ties break toward higher delta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withMid.sort((a: any, b: any) =>
    type === "call" ? (a.strike as number) - (b.strike as number) : (b.strike as number) - (a.strike as number),
  );

  // Prefer contracts within budget; allow up to 1.5× if nothing fits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withinBudget = withMid.filter((c: any) => c._cost <= budgetUsd);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool = withinBudget.length > 0 ? withinBudget : withMid.filter((c: any) => c._cost <= budgetUsd * 1.5);
  const candidates = pool.length > 0 ? pool : withMid;

  // Pick the contract whose cost is closest to the budget (maximise delta within spend)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return candidates.reduce((best: any, curr: any) =>
    Math.abs(curr._cost - budgetUsd) < Math.abs(best._cost - budgetUsd) ? curr : best,
  );
}

/**
 * Fetches the SPY options chain and returns the best near-term OTM call and put
 * sized to fit within `budgetUsd` for a single contract.
 *
 * Step 1: fetch the base chain to discover all available expirationDates.
 * Step 2: pick the nearest expiry that is >= minDaysOut days from now
 *         (defaults to 2 days so we land on the closest weekly, not 0DTE).
 * Step 3: re-fetch for that date and select the OTM strike whose
 *         1-contract cost is closest to budgetUsd.
 */
export async function fetchSpyOptionsChain(currentPrice: number, budgetUsd = 150, minDaysOut = 2): Promise<{
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

    // Step 2 — pick first expiry >= minDaysOut days from now (avoid same-day expiry)
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

    const rawCall = findOtmContract(optionSet.calls ?? [], currentPrice, "call", budgetUsd);
    const rawPut  = findOtmContract(optionSet.puts  ?? [], currentPrice, "put",  budgetUsd);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function parseContract(raw: any, type: "call" | "put"): OptionsContract | null {
      if (!raw) return null;
      const bid = (raw.bid as number) ?? 0;
      const ask = (raw.ask as number) ?? 0;
      const last = (raw.lastPrice as number) ?? 0;
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
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

    const daysOut = Math.round((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    logger.info(
      {
        expiryDate: expiryDate.toISOString().slice(0, 10),
        daysToExpiry: daysOut,
        callStrike: rawCall?.strike ?? null,
        putStrike: rawPut?.strike ?? null,
        callCost: rawCall ? (((rawCall.bid ?? 0) + (rawCall.ask ?? 0)) / 2 * 100).toFixed(0) : null,
        putCost:  rawPut  ? (((rawPut.bid  ?? 0) + (rawPut.ask  ?? 0)) / 2 * 100).toFixed(0) : null,
        budgetUsd,
      },
      "SPY options chain fetched",
    );

    return {
      call: parseContract(rawCall, "call"),
      put:  parseContract(rawPut,  "put"),
      expiryDate,
    };
  } catch (err) {
    logger.warn({ err }, "Failed to fetch SPY options chain");
    return null;
  }
}
