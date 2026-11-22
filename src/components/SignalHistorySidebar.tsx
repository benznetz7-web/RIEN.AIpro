import React, { useState } from 'react';
import { Compass, ListChecks } from 'lucide-react';
import { TranslationBundle } from '../constants/market';
import { SignalHistoryItem } from '../types/trading';

interface SignalHistorySidebarProps {
  t: TranslationBundle;
  history: SignalHistoryItem[];
  onClearHistory: () => void;
}

export const SignalHistorySidebar: React.FC<SignalHistorySidebarProps> = ({ t, history, onClearHistory }) => {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* Saved READY Signal History */}
      <div className="flex h-[480px] flex-col rounded-xl border border-slate-800/80 bg-[#101622] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <strong className="inline-flex items-center gap-2 text-xs font-bold text-slate-100">
            <ListChecks className="h-4 w-4 text-amber-400" />
            <span>{t.signalHistory}</span>
          </strong>
          {history.length > 0 && (
            <div className="flex items-center gap-1.5">
              {confirmClear ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClearHistory();
                      setConfirmClear(false);
                    }}
                    className="whitespace-nowrap shrink-0 rounded-md border border-red-600/70 bg-red-950/80 px-2 py-1 text-[10px] font-bold text-red-200 hover:bg-red-900/80"
                  >
                    Confirm Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="whitespace-nowrap shrink-0 rounded-md border border-slate-700 bg-[#090d14] px-2 py-1 text-[10px] font-bold text-slate-300"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="whitespace-nowrap shrink-0 rounded-md border border-slate-800 bg-[#090d14] px-2.5 py-1 text-[10px] font-bold text-slate-300 transition-colors hover:border-amber-500/50"
                >
                  Clear Log
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <div className="font-mono-tabular py-10 text-center text-[11px] text-slate-500">
              No saved READY setups yet.
            </div>
          ) : (
            history.map((it, idx) => {
              const isBuy = it.type === 'BUY';
              return (
                <div
                  key={`${it.asset}-${it.tf}-${it.time}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-[#090d14] px-3 py-2 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-white">{it.asset}</strong>
                      <span className="font-mono-tabular text-[10px] text-amber-400">{it.tf}</span>
                      <span className={`font-mono-tabular text-[10px] font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                        {it.type}
                      </span>
                    </div>
                    <div className="font-mono-tabular mt-1 truncate text-[10px] text-slate-400">
                      E: {it.entry} | TP1: {it.tp1} | SL: {it.sl}
                    </div>
                  </div>
                  <div className="font-mono-tabular shrink-0 text-right text-[10px]">
                    <div className="text-slate-500">
                      {it.date} {it.time}
                    </div>
                    <div className="text-amber-400">{it.status || 'READY'}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* How to Trade This Engine */}
      <div className="rounded-xl border border-amber-500/30 bg-[#101622] p-4">
        <div className="mb-2.5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-400">
          <Compass className="h-3.5 w-3.5" />
          <span>{t.traderTipTitle}</span>
        </div>
        <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-400">
          <li>{t.rule1}</li>
          <li>{t.rule2}</li>
          <li>{t.rule3}</li>
          <li>{t.rule4}</li>
        </ul>
      </div>
    </div>
  );
};
