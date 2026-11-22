import React from 'react';
import { Copy, LockOpen } from 'lucide-react';
import { TF_PROFILES, TranslationBundle } from '../constants/market';
import { formatPrice } from '../engine/indicators';
import { FreshnessResult, ProviderType, QuoteData, ResolvedSymbolSpec, SignalResult, TimeframeType } from '../types/trading';

interface SignalCardProps {
  t: TranslationBundle;
  signal: SignalResult;
  activeSymbol: string;
  activeTF: TimeframeType;
  provider: ProviderType;
  quote: QuoteData | null;
  freshness: FreshnessResult;
  spec: ResolvedSymbolSpec;
  onUnlockSignal: () => void;
  onCopySignal: () => void;
}

export const SignalCard: React.FC<SignalCardProps> = ({
  t,
  signal,
  activeSymbol,
  activeTF,
  provider,
  quote,
  freshness,
  spec,
  onUnlockSignal,
  onCopySignal,
}) => {
  const sym = signal.asset || activeSymbol;
  const prof = TF_PROFILES[signal.tf || activeTF];
  const px = sym === 'XAUUSD' ? '$' : '';
  const rb = signal.state === 'READY' && signal.type === 'BUY';
  const rs = signal.state === 'READY' && signal.type === 'SELL';
  const wa = signal.state === 'WATCH';
  const nt = signal.state === 'NO TRADE';

  const cardBorder = rb
    ? 'border-emerald-500/60'
    : rs
      ? 'border-red-500/60'
      : wa
        ? 'border-blue-500/60'
        : nt
          ? 'border-red-500/35'
          : 'border-amber-500/50';

  const badgeClass = rb
    ? 'bg-emerald-500 text-slate-950 signal-badge-buy'
    : rs
      ? 'bg-red-500 text-white signal-badge-sell'
      : wa
        ? 'bg-blue-500 text-white'
        : nt
          ? 'bg-red-950/90 text-red-200 border border-red-700/70'
          : 'bg-amber-500 text-slate-950';

  const badgeLabel = rb ? 'READY · BUY' : rs ? 'READY · SELL' : signal.state;

  let livePnlText = 'Live P/L: —';
  let livePnlColor = 'text-slate-400';
  if (!quote || !freshness.fresh || signal.state !== 'READY' || signal.entry === null || !spec.verified || !spec.pipSize) {
    livePnlText = freshness.status !== 'LIVE' ? freshness.status : 'Live P/L: —';
  } else {
    const ex = signal.type === 'BUY' ? quote.bid : quote.ask;
    const mv = signal.type === 'BUY' ? ex - signal.entry : signal.entry - ex;
    const p = mv / spec.pipSize;
    livePnlText =
      sym === 'XAUUSD'
        ? `Live: ${mv >= 0 ? '+' : '-'}$${Math.abs(mv).toFixed(2)} (${p >= 0 ? '+' : ''}${p.toFixed(1)}p)`
        : `Live: ${p >= 0 ? '+' : ''}${p.toFixed(1)} pips`;
    livePnlColor = mv >= 0 ? 'text-emerald-400' : 'text-red-400';
  }

  const formatDistPips = (a: number | null, b: number | null, prefix: string) => {
    if (signal.state !== 'READY' || a === null || b === null || !spec.verified || !spec.pipSize) return signal.state;
    return `${prefix}${(Math.abs(a - b) / spec.pipSize).toFixed(1)}p`;
  };

  return (
    <div id="signal-desk" className={`rounded-xl border-2 bg-[#101622] p-4 ${cardBorder}`}>
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${badgeClass}`}>
              {badgeLabel}
            </span>
            {signal.locked && (
              <span className="font-mono-tabular text-[11px] font-bold text-blue-300">LOCKED · TRACKING</span>
            )}
            <span className="font-mono-tabular text-[11px] font-semibold text-amber-300">{signal.entryMode || signal.state}</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono-tabular text-[11px] text-slate-300">TF: {prof.label}</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono-tabular text-[11px] text-slate-400">{signal.source || provider}</span>
          </div>

          <h2 className="mt-2 flex flex-wrap items-baseline gap-2.5 text-xl font-extrabold text-white">
            <span>{sym}</span>
            <span className="font-mono-tabular text-xs font-normal text-slate-400">
              {signal.reason} ({signal.time})
            </span>
          </h2>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {signal.locked && (
              <button
                type="button"
                onClick={onUnlockSignal}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-red-700/70 bg-red-950/60 px-3 py-1.5 text-xs font-bold text-red-200 transition-colors hover:bg-red-900/70"
              >
                <LockOpen className="h-3.5 w-3.5" />
                <span>Close / Unlock</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCopySignal}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-amber-400 bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{t.copySignal}</span>
            </button>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold text-slate-400">{t.winrate}</div>
            <div className="font-mono-tabular text-lg font-extrabold text-amber-400">{signal.setupScore}%</div>
          </div>
        </div>
      </div>

      {/* Entry / TP1 / TP2 / TP3 / SL Grid */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
          <div className="text-[10px] font-bold text-slate-400">{t.entryPrice}</div>
          <div className="font-mono-tabular mt-1 text-sm font-extrabold text-white">
            {signal.entry !== null ? `${px}${formatPrice(signal.entry, sym)}` : '—'}
          </div>
          <div className={`font-mono-tabular mt-1 text-[10px] ${livePnlColor}`}>{livePnlText}</div>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-[#090d14] p-2.5">
          <div className="text-[10px] font-bold text-emerald-400">TP 1 ({signal.danger?.tp1R || 1.3}R · BE)</div>
          <div className="font-mono-tabular mt-1 text-sm font-extrabold text-emerald-400">
            {signal.tp1 !== null ? `${px}${formatPrice(signal.tp1, sym)}` : '—'}
          </div>
          <div className="font-mono-tabular mt-1 text-[10px] text-slate-400">{formatDistPips(signal.tp1, signal.entry, '+')}</div>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-[#090d14] p-2.5">
          <div className="text-[10px] font-bold text-emerald-400">TP 2 ({signal.danger?.tp2R || 2.2}R)</div>
          <div className="font-mono-tabular mt-1 text-sm font-extrabold text-emerald-400">
            {signal.tp2 !== null ? `${px}${formatPrice(signal.tp2, sym)}` : '—'}
          </div>
          <div className="font-mono-tabular mt-1 text-[10px] text-slate-400">{formatDistPips(signal.tp2, signal.entry, '+')}</div>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-[#090d14] p-2.5">
          <div className="text-[10px] font-bold text-emerald-400">TP 3 (Key Level)</div>
          <div className="font-mono-tabular mt-1 text-sm font-extrabold text-emerald-400">
            {signal.tp3 !== null ? `${px}${formatPrice(signal.tp3, sym)}` : '—'}
          </div>
          <div className="font-mono-tabular mt-1 text-[10px] text-slate-400">{formatDistPips(signal.tp3, signal.entry, '+')}</div>
        </div>

        <div className="rounded-lg border border-red-500/30 bg-[#090d14] p-2.5">
          <div className="text-[10px] font-bold text-red-400">STOP LOSS</div>
          <div className="font-mono-tabular mt-1 text-sm font-extrabold text-red-400">
            {signal.sl !== null ? `${px}${formatPrice(signal.sl, sym)}` : '—'}
          </div>
          <div className="font-mono-tabular mt-1 text-[10px] text-slate-400">{formatDistPips(signal.entry, signal.sl, '-')}</div>
        </div>
      </div>

      {/* Pending / Watch Trigger Box */}
      {signal.watchNote && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-200">
          <span className="font-mono-tabular">{signal.watchNote}</span>
          <span className="font-mono-tabular font-bold text-amber-400">Developing</span>
        </div>
      )}

      {/* Indicators Summary Line */}
      <div className="font-mono-tabular mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-[#090d14] px-3 py-2 text-[11px] text-slate-300">
        <span>
          Gross R:R:{' '}
          <strong>{signal.grossRR !== null ? `${signal.grossRR.toFixed(2)}R / ${signal.danger?.tp2R || 2.0}R` : '—'}</strong>
        </span>
        <span>
          Net R:R: <strong className="text-amber-400">{signal.netRR !== null ? `${signal.netRR.toFixed(2)}R` : '—'}</strong>
        </span>
        <span>
          EMA 20/50:{' '}
          <strong>
            {signal.ema20 !== null && signal.ema50 !== null
              ? `${formatPrice(signal.ema20, sym)} / ${formatPrice(signal.ema50, sym)}`
              : '—'}
          </strong>
        </span>
        <span>
          RSI(14): <strong>{signal.rsi14 !== null ? signal.rsi14.toFixed(1) : '—'}</strong>
        </span>
        <span>
          ATR(14): <strong>{signal.atr14 !== null ? `${px}${formatPrice(signal.atr14, sym)}` : '—'}</strong>
        </span>
      </div>

      {/* 3-Step Diagnostics */}
      <div className="font-mono-tabular mt-3 grid grid-cols-1 gap-2.5 text-[11px] md:grid-cols-3">
        <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
          <span className="block text-[10px] font-bold text-slate-400">1. DATA &amp; RISK ADVISORY</span>
          <strong className={nt ? 'text-red-400' : signal.diagVeto?.startsWith('Advisory') ? 'text-amber-400' : 'text-emerald-400'}>
            {signal.diagVeto || 'Clear'}
          </strong>
        </div>
        <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
          <span className="block text-[10px] font-bold text-slate-400">2. KEY LEVEL + REGIME</span>
          <strong className="text-amber-400">{signal.diagSetup || 'Scanning…'}</strong>
        </div>
        <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
          <span className="block text-[10px] font-bold text-slate-400">3. STRATEGY TRIGGER</span>
          <strong className="text-slate-200">{signal.diagTrigger || 'Checking…'}</strong>
        </div>
      </div>

      {/* 8-Rule Confluence Checklist */}
      {signal.rules.length > 0 && (
        <div className="font-mono-tabular mt-3 grid grid-cols-2 gap-2 text-[10px] md:grid-cols-4">
          {signal.rules.map((r) => (
            <div
              key={r.name}
              className={`flex items-center justify-between gap-2 rounded-lg border bg-[#090d14] px-2.5 py-1.5 ${
                r.pass ? 'border-emerald-500/35 text-emerald-400' : 'border-slate-800/80 text-slate-400'
              }`}
            >
              <span className="truncate">
                {r.pass ? '✓' : '·'} {r.name}
              </span>
              <span className="shrink-0">{r.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* ICT / Structure Footer Row */}
      <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-slate-800/70 pt-3 text-[11px] md:grid-cols-3">
        <div className="rounded-lg border border-amber-500/25 bg-[#090d14] p-2.5">
          <span className="block font-bold text-slate-400">Key Levels / FVG (Bonus)</span>
          <strong className="font-mono-tabular text-amber-400">{signal.fvg?.label || '—'}</strong>
        </div>
        <div className="rounded-lg border border-blue-500/25 bg-[#090d14] p-2.5">
          <span className="block font-bold text-slate-400">Structure / Liquidity Sweep</span>
          <strong className="font-mono-tabular text-emerald-400">{signal.structure?.label || '—'}</strong>
        </div>
        <div className="rounded-lg border border-purple-500/25 bg-[#090d14] p-2.5">
          <span className="block font-bold text-slate-400">OB / Breaker (Bonus)</span>
          <strong className="font-mono-tabular text-purple-300">
            {signal.ob?.label || '—'}
            {signal.breaker && signal.breaker.type !== 'NONE' ? ` | ${signal.breaker.label}` : ''}
          </strong>
        </div>
      </div>
    </div>
  );
};
