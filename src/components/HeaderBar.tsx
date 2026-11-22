import React from 'react';
import { Bell, BellOff, Crown, FlaskConical, RefreshCw } from 'lucide-react';
import { TranslationBundle } from '../constants/market';
import { LanguageType, ProviderType } from '../types/trading';

interface HeaderBarProps {
  t: TranslationBundle;
  provider: ProviderType;
  onProviderChange: (p: ProviderType) => void;
  language: LanguageType;
  onLanguageChange: (l: LanguageType) => void;
  statusMessage: string;
  statusLevel: 'ok' | 'warn' | 'err';
  isRefreshing: boolean;
  onRefresh: () => void;
  alertEnabled: boolean;
  alertCountdown: string;
  onToggleAlert: () => void;
  onOpenQaModal: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  t,
  provider,
  onProviderChange,
  language,
  onLanguageChange,
  statusMessage,
  statusLevel,
  isRefreshing,
  onRefresh,
  alertEnabled,
  alertCountdown,
  onToggleAlert,
  onOpenQaModal,
}) => {
  const statusColor =
    statusLevel === 'ok' ? 'text-emerald-400' : statusLevel === 'err' ? 'text-red-400' : 'text-amber-400';
  const dotColor =
    statusLevel === 'ok' ? 'bg-emerald-400' : statusLevel === 'err' ? 'bg-red-400' : 'bg-amber-400';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0b1018]/95 backdrop-blur-md">
      {/* Top Bar: 3 clean zones */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3 sm:px-6">
        <a href="#overview" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950">
            <Crown className="h-4 w-4" />
          </span>
          <span className="text-base font-extrabold tracking-tight text-white">NETHAGA PRO</span>
        </a>

        <nav className="hidden items-center gap-6 text-xs font-semibold text-slate-400 md:flex">
          <a href="#overview" className="whitespace-nowrap shrink-0 transition-colors hover:text-white">
            Overview
          </a>
          <a href="#watchlists" className="whitespace-nowrap shrink-0 transition-colors hover:text-white">
            Watchlists
          </a>
          <a href="#risk" className="whitespace-nowrap shrink-0 transition-colors hover:text-white">
            Risk Advisor
          </a>
          <a href="#signal-desk" className="whitespace-nowrap shrink-0 transition-colors hover:text-white">
            Signal &amp; Chart
          </a>
          <a href="#walk-forward" className="whitespace-nowrap shrink-0 transition-colors hover:text-white">
            Validation
          </a>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenQaModal}
            className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span>{t.apiBtn}</span>
          </button>
        </div>
      </div>

      {/* Workspace Control Strip */}
      <div className="border-t border-slate-800/70 bg-[#090d14]/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <p className="hidden text-xs text-slate-400 lg:block">{t.subtitle}</p>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Provider Segmented Toggle */}
            <div
              role="group"
              aria-label="Data Provider"
              className="inline-flex rounded-lg border border-slate-800 bg-[#0d121c] p-0.5"
            >
              <button
                type="button"
                onClick={() => onProviderChange('BIQUOTE')}
                className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  provider === 'BIQUOTE' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                BIQUOTE
              </button>
              <button
                type="button"
                onClick={() => onProviderChange('EXNESS')}
                className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  provider === 'EXNESS' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EXNESS MT5
              </button>
            </div>

            {/* Live Connection Status */}
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#0d121c] px-2.5 py-1 text-[11px]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
              <span className={`font-mono-tabular max-w-[200px] truncate ${statusColor}`}>{statusMessage}</span>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-800 bg-[#0d121c] px-2.5 py-1 text-[11px] font-bold text-amber-400 transition-colors hover:border-amber-500/50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{t.refreshBtn}</span>
            </button>

            {/* 20m Audio Reminder */}
            <button
              type="button"
              onClick={onToggleAlert}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-800 bg-[#0d121c] px-2.5 py-1 text-[11px] font-bold text-slate-200 transition-colors hover:border-amber-500/50"
            >
              {alertEnabled ? (
                <Bell className="h-3 w-3 text-amber-400" />
              ) : (
                <BellOff className="h-3 w-3 text-slate-500" />
              )}
              <span>{alertEnabled ? t.alertOn : t.alertOff}</span>
              <span className="font-mono-tabular text-amber-400">{alertCountdown}</span>
            </button>

            {/* Language Switch */}
            <div role="group" aria-label="Language" className="inline-flex rounded-lg border border-slate-800 bg-[#0d121c] p-0.5">
              <button
                type="button"
                onClick={() => onLanguageChange('en')}
                className={`whitespace-nowrap shrink-0 rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                  language === 'en' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange('kh')}
                className={`whitespace-nowrap shrink-0 rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                  language === 'kh' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ខ្មែរ
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
