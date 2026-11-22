import * as signalR from '@microsoft/signalr';
import { BIQUOTE_BASE, BIQUOTE_HUB, SUPPORTED_SYMBOLS, TF_PROFILES } from '../constants/market';
import { aggregateWeeklyFromDaily } from '../engine/indicators';
import { BrokerSpecsStore, evaluateQuoteFreshness, ingestQuoteUpdate, QuotesStore } from '../engine/strategy';
import { CandleBar, CandleSeries, ProviderType, QuoteData, SignalRStateType, TimeframeType } from '../types/trading';

let rateLimitUntilMs = 0;

export function safeFetch(url: string, opt: RequestInit = {}, ms = 10000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t));
}

export async function biquoteFetchJson<T = unknown>(url: string): Promise<T> {
  if (Date.now() < rateLimitUntilMs) throw new Error('Rate limited (429)');
  const r = await safeFetch(url);
  if (r.status === 429) {
    const ra = Number(r.headers.get('Retry-After') || '15');
    rateLimitUntilMs = Date.now() + Math.max(5, ra) * 1000;
    throw new Error(`HTTP 429 retry in ${ra}s`);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function checkBiquoteActiveSymbols(): Promise<Set<string>> {
  const d = await biquoteFetchJson<unknown>(`${BIQUOTE_BASE}/api/active`);
  const f = new Set<string>();
  if (Array.isArray(d)) {
    d.forEach((x) => {
      if (typeof x === 'string') {
        f.add(x.toUpperCase());
        return;
      }
      if (x && typeof x === 'object') {
        const obj = x as { symbol?: string; name?: string };
        if (obj.symbol) f.add(String(obj.symbol).toUpperCase());
        if (obj.name) f.add(String(obj.name).toUpperCase());
      }
    });
  }
  return f;
}

export async function fetchBiquoteLatestSnapshot(quotesStore: QuotesStore): Promise<void> {
  // Always query /api/latest for SUPPORTED_SYMBOLS (do not exclude weekend-closed symbols missing from /api/active!)
  const query = SUPPORTED_SYMBOLS.map((s) => `symbols=${encodeURIComponent(s)}`).join('&');
  const p = await biquoteFetchJson<unknown>(`${BIQUOTE_BASE}/api/latest?${query}`);
  const ent: [string, Record<string, unknown>][] = Array.isArray(p)
    ? p.map((x) => [String((x as { symbol?: string })?.symbol || '').toUpperCase(), x as Record<string, unknown>])
    : Object.entries((p as Record<string, Record<string, unknown>>) || {}).map(([k, v]) => [String(k).toUpperCase(), v]);

  for (const [sym, raw] of ent) {
    if (SUPPORTED_SYMBOLS.includes(sym)) {
      ingestQuoteUpdate(quotesStore, sym, raw, 'BIQUOTE', true);
    }
  }
}

export async function fetchSymbolCandles(
  sym: string,
  tf: TimeframeType,
  provider: ProviderType,
  candlesCache: Record<string, CandleSeries>,
  allowCache = false,
): Promise<CandleSeries> {
  const key = `${provider}:${sym}:${tf}`;
  const c = candlesCache[key];
  const maxAge = (TF_PROFILES[tf]?.seconds || 300) >= 3600 ? 120000 : 25000;
  if (allowCache && c && Date.now() - c.fetchedAt < maxAge) return c;

  if (provider === 'EXNESS') {
    const r = await safeFetch(`/api/candles?symbol=${encodeURIComponent(sym)}&tf=${encodeURIComponent(tf)}&limit=300`);
    if (!r.ok) throw new Error(`EXNESS HTTP ${r.status}`);
    const d = (await r.json()) as { connected?: boolean; error?: string; candles?: Array<Record<string, unknown>> };
    if (!d.connected || !Array.isArray(d.candles)) throw new Error(d.error || 'Bridge disconnected');
    const bars: CandleBar[] = d.candles
      .map((x) => ({
        timeMs: Number(x.time) * 1000,
        open: Number(x.open),
        high: Number(x.high),
        low: Number(x.low),
        close: Number(x.close),
        isOpen: Boolean(x.isOpen),
      }))
      .filter((x) => Number.isFinite(x.timeMs) && [x.open, x.high, x.low, x.close].every(Number.isFinite))
      .sort((a, b) => a.timeMs - b.timeMs);
    const res: CandleSeries = {
      closedBars: bars.filter((b) => !b.isOpen),
      formingBar: bars.find((b) => b.isOpen) || null,
      fetchedAt: Date.now(),
    };
    candlesCache[key] = res;
    return res;
  }

  if (tf === 'W1') {
    const d1 = await fetchSymbolCandles(sym, 'D1', provider, candlesCache, allowCache);
    const wk = aggregateWeeklyFromDaily(d1.closedBars, d1.formingBar);
    const res: CandleSeries = { ...wk, fetchedAt: Date.now() };
    candlesCache[key] = res;
    return res;
  }

  const iv = TF_PROFILES[tf]?.biquote;
  const p = await biquoteFetchJson<{ bars?: Array<Record<string, unknown>> }>(
    `${BIQUOTE_BASE}/api/${encodeURIComponent(sym)}/ohlc?interval=${encodeURIComponent(iv)}&limit=300`,
  );
  const rb = Array.isArray(p?.bars) ? p.bars : [];
  if (!rb.length) throw new Error(`No OHLC bars for ${sym} (${iv})`);
  const parsed: CandleBar[] = rb
    .map((b) => ({
      openTime: String(b.openTime || ''),
      timeMs: Date.parse(String(b.openTime || '')),
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      isOpen: Boolean(b.isOpen),
    }))
    .filter((b) => Number.isFinite(b.timeMs) && [b.open, b.high, b.low, b.close].every(Number.isFinite))
    .sort((a, b) => a.timeMs - b.timeMs);

  const f = parsed.filter((b) => b.isOpen);
  const res: CandleSeries = {
    closedBars: parsed.filter((b) => !b.isOpen),
    formingBar: f.length ? f[f.length - 1] : null,
    fetchedAt: Date.now(),
  };
  candlesCache[key] = res;
  return res;
}

export async function checkExnessBridge(
  activeSymbol: string,
  tf: TimeframeType,
  quotesStore: QuotesStore,
  brokerSpecsOverride: BrokerSpecsStore,
): Promise<{ ok: boolean; statusText: string; statusLevel: 'ok' | 'warn' | 'err' }> {
  try {
    const res = await safeFetch(`/api/quote?symbol=${encodeURIComponent(activeSymbol)}`, {}, 2500);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = (await res.json()) as Record<string, unknown>;
    if (!d.connected) throw new Error(String(d.error || 'Disconnected'));
    const sym = String(d.symbol || activeSymbol).toUpperCase();
    if (Number(d.trade_contract_size) > 0 && Number(d.trade_tick_size) > 0) {
      brokerSpecsOverride[sym] = {
        digits: Number.isInteger(Number(d.digits)) ? Number(d.digits) : undefined,
        pointSize: Number(d.point) > 0 ? Number(d.point) : undefined,
        tickSize: Number(d.trade_tick_size),
        tickValueUsd: Number(d.trade_tick_value) > 0 ? Number(d.trade_tick_value) : undefined,
        contractSize: Number(d.trade_contract_size),
        volumeMin: Number(d.volume_min) > 0 ? Number(d.volume_min) : 0.01,
        volumeStep: Number(d.volume_step) > 0 ? Number(d.volume_step) : 0.01,
        verified: true,
      };
    }
    const ing = ingestQuoteUpdate(
      quotesStore,
      sym,
      {
        bid: d.bid,
        ask: d.ask,
        high: d.high,
        low: d.low,
        dayDiffPercent: d.change_pct,
        timestamp: d.timestamp || d.time || d.time_msc,
        source: 'EXNESS MT5',
        marketState: d.market_state || 'open',
        stale: Boolean(d.stale),
      },
      'EXNESS',
      true,
    );
    if (!ing.accepted && ing.reason !== 'Duplicate (age preserved)') {
      throw new Error(ing.reason || 'Invalid EXNESS quote');
    }
    const f = evaluateQuoteFreshness(quotesStore, sym, tf, 'EXNESS');
    return {
      ok: true,
      statusText: f.fresh ? `EXNESS MT5 connected (${sym})` : `EXNESS: ${f.label}`,
      statusLevel: f.fresh ? 'ok' : 'warn',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, statusText: `EXNESS MT5 unavailable — ${msg}`, statusLevel: 'err' };
  }
}

export class BiquoteSignalRClient {
  private connection: signalR.HubConnection | null = null;
  private isConnecting = false;
  private subscribedSymbolsKey = '';
  public state: SignalRStateType = 'DISCONNECTED';

  async connect(
    quotesStore: QuotesStore,
    onTick: (sym: string, prevMid: number, quote: QuoteData) => void,
    onStateChange: (state: SignalRStateType, message?: string, level?: 'ok' | 'warn' | 'err') => void,
  ): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;
    try {
      await this.disconnect();
      this.state = 'CONNECTING';
      onStateChange('CONNECTING');

      const conn = new signalR.HubConnectionBuilder()
        .withUrl(BIQUOTE_HUB, { withCredentials: false })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
        .configureLogging(signalR.LogLevel.None)
        .build();

      conn.on('ReceiveTick', (tick: Record<string, unknown>) => {
        if (!tick) return;
        const sym = String(tick.symbol || '').toUpperCase();
        if (!SUPPORTED_SYMBOLS.includes(sym)) return;
        const prev = quotesStore.BIQUOTE?.[sym]?.mid || 0;
        const res = ingestQuoteUpdate(quotesStore, sym, tick, 'BIQUOTE', true);
        if (res.accepted && res.quote) {
          onTick(sym, prev, res.quote);
        }
      });

      conn.onreconnecting(() => {
        this.state = 'RECONNECTING';
        this.subscribedSymbolsKey = '';
        onStateChange('RECONNECTING', 'SignalR reconnecting…', 'warn');
      });

      conn.onreconnected(async () => {
        this.state = 'CONNECTED';
        await this.subscribe(conn, true);
        onStateChange('CONNECTED', 'BIQUOTE SignalR reconnected', 'ok');
      });

      conn.onclose(() => {
        this.state = 'DISCONNECTED';
        this.subscribedSymbolsKey = '';
        onStateChange('DISCONNECTED', 'SignalR disconnected — polling', 'warn');
      });

      this.connection = conn;
      await conn.start();
      this.state = 'CONNECTED';
      await this.subscribe(conn, true);
      onStateChange('CONNECTED', 'BIQUOTE SignalR connected · Live ticks', 'ok');
    } catch (e) {
      this.state = 'ERROR';
      const msg = e instanceof Error ? e.message : String(e);
      onStateChange('ERROR', `SignalR error (${msg})`, 'warn');
    } finally {
      this.isConnecting = false;
    }
  }

  async subscribe(conn: signalR.HubConnection | null = this.connection, force = false): Promise<void> {
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;
    const key = SUPPORTED_SYMBOLS.slice().sort().join(',');
    if (!force && this.subscribedSymbolsKey === key) return;
    try {
      await conn.invoke('Subscribe', SUPPORTED_SYMBOLS);
      this.subscribedSymbolsKey = key;
    } catch {
      // Ignore transient invoke error
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.stop();
      } catch {
        // Ignore stop errors
      }
      this.connection = null;
    }
    this.subscribedSymbolsKey = '';
    this.state = 'DISCONNECTED';
  }

  isSingleFlightGuarded(): boolean {
    return typeof this.subscribe === 'function' && typeof this.isConnecting === 'boolean';
  }
}
