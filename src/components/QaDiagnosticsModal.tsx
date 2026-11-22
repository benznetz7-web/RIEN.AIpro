import React from 'react';
import { FlaskConical, X } from 'lucide-react';
import { APP_VERSION, RELEASE_DATE, TranslationBundle } from '../constants/market';
import { QaLogEntry, SignalRStateType } from '../types/trading';

interface QaDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TranslationBundle;
  logs: QaLogEntry[];
  isRunning: boolean;
  onRunQaSuite: () => void;
  signalRState: SignalRStateType;
}

export const QaDiagnosticsModal: React.FC<QaDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  t,
  logs,
  isRunning,
  onRunQaSuite,
  signalRState,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qa-modal-title"
    >
      <div className="relative max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-800 bg-[#101622] p-5 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close diagnostics"
          className="absolute right-3.5 top-3.5 rounded-lg border border-slate-800 bg-[#090d14] p-1.5 text-slate-400 transition-colors hover:border-amber-500/60 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 id="qa-modal-title" className="flex items-center gap-2 pr-8 text-base font-bold text-white">
          <FlaskConical className="h-4 w-4 text-amber-400" />
          <span>{t.modalTitle}</span>
        </h3>
        <p className="mt-1.5 text-xs text-slate-400">{t.modalDesc}</p>

        <div className="font-mono-tabular mt-3 space-y-1 rounded-lg border border-slate-800 bg-[#090d14] p-3 text-[11px]">
          <div className="font-bold text-amber-400">
            Version: {APP_VERSION} | Date: {RELEASE_DATE} | SignalR: {signalRState}
          </div>
          <div className="text-slate-400">
            BIQUOTE: /api/&#123;active,latest,&#123;sym&#125;/ohlc&#125; &amp; /hubs/tick | W1 aggregated from 1d closed bars
          </div>
          <div className="text-slate-400">
            EXNESS MT5 Bridge: /api/quote &amp; /api/candles (explicit broker timestamp required)
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-800 bg-[#090d14] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="font-mono-tabular text-xs text-amber-400">20-Test QA Suite + Live Checks</strong>
            <button
              type="button"
              onClick={onRunQaSuite}
              disabled={isRunning}
              className="whitespace-nowrap shrink-0 rounded-lg border border-amber-400 bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-60"
            >
              {isRunning ? 'Running…' : 'Run Full QA Suite'}
            </button>
          </div>

          <div className="font-mono-tabular max-h-[280px] space-y-1 overflow-y-auto rounded-lg border border-slate-800/80 bg-[#06090f] p-2.5 text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-slate-400">
                Click &quot;Run Full QA Suite&quot; to run all 20 unit assertions and live BIQUOTE checks.
              </div>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className={
                    entry.status === 'pass'
                      ? 'text-emerald-400'
                      : entry.status === 'fail'
                        ? 'text-red-400'
                        : 'text-amber-300'
                  }
                >
                  {entry.text}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap shrink-0 rounded-lg border border-amber-400 bg-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
