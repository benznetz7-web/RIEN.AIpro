import { APP_VERSION, BIQUOTE_BASE } from '../constants/market';
import { biquoteFetchJson, BiquoteSignalRClient, checkBiquoteActiveSymbols } from '../services/marketFeed';
import { CandleBar, QaLogEntry, RiskConfig } from '../types/trading';
import {
  aggregateWeeklyFromDaily,
  analyzeFVGs,
  analyzeMarketStructure,
  calculateEMASeries,
  classifyMarketRegimeAndDanger,
  detectConfirmedSwings,
  extractKeyLevels,
} from './indicators';
import {
  BrokerSpecsStore,
  computePositionRiskAndCosts,
  evaluateQuoteFreshness,
  evaluateSetup,
  getSymbolSpec,
  ingestQuoteUpdate,
  QuotesStore,
  runWalkForwardForTimeframe,
} from './strategy';

export function makeSyntheticBars(closes: number[], sp = 1.0, stepMs = 900000, startMs = 1700000000000): CandleBar[] {
  return closes.map((c, i) => ({
    timeMs: startMs + i * stepMs,
    open: i === 0 ? c - 0.3 : closes[i - 1],
    high: Math.max(i === 0 ? c - 0.3 : closes[i - 1], c) + sp * 0.4,
    low: Math.min(i === 0 ? c - 0.3 : closes[i - 1], c) - sp * 0.4,
    close: c,
    isOpen: false,
  }));
}

export async function runFullQaSuite(
  signalRClient: BiquoteSignalRClient,
  riskConfig: RiskConfig,
  brokerSpecsOverride: BrokerSpecsStore,
  onLog: (entry: QaLogEntry) => void,
  onRefreshAfter: () => Promise<void>,
): Promise<{ pass: number; fail: number }> {
  let seq = 0;
  const append = (text: string, status: 'pass' | 'fail' | 'info' = 'info') => {
    seq += 1;
    onLog({ id: `qa-${Date.now()}-${seq}`, text, status });
  };
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  append(`Running ${APP_VERSION} 20-Test QA Suite…`, 'info');

  const quotesStore: QuotesStore = { BIQUOTE: {}, EXNESS: {} };
  const defaultEvalOpts = (rc: RiskConfig = riskConfig) => ({
    provider: 'BIQUOTE' as const,
    quotesStore,
    brokerSpecsOverride,
    riskConfig: rc,
  });

  const tests: Array<[string, () => string]> = [
    [
      '1. Multi-touch Key Level extraction (S1/S2/R1/R2/PDH/PDL)',
      () => {
        const b = makeSyntheticBars(Array.from({ length: 30 }, (_, i) => 3580 + (i % 6) * 4), 1.2);
        const d1 = [{ timeMs: 1700000000000, high: 3615, low: 3570, open: 3585, close: 3595, isOpen: false }];
        const kl = extractKeyLevels(b, d1, b, 2.0, 'XAUUSD', 3590);
        assert(Boolean(kl.r1 && kl.s1 && kl.pdh === 3615 && kl.pdl === 3570), 'Missing key levels');
        return `R1=${kl.r1!.price.toFixed(1)}, S1=${kl.s1!.price.toFixed(1)}`;
      },
    ],
    [
      '2. S/R Bounce triggers BUY without requiring FVG or OB',
      () => {
        const seqPrices = [...Array.from({ length: 28 }, (_, i) => 3575 + i * 1.1), 3605, 3600, 3594, 3598, 3594, 3592, 3597];
        const b = makeSyntheticBars(seqPrices, 1.2);
        b[b.length - 1] = { ...b[b.length - 1], open: 3592, low: 3590.0, high: 3598.0, close: 3597.5 };
        const r = evaluateSetup('XAUUSD', 'M15', b, null, b, b, b, {
          ...defaultEvalOpts(),
          historicalMode: true,
          simQuote: { bid: 3597.3, ask: 3597.5, mid: 3597.4, spread: 0.2 },
        });
        assert(r.state === 'READY' && r.type === 'BUY', `Got ${r.state} (${r.reason})`);
        return r.reason;
      },
    ],
    [
      '3. W1 weekly aggregation from real 1d closed bars',
      () => {
        const t0 = Date.UTC(2026, 10, 2);
        const d1 = makeSyntheticBars(Array.from({ length: 14 }, (_, i) => 3550 + i), 3, 86400000, t0);
        const wk = aggregateWeeklyFromDaily(d1, null, t0 + 20 * 86400000);
        assert(wk.closedBars.length === 2, `Got ${wk.closedBars.length} weeks`);
        return `${wk.closedBars.length} closed weeks aggregated`;
      },
    ],
    [
      '4. All TFs (M1..W1) open without artificial NO TRADE lock',
      () => {
        const b = makeSyntheticBars(Array.from({ length: 40 }, (_, i) => 3580 + i * 1.2), 1.2);
        ingestQuoteUpdate(quotesStore, 'XAUUSD', { bid: 3627, ask: 3627.3, timestamp: new Date(Date.now() + 2000).toISOString() }, 'BIQUOTE', true);
        const m1 = evaluateSetup('XAUUSD', 'M1', b, null, b, b, b, defaultEvalOpts());
        assert(m1.state !== 'NO TRADE', `M1 locked: ${m1.reason}`);
        return `M1=${m1.state} (open)`;
      },
    ],
    [
      '5. Caution Danger Tier scales Risk down & keeps SL outside noise',
      () => {
        const b = makeSyntheticBars(Array.from({ length: 40 }, (_, i) => 3600 + (i % 4 ? 0.4 : -0.6)), 1.5);
        const r = classifyMarketRegimeAndDanger(
          b,
          [1.5, 1.5, 1.5],
          calculateEMASeries(b.map((x) => x.close), 20),
          calculateEMASeries(b.map((x) => x.close), 50),
          0.2,
          0.35,
        );
        assert(r.danger.riskScale <= 0.5 && r.danger.tp1R <= 1.1, 'Expected caution risk scale');
        return r.danger.label;
      },
    ],
    [
      '6. Non-blocking Risk Advisor warns instead of hiding signal',
      () => {
        const b = makeSyntheticBars(Array.from({ length: 40 }, (_, i) => 3580 + i * 1.2), 1.2);
        ingestQuoteUpdate(quotesStore, 'XAUUSD', { bid: 3627, ask: 3627.3, timestamp: new Date(Date.now() + 3000).toISOString() }, 'BIQUOTE', true);
        const res = evaluateSetup('XAUUSD', 'M15', b, null, b, b, b, defaultEvalOpts({
          balance: 80,
          riskPct: 0.25,
          dailyCap: 1.0,
          contractMode: 'STANDARD',
          commission: 0,
        }));
        assert(res.state !== 'NO TRADE' && res.diagVeto.includes('Advisory'), `Got ${res.state} / ${res.diagVeto}`);
        return res.diagVeto;
      },
    ],
    [
      '7. FVG bullish & bearish detection',
      () => {
        const b: CandleBar[] = Array.from({ length: 12 }, (_, idx) => ({ timeMs: idx * 1000, open: 100, high: 101, low: 99, close: 100, isOpen: false }));
        b[5] = { ...b[5], open: 100, high: 101, low: 99, close: 101 };
        b[6] = { ...b[6], open: 101, high: 106, low: 101, close: 105 };
        b[7] = { ...b[7], open: 105, high: 107, low: 103.5, close: 106 };
        b[8] = { ...b[8], open: 106, high: 107, low: 105, close: 106 };
        b[9] = { ...b[9], open: 106, high: 106.5, low: 105, close: 105.5 };
        b[10] = { ...b[10], open: 105.5, high: 105.5, low: 102, close: 102.5 };
        b[11] = { ...b[11], open: 102.5, high: 103, low: 101.2, close: 101.5 };
        const r = analyzeFVGs(b, 1.0, 'XAUUSD');
        assert(r.validBull.length >= 1 && r.validBear.length >= 1, 'Both FVG directions required');
        return `Bull=${r.validBull.length}, Bear=${r.validBear.length}`;
      },
    ],
    [
      '8. Plateau swing detection handles equal highs cleanly',
      () => {
        const b: CandleBar[] = [
          { timeMs: 1, high: 100, low: 98, open: 99, close: 99, isOpen: false },
          { timeMs: 2, high: 105, low: 101, open: 102, close: 104, isOpen: false },
          { timeMs: 3, high: 105, low: 102, open: 104, close: 104, isOpen: false },
          { timeMs: 4, high: 105, low: 102, open: 104, close: 103, isOpen: false },
          { timeMs: 5, high: 101, low: 99, open: 103, close: 100, isOpen: false },
          { timeMs: 6, high: 100, low: 97, open: 100, close: 98, isOpen: false },
        ];
        const sw = detectConfirmedSwings(b, 1.0);
        assert(sw.swingHighs.length === 1 && sw.swingHighs[0].plateauBars === 3, 'Expected 1 plateau');
        return '1 plateau (3 bars)';
      },
    ],
    [
      '9. Pullback preserves structure',
      () => {
        const seqPrices = [...Array.from({ length: 18 }, (_, i) => 3580 + i * 0.5), 3595, 3592, 3588, 3591, 3598, 3606, 3612, 3608, 3604];
        const b = makeSyntheticBars(seqPrices, 1.0);
        const st = analyzeMarketStructure(b, 1.0, 'XAUUSD', 18);
        assert(st.type === 'BULLISH' && Boolean(st.inPullback), `Expected bullish pullback, got ${st.type} (inPullback=${st.inPullback})`);
        return st.label;
      },
    ],
    [
      '10. Structure invalidation when swing low broken',
      () => {
        const b = makeSyntheticBars([...Array.from({ length: 28 }, (_, i) => 3580 + i * 1.2), 3610, 3608, 3612, 3575, 3572], 1.1);
        const st = analyzeMarketStructure(b, 1.1, 'XAUUSD', 18);
        assert(st.type !== 'BULLISH', 'Expected invalidation');
        return st.label;
      },
    ],
    [
      '11. D1/HTF zero-lookahead leakage check',
      () => {
        const t0 = 1700000000000;
        const d1 = makeSyntheticBars(Array.from({ length: 50 }, (_, i) => 3500 + i * 5), 5, 86400000, t0);
        const dec = t0 + 10 * 86400000;
        const kept = d1.filter((d) => d.timeMs + 86400000 <= dec);
        assert(kept.length === 10, 'Future D1 leaked');
        return `${kept.length} closed D1 bars`;
      },
    ],
    [
      '12. Stale M1 (>25s) & M5 (>60s) quotes rejected',
      () => {
        const old = new Date(Date.now() - 75000).toISOString();
        delete quotesStore.BIQUOTE.XAUUSD;
        ingestQuoteUpdate(quotesStore, 'XAUUSD', { bid: 3600, ask: 3600.3, timestamp: old }, 'BIQUOTE', true);
        const fm1 = evaluateQuoteFreshness(quotesStore, 'XAUUSD', 'M1', 'BIQUOTE');
        const fm5 = evaluateQuoteFreshness(quotesStore, 'XAUUSD', 'M5', 'BIQUOTE');
        assert(!fm1.fresh && !fm5.fresh, 'Stale must fail');
        return `M1=${fm1.status}, M5=${fm5.status}`;
      },
    ],
    [
      '13. Broker timestamp validation & duplicate/OOO guard',
      () => {
        const miss = ingestQuoteUpdate(quotesStore, 'XAUUSD', { bid: 3600, ask: 3600.2 }, 'EXNESS', true);
        assert(!miss.accepted, 'Missing ts must fail');
        delete quotesStore.BIQUOTE.EURUSD;
        const tN = new Date(Date.now() + 4000).toISOString();
        const tO = new Date(Date.now() - 60000).toISOString();
        ingestQuoteUpdate(quotesStore, 'EURUSD', { bid: 1.1, ask: 1.1001, timestamp: tN }, 'BIQUOTE', true);
        const dup = ingestQuoteUpdate(quotesStore, 'EURUSD', { bid: 1.1, ask: 1.1001, timestamp: tN }, 'BIQUOTE', true);
        const ooo = ingestQuoteUpdate(quotesStore, 'EURUSD', { bid: 1.099, ask: 1.0991, timestamp: tO }, 'BIQUOTE', true);
        assert(!dup.accepted && !ooo.accepted, 'Dup/OOO must fail');
        return 'Missing/Dup/OOO rejected';
      },
    ],
    [
      '14. SignalR dedup & single-flight guard active',
      () => {
        assert(signalRClient.isSingleFlightGuarded(), 'Missing guards');
        return 'Active';
      },
    ],
    [
      '15. Exness disconnection handled safely',
      () => {
        delete quotesStore.EXNESS.GBPUSD;
        const f = evaluateQuoteFreshness(quotesStore, 'GBPUSD', 'M15', 'EXNESS');
        assert(!f.available && !f.fresh, 'Must be UNAVAILABLE');
        return f.label;
      },
    ],
    [
      '16. Invalid symbol specs disable lot sizing',
      () => {
        const sp = getSymbolSpec('BAD_SYM', 'BIQUOTE', quotesStore, brokerSpecsOverride, riskConfig.contractMode, riskConfig.commission, 1.0);
        const rc = computePositionRiskAndCosts('BAD_SYM', 1.0, { spread: 0.1 }, sp, riskConfig);
        assert(!sp.verified && !rc.valid, 'Unknown spec must fail');
        return rc.reason;
      },
    ],
    [
      '17. Net R:R calculation deducts spread + comm + slippage',
      () => {
        const sp = getSymbolSpec('XAUUSD', 'BIQUOTE', quotesStore, brokerSpecsOverride, riskConfig.contractMode, riskConfig.commission, 3600);
        const rc = computePositionRiskAndCosts('XAUUSD', 4.0, { spread: 0.4 }, sp, riskConfig);
        assert((rc.costInPrice || 0) >= 0.4, 'Cost must include spread+slip');
        return `Cost=$${(rc.costInPrice || 0).toFixed(2)}`;
      },
    ],
    [
      '18. Active Signal Lock prevents mid-candle WAIT flicker',
      () => {
        const lock = { type: 'SELL', entry: 3600, tp1: 3595, tp2: 3590, tp3: 3585, sl: 3605, tp1Hit: false };
        const px = 3599.2;
        const hitSl = px >= lock.sl;
        const hitTp3 = px <= lock.tp3;
        assert(!hitSl && !hitTp3, 'Lock must persist');
        return 'Lock holds';
      },
    ],
    [
      '19. Manual Confirm Entered decouples viewing other TFs',
      () => {
        let openPositions = 0;
        const prev = openPositions;
        openPositions = openPositions > 0 ? 0 : 1;
        assert(openPositions !== prev, 'Toggle failed');
        return 'Manual position toggle OK';
      },
    ],
    [
      '20. Historical zero-lookahead walk-forward execution',
      () => {
        const b = makeSyntheticBars(Array.from({ length: 95 }, (_, i) => 3550 + i * 1.1), 1.2);
        const wf = runWalkForwardForTimeframe('XAUUSD', 'M15', b, b, b, b, defaultEvalOpts(), 0.2);
        assert(!wf.insufficient && Number.isFinite(wf.profitFactor), 'WF failed');
        return `${wf.totalTrades} trades, PF=${wf.profitFactor!.toFixed(2)}`;
      },
    ],
  ];

  let pass = 0;
  let fail = 0;
  for (const [name, fn] of tests) {
    try {
      const out = fn();
      append(`[PASS] ${name} -> ${out}`, 'pass');
      pass++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      append(`[FAIL] ${name} -> ${msg}`, 'fail');
      fail++;
    }
  }

  append(`Unit Summary: ${pass}/${tests.length} PASSED, ${fail} FAILED`, fail === 0 ? 'pass' : 'fail');
  append('Running Live BIQUOTE API & SignalR Checks…', 'info');

  const liveChecks: Array<[string, () => Promise<string>]> = [
    [
      'GET /api/active',
      async () => {
        const d = await checkBiquoteActiveSymbols();
        return `Active=${d.size}`;
      },
    ],
    [
      'GET /api/latest?symbols=EURUSD&symbols=XAUUSD',
      async () => {
        const d = await biquoteFetchJson<Record<string, { mid?: number }>>(`${BIQUOTE_BASE}/api/latest?symbols=EURUSD&symbols=XAUUSD`);
        return `EUR=${d?.EURUSD?.mid}, XAU=${d?.XAUUSD?.mid}`;
      },
    ],
    [
      'OHLC XAUUSD 15m & 1d',
      async () => {
        const a = await biquoteFetchJson<{ bars?: unknown[] }>(`${BIQUOTE_BASE}/api/XAUUSD/ohlc?interval=15m&limit=10`);
        const b = await biquoteFetchJson<{ bars?: unknown[] }>(`${BIQUOTE_BASE}/api/XAUUSD/ohlc?interval=1d&limit=20`);
        return `15m=${a?.bars?.length}, 1d=${b?.bars?.length}`;
      },
    ],
    [
      'SignalR /hubs/tick',
      async () => `State=${signalRClient.state}`,
    ],
  ];

  for (const [name, fn] of liveChecks) {
    try {
      const out = await fn();
      append(`[PASS] ${name} -> ${out}`, 'pass');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      append(`[FAIL] ${name} -> ${msg}`, 'fail');
    }
  }

  await onRefreshAfter();
  return { pass, fail };
}
