import React from 'react';
import { TF_PROFILES, TranslationBundle } from '../constants/market';
import { formatPrice } from '../engine/indicators';
import {
  ContractModeType,
  FreshnessResult,
  QuoteData,
  ResolvedSymbolSpec,
  SignalResult,
  TimeframeType,
} from '../types/trading';

interface MarketOverviewRowProps {
  t: TranslationBundle;
  activeSymbol: string;
  activeTF: TimeframeType;
  quote: QuoteData | null;
  priceTrend: 'up' | 'down' | 'neutral';
  freshness: FreshnessResult;
  spec: ResolvedSymbolSpec;
  contractMode: ContractModeType;
  signal: SignalResult;
  latencyMs: number;
  utcClock: string;
  sessions: { london: boolean; ny: boolean; tokyo: boolean; sydney: boolean };
}

export const MarketOverviewRow: React.FC<MarketOverviewRowProps> = ({
  t,
  activeSymbol,
  activeTF,
  quote,
  priceTrend,
  freshness,
  spec,
  contractMode,
  signal,
  latencyMs,
  utcClock,
  sessions,
}) => {
  const px = activeSymbol === 'XAUUSD' ? '$' : '';
  const prof = TF_PROFILES[activeTF];

  const statusTextClass =
    freshness.status === 'LIVE'
      ? 'text-emerald-400'
      : freshness.status === 'CLOSED'
        ? 'text-amber-400'
        : freshness.status === 'STALE'
          ? 'text-orange-400'
          : 'text-red-400';

  const priceColorClass =
    !quote || !freshness.available
      ? 'text-red-400'
      : priceTrend === 'up'
        ? 'text-emerald-400'
        : priceTrend === 'down'
          ? 'text-red-400'
          : 'text-amber-400';

  const dangerColorClass =
    signal.danger.pct >= 50 ? 'text-red-400' : signal.danger.pct >= 25 ? 'text-orange-400' : 'text-emerald-400';

  return (
    <section id="overview" className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* 1. Active Instrument */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#101622] p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-slate-400">{t.goldLabel}</div>
            <div className="mt-0.5 text-xl font-extrabold tracking-tight text-white">{activeSymbol}</div>
          </div>
          <span className={`font-mono-tabular text-xs font-bold ${statusTextClass}`}>{freshness.status}</span>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className={`font-mono-tabular text-2xl font-extrabold ${priceColorClass}`}>
            {quote && freshness.available ? `${px}${formatPrice(quote.mid, activeSymbol)}` : 'DATA UNAVAILABLE'}
          </span>
          <span className="font-mono-tabular text-xs font-semibold text-slate-300">
            {!quote || !freshness.available
              ? 'UNAVAILABLE'
              : quote.marketState === 'closed'
                ? 'CLOSED'
                : quote.dayDiffPercent === null
                  ? '—'
                  : `${quote.dayDiffPercent >= 0 ? '+' : ''}${quote.dayDiffPercent.toFixed(2)}%`}
          </span>
        </div>

        <div className="font-mono-tabular mt-3 space-y-1 border-t border-slate-800/70 pt-2.5 text-[11px] text-slate-400">
          <div className="flex justify-between">
            <span>
              Bid: <strong className="text-slate-200">{quote && freshness.available ? `${px}${formatPrice(quote.bid, activeSymbol)}` : '—'}</strong>
            </span>
            <span>
              Ask: <strong className="text-slate-200">{quote && freshness.available ? `${px}${formatPrice(quote.ask, activeSymbol)}` : '—'}</strong>
            </span>
          </div>
          <div className="flex justify-between">
            <span>
              Spread:{' '}
              <strong className="text-slate-200">
                {quote && freshness.available
                  ? `${px}${quote.spread.toFixed(spec.digits || 2)} (${spec.verified && spec.pipSize ? (quote.spread / spec.pipSize).toFixed(1) : '—'}p)`
                  : '—'}
              </strong>
            </span>
            <span>
              Age: <strong className="text-amber-400">{quote && freshness.available ? `${freshness.ageSeconds}s (${freshness.status})` : '—'}</strong>
            </span>
          </div>
          <div className="flex justify-between">
            <span>
              PDH: <strong className="text-emerald-400">{signal.keyLevels?.pdh ? `${px}${formatPrice(signal.keyLevels.pdh, activeSymbol)}` : '—'}</strong>
            </span>
            <span>
              PDL: <strong className="text-red-400">{signal.keyLevels?.pdl ? `${px}${formatPrice(signal.keyLevels.pdl, activeSymbol)}` : '—'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Market Quality & Danger Tier */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#101622] p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-bold text-amber-400">{t.profileTitle}</span>
          <span className={`font-mono-tabular text-[11px] font-bold ${dangerColorClass}`}>{signal.danger?.label || 'CLEAN'}</span>
        </div>

        <div className="font-mono-tabular my-3 space-y-1.5 text-[11px]">
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Regime</span>
            <strong className="text-amber-300">{signal.regime?.regime || '—'}</strong>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">ADX(14) / ATRx</span>
            <strong className="text-slate-200">
              {signal.regime?.adx ? `ADX ${signal.regime.adx.toFixed(1)} | ATRx ${signal.regime.atrRatio.toFixed(2)}` : '—'}
            </strong>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Adaptive Risk Plan</span>
            <strong className="text-emerald-400">
              {signal.danger ? `${(signal.danger.riskScale * 100).toFixed(0)}% Risk | TP ${signal.danger.tp1R}R/${signal.danger.tp2R}R` : '—'}
            </strong>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">HTF / D1 Bias</span>
            <strong className="text-slate-200">{signal.htfSummary || '—'}</strong>
          </div>
        </div>

        <div className="font-mono-tabular flex items-center justify-between border-t border-slate-800/70 pt-2.5 text-[10px] text-slate-400">
          <span className="truncate">
            {prof.label}: {prof.role}
          </span>
          <span className="shrink-0">
            Latency: <strong className="text-amber-400">{latencyMs.toFixed(1)} ms</strong>
          </span>
        </div>
      </div>

      {/* 3. Market Sessions (UTC) */}
      <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#101622] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-300">{t.marketSessions}</span>
          <span className="font-mono-tabular text-xs font-semibold text-amber-400">{utcClock}</span>
        </div>

        <div className="my-3 grid grid-cols-2 gap-2 text-xs">
          {[
            { name: 'London', open: sessions.london },
            { name: 'New York', open: sessions.ny },
            { name: 'Tokyo', open: sessions.tokyo },
            { name: 'Sydney', open: sessions.sydney },
          ].map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-[#0b1018] px-2.5 py-1.5"
            >
              <span className="text-slate-400">{s.name}</span>
              <span className={`font-mono-tabular text-[11px] font-bold ${s.open ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                {s.open ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
          ))}
        </div>

        <div className="font-mono-tabular flex items-center justify-between border-t border-slate-800/70 pt-2.5 text-[10px] text-slate-400">
          <span>
            Spec:{' '}
            <strong className={spec.verified ? 'text-emerald-400' : 'text-red-400'}>
              {spec.verified ? `${contractMode} · VERIFIED` : 'UNVERIFIED'}
            </strong>
          </span>
          <span>{quote && freshness.available ? `${quote.timestamp.slice(11, 19)}Z` : '—'}</span>
        </div>
      </div>
    </section>
  );
};
