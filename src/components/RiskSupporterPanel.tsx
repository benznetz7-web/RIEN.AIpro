import React from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { TranslationBundle } from '../constants/market';
import { ContractModeType, ResolvedSymbolSpec, RiskConfig, RiskLedger, SignalResult } from '../types/trading';

interface RiskSupporterPanelProps {
  t: TranslationBundle;
  riskConfig: RiskConfig;
  onRiskConfigChange: (next: RiskConfig) => void;
  riskLedger: RiskLedger;
  onToggleManualPosition: () => void;
  onRecordSimulatedLoss: () => void;
  onResetRiskPause: () => void;
  signal: SignalResult;
  spec: ResolvedSymbolSpec;
}

export const RiskSupporterPanel: React.FC<RiskSupporterPanelProps> = ({
  t,
  riskConfig,
  onRiskConfigChange,
  riskLedger,
  onToggleManualPosition,
  onRecordSimulatedLoss,
  onResetRiskPause,
  signal,
  spec,
}) => {
  const eq = Math.max(5, Number(riskConfig.balance || 80));
  const rp = Math.max(0.1, Math.min(5.0, Number(riskConfig.riskPct || 0.5)));
  const scale = signal.danger?.riskScale || 1;
  const bud = eq * (rp / 100) * scale;
  const rc = signal.riskCalc;

  const badgeText = !rc ? 'ADVISOR READY' : !rc.valid ? 'EXCEEDS BUDGET (ADVISORY)' : `SAFE (${(rc.lots || 0).toFixed(2)})`;
  const badgeColor = !rc || rc.valid ? 'text-emerald-400' : 'text-orange-400';

  return (
    <section id="risk" className="rounded-xl border border-amber-500/30 bg-[#101622] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-amber-400">
          <ShieldCheck className="h-4 w-4" />
          <span>{t.riskTitle}</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-mono-tabular text-[11px] font-bold ${badgeColor}`}>{badgeText}</span>
          <button
            type="button"
            onClick={onToggleManualPosition}
            className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md border border-emerald-600/60 bg-emerald-950/60 px-2.5 py-1 text-[11px] font-bold text-emerald-300 transition-colors hover:bg-emerald-900/60"
          >
            <Check className="h-3 w-3" />
            <span>{riskLedger.openPositions ? 'Close Entered (1/1)' : 'Confirm Entered (0/1)'}</span>
          </button>
          <button
            type="button"
            onClick={onRecordSimulatedLoss}
            className="whitespace-nowrap shrink-0 rounded-md border border-slate-700 bg-[#0b1018] px-2.5 py-1 text-[11px] font-bold text-slate-200 transition-colors hover:border-amber-500/50"
          >
            +1 Loss
          </button>
          <button
            type="button"
            onClick={onResetRiskPause}
            className="whitespace-nowrap shrink-0 rounded-md border border-amber-500/50 bg-[#0b1018] px-2.5 py-1 text-[11px] font-bold text-amber-400 transition-colors hover:bg-amber-500/10"
          >
            Reset Guard
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div>
          <label htmlFor="riskBalanceInput" className="mb-1 block text-[11px] text-slate-400">
            {t.lblBalance}
          </label>
          <input
            id="riskBalanceInput"
            type="number"
            min={5}
            step={5}
            value={riskConfig.balance}
            onChange={(e) => onRiskConfigChange({ ...riskConfig, balance: Math.max(5, Number(e.target.value) || 5) })}
            className="font-mono-tabular w-full rounded-lg border border-slate-800 bg-[#090d14] px-2.5 py-1.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="riskPercentInput" className="mb-1 block text-[11px] text-slate-400">
            {t.lblRiskPct}
          </label>
          <input
            id="riskPercentInput"
            type="number"
            min={0.1}
            max={5.0}
            step={0.05}
            value={riskConfig.riskPct}
            onChange={(e) =>
              onRiskConfigChange({
                ...riskConfig,
                riskPct: Math.max(0.1, Math.min(5.0, Number(e.target.value) || 0.5)),
              })
            }
            className="font-mono-tabular w-full rounded-lg border border-slate-800 bg-[#090d14] px-2.5 py-1.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="dailyLossLimitInput" className="mb-1 block text-[11px] text-slate-400">
            {t.lblDailyLimit}
          </label>
          <input
            id="dailyLossLimitInput"
            type="number"
            min={0.25}
            max={5.0}
            step={0.25}
            value={riskConfig.dailyCap}
            onChange={(e) =>
              onRiskConfigChange({
                ...riskConfig,
                dailyCap: Math.max(0.25, Math.min(5.0, Number(e.target.value) || 1.0)),
              })
            }
            className="font-mono-tabular w-full rounded-lg border border-slate-800 bg-[#090d14] px-2.5 py-1.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="accountContractSelect" className="mb-1 block text-[11px] text-slate-400">
            {t.lblContractMode}
          </label>
          <select
            id="accountContractSelect"
            value={riskConfig.contractMode}
            onChange={(e) => onRiskConfigChange({ ...riskConfig, contractMode: e.target.value as ContractModeType })}
            className="font-mono-tabular w-full rounded-lg border border-slate-800 bg-[#090d14] px-2.5 py-1.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
          >
            <option value="STANDARD">Standard (0.01 = 1x)</option>
            <option value="CENT">Cent / Micro (0.01 = 0.01x)</option>
          </select>
        </div>
        <div>
          <label htmlFor="commissionPerLotInput" className="mb-1 block text-[11px] text-slate-400">
            {t.lblCommission}
          </label>
          <input
            id="commissionPerLotInput"
            type="number"
            min={0}
            max={30}
            step={0.5}
            value={riskConfig.commission}
            onChange={(e) => onRiskConfigChange({ ...riskConfig, commission: Math.max(0, Number(e.target.value) || 0) })}
            className="font-mono-tabular w-full rounded-lg border border-slate-800 bg-[#090d14] px-2.5 py-1.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="font-mono-tabular mt-3 grid grid-cols-2 gap-3 border-t border-slate-800/70 pt-3 text-xs md:grid-cols-5">
        <div>
          <span className="block text-[10px] text-slate-400">Adaptive Lot Size</span>
          <strong className="text-amber-400">
            {!rc
              ? `Budget $${bud.toFixed(2)}`
              : !rc.valid
                ? `${(rc.lots || 0).toFixed(2)} (WARN)`
                : `${(rc.lots || 0).toFixed(2)} lots (${(scale * 100).toFixed(0)}%)`}
          </strong>
        </div>
        <div>
          <span className="block text-[10px] text-slate-400">Budget / Min Lot Risk</span>
          <strong className={!rc || !rc.valid ? 'text-red-400' : 'text-slate-200'}>
            {!rc
              ? `Min ${spec.volumeMin || 0.01} lot`
              : !rc.valid
                ? `Min $${(rc.minLotRiskUsd || 0).toFixed(2)} > $${bud.toFixed(2)}`
                : `$${(rc.actualRiskUsd || 0).toFixed(2)} / $${bud.toFixed(2)}`}
          </strong>
        </div>
        <div>
          <span className="block text-[10px] text-slate-400">Daily Loss / Streak</span>
          <strong className="text-slate-200">
            {riskLedger.dailyLossPct.toFixed(2)}% / {riskLedger.consecutiveLosses}L
          </strong>
        </div>
        <div>
          <span className="block text-[10px] text-slate-400">Tracked Positions</span>
          <strong className="text-slate-200">{riskLedger.openPositions} / 1</strong>
        </div>
        <div>
          <span className="block text-[10px] text-slate-400">Symbol Spec</span>
          <strong className={spec.verified ? 'text-emerald-400' : 'text-red-400'}>
            {spec.verified && spec.tickValueUsd ? `Tick $${spec.tickValueUsd.toFixed(4)} | Min ${spec.volumeMin}` : 'UNVERIFIED'}
          </strong>
        </div>
      </div>
    </section>
  );
};
