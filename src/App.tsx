import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { KeyLevelChart } from './components/KeyLevelChart';
import { MarketOverviewRow } from './components/MarketOverviewRow';
import { QaDiagnosticsModal } from './components/QaDiagnosticsModal';
import { RiskSupporterPanel } from './components/RiskSupporterPanel';
import { SignalCard } from './components/SignalCard';
import { SignalHistorySidebar } from './components/SignalHistorySidebar';
import { TimeframeAndKeyMap } from './components/TimeframeAndKeyMap';
import { WalkForwardPanel } from './components/WalkForwardPanel';
import { WatchlistsSection } from './components/WatchlistsSection';
import {
  APP_VERSION,
  RELEASE_DATE,
  STORAGE_KEYS,
  SUPPORTED_SYMBOLS,
  TF_PROFILES,
  TRANSLATIONS,
} from './constants/market';
import { formatPrice } from './engine/indicators';
import { runFullQaSuite } from './engine/qaSuite';
import {
  BrokerSpecsStore,
  evaluateQuoteFreshness,
  evaluateSetup,
  getSymbolSpec,
  QuotesStore,
  runWalkForwardForTimeframe,
} from './engine/strategy';
import {
  BiquoteSignalRClient,
  checkBiquoteActiveSymbols,
  checkExnessBridge,
  fetchBiquoteLatestSnapshot,
  fetchSymbolCandles,
} from './services/marketFeed';
import {
  ActiveLock,
  CandleBar,
  CandleSeries,
  ChartLayers,
  ContractModeType,
  LanguageType,
  ProviderType,
  QaLogEntry,
  QuoteData,
  RiskConfig,
  RiskLedger,
  SignalHistoryItem,
  SignalResult,
  SignalRStateType,
  TimeframeType,
  WalkForwardStats,
} from './types/trading';

function playSignalSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [587.33, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + idx * 0.16;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Ignore audio context restriction
  }
}

function loadInitialRiskConfig(): RiskConfig {
  const b = Number(localStorage.getItem(STORAGE_KEYS.riskBal));
  const p = Number(localStorage.getItem(STORAGE_KEYS.riskPct));
  const d = Number(localStorage.getItem(STORAGE_KEYS.dailyCap));
  const m = localStorage.getItem(STORAGE_KEYS.contractMode) as ContractModeType | null;
  const c = Number(localStorage.getItem(STORAGE_KEYS.commission));
  return {
    balance: Number.isFinite(b) && b >= 5 ? b : 80,
    riskPct: Number.isFinite(p) && p >= 0.1 && p <= 5 ? p : 0.5,
    dailyCap: Number.isFinite(d) && d >= 0.25 && d <= 5 ? d : 1.0,
    contractMode: m === 'CENT' ? 'CENT' : 'STANDARD',
    commission: Number.isFinite(c) && c >= 0 ? c : 0,
  };
}

function loadInitialRiskLedger(): RiskLedger {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.riskState) || 'null') as RiskLedger | null;
    if (parsed && parsed.dateUtc === today) return parsed;
  } catch {
    // fallback
  }
  return { dateUtc: today, dailyLossPct: 0, consecutiveLosses: 0, openPositions: 0, pausedForReview: false };
}

function loadInitialHistory(): SignalHistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    if (Array.isArray(parsed)) {
      return parsed.filter((x) => x && (x.type === 'BUY' || x.type === 'SELL')).slice(0, 60);
    }
  } catch {
    // fallback
  }
  return [];
}

function loadInitialLocks(): Record<string, ActiveLock> {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEYS.lock) || '{}') as Record<string, ActiveLock>) || {};
  } catch {
    return {};
  }
}

function loadInitialLayers(): ChartLayers {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.layers) || 'null') as Partial<ChartLayers> | null;
    if (parsed) return { sr: parsed.sr ?? true, liq: parsed.liq ?? true, ict: parsed.ict ?? true };
  } catch {
    // fallback
  }
  return { sr: true, liq: true, ict: true };
}

function createInitialSignal(symbol: string, tf: TimeframeType, provider: ProviderType): SignalResult {
  return {
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
    htfSummary: '—',
    setupScore: 0,
    rules: [],
    diagVeto: 'Initializing',
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
    closedCount: 0,
    formingBar: null,
    candleTime: 0,
    time: '--:--:--',
    reason: 'Syncing candles…',
  };
}

export default function App() {
  const [language, setLanguage] = useState<LanguageType>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.language);
    return saved === 'kh' ? 'kh' : 'en';
  });
  const [provider, setProvider] = useState<ProviderType>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.provider);
    return saved === 'EXNESS' ? 'EXNESS' : 'BIQUOTE';
  });
  const [activeSymbol, setActiveSymbol] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.symbol);
    return saved && SUPPORTED_SYMBOLS.includes(saved) ? saved : 'XAUUSD';
  });
  const [activeTF, setActiveTF] = useState<TimeframeType>('M15');
  const [alertEnabled, setAlertEnabled] = useState<boolean>(() => localStorage.getItem(STORAGE_KEYS.alerts) !== 'false');

  const [riskConfig, setRiskConfig] = useState<RiskConfig>(loadInitialRiskConfig);
  const [riskLedger, setRiskLedger] = useState<RiskLedger>(loadInitialRiskLedger);
  const [signalHistory, setSignalHistory] = useState<SignalHistoryItem[]>(loadInitialHistory);
  const [chartLayers, setChartLayers] = useState<ChartLayers>(loadInitialLayers);

  const [statusMessage, setStatusMessage] = useState<string>('Connecting…');
  const [statusLevel, setStatusLevel] = useState<'ok' | 'warn' | 'err'>('warn');
  const [signalRState, setSignalRState] = useState<SignalRStateType>('DISCONNECTED');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [currentSignal, setCurrentSignal] = useState<SignalResult>(() =>
    createInitialSignal(activeSymbol, 'M15', provider),
  );
  const [walkForwardStats, setWalkForwardStats] = useState<WalkForwardStats | null>(null);
  const [chartBars, setChartBars] = useState<{ closed: CandleBar[]; forming: CandleBar | null; error: string | null }>({
    closed: [],
    forming: null,
    error: null,
  });
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [priceTrend, setPriceTrend] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [tickVersion, setTickVersion] = useState<number>(0);

  const [utcClock, setUtcClock] = useState<string>(() => new Date().toISOString().slice(11, 19) + ' UTC');
  const [candleCountdown, setCandleCountdown] = useState<string>('15:00');
  const [alertCountdown, setAlertCountdown] = useState<string>('19:59');
  const [sessions, setSessions] = useState(() => {
    const h = new Date().getUTCHours();
    return { london: h >= 7 && h < 16, ny: h >= 12 && h < 21, tokyo: h >= 0 && h < 9, sydney: h >= 21 || h < 6 };
  });

  const [toast, setToast] = useState<string | null>(null);
  const [qaModalOpen, setQaModalOpen] = useState<boolean>(false);
  const [qaLogs, setQaLogs] = useState<QaLogEntry[]>([]);
  const [qaRunning, setQaRunning] = useState<boolean>(false);

  // Mutable stores for high-frequency tick ingestion & caching
  const quotesStoreRef = useRef<QuotesStore>({ BIQUOTE: {}, EXNESS: {} });
  const brokerSpecsRef = useRef<BrokerSpecsStore>({});
  const candlesCacheRef = useRef<Record<string, CandleSeries>>({});
  const activeLocksRef = useRef<Record<string, ActiveLock>>(loadInitialLocks());
  const signalRClientRef = useRef<BiquoteSignalRClient>(new BiquoteSignalRClient());

  const analysisEpochRef = useRef<number>(0);
  const analysisInFlightRef = useRef<boolean>(false);
  const queuedTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSignalBarKeyRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest state accessible in async callbacks/timers
  const stateRef = useRef({
    activeSymbol,
    activeTF,
    provider,
    riskConfig,
    riskLedger,
    alertEnabled,
  });
  stateRef.current = { activeSymbol, activeTF, provider, riskConfig, riskLedger, alertEnabled };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const saveLocks = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.lock, JSON.stringify(activeLocksRef.current));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const saveRiskLedger = useCallback((next: RiskLedger) => {
    setRiskLedger(next);
    try {
      localStorage.setItem(STORAGE_KEYS.riskState, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const closeActiveLock = useCallback(
    (key: string, reason: string, isLoss: boolean) => {
      const lk = activeLocksRef.current[key];
      if (!lk) return;
      delete activeLocksRef.current[key];
      saveLocks();
      if (isLoss && stateRef.current.riskLedger.openPositions > 0) {
        const rp = Math.max(0.1, Number(stateRef.current.riskConfig.riskPct || 0.5));
        const cur = stateRef.current.riskLedger;
        const nextConsec = cur.consecutiveLosses + 1;
        saveRiskLedger({
          ...cur,
          dailyLossPct: Number((cur.dailyLossPct + rp).toFixed(2)),
          consecutiveLosses: nextConsec,
          pausedForReview: nextConsec >= 2 ? true : cur.pausedForReview,
        });
      }
      showToast(`${lk.asset} ${lk.type} closed: ${reason}`);
    },
    [saveLocks, saveRiskLedger, showToast],
  );

  const evaluateActiveLockOnTick = useCallback(
    (quote: QuoteData) => {
      const { provider: prov, activeSymbol: sym, activeTF: tf } = stateRef.current;
      const key = `${prov}:${sym}:${tf}`;
      const lk = activeLocksRef.current[key];
      if (!lk || !quote) return;
      const px = lk.type === 'BUY' ? quote.bid : quote.ask;
      if (lk.type === 'BUY') {
        if (!lk.tp1Hit && px <= lk.sl) {
          closeActiveLock(key, 'SL HIT', true);
          return;
        }
        if (!lk.tp1Hit && px >= lk.tp1) {
          lk.tp1Hit = true;
          lk.sl = lk.entry;
          saveLocks();
          showToast(`${lk.asset} TP1 HIT — Move SL to BE`);
        }
        if (lk.tp1Hit && !lk.tp2Hit && px >= lk.tp2) {
          lk.tp2Hit = true;
          saveLocks();
          showToast(`${lk.asset} TP2 HIT!`);
        }
        if (lk.tp1Hit && px <= lk.sl) {
          closeActiveLock(key, 'BREAKEVEN CLOSED', false);
          return;
        }
        if (px >= lk.tp3) {
          closeActiveLock(key, 'TP3 COMPLETED', false);
        }
      } else {
        if (!lk.tp1Hit && px >= lk.sl) {
          closeActiveLock(key, 'SL HIT', true);
          return;
        }
        if (!lk.tp1Hit && px <= lk.tp1) {
          lk.tp1Hit = true;
          lk.sl = lk.entry;
          saveLocks();
          showToast(`${lk.asset} TP1 HIT — Move SL to BE`);
        }
        if (lk.tp1Hit && !lk.tp2Hit && px <= lk.tp2) {
          lk.tp2Hit = true;
          saveLocks();
          showToast(`${lk.asset} TP2 HIT!`);
        }
        if (lk.tp1Hit && px >= lk.sl) {
          closeActiveLock(key, 'BREAKEVEN CLOSED', false);
          return;
        }
        if (px <= lk.tp3) {
          closeActiveLock(key, 'TP3 COMPLETED', false);
        }
      }
    },
    [closeActiveLock, saveLocks, showToast],
  );

  const analyzeActiveMarket = useCallback(
    async (isBarCloseOrLoad = true) => {
      if (analysisInFlightRef.current) return;
      analysisInFlightRef.current = true;
      const myEp = ++analysisEpochRef.current;
      const t0 = performance.now();
      const { activeSymbol: sym, activeTF: tf, provider: prov, riskConfig: rc, alertEnabled: soundOn } = stateRef.current;
      const prof = TF_PROFILES[tf];

      try {
        const ltf = await fetchSymbolCandles(sym, tf, prov, candlesCacheRef.current, false);
        if (myEp !== analysisEpochRef.current) return;

        let htf: CandleSeries | null = ltf;
        let d1: CandleSeries | null = null;
        let h1: CandleSeries | null = null;

        if (prof.htf !== tf) {
          try {
            htf = await fetchSymbolCandles(sym, prof.htf, prov, candlesCacheRef.current, true);
          } catch {
            htf = null;
          }
        }
        try {
          d1 = tf === 'D1' ? ltf : await fetchSymbolCandles(sym, 'D1', prov, candlesCacheRef.current, true);
        } catch {
          d1 = null;
        }
        try {
          h1 = tf === 'H1' ? ltf : await fetchSymbolCandles(sym, 'H1', prov, candlesCacheRef.current, true);
        } catch {
          h1 = null;
        }
        if (myEp !== analysisEpochRef.current) return;

        const evalOpts = {
          provider: prov,
          quotesStore: quotesStoreRef.current,
          brokerSpecsOverride: brokerSpecsRef.current,
          riskConfig: rc,
        };

        const fresh = evaluateSetup(
          sym,
          tf,
          ltf.closedBars,
          ltf.formingBar,
          htf?.closedBars || null,
          d1?.closedBars || null,
          h1?.closedBars || null,
          evalOpts,
        );

        const lockKey = `${prov}:${sym}:${tf}`;
        let activeLock: ActiveLock | undefined = activeLocksRef.current[lockKey];

        if (activeLock && isBarCloseOrLoad && fresh.candleTime > activeLock.candleTime) {
          const opp =
            (activeLock.type === 'BUY' && fresh.structure?.type === 'BEARISH' && fresh.setupScore >= 65) ||
            (activeLock.type === 'SELL' && fresh.structure?.type === 'BULLISH' && fresh.setupScore >= 65);
          if (opp) {
            closeActiveLock(lockKey, 'OPPOSITE STRUCTURE', false);
            activeLock = undefined;
          }
        }

        if (!activeLock && isBarCloseOrLoad && fresh.state === 'READY' && fresh.entry !== null && fresh.tp1 !== null && fresh.tp2 !== null && fresh.tp3 !== null && fresh.sl !== null && (fresh.type === 'BUY' || fresh.type === 'SELL')) {
          activeLock = {
            id: `${sym}:${tf}:${fresh.candleTime}`,
            asset: sym,
            tf,
            provider: prov,
            type: fresh.type,
            entryMode: fresh.entryMode,
            entry: fresh.entry,
            entryZone: fresh.entryZone,
            tp1: fresh.tp1,
            tp2: fresh.tp2,
            tp3: fresh.tp3,
            sl: fresh.sl,
            grossRR: fresh.grossRR,
            netRR: fresh.netRR,
            rrText: fresh.rrText,
            riskCalc: fresh.riskCalc,
            candleTime: fresh.candleTime,
            time: fresh.time,
            tp1Hit: false,
            tp2Hit: false,
          };
          activeLocksRef.current[lockKey] = activeLock;
          saveLocks();

          const bk = `${prov}:${sym}:${tf}:${fresh.candleTime}`;
          if (lastSignalBarKeyRef.current !== bk) {
            lastSignalBarKeyRef.current = bk;
            const entryItem: SignalHistoryItem = {
              time: fresh.time,
              date: new Date(fresh.candleTime).toLocaleDateString(),
              asset: sym,
              tf: prof.label,
              source: prov,
              type: fresh.type,
              entry: formatPrice(fresh.entry, sym),
              tp1: formatPrice(fresh.tp1, sym),
              sl: formatPrice(fresh.sl, sym),
              status: `${fresh.entryMode} · ${fresh.setupScore}%`,
            };
            setSignalHistory((prev) => {
              const next = [entryItem, ...prev].slice(0, 60);
              try {
                localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(next));
              } catch {
                // ignore
              }
              return next;
            });
            if (soundOn) playSignalSound();
            showToast(`READY: ${sym} ${prof.label} ${fresh.type} (${fresh.entryMode})`);
          }
        }

        let resolvedSignal: SignalResult;
        if (activeLock) {
          resolvedSignal = {
            ...fresh,
            state: 'READY',
            type: activeLock.type,
            entryMode: activeLock.tp2Hit
              ? 'TP2 HIT · RUNNER'
              : activeLock.tp1Hit
                ? 'TP1 HIT · SL AT BE'
                : activeLock.entryMode,
            entry: activeLock.entry,
            entryZone: activeLock.entryZone,
            tp1: activeLock.tp1,
            tp2: activeLock.tp2,
            tp3: activeLock.tp3,
            sl: activeLock.sl,
            grossRR: activeLock.grossRR,
            netRR: activeLock.netRR,
            rrText: activeLock.rrText,
            riskCalc: activeLock.riskCalc,
            locked: true,
            tp1Hit: activeLock.tp1Hit,
            tp2Hit: activeLock.tp2Hit,
            watchNote: null,
            reason: `LOCKED ${activeLock.type} (${activeLock.tp1Hit ? 'TP1 hit — SL at BE' : 'tracking TP1/SL'})`,
          };
        } else if (!isBarCloseOrLoad && fresh.state === 'READY') {
          resolvedSignal = {
            ...fresh,
            state: 'WATCH',
            type: 'WAIT',
            entryMode: `${fresh.type} FORMING`,
            watchNote: `${fresh.type} (${fresh.entryMode}) forming — awaiting ${prof.label} close to lock`,
            reason: `WATCH: Awaiting ${prof.label} bar close for ${fresh.type}`,
          };
        } else {
          resolvedSignal = fresh;
        }

        const wf = runWalkForwardForTimeframe(
          sym,
          tf,
          ltf.closedBars,
          htf?.closedBars || null,
          d1?.closedBars || null,
          h1?.closedBars || null,
          evalOpts,
        );

        setLatencyMs(Math.max(0.1, performance.now() - t0));
        setCurrentSignal(resolvedSignal);
        setWalkForwardStats(wf);
        setChartBars({ closed: ltf.closedBars, forming: ltf.formingBar, error: null });
      } catch (err) {
        if (myEp !== analysisEpochRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLatencyMs(Math.max(0.1, performance.now() - t0));
        setWalkForwardStats({ insufficient: true, reason: msg });
        setCurrentSignal((prev) => ({
          ...prev,
          asset: sym,
          tf,
          source: prov,
          state: 'NO TRADE',
          type: 'WAIT',
          entryMode: 'DATA ERROR',
          entry: null,
          tp1: null,
          tp2: null,
          tp3: null,
          sl: null,
          locked: false,
          diagVeto: msg,
          reason: `NO TRADE: ${msg}`,
        }));
        setChartBars({ closed: [], forming: null, error: msg });
      } finally {
        analysisInFlightRef.current = false;
      }
    },
    [closeActiveLock, saveLocks, showToast],
  );

  const scheduleTickEvaluation = useCallback(() => {
    if (queuedTickTimerRef.current) return;
    const delay = stateRef.current.activeTF === 'M1' || stateRef.current.activeTF === 'M5' ? 600 : 1400;
    queuedTickTimerRef.current = setTimeout(() => {
      queuedTickTimerRef.current = null;
      void analyzeActiveMarket(false);
    }, delay);
  }, [analyzeActiveMarket]);

  // Provider connection lifecycle (BIQUOTE SignalR + REST or EXNESS Polling)
  useEffect(() => {
    let cancelled = false;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
    let exnessPoll: ReturnType<typeof setInterval> | null = null;

    const startProvider = async () => {
      if (provider === 'BIQUOTE') {
        setStatusMessage('Connecting to Biquote…');
        setStatusLevel('warn');
        try {
          await checkBiquoteActiveSymbols();
        } catch {
          // Non-fatal: weekend /api/active may exclude closed FX/Gold pairs
        }
        try {
          await fetchBiquoteLatestSnapshot(quotesStoreRef.current);
          setTickVersion((v) => v + 1);
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatusMessage(`DATA UNAVAILABLE — ${msg}`);
            setStatusLevel('err');
          }
        }
        if (cancelled) return;

        await signalRClientRef.current.connect(
          quotesStoreRef.current,
          (sym, prevMid, quote) => {
            if (cancelled || stateRef.current.provider !== 'BIQUOTE') return;
            if (sym === stateRef.current.activeSymbol) {
              setPriceTrend(prevMid && quote.mid > prevMid ? 'up' : prevMid && quote.mid < prevMid ? 'down' : 'neutral');
              evaluateActiveLockOnTick(quote);

              const cacheKey = `${stateRef.current.provider}:${stateRef.current.activeSymbol}:${stateRef.current.activeTF}`;
              const cached = candlesCacheRef.current[cacheKey];
              if (cached?.formingBar) {
                cached.formingBar.close = quote.mid;
                cached.formingBar.high = Math.max(cached.formingBar.high, quote.mid);
                cached.formingBar.low = Math.min(cached.formingBar.low, quote.mid);
                setChartBars((prev) => ({ ...prev, forming: { ...cached.formingBar! } }));
              }

              const lockKey = `${stateRef.current.provider}:${stateRef.current.activeSymbol}:${stateRef.current.activeTF}`;
              if (!activeLocksRef.current[lockKey]) {
                scheduleTickEvaluation();
              }
            }
            setTickVersion((v) => v + 1);
          },
          (st, msg, lvl) => {
            if (cancelled) return;
            setSignalRState(st);
            if (msg && lvl) {
              setStatusMessage(msg);
              setStatusLevel(lvl);
            }
          },
        );

        if (!cancelled) {
          await analyzeActiveMarket(true);
        }

        fallbackPoll = setInterval(async () => {
          if (stateRef.current.provider === 'BIQUOTE' && signalRClientRef.current.state !== 'CONNECTED') {
            try {
              await fetchBiquoteLatestSnapshot(quotesStoreRef.current);
              setTickVersion((v) => v + 1);
            } catch {
              // ignore transient fallback poll error
            }
          }
        }, 15000);
      } else {
        await signalRClientRef.current.disconnect();
        setSignalRState('DISCONNECTED');

        const pollExness = async () => {
          const res = await checkExnessBridge(
            stateRef.current.activeSymbol,
            stateRef.current.activeTF,
            quotesStoreRef.current,
            brokerSpecsRef.current,
          );
          if (cancelled) return;
          setStatusMessage(res.statusText);
          setStatusLevel(res.statusLevel);
          setTickVersion((v) => v + 1);
          await analyzeActiveMarket(true);
        };

        await pollExness();
        exnessPoll = setInterval(pollExness, 3000);
      }
    };

    void startProvider();

    return () => {
      cancelled = true;
      if (fallbackPoll) clearInterval(fallbackPoll);
      if (exnessPoll) clearInterval(exnessPoll);
      void signalRClientRef.current.disconnect();
    };
  }, [provider, analyzeActiveMarket, evaluateActiveLockOnTick, scheduleTickEvaluation]);

  // Re-analyze when symbol, timeframe, or riskConfig changes
  useEffect(() => {
    void analyzeActiveMarket(true);
  }, [activeSymbol, activeTF, riskConfig, analyzeActiveMarket]);

  // Timers: Candle countdown, 20m Alert reminder, UTC clock + 1s freshness tick, and Market Sessions
  useEffect(() => {
    let prevBarIndex = Math.floor(Date.now() / 1000 / (TF_PROFILES[activeTF]?.seconds || 900));

    const updateTimers = () => {
      const now = new Date();
      setUtcClock(now.toISOString().slice(11, 19) + ' UTC');

      const dur = TF_PROFILES[stateRef.current.activeTF]?.seconds || 900;
      const nowSec = Math.floor(Date.now() / 1000);
      const rem = dur - (nowSec % dur);
      const h = Math.floor(rem / 3600);
      const m = Math.floor((rem % 3600) / 60);
      const s = rem % 60;
      setCandleCountdown(
        h > 0
          ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      );

      const barIdx = Math.floor(nowSec / dur);
      if (barIdx !== prevBarIndex) {
        prevBarIndex = barIdx;
        setTimeout(() => {
          void analyzeActiveMarket(true);
        }, 1800);
      }

      let rem20 = 1200 - ((now.getMinutes() % 20) * 60 + now.getSeconds());
      if (rem20 <= 0) rem20 = 1200;
      setAlertCountdown(`${String(Math.floor(rem20 / 60)).padStart(2, '0')}:${String(rem20 % 60).padStart(2, '0')}`);
      if (now.getMinutes() % 20 === 0 && now.getSeconds() === 0 && stateRef.current.alertEnabled) {
        playSignalSound();
        showToast('20m review reminder');
      }

      const hr = now.getUTCHours();
      setSessions({
        london: hr >= 7 && hr < 16,
        ny: hr >= 12 && hr < 21,
        tokyo: hr >= 0 && hr < 9,
        sydney: hr >= 21 || hr < 6,
      });

      setTickVersion((v) => v + 1);
    };

    updateTimers();
    const id = setInterval(updateTimers, 1000);
    return () => clearInterval(id);
  }, [activeTF, analyzeActiveMarket, showToast]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (provider === 'BIQUOTE') {
        await checkBiquoteActiveSymbols().catch(() => undefined);
        await fetchBiquoteLatestSnapshot(quotesStoreRef.current);
        if (signalRClientRef.current.state !== 'CONNECTED') {
          await signalRClientRef.current.connect(
            quotesStoreRef.current,
            (sym, prevMid, quote) => {
              if (sym === stateRef.current.activeSymbol) {
                setPriceTrend(prevMid && quote.mid > prevMid ? 'up' : prevMid && quote.mid < prevMid ? 'down' : 'neutral');
                evaluateActiveLockOnTick(quote);
              }
              setTickVersion((v) => v + 1);
            },
            (st, msg, lvl) => {
              setSignalRState(st);
              if (msg && lvl) {
                setStatusMessage(msg);
                setStatusLevel(lvl);
              }
            },
          );
        }
        setTickVersion((v) => v + 1);
        await analyzeActiveMarket(true);
        showToast('Refreshed');
      } else {
        const res = await checkExnessBridge(activeSymbol, activeTF, quotesStoreRef.current, brokerSpecsRef.current);
        setStatusMessage(res.statusText);
        setStatusLevel(res.statusLevel);
        setTickVersion((v) => v + 1);
        await analyzeActiveMarket(true);
        showToast('Exness checked');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMessage(`Refresh error: ${msg}`);
      setStatusLevel('err');
      showToast(`Refresh failed: ${msg}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeSymbol, activeTF, analyzeActiveMarket, evaluateActiveLockOnTick, provider, showToast]);

  const handleSelectSymbol = (sym: string) => {
    if (!SUPPORTED_SYMBOLS.includes(sym)) return;
    setActiveSymbol(sym);
    setPriceTrend('neutral');
    localStorage.setItem(STORAGE_KEYS.symbol, sym);
  };

  const handleProviderChange = (p: ProviderType) => {
    setProvider(p);
    localStorage.setItem(STORAGE_KEYS.provider, p);
  };

  const handleLanguageChange = (l: LanguageType) => {
    setLanguage(l);
    localStorage.setItem(STORAGE_KEYS.language, l);
  };

  const handleToggleAlert = () => {
    const next = !alertEnabled;
    setAlertEnabled(next);
    localStorage.setItem(STORAGE_KEYS.alerts, String(next));
    showToast(next ? 'Reminder ON' : 'Reminder OFF');
  };

  const handleRiskConfigChange = (next: RiskConfig) => {
    setRiskConfig(next);
    localStorage.setItem(STORAGE_KEYS.riskBal, String(next.balance));
    localStorage.setItem(STORAGE_KEYS.riskPct, String(next.riskPct));
    localStorage.setItem(STORAGE_KEYS.dailyCap, String(next.dailyCap));
    localStorage.setItem(STORAGE_KEYS.contractMode, next.contractMode);
    localStorage.setItem(STORAGE_KEYS.commission, String(next.commission));
  };

  const handleToggleManualPosition = () => {
    const nextOpen = riskLedger.openPositions > 0 ? 0 : 1;
    saveRiskLedger({ ...riskLedger, openPositions: nextOpen });
    showToast(nextOpen ? 'Marked 1 open trade' : 'Marked 0 open trades');
  };

  const handleRecordSimulatedLoss = () => {
    const p = Math.max(0.1, Number(riskConfig.riskPct || 0.5));
    const nextConsec = riskLedger.consecutiveLosses + 1;
    saveRiskLedger({
      ...riskLedger,
      dailyLossPct: Number((riskLedger.dailyLossPct + p).toFixed(2)),
      consecutiveLosses: nextConsec,
      pausedForReview: nextConsec >= 2 ? true : riskLedger.pausedForReview,
    });
    showToast(`Loss logged (${nextConsec}L)`);
  };

  const handleResetRiskPause = () => {
    saveRiskLedger({
      ...riskLedger,
      dailyLossPct: 0,
      consecutiveLosses: 0,
      openPositions: 0,
      pausedForReview: false,
    });
    showToast('Risk guard reset');
  };

  const handleToggleLayer = (k: keyof ChartLayers) => {
    setChartLayers((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try {
        localStorage.setItem(STORAGE_KEYS.layers, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleUnlockSignal = () => {
    const key = `${provider}:${activeSymbol}:${activeTF}`;
    if (!activeLocksRef.current[key]) return;
    closeActiveLock(key, 'MANUAL', false);
    void analyzeActiveMarket(true);
  };

  const handleCopySignal = () => {
    const s = currentSignal;
    const prof = TF_PROFILES[s.tf || activeTF];
    const sym = s.asset || activeSymbol;
    const kl = s.keyLevels;
    const rc = s.riskCalc;
    const lotTxt = !rc
      ? `Budget $${(Math.max(5, riskConfig.balance) * (riskConfig.riskPct / 100) * (s.danger?.riskScale || 1)).toFixed(2)}`
      : !rc.valid
        ? `${(rc.lots || 0).toFixed(2)} (WARN)`
        : `${(rc.lots || 0).toFixed(2)} lots`;
    const txt = [
      `${APP_VERSION} (${RELEASE_DATE})`,
      `${s.source} | ${sym} ${prof.label} | ${s.danger?.label}`,
      `State: ${s.state} | Type: ${s.type} (${s.entryMode}) | Score: ${s.setupScore}%`,
      `Entry: ${s.entry !== null ? formatPrice(s.entry, sym) : '—'} | SL: ${s.sl !== null ? formatPrice(s.sl, sym) : '—'}`,
      `TP1: ${s.tp1 !== null ? formatPrice(s.tp1, sym) : '—'} | TP2: ${s.tp2 !== null ? formatPrice(s.tp2, sym) : '—'} | TP3: ${s.tp3 !== null ? formatPrice(s.tp3, sym) : '—'}`,
      `S1: ${kl.s1 ? formatPrice(kl.s1.price, sym) : '—'} | R1: ${kl.r1 ? formatPrice(kl.r1.price, sym) : '—'} | Lot: ${lotTxt}`,
    ].join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt).then(() => showToast('Analysis copied')).catch(() => undefined);
    }
  };

  const handleClearHistory = () => {
    setSignalHistory([]);
    localStorage.removeItem(STORAGE_KEYS.history);
  };

  const handleRunQaSuite = async () => {
    setQaRunning(true);
    setQaLogs([]);
    try {
      await runFullQaSuite(
        signalRClientRef.current,
        riskConfig,
        brokerSpecsRef.current,
        (entry) => setQaLogs((prev) => [...prev, entry]),
        handleManualRefresh,
      );
    } finally {
      setQaRunning(false);
    }
  };

  const t = TRANSLATIONS[language];
  const activeQuote = useMemo(
    () => quotesStoreRef.current[provider]?.[activeSymbol] || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, activeSymbol, tickVersion],
  );
  const activeFreshness = useMemo(
    () => evaluateQuoteFreshness(quotesStoreRef.current, activeSymbol, activeTF, provider),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, activeSymbol, activeTF, tickVersion],
  );
  const activeSpec = useMemo(
    () =>
      getSymbolSpec(
        activeSymbol,
        provider,
        quotesStoreRef.current,
        brokerSpecsRef.current,
        riskConfig.contractMode,
        riskConfig.commission,
        activeQuote?.mid ?? null,
      ),
    [activeSymbol, provider, riskConfig.contractMode, riskConfig.commission, activeQuote?.mid],
  );

  return (
    <div className="flex min-h-screen flex-col justify-between text-slate-200">
      <HeaderBar
        t={t}
        provider={provider}
        onProviderChange={handleProviderChange}
        language={language}
        onLanguageChange={handleLanguageChange}
        statusMessage={statusMessage}
        statusLevel={statusLevel}
        isRefreshing={isRefreshing}
        onRefresh={() => void handleManualRefresh()}
        alertEnabled={alertEnabled}
        alertCountdown={alertCountdown}
        onToggleAlert={handleToggleAlert}
        onOpenQaModal={() => setQaModalOpen(true)}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
        <MarketOverviewRow
          t={t}
          activeSymbol={activeSymbol}
          activeTF={activeTF}
          quote={activeQuote}
          priceTrend={priceTrend}
          freshness={activeFreshness}
          spec={activeSpec}
          contractMode={riskConfig.contractMode}
          signal={currentSignal}
          latencyMs={latencyMs}
          utcClock={utcClock}
          sessions={sessions}
        />

        <WatchlistsSection
          t={t}
          activeSymbol={activeSymbol}
          activeTF={activeTF}
          provider={provider}
          quotesStore={quotesStoreRef.current}
          onSelectSymbol={handleSelectSymbol}
          tickVersion={tickVersion}
        />

        <RiskSupporterPanel
          t={t}
          riskConfig={riskConfig}
          onRiskConfigChange={handleRiskConfigChange}
          riskLedger={riskLedger}
          onToggleManualPosition={handleToggleManualPosition}
          onRecordSimulatedLoss={handleRecordSimulatedLoss}
          onResetRiskPause={handleResetRiskPause}
          signal={currentSignal}
          spec={activeSpec}
        />

        <TimeframeAndKeyMap
          t={t}
          activeSymbol={activeSymbol}
          activeTF={activeTF}
          onChangeTF={setActiveTF}
          candleCountdown={candleCountdown}
          signal={currentSignal}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <SignalCard
              t={t}
              signal={currentSignal}
              activeSymbol={activeSymbol}
              activeTF={activeTF}
              provider={provider}
              quote={activeQuote}
              freshness={activeFreshness}
              spec={activeSpec}
              onUnlockSignal={handleUnlockSignal}
              onCopySignal={handleCopySignal}
            />

            <KeyLevelChart
              t={t}
              activeSymbol={activeSymbol}
              activeTF={activeTF}
              provider={provider}
              closedBars={chartBars.closed}
              formingBar={chartBars.forming}
              chartError={chartBars.error}
              quote={activeQuote}
              freshness={activeFreshness}
              signal={currentSignal}
              layers={chartLayers}
              onToggleLayer={handleToggleLayer}
            />

            <WalkForwardPanel
              activeSymbol={activeSymbol}
              activeTF={activeTF}
              stats={walkForwardStats}
              latencyMs={latencyMs}
              freshness={activeFreshness}
            />
          </div>

          <SignalHistorySidebar
            t={t}
            history={signalHistory}
            onClearHistory={handleClearHistory}
          />
        </div>
      </main>

      <footer className="mt-6 border-t border-slate-800/80 bg-[#0b1018] py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 text-[11px] text-slate-500 sm:px-6">
          <span>&copy; 2026 NETHAGA Pro Trading Hub · All-in-One Key Level Edition. Not financial advice.</span>
          <span>Verify broker spreads &amp; contract specs before trading</span>
        </div>
      </footer>

      <QaDiagnosticsModal
        isOpen={qaModalOpen}
        onClose={() => setQaModalOpen(false)}
        t={t}
        logs={qaLogs}
        isRunning={qaRunning}
        onRunQaSuite={() => void handleRunQaSuite()}
        signalRState={signalRState}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-[90vw] rounded-xl border border-yellow-300 bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
