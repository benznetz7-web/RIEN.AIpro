import React from 'react';
import { Clock, Layers } from 'lucide-react';
import { TIMEFRAMES, TranslationBundle } from '../constants/market';
import { formatPrice } from '../engine/indicators';
import { SignalResult, TimeframeType } from '../types/trading';

interface TimeframeAndKeyMapProps {
  t: TranslationBundle;
  activeSymbol: string;
  activeTF: TimeframeType;
  onChangeTF: (tf: TimeframeType) => void;
  candleCountdown: string;
  signal: SignalResult;
}

export const TimeframeAndKeyMap: React.FC<TimeframeAndKeyMapProps> = ({
  t,
  activeSymbol,
  activeTF,
  onChangeTF,
  candleCountdown,
  signal,
}) => {
  const kl = signal.keyLevels;
  const px = activeSymbol === 'XAUUSD' ? '$' : '';
  const r1p = kl.r1 ? `${px}${formatPrice(kl.r1.price, activeSymbol)}` : 'R1';
  const r2p = kl.r2 ? `${px}${formatPrice(kl.r2.price, activeSymbol)}` : 'R2';
  const s1p = kl.s1 ? `${px}${formatPrice(kl.s1.price, activeSymbol)}` : 'S1';
  const s2p = kl.s2 ? `${px}${formatPrice(kl.s2.price, activeSymbol)}` : 'S2';

  return (
    <>
      {/* Timeframe Bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-[#101622] px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            <span>{t.selectTF}:</span>
          </span>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onChangeTF(tf)}
              className={`font-mono-tabular whitespace-nowrap shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                activeTF === tf
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                  : 'border-slate-800 bg-[#090d14] text-slate-300 hover:border-amber-500/50'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-[#090d14] px-3 py-1.5">
          <div className="text-right">
            <div className="text-[10px] font-bold text-slate-400">{t.candleClose}</div>
            <div className="text-[11px] font-medium text-amber-400">{t.signalRule}</div>
          </div>
          <div className="font-mono-tabular rounded-md border border-slate-800 bg-[#101622] px-2.5 py-1 text-base font-extrabold text-amber-400">
            {candleCountdown}
          </div>
        </div>
      </section>

      {/* Pre-Market Key-Level Map */}
      <section className="rounded-xl border border-blue-500/30 bg-[#101622] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-bold text-blue-400">
            <Layers className="h-3.5 w-3.5" />
            <span>{t.matrixTitle}</span>
          </span>
          <span className="font-mono-tabular text-[11px] text-slate-400">
            {kl.all?.length || 0} clustered levels mapped ({activeTF})
          </span>
        </div>

        <div className="font-mono-tabular grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          {[
            { lbl: 'R2 (Next Res)', val: kl.r2, color: 'text-red-400' },
            { lbl: 'R1 (Near Res)', val: kl.r1, color: 'text-red-400' },
            { lbl: 'S1 (Near Sup)', val: kl.s1, color: 'text-emerald-400' },
            { lbl: 'S2 (Next Sup)', val: kl.s2, color: 'text-emerald-400' },
          ].map((item) => (
            <div key={item.lbl} className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
              <span className="block text-[10px] text-slate-400">{item.lbl}</span>
              <strong className={`text-sm font-bold ${item.color}`}>
                {item.val ? `${px}${formatPrice(item.val.price, activeSymbol)}` : '—'}
              </strong>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {item.val ? `${item.val.touches}x · ${item.val.tags}` : 'No cluster'}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 text-xs lg:grid-cols-2">
          <div className="rounded-lg border border-red-500/25 bg-[#090d14] p-2.5">
            <strong className="text-red-400">SCENARIO A (UP → R1 Resistance):</strong>
            <div className="font-mono-tabular mt-1 text-[11px] text-slate-400">
              Reject/Pin at {r1p} → SELL to {s1p} | Break &amp; Retest above {r1p} → BUY to {r2p}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-500/25 bg-[#090d14] p-2.5">
            <strong className="text-emerald-400">SCENARIO B (DOWN → S1 Support):</strong>
            <div className="font-mono-tabular mt-1 text-[11px] text-slate-400">
              Bounce/Pin at {s1p} → BUY to {r1p} | Break &amp; Retest below {s1p} → SELL to {s2p}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
