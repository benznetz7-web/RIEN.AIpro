import { SYMBOL_SPECS } from '../constants/market';
import {
  BreakerBlock,
  CandleBar,
  DangerResult,
  FvgAnalysis,
  FvgZone,
  KeyLevelClusterRaw,
  KeyLevelItem,
  KeyLevelsResult,
  MarketStructure,
  OrderBlock,
  RegimeResult,
  SwingPoint,
} from '../types/trading';

export function formatPrice(v: number | null | undefined, sym = 'XAUUSD', dOv: number | null = null): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const d = dOv !== null ? dOv : (SYMBOL_SPECS[sym]?.digits ?? 2);
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function aggregateWeeklyFromDaily(
  dailyClosed: CandleBar[],
  dailyForming: CandleBar | null = null,
  nowMs = Date.now(),
): { closedBars: CandleBar[]; formingBar: CandleBar | null } {
  const all = [...(dailyClosed || []), ...(dailyForming ? [dailyForming] : [])].sort((a, b) => a.timeMs - b.timeMs);
  const buckets = new Map<number, CandleBar[]>();
  const getWeekStart = (ms: number) => {
    const dt = new Date(ms);
    const day = dt.getUTCDay();
    const diff = (day + 6) % 7;
    return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() - diff);
  };
  const currentWeekStart = getWeekStart(nowMs);
  for (const b of all) {
    const wk = getWeekStart(b.timeMs);
    if (!buckets.has(wk)) buckets.set(wk, []);
    buckets.get(wk)!.push(b);
  }
  const weeks: CandleBar[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wk, items]) => ({
      timeMs: wk,
      openTime: new Date(wk).toISOString(),
      open: items[0].open,
      high: Math.max(...items.map((x) => x.high)),
      low: Math.min(...items.map((x) => x.low)),
      close: items[items.length - 1].close,
      isOpen: wk >= currentWeekStart || items.some((x) => x.isOpen),
    }));
  return {
    closedBars: weeks.filter((w) => !w.isOpen),
    formingBar: weeks.find((w) => w.isOpen) || null,
  };
}

export function calculateEMASeries(v: number[], p: number): number[] {
  if (!v.length) return [];
  const k = 2 / (p + 1);
  const o = [v[0]];
  for (let i = 1; i < v.length; i++) {
    o.push(v[i] * k + o[i - 1] * (1 - k));
  }
  return o;
}

export function calculateRSI(v: number[], p = 14): number | null {
  if (v.length <= p) return null;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= p; i++) {
    const d = v[i] - v[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  let ag = g / p;
  let al = l / p;
  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

export function calculateATRSeries(c: CandleBar[], p = 14): number[] {
  if (c.length <= p) return [];
  const tr: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const x = c[i];
    const pr = c[i - 1].close;
    tr.push(Math.max(x.high - x.low, Math.abs(x.high - pr), Math.abs(x.low - pr)));
  }
  let a = tr.slice(0, p).reduce((x, y) => x + y, 0) / p;
  const o = [a];
  for (let i = p; i < tr.length; i++) {
    a = (a * (p - 1) + tr[i]) / p;
    o.push(a);
  }
  return o;
}

export function calculateADX(c: CandleBar[], p = 14): number | null {
  if (c.length < p * 2 + 2) return null;
  const pDM: number[] = [];
  const mDM: number[] = [];
  const trL: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const u = c[i].high - c[i - 1].high;
    const d = c[i - 1].low - c[i].low;
    pDM.push(u > d && u > 0 ? u : 0);
    mDM.push(d > u && d > 0 ? d : 0);
    trL.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
  }
  let sT = trL.slice(0, p).reduce((a, b) => a + b, 0);
  let sP = pDM.slice(0, p).reduce((a, b) => a + b, 0);
  let sM = mDM.slice(0, p).reduce((a, b) => a + b, 0);
  const dxL: number[] = [];
  for (let i = p; i < trL.length; i++) {
    sT = sT - sT / p + trL[i];
    sP = sP - sP / p + pDM[i];
    sM = sM - sM / p + mDM[i];
    const pDI = sT > 0 ? (sP / sT) * 100 : 0;
    const mDI = sT > 0 ? (sM / sT) * 100 : 0;
    dxL.push(pDI + mDI > 0 ? (Math.abs(pDI - mDI) / (pDI + mDI)) * 100 : 0);
  }
  if (dxL.length < p) return dxL.length ? dxL[dxL.length - 1] : null;
  let adx = dxL.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < dxL.length; i++) {
    adx = (adx * (p - 1) + dxL[i]) / p;
  }
  return adx;
}

export function calculateEfficiencyRatio(c: CandleBar[], p = 12): number {
  if (c.length <= p) return 1;
  const st = c.length - 1 - p;
  const net = Math.abs(c[c.length - 1].close - c[st].close);
  let s = 0;
  for (let i = st + 1; i < c.length; i++) {
    s += Math.abs(c[i].close - c[i - 1].close);
  }
  return s > 0 ? net / s : 0;
}

export function classifyMarketRegimeAndDanger(
  bars: CandleBar[],
  atrS: number[],
  _e20: number[],
  _e50: number[],
  spread: number,
  maxSpreadRatio: number,
): { regime: RegimeResult; danger: DangerResult } {
  const a14 = atrS.length ? atrS[atrS.length - 1] : 0;
  const a50 = atrS.length >= 20 ? atrS.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, atrS.length) : a14;
  const atrR = a50 > 0 ? a14 / a50 : 1;
  const adx = calculateADX(bars, 14) ?? 20;
  const er = calculateEfficiencyRatio(bars, 12);
  const last = bars[bars.length - 1];
  const rH = Math.max(...bars.slice(-21, -1).map((c) => c.high));
  const rL = Math.min(...bars.slice(-21, -1).map((c) => c.low));
  const near = a14 > 0 && (Math.abs(last.close - rH) <= a14 * 0.4 || Math.abs(last.close - rL) <= a14 * 0.4);
  const exp = last.high - last.low >= a14 * 1.25;

  let regime = 'RANGING';
  if (atrR >= 1.65) regime = 'HIGH_VOLATILITY';
  else if (atrR <= 0.55 && adx < 18) regime = 'LOW_VOLATILITY';
  else if ((near && exp) || (atrR < 0.9 && (last.close > rH || last.close < rL))) regime = 'BREAKOUT_DEVELOPING';
  else if (adx >= 21 || er >= 0.28) regime = 'TRENDING';

  let dangerPct = 15;
  if (adx < 18) dangerPct += 18;
  if (er < 0.22) dangerPct += 15;
  if (atrR >= 1.5 || atrR <= 0.6) dangerPct += 20;
  if (a14 > 0 && spread > a14 * maxSpreadRatio) dangerPct += 22;
  dangerPct = Math.min(95, dangerPct);

  let tier = 'CLEAN';
  let riskScale = 1.0;
  let tp1R = 1.3;
  let tp2R = 2.2;
  if (dangerPct >= 50) {
    tier = 'HIGH DANGER (SIDEWAYS/VOL)';
    riskScale = 0.35;
    tp1R = 1.0;
    tp2R = 1.5;
  } else if (dangerPct >= 25) {
    tier = 'CAUTION (20-35% RISK)';
    riskScale = 0.5;
    tp1R = 1.05;
    tp2R = 1.65;
  }

  return {
    regime: {
      regime,
      adx,
      atrRatio: atrR,
      er,
      label: `${regime} (ADX ${adx.toFixed(1)}, ATRx ${atrR.toFixed(2)})`,
    },
    danger: {
      tier,
      pct: dangerPct,
      riskScale,
      tp1R,
      tp2R,
      label: `${tier} · ${dangerPct}%`,
    },
  };
}

export function detectConfirmedSwings(
  c: CandleBar[],
  atr = 0,
): { swingHighs: SwingPoint[]; swingLows: SwingPoint[]; eqHigh: number | null; eqLow: number | null } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];
  const n = c.length;
  if (n < 5) return { swingHighs, swingLows, eqHigh: null, eqLow: null };
  const eps = Math.max(1e-9, (atr || 0) * 0.01);

  let i = 1;
  while (i < n - 1) {
    const h = c[i].high;
    let end = i;
    while (end + 1 < n - 1 && Math.abs(c[end + 1].high - h) <= eps) end++;
    if (h > c[i - 1].high + eps && (i < 2 || h >= c[i - 2].high - eps) && end + 1 < n && h > c[end + 1].high + eps) {
      swingHighs.push({
        index: end,
        price: Math.max(...c.slice(i, end + 1).map((x) => x.high)),
        plateauBars: end - i + 1,
      });
    }
    i = end + 1;
  }

  let j = 1;
  while (j < n - 1) {
    const l = c[j].low;
    let end = j;
    while (end + 1 < n - 1 && Math.abs(c[end + 1].low - l) <= eps) end++;
    if (l < c[j - 1].low - eps && (j < 2 || l <= c[j - 2].low + eps) && end + 1 < n && l < c[end + 1].low - eps) {
      swingLows.push({
        index: end,
        price: Math.min(...c.slice(j, end + 1).map((x) => x.low)),
        plateauBars: end - j + 1,
      });
    }
    j = end + 1;
  }

  const eqT = Math.max(1e-9, (atr || 0) * 0.15);
  let eqHigh: number | null = null;
  let eqLow: number | null = null;
  for (let a = swingHighs.length - 1; a >= 1; a--) {
    if (swingHighs[a].index - swingHighs[a - 1].index >= 2 && Math.abs(swingHighs[a].price - swingHighs[a - 1].price) <= eqT) {
      eqHigh = (swingHighs[a].price + swingHighs[a - 1].price) / 2;
      break;
    }
  }
  for (let a = swingLows.length - 1; a >= 1; a--) {
    if (swingLows[a].index - swingLows[a - 1].index >= 2 && Math.abs(swingLows[a].price - swingLows[a - 1].price) <= eqT) {
      eqLow = (swingLows[a].price + swingLows[a - 1].price) / 2;
      break;
    }
  }

  return { swingHighs, swingLows, eqHigh, eqLow };
}

export function extractKeyLevels(
  closedBars: CandleBar[],
  d1Bars: CandleBar[] | null,
  h1Bars: CandleBar[] | null,
  atr: number,
  sym: string,
  refPrice: number,
): KeyLevelsResult {
  const spec = SYMBOL_SPECS[sym] || { roundStep: 10 };
  const rawLevels: { price: number; tag: string; weight: number }[] = [];
  const add = (price: number, tag: string, weight: number) => {
    if (Number.isFinite(price) && price > 0) rawLevels.push({ price, tag, weight });
  };

  const { swingHighs, swingLows, eqHigh, eqLow } = detectConfirmedSwings(closedBars.slice(-140), atr);
  swingHighs.slice(-12).forEach((s) => add(s.price, 'Swing High', 2));
  swingLows.slice(-12).forEach((s) => add(s.price, 'Swing Low', 2));
  if (eqHigh) add(eqHigh, 'EQH Liquidity', 3);
  if (eqLow) add(eqLow, 'EQL Liquidity', 3);

  let pdh: number | null = null;
  let pdl: number | null = null;
  if (d1Bars && d1Bars.length >= 1) {
    const prevD = d1Bars[d1Bars.length - 1];
    pdh = prevD.high;
    pdl = prevD.low;
    add(pdh, 'PDH', 4);
    add(pdl, 'PDL', 4);
  }

  if (h1Bars && h1Bars.length >= 20) {
    const hSw = detectConfirmedSwings(h1Bars.slice(-80), atr);
    hSw.swingHighs.slice(-4).forEach((s) => add(s.price, 'H1 Res', 3));
    hSw.swingLows.slice(-4).forEach((s) => add(s.price, 'H1 Sup', 3));
  }

  const step = spec.roundStep || 10;
  const baseR = Math.round(refPrice / step) * step;
  [-2, -1, 0, 1, 2].forEach((k) => add(baseR + k * step, 'Round', 1));

  const tol = Math.max(refPrice * 0.0012, (atr || refPrice * 0.002) * 0.45);
  const clusters: KeyLevelClusterRaw[] = [];
  for (const lvl of rawLevels.sort((a, b) => a.price - b.price)) {
    const match = clusters.find((c) => Math.abs(c.price - lvl.price) <= tol);
    if (match) {
      match.touches++;
      match.weight += lvl.weight;
      match.tags.add(lvl.tag);
      match.price = (match.price * (match.touches - 1) + lvl.price) / match.touches;
    } else {
      clusters.push({ price: lvl.price, touches: 1, weight: lvl.weight, tags: new Set([lvl.tag]) });
    }
  }

  const minGap = Math.max(tol * 1.2, refPrice * 0.0008);
  const above = clusters.filter((c) => c.price > refPrice + minGap * 0.25).sort((a, b) => a.price - b.price);
  const below = clusters.filter((c) => c.price < refPrice - minGap * 0.25).sort((a, b) => b.price - a.price);

  const r1 = above[0] || null;
  const r2 = above.find((c) => !r1 || c.price - r1.price >= minGap) || above[1] || null;
  const s1 = below[0] || null;
  const s2 = below.find((c) => !s1 || s1.price - c.price >= minGap) || below[1] || null;

  const fmtC = (c: KeyLevelClusterRaw | null): KeyLevelItem | null =>
    c ? { price: c.price, touches: c.touches, weight: c.weight, tags: [...c.tags].slice(0, 2).join('+') } : null;

  return {
    r1: fmtC(r1),
    r2: fmtC(r2),
    s1: fmtC(s1),
    s2: fmtC(s2),
    pdh,
    pdl,
    eqHigh,
    eqLow,
    all: clusters.slice(0, 12),
  };
}

export function analyzeMarketStructure(c: CandleBar[], atr: number, sym: string, bosLookback = 18): MarketStructure {
  if (c.length < 25) {
    return {
      type: 'NEUTRAL',
      kind: 'NONE',
      swingSequence: 'MIXED',
      swingHigh: null,
      swingLow: null,
      eqHigh: null,
      eqLow: null,
      sweep: null,
      inPullback: false,
      label: 'Insufficient bars',
    };
  }
  const { swingHighs, swingLows, eqHigh, eqLow } = detectConfirmedSwings(c, atr);
  const rH = swingHighs.length ? swingHighs[swingHighs.length - 1] : { index: c.length - 4, price: Math.max(...c.slice(-15, -1).map((x) => x.high)) };
  const rL = swingLows.length ? swingLows[swingLows.length - 1] : { index: c.length - 4, price: Math.min(...c.slice(-15, -1).map((x) => x.low)) };

  let seq = 'MIXED';
  let pb: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const hh = swingHighs[swingHighs.length - 1].price > swingHighs[swingHighs.length - 2].price;
    const hl = swingLows[swingLows.length - 1].price > swingLows[swingLows.length - 2].price;
    const lh = swingHighs[swingHighs.length - 1].price < swingHighs[swingHighs.length - 2].price;
    const ll = swingLows[swingLows.length - 1].price < swingLows[swingLows.length - 2].price;
    if (hh && hl) {
      pb = 'BULLISH';
      seq = 'HH/HL';
    } else if (lh && ll) {
      pb = 'BEARISH';
      seq = 'LH/LL';
    }
  }

  const last = c[c.length - 1];
  const prev = c[c.length - 2];
  let sweep: MarketStructure['sweep'] = null;
  for (const b of [prev, last]) {
    if (b.low < rL.price && b.close > rL.price) sweep = { type: 'BULLISH', level: rL.price, label: 'Bull Sweep' };
    if (b.high > rH.price && b.close < rH.price) sweep = { type: 'BEARISH', level: rH.price, label: 'Bear Sweep' };
  }

  const mm = (atr || 0) * 0.04;
  let brk: { type: 'BULLISH' | 'BEARISH'; kind: string; level: number; idx: number } | null = null;
  for (let idx = Math.max(2, c.length - bosLookback); idx < c.length; idx++) {
    const b = c[idx];
    const sh = swingHighs.filter((s) => s.index < idx).pop();
    const sl = swingLows.filter((s) => s.index < idx).pop();
    if (sh && b.close > sh.price + mm) brk = { type: 'BULLISH', kind: pb === 'BEARISH' ? 'CHoCH' : 'BOS', level: sh.price, idx };
    if (sl && b.close < sl.price - mm) brk = { type: 'BEARISH', kind: pb === 'BULLISH' ? 'CHoCH' : 'BOS', level: sl.price, idx };
  }

  if (brk?.type === 'BULLISH' && last.close >= rL.price) {
    const peakSince = Math.max(...c.slice(brk.idx).map((x) => x.high));
    const inPullback = last.close < peakSince - (atr || 0) * 0.15;
    return {
      type: 'BULLISH',
      kind: brk.kind,
      swingSequence: seq,
      swingHigh: rH.price,
      swingLow: rL.price,
      eqHigh,
      eqLow,
      sweep,
      inPullback,
      label: `Bull ${brk.kind} (${seq})${inPullback ? ' · Pullback' : ''}${sweep?.type === 'BULLISH' ? ' · Sweep' : ''}`,
    };
  }
  if (brk?.type === 'BEARISH' && last.close <= rH.price) {
    const troughSince = Math.min(...c.slice(brk.idx).map((x) => x.low));
    const inPullback = last.close > troughSince + (atr || 0) * 0.15;
    return {
      type: 'BEARISH',
      kind: brk.kind,
      swingSequence: seq,
      swingHigh: rH.price,
      swingLow: rL.price,
      eqHigh,
      eqLow,
      sweep,
      inPullback,
      label: `Bear ${brk.kind} (${seq})${inPullback ? ' · Pullback' : ''}${sweep?.type === 'BEARISH' ? ' · Sweep' : ''}`,
    };
  }
  if (pb === 'BULLISH' && last.close >= rL.price) {
    return {
      type: 'BULLISH',
      kind: 'BOS',
      swingSequence: seq,
      swingHigh: rH.price,
      swingLow: rL.price,
      eqHigh,
      eqLow,
      sweep,
      inPullback: true,
      label: `Bull HH/HL > ${formatPrice(rL.price, sym)}`,
    };
  }
  if (pb === 'BEARISH' && last.close <= rH.price) {
    return {
      type: 'BEARISH',
      kind: 'BOS',
      swingSequence: seq,
      swingHigh: rH.price,
      swingLow: rL.price,
      eqHigh,
      eqLow,
      sweep,
      inPullback: true,
      label: `Bear LH/LL < ${formatPrice(rH.price, sym)}`,
    };
  }

  return {
    type: 'NEUTRAL',
    kind: 'NONE',
    swingSequence: seq,
    swingHigh: rH.price,
    swingLow: rL.price,
    eqHigh,
    eqLow,
    sweep,
    inPullback: false,
    label: `Range ${formatPrice(rL.price, sym)}–${formatPrice(rH.price, sym)}`,
  };
}

export function detectOrderAndBreakerBlocks(
  c: CandleBar[],
  st: MarketStructure,
  sym: string,
): { ob: OrderBlock; breaker: BreakerBlock } {
  let ob: OrderBlock = { type: 'NONE', high: 0, low: 0, index: -1, retested: false, label: 'No active OB' };
  let breaker: BreakerBlock = { type: 'NONE', high: 0, low: 0, index: -1, label: 'None' };
  if (st.type === 'NEUTRAL') return { ob, breaker };
  const last = c[c.length - 1];

  for (let i = c.length - 2; i >= Math.max(1, c.length - 28); i--) {
    const x = c[i];
    const isBullO = x.close < x.open;
    const isBearO = x.close > x.open;
    if (st.type === 'BULLISH' && isBullO && ob.type === 'NONE') {
      let br = false;
      for (let j = i + 1; j < c.length; j++) {
        if (c[j].close < x.low) {
          br = true;
          break;
        }
      }
      if (!br) {
        ob = {
          type: 'BULLISH',
          high: x.high,
          low: x.low,
          index: i,
          retested: last.low <= x.high && last.close >= x.low,
          label: `Demand OB ${formatPrice(x.low, sym)}`,
        };
      }
    }
    if (st.type === 'BEARISH' && isBearO && ob.type === 'NONE') {
      let br = false;
      for (let j = i + 1; j < c.length; j++) {
        if (c[j].close > x.high) {
          br = true;
          break;
        }
      }
      if (!br) {
        ob = {
          type: 'BEARISH',
          high: x.high,
          low: x.low,
          index: i,
          retested: last.high >= x.low && last.close <= x.high,
          label: `Supply OB ${formatPrice(x.high, sym)}`,
        };
      }
    }
    if (st.type === 'BULLISH' && isBearO && breaker.type === 'NONE') {
      let ca = false;
      for (let j = i + 1; j < c.length; j++) {
        if (c[j].close > x.high) {
          ca = true;
          break;
        }
      }
      if (ca && last.close >= x.low) {
        breaker = { type: 'BULLISH', high: x.high, low: x.low, index: i, label: `Bull Breaker ${formatPrice(x.low, sym)}` };
      }
    }
    if (st.type === 'BEARISH' && isBullO && breaker.type === 'NONE') {
      let cb = false;
      for (let j = i + 1; j < c.length; j++) {
        if (c[j].close < x.low) {
          cb = true;
          break;
        }
      }
      if (cb && last.close <= x.high) {
        breaker = { type: 'BEARISH', high: x.high, low: x.low, index: i, label: `Bear Breaker ${formatPrice(x.high, sym)}` };
      }
    }
  }
  return { ob, breaker };
}

export function analyzeFVGs(c: CandleBar[], atr: number, sym = 'XAUUSD'): FvgAnalysis {
  const all: FvgZone[] = [];
  for (let i = Math.max(2, c.length - 60); i < c.length; i++) {
    const f = c[i - 2];
    const t = c[i];
    if (t.low > f.high) {
      all.push({ type: 'BULLISH', top: t.low, bottom: f.high, index: i - 1, mitigated: false, invalidated: false });
    } else if (t.high < f.low) {
      all.push({ type: 'BEARISH', top: f.low, bottom: t.high, index: i - 1, mitigated: false, invalidated: false });
    }
  }
  for (const z of all) {
    for (let j = z.index + 2; j < c.length; j++) {
      const b = c[j];
      if (z.type === 'BULLISH') {
        if (b.low <= z.top) z.mitigated = true;
        if (b.close < z.bottom) {
          z.invalidated = true;
          break;
        }
      } else {
        if (b.high >= z.bottom) z.mitigated = true;
        if (b.close > z.top) {
          z.invalidated = true;
          break;
        }
      }
    }
  }
  const vB = all.filter((z) => z.type === 'BULLISH' && !z.invalidated);
  const vS = all.filter((z) => z.type === 'BEARISH' && !z.invalidated);
  const lB = vB.length ? vB[vB.length - 1] : null;
  const lS = vS.length ? vS[vS.length - 1] : null;
  const last = c[c.length - 1];
  const prev = c[c.length - 2];
  const tol = (atr || 0) * 0.25;
  const retB = Boolean(lB && Math.min(last.low, prev.low) <= lB.top + tol && last.close >= lB.bottom && last.close > last.open);
  const retS = Boolean(lS && Math.max(last.high, prev.high) >= lS.bottom - tol && last.close <= lS.top && last.close < last.open);
  const parts: string[] = [];
  if (lB) parts.push(`Bull FVG ${formatPrice(lB.bottom, sym)}`);
  if (lS) parts.push(`Bear FVG ${formatPrice(lS.top, sym)}`);
  return {
    validBull: vB,
    validBear: vS,
    latestBull: lB,
    latestBear: lS,
    retestedBullFvg: retB,
    retestedBearFvg: retS,
    label: parts.length ? parts.join(' | ') : 'No active FVG (OK)',
  };
}

export function detectPriceActionTriggers(
  closedBars: CandleBar[],
  keyLevels: KeyLevelsResult,
  atr: number,
  e20: number,
  e50: number,
) {
  const last = closedBars[closedBars.length - 1];
  const prev = closedBars[closedBars.length - 2];
  const rng = Math.max(1e-9, last.high - last.low);
  const body = Math.abs(last.close - last.open);
  const lw = Math.min(last.open, last.close) - last.low;
  const uw = last.high - Math.max(last.open, last.close);
  const bullEngulf = last.close > last.open && prev.close < prev.open && last.close >= prev.open && last.open <= prev.close;
  const bearEngulf = last.close < last.open && prev.close > prev.open && last.close <= prev.open && last.open >= prev.close;
  const bullPin = lw >= body * 1.3 && lw >= rng * 0.38 && uw <= rng * 0.32;
  const bearPin = uw >= body * 1.3 && uw >= rng * 0.38 && lw <= rng * 0.32;
  const bullClose = last.close > last.open && body >= rng * 0.3;
  const bearClose = last.close < last.open && body >= rng * 0.3;
  const zoneTol = Math.max(atr * 0.45, last.close * 0.0004);
  const s1 = keyLevels.s1?.price;
  const r1 = keyLevels.r1?.price;
  const srBullBounce = Boolean(s1 && last.low <= s1 + zoneTol && last.close > s1 && (bullPin || bullEngulf || bullClose));
  const srBearReject = Boolean(r1 && last.high >= r1 - zoneTol && last.close < r1 && (bearPin || bearEngulf || bearClose));
  const bullBreakRetest = Boolean(keyLevels.all.some((k) => prev.close > k.price && last.low <= k.price + zoneTol && last.close > k.price && bullClose));
  const bearBreakRetest = Boolean(keyLevels.all.some((k) => prev.close < k.price && last.high >= k.price - zoneTol && last.close < k.price && bearClose));
  const emaBullPullback = Boolean(e20 > e50 && Math.min(last.low, prev.low) <= e20 + zoneTol && last.close >= e50 - atr * 0.25 && (bullClose || bullPin || bullEngulf));
  const emaBearPullback = Boolean(e20 < e50 && Math.max(last.high, prev.high) >= e20 - zoneTol && last.close <= e50 + atr * 0.25 && (bearClose || bearPin || bearEngulf));

  return {
    bullEngulf,
    bearEngulf,
    bullPin,
    bearPin,
    bullClose,
    bearClose,
    srBullBounce,
    srBearReject,
    bullBreakRetest,
    bearBreakRetest,
    emaBullPullback,
    emaBearPullback,
  };
}

export function evaluateHTFContext(bars: CandleBar[] | null, lbl: string, sym: string) {
  if (!bars || bars.length < 25) return { bias: 'NEUTRAL', wB: 0, wS: 0, label: `${lbl}: Neutral` };
  const cl = bars.map((x) => x.close);
  const e20 = calculateEMASeries(cl, 20).pop()!;
  const e50 = calculateEMASeries(cl, 50).pop()!;
  const atrS = calculateATRSeries(bars, 14);
  const atr = atrS.length ? atrS[atrS.length - 1] : 0;
  const st = analyzeMarketStructure(bars, atr, sym, 14);
  let bias = 'NEUTRAL';
  if (e20 > e50 || st.type === 'BULLISH') bias = 'BULLISH';
  else if (e20 < e50 || st.type === 'BEARISH') bias = 'BEARISH';
  return {
    bias,
    wB: bias === 'BULLISH' ? 15 : bias === 'NEUTRAL' ? 5 : -5,
    wS: bias === 'BEARISH' ? 15 : bias === 'NEUTRAL' ? 5 : -5,
    label: `${lbl}: ${bias}`,
  };
}
