import React from 'react';
import { SYMBOL_SPECS, TF_PROFILES, TranslationBundle } from '../constants/market';
import { calculateEMASeries, formatPrice } from '../engine/indicators';
import { CandleBar, ChartLayers, FreshnessResult, ProviderType, QuoteData, SignalResult, TimeframeType } from '../types/trading';

interface KeyLevelChartProps {
  t: TranslationBundle;
  activeSymbol: string;
  activeTF: TimeframeType;
  provider: ProviderType;
  closedBars: CandleBar[];
  formingBar: CandleBar | null;
  chartError: string | null;
  quote: QuoteData | null;
  freshness: FreshnessResult;
  signal: SignalResult;
  layers: ChartLayers;
  onToggleLayer: (k: keyof ChartLayers) => void;
}

export const KeyLevelChart: React.FC<KeyLevelChartProps> = ({
  t,
  activeSymbol,
  activeTF,
  provider,
  closedBars,
  formingBar,
  chartError,
  quote,
  freshness,
  signal,
  layers,
  onToggleLayer,
}) => {
  const prof = TF_PROFILES[activeTF];
  const sIdx = Math.max(0, closedBars.length - 42);
  const disp = closedBars.slice(sIdx);
  const allV = formingBar ? [...disp, formingBar] : disp;
  const hasBars = allV.length > 0;

  let lo = 0;
  let hi = 1;
  if (hasBars) {
    const lvls: number[] = allV.flatMap((x) => [x.high, x.low]);
    if (quote && Number.isFinite(quote.mid)) lvls.push(quote.mid);
    if (layers.sr) {
      if (signal.keyLevels.r1) lvls.push(signal.keyLevels.r1.price);
      if (signal.keyLevels.s1) lvls.push(signal.keyLevels.s1.price);
    }
    if (signal.state === 'READY') {
      [signal.entry, signal.tp1, signal.tp2, signal.sl].forEach((v) => {
        if (v !== null && Number.isFinite(v)) lvls.push(v);
      });
    }
    const vL = lvls.filter(Number.isFinite);
    const mn = Math.min(...vL);
    const mx = Math.max(...vL);
    const pad = Math.max((mx - mn) * 0.08, (SYMBOL_SPECS[activeSymbol]?.pipSize || 0.01) * 5);
    lo = mn - pad;
    hi = mx + pad;
  }

  const y = (p: number) => 228 - ((p - lo) / (hi - lo || 1)) * 216;
  const sp = hasBars ? 600 / allV.length : 10;
  const bw = Math.max(3, Math.min(12, sp * 0.62));

  const closes = closedBars.map((x) => x.close);
  const e20 = disp.length ? calculateEMASeries(closes, 20).slice(-disp.length) : [];
  const e50 = disp.length ? calculateEMASeries(closes, 50).slice(-disp.length) : [];
  const buildPath = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * sp + sp / 2).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const hLines: Array<{ price: number; color: string; label: string; dash: string }> = [];
  if (hasBars) {
    const kl = signal.keyLevels;
    if (layers.sr) {
      if (kl.r2) hLines.push({ price: kl.r2.price, color: '#f87171', label: `R2 ${formatPrice(kl.r2.price, activeSymbol)} (${kl.r2.touches}x)`, dash: '5 3' });
      if (kl.r1) hLines.push({ price: kl.r1.price, color: '#ef4444', label: `R1 ${formatPrice(kl.r1.price, activeSymbol)} (${kl.r1.touches}x)`, dash: '5 3' });
      if (kl.s1) hLines.push({ price: kl.s1.price, color: '#10b981', label: `S1 ${formatPrice(kl.s1.price, activeSymbol)} (${kl.s1.touches}x)`, dash: '5 3' });
      if (kl.s2) hLines.push({ price: kl.s2.price, color: '#34d399', label: `S2 ${formatPrice(kl.s2.price, activeSymbol)} (${kl.s2.touches}x)`, dash: '5 3' });
    }
    if (layers.liq) {
      if (kl.pdh) hLines.push({ price: kl.pdh, color: '#22d3ee', label: `PDH ${formatPrice(kl.pdh, activeSymbol)}`, dash: '2 3' });
      if (kl.pdl) hLines.push({ price: kl.pdl, color: '#22d3ee', label: `PDL ${formatPrice(kl.pdl, activeSymbol)}`, dash: '2 3' });
      if (kl.eqHigh) hLines.push({ price: kl.eqHigh, color: '#fbbf24', label: `EQH LIQ ${formatPrice(kl.eqHigh, activeSymbol)}`, dash: '2 2' });
      if (kl.eqLow) hLines.push({ price: kl.eqLow, color: '#fbbf24', label: `EQL LIQ ${formatPrice(kl.eqLow, activeSymbol)}`, dash: '2 2' });
    }
  }

  const ictZones: Array<{ top: number; bottom: number; ci: number; color: string; label: string }> = [];
  if (hasBars && layers.ict) {
    if (signal.fvg?.latestBull) {
      ictZones.push({ top: signal.fvg.latestBull.top, bottom: signal.fvg.latestBull.bottom, ci: signal.fvg.latestBull.index, color: '#10b981', label: 'BULL FVG' });
    }
    if (signal.fvg?.latestBear) {
      ictZones.push({ top: signal.fvg.latestBear.top, bottom: signal.fvg.latestBear.bottom, ci: signal.fvg.latestBear.index, color: '#ef4444', label: 'BEAR FVG' });
    }
    if (signal.ob && signal.ob.type !== 'NONE' && signal.ob.high) {
      ictZones.push({ top: signal.ob.high, bottom: signal.ob.low, ci: signal.ob.index, color: '#a855f7', label: 'OB' });
    }
    if (signal.breaker && signal.breaker.type !== 'NONE' && signal.breaker.high) {
      ictZones.push({ top: signal.breaker.high, bottom: signal.breaker.low, ci: signal.breaker.index, color: '#3b82f6', label: 'BREAKER' });
    }
  }

  const showSignalLines = hasBars && signal.state === 'READY' && signal.entry !== null;
  const liveRef = hasBars ? (quote?.mid ?? allV[allV.length - 1].close) : null;

  const renderPriceMarker = (
    price: number | null,
    lineColor: string,
    boxBg: string,
    textColor: string,
    dash?: string,
    strokeWidth = 1.5,
  ) => {
    if (price === null || !Number.isFinite(price)) return null;
    const yy = y(price);
    return (
      <>
        <line x1={0} y1={yy} x2={600} y2={yy} stroke={lineColor} strokeWidth={strokeWidth} strokeDasharray={dash} />
        <rect x={602} y={yy - 7.5} width={56} height={15} fill={boxBg} rx={2} />
        <text x={605} y={yy + 3} fill={textColor} fontSize={8.5} fontWeight="bold" fontFamily="monospace">
          {formatPrice(price, activeSymbol)}
        </text>
      </>
    );
  };

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#0b0e14] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono-tabular font-bold text-amber-400">
            {activeSymbol} · {prof.label}
          </span>
          <strong className="text-slate-200">{t.chartTitle}</strong>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['sr', 'S/R Levels'],
              ['liq', 'PDH/PDL/EQ'],
              ['ict', 'FVG/OB'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onToggleLayer(key)}
              className={`whitespace-nowrap shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
                layers[key]
                  ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                  : 'border-slate-800 bg-[#090d14] text-slate-400 hover:border-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="font-mono-tabular inline-flex items-center gap-1.5 text-[11px] font-bold">
            <span className={`h-2 w-2 rounded-full ${hasBars ? (freshness.fresh ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-red-400'}`} />
            <span className={hasBars ? (freshness.fresh ? 'text-emerald-400' : 'text-amber-400') : 'text-red-400'}>
              {hasBars ? `${provider} · ${freshness.status}` : 'UNAVAILABLE'}
            </span>
          </span>
        </div>
      </div>

      <div className="relative h-[260px] w-full overflow-hidden rounded-lg border border-slate-800 bg-[#080b10] sm:h-[320px]">
        <svg className="block h-full w-full" viewBox="0 0 660 240" preserveAspectRatio="none">
          {/* Grid Lines */}
          {[40, 80, 120, 160, 200].map((gy) => (
            <line key={gy} x1={0} y1={gy} x2={600} y2={gy} stroke="#161b26" />
          ))}
          {[150, 300, 450].map((gx) => (
            <line key={gx} x1={gx} y1={0} x2={gx} y2={240} stroke="#161b26" />
          ))}
          <line x1={600} y1={0} x2={600} y2={240} stroke="#1f2937" strokeWidth={1.5} />

          {/* ICT Zones */}
          {ictZones.map((z, idx) => {
            const ri = Math.max(0, (z.ci >= 0 ? z.ci : sIdx) - sIdx);
            const sx = Math.min(540, Math.max(0, ri * sp));
            const w = Math.max(40, 600 - sx);
            const yt = Math.min(y(z.top), y(z.bottom));
            const h = Math.max(5, Math.abs(y(z.top) - y(z.bottom)));
            return (
              <g key={`${z.label}-${idx}`}>
                <rect
                  x={sx}
                  y={yt}
                  width={w}
                  height={h}
                  fill={z.color}
                  fillOpacity={0.12}
                  stroke={z.color}
                  strokeDasharray="3 2"
                />
                <text x={sx + 4} y={Math.max(12, yt + 10)} fill={z.color} fontSize={8} fontFamily="monospace">
                  {z.label}
                </text>
              </g>
            );
          })}

          {/* Key Levels & Liquidity Lines */}
          {hLines
            .filter((hl) => Number.isFinite(hl.price) && hl.price >= lo && hl.price <= hi)
            .map((hl, idx) => {
              const yy = y(hl.price);
              return (
                <g key={`${hl.label}-${idx}`}>
                  <line x1={0} x2={600} y1={yy} y2={yy} stroke={hl.color} strokeWidth={1.1} strokeDasharray={hl.dash} opacity={0.75} />
                  <text x={6} y={yy - 3} fill={hl.color} fontSize={8.5} fontFamily="monospace">
                    {hl.label}
                  </text>
                </g>
              );
            })}

          {/* Candles */}
          {allV.map((b, i) => {
            const x = i * sp + sp / 2;
            const up = b.close >= b.open;
            const col = up ? '#10b981' : '#ef4444';
            const topBody = Math.min(y(b.open), y(b.close));
            const bodyH = Math.max(2, Math.abs(y(b.open) - y(b.close)));
            return (
              <g key={`${b.timeMs}-${i}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={y(b.high)}
                  y2={y(b.low)}
                  stroke={col}
                  strokeWidth={b.isOpen ? 1 : 1.4}
                  strokeDasharray={b.isOpen ? '2 2' : undefined}
                />
                <rect
                  x={x - bw / 2}
                  y={topBody}
                  width={bw}
                  height={bodyH}
                  fill={col}
                  fillOpacity={b.isOpen ? 0.35 : 1}
                  stroke={b.isOpen ? '#f59e0b' : undefined}
                  strokeDasharray={b.isOpen ? '2 1' : undefined}
                />
              </g>
            );
          })}

          {/* EMA Lines */}
          {e20.length > 0 && <path d={buildPath(e20)} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.85} />}
          {e50.length > 0 && (
            <path d={buildPath(e50)} fill="none" stroke="#3b82f6" strokeWidth={1.3} strokeDasharray="3 2" opacity={0.75} />
          )}

          {/* Signal Lines */}
          {showSignalLines && renderPriceMarker(signal.tp2, '#10b981', '#065f46', '#34d399', '4 3')}
          {showSignalLines && renderPriceMarker(signal.tp1, '#34d399', '#064e3b', '#6ee7b7', '4 3')}
          {showSignalLines && renderPriceMarker(signal.entry, '#3b82f6', '#1d4ed8', '#ffffff', undefined, 2)}
          {showSignalLines && renderPriceMarker(signal.sl, '#ef4444', '#7f1d1d', '#fca5a5', '4 3')}
          {liveRef !== null && renderPriceMarker(liveRef, '#f59e0b', '#d97706', '#000000', '2 2', 1)}
        </svg>

        {!hasBars && (
          <div className="font-mono-tabular absolute inset-0 flex items-center justify-center bg-[#080b10]/85 p-4 text-center text-xs font-bold text-red-400">
            {chartError ? `DATA UNAVAILABLE — ${chartError}` : 'DATA UNAVAILABLE'}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>R1/R2 (Red) · S1/S2 (Green) · PDH/PDL/EQ (Cyan/Amber) · FVG/OB (Shaded)</span>
        <span>— EMA 20 · -- EMA 50</span>
      </div>
    </div>
  );
};
