import React from 'react';
import { TF_PROFILES } from '../constants/market';
import { FreshnessResult, TimeframeType, WalkForwardStats } from '../types/trading';

interface WalkForwardPanelProps {
  activeSymbol: string;
  activeTF: TimeframeType;
  stats: WalkForwardStats | null;
  latencyMs: number;
  freshness: FreshnessResult;
}

export const WalkForwardPanel: React.FC<WalkForwardPanelProps> = ({
  activeSymbol,
  activeTF,
  stats,
  latencyMs,
  freshness,
}) => {
  const prof = TF_PROFILES[activeTF];

  return (
    <section id="walk-forward" className="rounded-xl border border-amber-500/30 bg-[#101622] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono-tabular font-bold text-amber-400">ZERO-LOOKAHEAD WALK-FORWARD</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <strong className="text-slate-200">Multi-Strategy Validation (With Real Costs)</strong>
        </div>
        <span className="font-mono-tabular text-[11px] text-slate-400">
          Latency: {latencyMs.toFixed(0)}ms · Age: {Number.isFinite(freshness.ageSeconds) ? `${freshness.ageSeconds}s` : '—'}
        </span>
      </div>

      {!stats || stats.insufficient ? (
        <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-3 text-xs font-semibold text-amber-400">
          {stats?.reason || 'Insufficient data'}
        </div>
      ) : (
        <>
          <div className="font-mono-tabular grid grid-cols-2 gap-2.5 text-xs md:grid-cols-5">
            <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
              <span className="block text-[10px] text-slate-400">Trades / Win Rate</span>
              <strong className={(stats.winRate ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400'}>
                {stats.totalTrades} ({stats.winRate !== null && stats.winRate !== undefined ? `${stats.winRate.toFixed(1)}%` : 'N/A'})
              </strong>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
              <span className="block text-[10px] text-slate-400">Profit Factor</span>
              <strong className={(stats.profitFactor ?? 0) >= 1.2 ? 'text-emerald-400' : 'text-amber-400'}>
                {(stats.profitFactor ?? 0).toFixed(2)}
              </strong>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
              <span className="block text-[10px] text-slate-400">Net R:R / Expect.</span>
              <strong className={(stats.expectancyR ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {(stats.netRR ?? 0).toFixed(2)}R / {(stats.expectancyR ?? 0) >= 0 ? '+' : ''}
                {(stats.expectancyR ?? 0).toFixed(2)}R
              </strong>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
              <span className="block text-[10px] text-slate-400">Max DD / Streak</span>
              <strong className="text-red-400">
                -{(stats.maxDrawdownR ?? 0).toFixed(1)}R / {stats.maxLossStreak ?? 0}L
              </strong>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-[#090d14] p-2.5">
              <span className="block text-[10px] text-slate-400">Avg W/L / Skipped</span>
              <strong className="text-slate-200">
                +{(stats.avgWinR ?? 0).toFixed(2)}/-{(stats.avgLossR ?? 0).toFixed(2)} | {stats.skippedSetups ?? 0}
              </strong>
            </div>
          </div>

          <div className="font-mono-tabular mt-2.5 rounded-lg border border-slate-800/80 bg-[#090d14] px-3 py-2 text-[11px] text-slate-400">
            {activeSymbol} ({prof.label}) · {stats.wins}W/{stats.losses}L · Zero-lookahead S/R + PA + Liquidity + ICT validation, next-bar open execution, costs deducted, SL-first. Past stats do not guarantee future returns.
          </div>
        </>
      )}
    </section>
  );
};
