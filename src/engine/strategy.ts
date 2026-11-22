import { FRESHNESS_LIMITS_SEC, SYMBOL_SPECS, TF_PROFILES } from '../constants/market';
import {
  BaseSymbolSpec,
  CandleBar,
  ContractModeType,
  FreshnessResult,
  ProviderType,
  QuoteData,
  ResolvedSymbolSpec,
  RiskCalcResult,
  RiskConfig,
  SignalResult,
  TimeframeType,
  WalkForwardStats,
} from '../types/trading';
import {
  analyzeFVGs,
  analyzeMarketStructure,
  calculateATRSeries,
  calculateEMASeries,
  calculateRSI,
  classifyMarketRegimeAndDanger,
  detectOrderAndBreakerBlocks,
  detectPriceActionTriggers,
  evaluateHTFContext,
  extractKeyLevels,
  formatPrice,
} from './indicators';

export type QuotesStore = Record<ProviderType, Record<string, QuoteData>>;
export type BrokerSpecsStore = Record<string, Partial<BaseSymbolSpec>>;

export function getSymbolSpec(
  sym: string,
  prov: ProviderType,
  quotesStore: QuotesStore,
  brokerSpecsOverride: BrokerSpecsStore,
  contractMode: ContractModeType,
  commissionPerLot: number,
  midOv: number | null = null,
): ResolvedSymbolSpec {
  const b = SYMBOL_SPECS[sym];
  if (!b) return { verified: false, reason: `Unknown ${sym}` };
  const br = prov === 'EXNESS' ? brokerSpecsOverride[sym] : null;
  const m: BaseSymbolSpec = br ? { ...b, ...br } : { ...b };
  const mult = contractMode === 'CENT' ? 0.01 : 1.0;
  const effC = m.contractSize * mult;
  if (
    !m.verified ||
    ![m.digits, m.pointSize, m.pipSize, m.tickSize, effC, m.volumeMin, m.volumeStep].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  ) {
    return { ...m, verified: false, reason: 'Invalid spec' };
  }
  const q = quotesStore[prov]?.[sym];
  const refM = midOv !== null && Number.isFinite(midOv) && midOv > 0 ? midOv : q?.mid;
  let tv = m.tickValueUsd;
  if (tv === undefined || !Number.isFinite(tv) || tv <= 0) {
    if (m.quoteCcy === 'USD') {
      tv = effC * m.tickSize;
    } else {
      if (!(refM && refM > 0)) {
        return { ...m, effectiveContractSize: effC, verified: false, reason: `Need ${sym} rate` };
      }
      tv = (effC * m.tickSize) / refM;
    }
  } else {
    tv *= mult;
  }

  return {
    ...m,
    contractMultiplier: mult,
    effectiveContractSize: effC,
    tickValueUsd: tv,
    commissionPerLotUsd: Math.max(0, commissionPerLot) * mult,
    verified: true,
  };
}

export function computePositionRiskAndCosts(
  _sym: string,
  slDist: number,
  quote: { spread?: number } | null | undefined,
  spec: ResolvedSymbolSpec,
  riskConfig: RiskConfig,
  riskScale = 1.0,
): RiskCalcResult {
  if (!spec || !spec.verified || !spec.tickSize || !spec.tickValueUsd || !spec.volumeMin || !spec.volumeStep || !spec.pointSize) {
    return { valid: false, reason: spec?.reason || 'UNVERIFIED spec' };
  }
  if (!(slDist > 0) || !Number.isFinite(slDist)) {
    return { valid: false, reason: 'Invalid SL' };
  }
  const eq = Math.max(5, Number(riskConfig.balance || 80));
  const rp = Math.max(0.1, Math.min(5.0, Number(riskConfig.riskPct || 0.5)));
  const scaledBudget = eq * (rp / 100) * riskScale;
  const slTicks = slDist / spec.tickSize;
  const loss1 = slTicks * spec.tickValueUsd;
  const comm1 = spec.commissionPerLotUsd || 0;
  const slipPx = (spec.slippagePoints || 0) * spec.pointSize * 2;
  const slip1 = (slipPx / spec.tickSize) * spec.tickValueUsd;
  const tot1 = loss1 + comm1 + slip1;
  const minRisk = tot1 * spec.volumeMin;
  const costInPrice = (quote?.spread || 0) + slipPx + comm1 / (spec.tickValueUsd / spec.tickSize);

  if (minRisk > scaledBudget) {
    return {
      valid: false,
      minLotExceeds: true,
      riskBudgetUsd: scaledBudget,
      minLotRiskUsd: minRisk,
      lots: spec.volumeMin,
      actualRiskUsd: minRisk,
      costInPrice,
      reason: `0.01 lot risks $${minRisk.toFixed(2)} > $${scaledBudget.toFixed(2)} (${(rp * riskScale).toFixed(2)}%)`,
    };
  }
  const lots = Number(
    Math.max(spec.volumeMin, Math.floor(scaledBudget / tot1 / spec.volumeStep) * spec.volumeStep).toFixed(2),
  );
  return {
    valid: true,
    minLotExceeds: false,
    riskBudgetUsd: scaledBudget,
    minLotRiskUsd: minRisk,
    lots,
    actualRiskUsd: lots * tot1,
    costInPrice,
    reason: `Lot ${lots.toFixed(2)} risks $${(lots * tot1).toFixed(2)}`,
  };
}

export function ingestQuoteUpdate(
  quotesStore: QuotesStore,
  sym: string,
  raw: Record<string, unknown> | null | undefined,
  prov: ProviderType,
  reqTs = false,
): { accepted: boolean; reason?: string; quote?: QuoteData } {
  if (!raw || typeof raw !== 'object') return { accepted: false, reason: 'Empty payload' };
  const bid = Number(raw.bid);
  const ask = Number(raw.ask);
  if (!(bid > 0) || !(ask >= bid) || !Number.isFinite(bid) || !Number.isFinite(ask)) {
    return { accepted: false, reason: 'Invalid bid/ask' };
  }
  const rawTs = raw.timestamp || raw.time || (raw.time_msc ? Number(raw.time_msc) : null);
  if (reqTs && !rawTs) return { accepted: false, reason: 'Missing timestamp' };
  const tsMs = typeof rawTs === 'number' ? rawTs : rawTs ? Date.parse(String(rawTs)) : NaN;
  if (!Number.isFinite(tsMs) || tsMs <= 0) return { accepted: false, reason: 'Invalid timestamp' };

  const ex = quotesStore[prov]?.[sym];
  if (ex) {
    if (tsMs < ex.providerTsMs) return { accepted: false, reason: 'Out-of-order ignored' };
    if (tsMs === ex.providerTsMs && bid === ex.bid && ask === ex.ask) {
      return { accepted: false, reason: 'Duplicate (age preserved)' };
    }
  }

  const mid = Number.isFinite(Number(raw.mid)) && Number(raw.mid) > 0 ? Number(raw.mid) : (bid + ask) / 2;
  const spread = Number.isFinite(Number(raw.spread)) ? Number(raw.spread) : ask - bid;
  const srvAge = Number.isFinite(Number(raw.quoteAgeSeconds)) ? Math.max(0, Number(raw.quoteAgeSeconds)) : null;
  const ms = String(raw.marketState || 'open').toLowerCase();

  const norm: QuoteData = {
    symbol: sym,
    provider: prov,
    source: String(raw.source || prov),
    bid,
    ask,
    mid,
    spread,
    high: Number.isFinite(Number(raw.high)) ? Number(raw.high) : null,
    low: Number.isFinite(Number(raw.low)) ? Number(raw.low) : null,
    dayDiffPercent:
      ms === 'closed' ? null : Number.isFinite(Number(raw.dayDiffPercent)) ? Number(raw.dayDiffPercent) : null,
    timestamp: new Date(tsMs).toISOString(),
    providerTsMs: tsMs,
    localReceiptMs: Date.now(),
    serverQuoteAgeSeconds: srvAge,
    marketState: ms,
    staleFlag: Boolean(raw.stale),
    digits: Number.isInteger(Number(raw.digits)) ? Number(raw.digits) : (SYMBOL_SPECS[sym]?.digits ?? 2),
  };

  if (!quotesStore[prov]) quotesStore[prov] = {};
  quotesStore[prov][sym] = norm;
  return { accepted: true, quote: norm };
}

export function evaluateQuoteFreshness(
  quotesStore: QuotesStore,
  sym: string,
  tf: TimeframeType,
  prov: ProviderType,
  nowMs = Date.now(),
): FreshnessResult {
  const q = quotesStore[prov]?.[sym] || null;
  const limit = FRESHNESS_LIMITS_SEC[tf] || 150;
  if (!q) {
    return { available: false, fresh: false, status: 'UNAVAILABLE', ageSeconds: Infinity, limitSec: limit, label: 'DATA UNAVAILABLE' };
  }
  const age = Math.max(
    Math.max(0, Math.floor((nowMs - q.providerTsMs) / 1000)),
    Math.max(0, Math.floor((nowMs - q.localReceiptMs) / 1000)),
    q.serverQuoteAgeSeconds ?? 0,
  );
  if (q.marketState === 'closed') {
    return { available: true, fresh: false, status: 'CLOSED', ageSeconds: age, limitSec: limit, label: 'MARKET CLOSED — LAST PRICE' };
  }
  if (q.staleFlag || age > limit) {
    return { available: true, fresh: false, status: 'STALE', ageSeconds: age, limitSec: limit, label: `STALE (${age}s > ${limit}s)` };
  }
  return { available: true, fresh: true, status: 'LIVE', ageSeconds: age, limitSec: limit, label: 'LIVE' };
}

export interface EvaluateSetupOptions {
  provider: ProviderType;
  quotesStore: QuotesStore;
  brokerSpecsOverride: BrokerSpecsStore;
  riskConfig: RiskConfig;
  historicalMode?: boolean;
  simQuote?: { bid: number; ask: number; mid: number; spread: number } | null;
  nowMs?: number;
}

export function evaluateSetup(
  symbol: string,
  tf: TimeframeType,
  closedBars: CandleBar[],
  formingBar: CandleBar | null,
  htfBars: CandleBar[] | null,
  d1Bars: CandleBar[] | null,
  h1Bars: CandleBar[] | null,
  options: EvaluateSetupOptions,
): SignalResult {
  const {
    provider,
    quotesStore,
    brokerSpecsOverride,
    riskConfig,
    historicalMode = false,
    simQuote = null,
    nowMs = Date.now(),
  } = options;
  const prof = TF_PROFILES[tf] || TF_PROFILES.M15;
  const freshness = historicalMode
    ? { available: true, fresh: true, status: 'LIVE' as const, ageSeconds: 0, limitSec: 999, label: 'HISTORICAL' }
    : evaluateQuoteFreshness(quotesStore, symbol, tf, provider, nowMs);
  const quote = historicalMode ? simQuote : quotesStore[provider]?.[symbol] || null;
  const spec = getSymbolSpec(
    symbol,
    provider,
    quotesStore,
    brokerSpecsOverride,
    riskConfig.contractMode,
    riskConfig.commission,
    quote?.mid ?? null,
  );
  const htfLabel = TF_PROFILES[prof.htf]?.label || prof.htf;

  const mk = (ov: Partial<SignalResult>): SignalResult => ({
    asset: symbol,
    tf,
    source: provider,
    state: 'WAIT',
    type: 'WAIT',
    entryMode: 'NONE',
    entry: null,
    entryZone: null,
    tp1: null,
    tp2: null,
    tp3: null,
    sl: null,
    grossRR: null,
    netRR: null,
    rrText: '—',
    danger: { tier: 'CLEAN', pct: 15, riskScale: 1.0, tp1R: 1.3, tp2R: 2.2, label: 'CLEAN' },
    regime: { regime: 'UNKNOWN', adx: 0, atrRatio: 1, er: 0, label: '—' },
    keyLevels: { r1: null, r2: null, s1: null, s2: null, pdh: null, pdl: null, all: [] },
    watchNote: null,
    htfSummary: htfLabel,
    setupScore: 0,
    rules: [],
    diagVeto: 'None',
    diagSetup: '—',
    diagTrigger: '—',
    ema20: null,
    ema50: null,
    rsi14: null,
    atr14: null,
    fvg: { validBull: [], validBear: [], latestBull: null, latestBear: null, label: '—' },
    structure: { type: 'NEUTRAL', kind: 'NONE', label: '—', eqHigh: null, eqLow: null, sweep: null },
    ob: { type: 'NONE', high: 0, low: 0, index: -1, label: '—' },
    breaker: { type: 'NONE', high: 0, low: 0, index: -1, label: 'None' },
    riskCalc: null,
    locked: false,
    tp1Hit: false,
    tp2Hit: false,
    closedCount: closedBars?.length || 0,
    formingBar,
    candleTime: closedBars?.length ? closedBars[closedBars.length - 1].timeMs : 0,
    time: new Date().toLocaleTimeString('en-US', { hour12: false }),
    reason: '—',
    ...ov,
  });

  if (!freshness.available || !freshness.fresh || !quote || !(quote.bid > 0) || !(quote.ask >= quote.bid)) {
    return mk({ state: 'NO TRADE', diagVeto: freshness.label, reason: `NO TRADE: ${freshness.label}` });
  }
  if (!closedBars || closedBars.length < 30) {
    return mk({
      state: 'NO TRADE',
      diagVeto: `Insufficient bars (${closedBars?.length || 0}/30)`,
      reason: 'NO TRADE: Insufficient candles',
    });
  }

  const closes = closedBars.map((c) => c.close);
  const e20S = calculateEMASeries(closes, 20);
  const e50S = calculateEMASeries(closes, 50);
  const e20 = e20S[e20S.length - 1];
  const e50 = e50S[e50S.length - 1];
  const rsi14 = calculateRSI(closes, 14);
  const atrS = calculateATRSeries(closedBars, 14);
  const atr14 = atrS.length ? atrS[atrS.length - 1] : quote.mid * 0.002;
  const { regime, danger } = classifyMarketRegimeAndDanger(
    closedBars,
    atrS,
    e20S,
    e50S,
    quote.spread,
    prof.maxSpreadRatioAtr,
  );
  const keyLevels = extractKeyLevels(closedBars, d1Bars, h1Bars, atr14, symbol, quote.mid);
  const st = analyzeMarketStructure(closedBars, atr14, symbol, prof.bosLookback);
  const { ob, breaker } = detectOrderAndBreakerBlocks(closedBars, st, symbol);
  const fvg = analyzeFVGs(closedBars, atr14, symbol);
  const pa = detectPriceActionTriggers(closedBars, keyLevels, atr14, e20, e50);
  const htf =
    tf === prof.htf
      ? { bias: e20 > e50 ? 'BULLISH' : 'BEARISH', wB: e20 > e50 ? 15 : 0, wS: e20 < e50 ? 15 : 0, label: `${htfLabel}: SELF` }
      : evaluateHTFContext(htfBars, htfLabel, symbol);

  let bScore = 0;
  let bStrategy = '';
  if (pa.srBullBounce) {
    bScore += 35;
    bStrategy = 'S/R BOUNCE';
  }
  if (pa.bullBreakRetest) {
    bScore += 30;
    bStrategy = bStrategy || 'BREAK & RETEST';
  }
  if (st.sweep?.type === 'BULLISH' && pa.bullClose) {
    bScore += 25;
    bStrategy = bStrategy || 'SWEEP RECLAIM';
  }
  if (pa.emaBullPullback) {
    bScore += 25;
    bStrategy = bStrategy || 'TREND PULLBACK';
  }
  if (e20 > e50) bScore += 15;
  if (st.type === 'BULLISH') bScore += 15;
  if (fvg.retestedBullFvg || ob.type === 'BULLISH' || breaker.type === 'BULLISH') bScore += 15;
  bScore += htf.wB;
  if (rsi14 !== null && rsi14 >= 42 && rsi14 < 74) bScore += 10;
  bScore = Math.max(0, Math.min(100, bScore));

  let sScore = 0;
  let sStrategy = '';
  if (pa.srBearReject) {
    sScore += 35;
    sStrategy = 'S/R REJECT';
  }
  if (pa.bearBreakRetest) {
    sScore += 30;
    sStrategy = sStrategy || 'BREAK & RETEST';
  }
  if (st.sweep?.type === 'BEARISH' && pa.bearClose) {
    sScore += 25;
    sStrategy = sStrategy || 'SWEEP RECLAIM';
  }
  if (pa.emaBearPullback) {
    sScore += 25;
    sStrategy = sStrategy || 'TREND PULLBACK';
  }
  if (e20 < e50) sScore += 15;
  if (st.type === 'BEARISH') sScore += 15;
  if (fvg.retestedBearFvg || ob.type === 'BEARISH' || breaker.type === 'BEARISH') sScore += 15;
  sScore += htf.wS;
  if (rsi14 !== null && rsi14 <= 58 && rsi14 > 26) sScore += 10;
  sScore = Math.max(0, Math.min(100, sScore));

  const dom: 'BUY' | 'SELL' = bScore >= sScore ? 'BUY' : 'SELL';
  const score = Math.max(bScore, sScore);
  const stratName = (dom === 'BUY' ? bStrategy : sStrategy) || (pa.bullClose || pa.bearClose ? 'MOMENTUM PA' : 'CONTEXT');
  const r3H = Math.max(...closedBars.slice(-3).map((c) => c.high));
  const r3L = Math.min(...closedBars.slice(-3).map((c) => c.low));

  const buildLvl = (side: 'BUY' | 'SELL') => {
    const entry = side === 'BUY' ? quote.ask : quote.bid;
    const minD = Math.max(atr14 * 1.05, (spec.tickSize || 0.01) * 5);
    if (side === 'BUY') {
      const base =
        keyLevels.s1 && entry - keyLevels.s1.price <= atr14 * 2.6
          ? keyLevels.s1.price
          : st.swingLow && entry - st.swingLow <= atr14 * 2.8
            ? st.swingLow
            : r3L;
      const dist = Math.max(minD, entry - (base - atr14 * 0.3));
      const sl = entry - dist;
      const tp1 = entry + dist * danger.tp1R;
      const tp2 = entry + dist * danger.tp2R;
      const tp3 =
        keyLevels.r1 && keyLevels.r1.price > tp2
          ? keyLevels.r1.price
          : keyLevels.r2 && keyLevels.r2.price > tp2
            ? keyLevels.r2.price
            : entry + dist * (danger.tp2R + 0.9);
      return {
        entry,
        sl,
        tp1,
        tp2,
        tp3,
        dist,
        entryZone: `${formatPrice(Math.min(entry, e20), symbol)}–${formatPrice(entry, symbol)}`,
      };
    } else {
      const base =
        keyLevels.r1 && keyLevels.r1.price - entry <= atr14 * 2.6
          ? keyLevels.r1.price
          : st.swingHigh && st.swingHigh - entry <= atr14 * 2.8
            ? st.swingHigh
            : r3H;
      const dist = Math.max(minD, base + atr14 * 0.3 - entry);
      const sl = entry + dist;
      const tp1 = entry - dist * danger.tp1R;
      const tp2 = entry - dist * danger.tp2R;
      const tp3 =
        keyLevels.s1 && keyLevels.s1.price < tp2
          ? keyLevels.s1.price
          : keyLevels.s2 && keyLevels.s2.price < tp2
            ? keyLevels.s2.price
            : entry - dist * (danger.tp2R + 0.9);
      return {
        entry,
        sl,
        tp1,
        tp2,
        tp3,
        dist,
        entryZone: `${formatPrice(entry, symbol)}–${formatPrice(Math.max(entry, e20), symbol)}`,
      };
    }
  };

  const lv = buildLvl(dom);
  const rc = computePositionRiskAndCosts(symbol, lv.dist, quote, spec, riskConfig, danger.riskScale);
  const cost = rc.costInPrice || quote.spread;
  const netR1 = lv.dist + cost > 0 ? Math.max(0, lv.dist * danger.tp1R - cost) / (lv.dist + cost) : 0;
  const netR2 = lv.dist + cost > 0 ? Math.max(0, lv.dist * danger.tp2R - cost) / (lv.dist + cost) : 0;
  const riskAdv = !spec.verified
    ? 'Spec UNVERIFIED'
    : !rc.valid
      ? `Advisory: ${rc.reason}`
      : `Lot ${(rc.lots || 0).toFixed(2)} (Risk scale ${(danger.riskScale * 100).toFixed(0)}%)`;

  const rules = [
    { name: 'S/R Key Levels', pass: Boolean(keyLevels.s1 || keyLevels.r1), detail: keyLevels.s1 && keyLevels.r1 ? 'S1/R1 Mapped' : 'Partial' },
    {
      name: 'Price Action',
      pass: Boolean(
        dom === 'BUY'
          ? pa.srBullBounce || pa.bullBreakRetest || pa.emaBullPullback || pa.bullClose
          : pa.srBearReject || pa.bearBreakRetest || pa.emaBearPullback || pa.bearClose,
      ),
      detail: stratName,
    },
    { name: 'EMA 20/50 Trend', pass: dom === 'BUY' ? e20 > e50 : e20 < e50, detail: e20 > e50 ? 'Bull' : 'Bear' },
    { name: 'Structure / Sweep', pass: st.type === (dom === 'BUY' ? 'BULLISH' : 'BEARISH') || Boolean(st.sweep), detail: st.sweep ? st.sweep.label : st.kind },
    { name: `HTF (${htfLabel})`, pass: (dom === 'BUY' ? htf.wB : htf.wS) > 0, detail: htf.bias },
    { name: 'ICT Bonus (Opt.)', pass: Boolean(fvg.latestBull || fvg.latestBear || ob.type !== 'NONE'), detail: fvg.latestBull || fvg.latestBear ? 'Active' : 'Not needed' },
    { name: 'Market Danger', pass: danger.pct < 50, detail: `${danger.pct}%` },
    { name: 'Net R:R', pass: netR1 >= 0.7, detail: `${netR1.toFixed(2)}R` },
  ];

  const confirmedPA =
    dom === 'BUY'
      ? pa.srBullBounce || pa.bullBreakRetest || pa.emaBullPullback || (st.sweep?.type === 'BULLISH' && pa.bullClose) || pa.bullClose
      : pa.srBearReject || pa.bearBreakRetest || pa.emaBearPullback || (st.sweep?.type === 'BEARISH' && pa.bearClose) || pa.bearClose;

  if (danger.pct >= 60 && score < 65) {
    return mk({
      state: 'WAIT',
      type: 'WAIT',
      danger,
      regime,
      keyLevels,
      setupScore: score,
      rules,
      htfSummary: htf.label,
      ema20: e20,
      ema50: e50,
      rsi14,
      atr14,
      fvg,
      structure: st,
      ob,
      breaker,
      riskCalc: rc,
      diagVeto: riskAdv,
      diagSetup: `High Danger Sideways (${danger.pct}%) · ${regime.label}`,
      diagTrigger: `Wait reaction at S1 (${formatPrice(keyLevels.s1?.price, symbol)}) or R1 (${formatPrice(keyLevels.r1?.price, symbol)})`,
      reason: `WAIT: High Danger Sideways (${danger.pct}%) — Pre-mapped S1/R1 ready`,
    });
  }

  if (score >= 45 && confirmedPA && netR1 >= 0.65) {
    const mode = `${stratName}${danger.tier.startsWith('CAUTION') ? ' (HALF RISK)' : ''}`;
    return mk({
      state: 'READY',
      type: dom,
      entryMode: mode,
      entry: lv.entry,
      entryZone: lv.entryZone,
      tp1: lv.tp1,
      tp2: lv.tp2,
      tp3: lv.tp3,
      sl: lv.sl,
      grossRR: danger.tp1R,
      netRR: netR1,
      rrText: `Gross ${danger.tp1R}R/${danger.tp2R}R | Net ${netR1.toFixed(2)}R/${netR2.toFixed(2)}R`,
      danger,
      regime,
      keyLevels,
      htfSummary: htf.label,
      setupScore: score,
      rules,
      riskCalc: rc,
      diagVeto: riskAdv,
      diagSetup: `${dom} ${score}% · ${danger.label}`,
      diagTrigger: `${stratName} · ${tf} ${prof.role}`,
      ema20: e20,
      ema50: e50,
      rsi14,
      atr14,
      fvg,
      structure: st,
      ob,
      breaker,
      reason: `READY ${dom} (${stratName} · ${score}%)`,
    });
  }

  const tgtLvl =
    dom === 'BUY'
      ? keyLevels.s1
        ? `${formatPrice(keyLevels.s1.price, symbol)} (${keyLevels.s1.tags})`
        : formatPrice(e20, symbol)
      : keyLevels.r1
        ? `${formatPrice(keyLevels.r1.price, symbol)} (${keyLevels.r1.tags})`
        : formatPrice(e20, symbol);
  const miss = !confirmedPA ? `Needs ${dom === 'BUY' ? 'bullish' : 'bearish'} candle close / S/R reaction` : `Score ${score}% or Net R:R ${netR1.toFixed(2)}R low`;

  return mk({
    state: score >= 35 ? 'WATCH' : 'WAIT',
    type: 'WAIT',
    entryMode: `${dom} WATCH`,
    entryZone: tgtLvl,
    watchNote: `${dom} WATCH (${score}%) · Key Level: ${tgtLvl} · ${miss}`,
    danger,
    regime,
    keyLevels,
    htfSummary: htf.label,
    setupScore: score,
    rules,
    riskCalc: rc,
    grossRR: danger.tp1R,
    netRR: netR1,
    rrText: `Est. Net ${netR1.toFixed(2)}R`,
    diagVeto: riskAdv,
    diagSetup: `${dom} ${score}% · ${danger.label}`,
    diagTrigger: miss,
    ema20: e20,
    ema50: e50,
    rsi14,
    atr14,
    fvg,
    structure: st,
    ob,
    breaker,
    reason: `${score >= 35 ? 'WATCH' : 'WAIT'} ${dom}: ${miss}`,
  });
}

export function runWalkForwardForTimeframe(
  sym: string,
  tf: TimeframeType,
  closedBars: CandleBar[],
  htfBars: CandleBar[] | null,
  d1Bars: CandleBar[] | null,
  h1Bars: CandleBar[] | null,
  options: EvaluateSetupOptions,
  spreadOv: number | null = null,
): WalkForwardStats {
  if (!closedBars || closedBars.length < 75) {
    return { insufficient: true, reason: `Insufficient data (${closedBars?.length || 0}/75 bars)` };
  }
  const prof = TF_PROFILES[tf] || TF_PROFILES.M15;
  const spec = getSymbolSpec(
    sym,
    options.provider,
    options.quotesStore,
    options.brokerSpecsOverride,
    options.riskConfig.contractMode,
    options.riskConfig.commission,
    closedBars[closedBars.length - 1].close,
  );
  const tfMs = prof.seconds * 1000;
  const htfMs = (TF_PROFILES[prof.htf]?.seconds || 3600) * 1000;
  const d1Ms = 86400 * 1000;
  const h1Ms = 3600 * 1000;
  const simSp = spreadOv !== null ? spreadOv : options.quotesStore[options.provider]?.[sym]?.spread || (spec.pipSize || 0.0001) * 1.5;
  const slip = (spec.slippagePoints || 0) * (spec.pointSize || 0.01) * 2;
  const comm = spec.verified && spec.tickValueUsd && spec.tickSize ? (spec.commissionPerLotUsd || 0) / (spec.tickValueUsd / spec.tickSize) : 0;

  let w = 0;
  let l = 0;
  let open = 0;
  let skip = 0;
  let sW = 0;
  let sL = 0;
  let eq = 0;
  let pk = 0;
  let dd = 0;
  let cs = 0;
  let ms = 0;
  let cd = -1;

  for (let i = 45; i < closedBars.length - 2; i++) {
    if (i <= cd) continue;
    const decMs = closedBars[i].timeMs + tfMs;
    const sLtf = closedBars.slice(0, i + 1);
    const sHtf = htfBars ? htfBars.filter((h) => h.timeMs + htfMs <= decMs) : null;
    const sD1 = d1Bars ? d1Bars.filter((d) => d.timeMs + d1Ms <= decMs) : null;
    const sH1 = h1Bars ? h1Bars.filter((h) => h.timeMs + h1Ms <= decMs) : null;
    const exec = closedBars[i + 1].open;
    const stp = evaluateSetup(sym, tf, sLtf, null, sHtf, sD1, sH1, {
      ...options,
      historicalMode: true,
      simQuote: { bid: exec - simSp * 0.5, ask: exec + simSp * 0.5, mid: exec, spread: simSp },
    });
    if (stp.state !== 'READY' || stp.tp1 === null || stp.sl === null || !Number.isFinite(stp.tp1) || !Number.isFinite(stp.sl) || stp.entry === null) {
      skip++;
      continue;
    }
    const entryPx = stp.entry;
    const slPx = stp.sl;
    const tp1Px = stp.tp1;
    const tp2Px = stp.tp2;
    const rsk = Math.abs(entryPx - slPx) + slip + comm;
    const r1 = Math.max(0, Math.abs(tp1Px - entryPx) - slip - comm);
    const r2 = tp2Px !== null ? Math.max(0, Math.abs(tp2Px - entryPx) - slip - comm) : r1;
    let out: 'OPEN' | 'WIN' | 'LOSS' = 'OPEN';
    let rr = 0;
    let ri = i + 1;

    for (let k = i + 1; k < Math.min(closedBars.length, i + 50); k++) {
      const b = closedBars[k];
      ri = k;
      if (stp.type === 'BUY') {
        if (b.low <= slPx) {
          out = 'LOSS';
          rr = -1;
          break;
        }
        if (tp2Px !== null && b.high >= tp2Px) {
          out = 'WIN';
          rr = r2 / rsk;
          break;
        }
        if (b.high >= tp1Px) {
          out = 'WIN';
          rr = r1 / rsk;
          break;
        }
      } else {
        if (b.high >= slPx) {
          out = 'LOSS';
          rr = -1;
          break;
        }
        if (tp2Px !== null && b.low <= tp2Px) {
          out = 'WIN';
          rr = r2 / rsk;
          break;
        }
        if (b.low <= tp1Px) {
          out = 'WIN';
          rr = r1 / rsk;
          break;
        }
      }
    }

    cd = ri + prof.cooldownBars;
    if (out === 'WIN') {
      w++;
      sW += rr;
      eq += rr;
      cs = 0;
    } else if (out === 'LOSS') {
      l++;
      sL += 1;
      eq -= 1;
      cs++;
      ms = Math.max(ms, cs);
    } else {
      open++;
    }
    pk = Math.max(pk, eq);
    dd = Math.max(dd, pk - eq);
  }

  const tot = w + l;
  return {
    insufficient: false,
    symbol: sym,
    tf,
    totalTrades: tot,
    wins: w,
    losses: l,
    openOrExpired: open,
    skippedSetups: skip,
    winRate: tot > 0 ? (w / tot) * 100 : null,
    profitFactor: sL > 0 ? sW / sL : sW > 0 ? 9.99 : 0,
    netRR: l > 0 && w > 0 ? sW / w / (sL / l) : w > 0 ? sW / w : 0,
    maxDrawdownR: dd,
    avgWinR: w > 0 ? sW / w : 0,
    avgLossR: l > 0 ? sL / l : 0,
    expectancyR: tot > 0 ? eq / tot : 0,
    maxLossStreak: ms,
  };
}
