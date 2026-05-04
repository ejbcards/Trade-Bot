import YahooFinanceClass from "yahoo-finance2";
import { logger } from "./logger";

// yahoo-finance2 v3: default export is the class, must be instantiated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinanceClass as any)();

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
