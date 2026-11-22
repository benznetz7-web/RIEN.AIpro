import React from 'react';
import { Coins, Globe } from 'lucide-react';
import { SUPPORTED_SYMBOLS, SYMBOL_SPECS, TranslationBundle } from '../constants/market';
import { formatPrice } from '../engine/indicators';
import { evaluateQuoteFreshness, QuotesStore } from '../engine/strategy';
import { ProviderType, TimeframeType } from '../types/trading';

interface WatchlistsSectionProps {
  t: TranslationBundle;
  activeSymbol: string;
  activeTF: TimeframeType;
  provider: ProviderType;
  quotesStore: QuotesStore;
  onSelectSymbol: (sym: string) => void;
  tickVersion: number;
}

export const WatchlistsSection: React.FC<WatchlistsSectionProps> = ({
  t,
  activeSymbol,
  activeTF,
  provider,
  quotesStore,
  onSelectSymbol,
}) => {
  const goldSymbols = SUPPORTED_SYMBOLS.filter((s) => SYMBOL_SPECS[s].group === 'GOLD');
  const fxSymbols = SUPPORTED_SYMBOLS.filter((s) => SYMBOL_SPECS[s].group === 'FX');

  const goldAvail = goldSymbols.filter((s) => evaluateQuoteFreshness(quotesStore, s, activeTF, provider).available).length;
  const fxAvail = fxSymbols.filter((s) => evaluateQuoteFreshness(quotesStore, s, activeTF, provider).available).length;

  const renderCard = (sym: string) => {
    const q = quotesStore[provider]?.[sym] || null;
    const f = evaluateQuoteFreshness(quotesStore, sym, activeTF, provider);
    const isSelected = sym === activeSymbol;
    const px = sym === 'XAUUSD' ? '$' : '';

    const statusClass =
      f.status === 'LIVE'
        ? 'text-emerald-400'
        : f.status === 'CLOSED'
          ? 'text-amber-400'
          : f.status === 'STALE'
            ? 'text-orange-400'
            : 'text-red-400';

    return (
      <button
        key={sym}
        type="button"
        onClick={() => onSelectSymbol(sym)}
        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
          isSelected
            ? 'border-amber-500/80 bg-amber-500/10'
            : 'border-slate-800/80 bg-[#0b1018] hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <strong className="font-mono-tabular text-xs font-bold text-white">{sym}</strong>
          <span className={`font-mono-tabular text-[10px] font-bold ${statusClass}`}>{f.status}</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <strong className={`font-mono-tabular text-sm font-bold ${q && f.available ? 'text-amber-400' : 'text-red-400'}`}>
            {q && f.available ? `${px}${formatPrice(q.mid, sym)}` : 'UNAVAILABLE'}
          </strong>
          <span className="font-mono-tabular text-[10px] text-slate-400">{q && f.available ? `${f.ageSeconds}s` : '—'}</span>
        </div>
        <div className="font-mono-tabular mt-1 text-[10px] text-slate-500">
          {q && f.available ? `B: ${formatPrice(q.bid, sym)} | A: ${formatPrice(q.ask, sym)}` : 'No quote'}
        </div>
      </button>
    );
  };

  return (
    <section id="watchlists" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-xl border border-slate-800/80 bg-[#101622] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
            <Coins className="h-3.5 w-3.5" />
            <span>{t.goldWatchlist}</span>
          </span>
          <span className="font-mono-tabular text-[11px] text-slate-400">{goldAvail}/1 Quotes</span>
        </div>
        <div className="space-y-2">{goldSymbols.map(renderCard)}</div>
      </div>

      <div className="rounded-xl border border-slate-800/80 bg-[#101622] p-4 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
            <Globe className="h-3.5 w-3.5" />
            <span>{t.forexWatchlist}</span>
          </span>
          <span className="font-mono-tabular text-[11px] text-slate-400">{fxAvail}/7 Quotes</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{fxSymbols.map(renderCard)}</div>
      </div>
    </section>
  );
};
