export type ProviderType = 'BIQUOTE' | 'EXNESS';
export type TimeframeType = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1';
export type LanguageType = 'en' | 'kh';
export type ContractModeType = 'STANDARD' | 'CENT';
export type SignalStateType = 'READY' | 'WATCH' | 'WAIT' | 'NO TRADE';
export type SignalDirectionType = 'BUY' | 'SELL' | 'WAIT';
export type FreshnessStatusType = 'LIVE' | 'CLOSED' | 'STALE' | 'UNAVAILABLE';
export type SignalRStateType = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR' | 'UNAVAILABLE';

export interface BaseSymbolSpec {
  group: 'GOLD' | 'FX';
  label: string;
  digits: number;
  pointSize: number;
  pipSize: number;
  tickSize: number;
  contractSize: number;
  quoteCcy: string;
  volumeMin: number;
  volumeStep: number;
  slippagePoints: number;
  roundStep: number;
  verified: boolean;
  tickValueUsd?: number;
}

export interface ResolvedSymbolSpec extends Partial<BaseSymbolSpec> {
  verified: boolean;
  reason?: string;
  contractMultiplier?: number;
  effectiveContractSize?: number;
  tickValueUsd?: number;
  commissionPerLotUsd?: number;
}

export interface TimeframeProfile {
  biquote: string;
  seconds: number;
  label: TimeframeType;
  role: string;
  htf: TimeframeType;
  cooldownBars: number;
  maxSpreadRatioAtr: number;
  bosLookback: number;
}

export interface QuoteData {
  symbol: string;
  provider: ProviderType;
  source: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  high: number | null;
  low: number | null;
  dayDiffPercent: number | null;
  timestamp: string;
  providerTsMs: number;
  localReceiptMs: number;
  serverQuoteAgeSeconds: number | null;
  marketState: string;
  staleFlag: boolean;
  digits: number;
}

export interface FreshnessResult {
  available: boolean;
  fresh: boolean;
  status: FreshnessStatusType;
  ageSeconds: number;
  limitSec: number;
  label: string;
}

export interface CandleBar {
  timeMs: number;
  openTime?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  isOpen: boolean;
}

export interface CandleSeries {
  closedBars: CandleBar[];
  formingBar: CandleBar | null;
  fetchedAt: number;
}

export interface SwingPoint {
  index: number;
  price: number;
  plateauBars: number;
}

export interface KeyLevelItem {
  price: number;
  touches: number;
  weight: number;
  tags: string;
}

export interface KeyLevelClusterRaw {
  price: number;
  touches: number;
  weight: number;
  tags: Set<string>;
}

export interface KeyLevelsResult {
  r1: KeyLevelItem | null;
  r2: KeyLevelItem | null;
  s1: KeyLevelItem | null;
  s2: KeyLevelItem | null;
  pdh: number | null;
  pdl: number | null;
  eqHigh?: number | null;
  eqLow?: number | null;
  all: KeyLevelClusterRaw[];
}

export interface RegimeResult {
  regime: string;
  adx: number;
  atrRatio: number;
  er: number;
  label: string;
}

export interface DangerResult {
  tier: string;
  pct: number;
  riskScale: number;
  tp1R: number;
  tp2R: number;
  label: string;
}

export interface MarketStructure {
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  kind: string;
  swingSequence?: string;
  swingHigh?: number | null;
  swingLow?: number | null;
  eqHigh: number | null;
  eqLow: number | null;
  sweep: { type: 'BULLISH' | 'BEARISH'; level: number; label: string } | null;
  inPullback?: boolean;
  label: string;
}

export interface OrderBlock {
  type: 'BULLISH' | 'BEARISH' | 'NONE';
  high: number;
  low: number;
  index: number;
  retested?: boolean;
  label: string;
}

export interface BreakerBlock {
  type: 'BULLISH' | 'BEARISH' | 'NONE';
  high: number;
  low: number;
  index: number;
  label: string;
}

export interface FvgZone {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  index: number;
  mitigated: boolean;
  invalidated: boolean;
}

export interface FvgAnalysis {
  validBull: FvgZone[];
  validBear: FvgZone[];
  latestBull: FvgZone | null;
  latestBear: FvgZone | null;
  retestedBullFvg?: boolean;
  retestedBearFvg?: boolean;
  label: string;
}

export interface RiskCalcResult {
  valid: boolean;
  minLotExceeds?: boolean;
  riskBudgetUsd?: number;
  minLotRiskUsd?: number;
  lots?: number;
  actualRiskUsd?: number;
  costInPrice?: number;
  reason: string;
}

export interface ConfluenceRule {
  name: string;
  pass: boolean;
  detail: string;
}

export interface SignalResult {
  asset: string;
  tf: TimeframeType;
  source: ProviderType;
  state: SignalStateType;
  type: SignalDirectionType;
  entryMode: string;
  entry: number | null;
  entryZone: string | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  sl: number | null;
  grossRR: number | null;
  netRR: number | null;
  rrText: string;
  danger: DangerResult;
  regime: RegimeResult;
  keyLevels: KeyLevelsResult;
  watchNote: string | null;
  htfSummary: string;
  setupScore: number;
  rules: ConfluenceRule[];
  diagVeto: string;
  diagSetup: string;
  diagTrigger: string;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  atr14: number | null;
  fvg: FvgAnalysis;
  structure: MarketStructure;
  ob: OrderBlock;
  breaker: BreakerBlock;
  riskCalc: RiskCalcResult | null;
  locked: boolean;
  tp1Hit: boolean;
  tp2Hit: boolean;
  closedCount: number;
  formingBar: CandleBar | null;
  candleTime: number;
  time: string;
  reason: string;
}

export interface WalkForwardStats {
  insufficient: boolean;
  reason?: string;
  symbol?: string;
  tf?: TimeframeType;
  totalTrades?: number;
  wins?: number;
  losses?: number;
  openOrExpired?: number;
  skippedSetups?: number;
  winRate?: number | null;
  profitFactor?: number;
  netRR?: number;
  maxDrawdownR?: number;
  avgWinR?: number;
  avgLossR?: number;
  expectancyR?: number;
  maxLossStreak?: number;
}

export interface RiskLedger {
  dateUtc: string;
  dailyLossPct: number;
  consecutiveLosses: number;
  openPositions: number;
  pausedForReview: boolean;
}

export interface ActiveLock {
  id: string;
  asset: string;
  tf: TimeframeType;
  provider: ProviderType;
  type: 'BUY' | 'SELL';
  entryMode: string;
  entry: number;
  entryZone: string | null;
  tp1: number;
  tp2: number;
  tp3: number;
  sl: number;
  grossRR: number | null;
  netRR: number | null;
  rrText: string;
  riskCalc: RiskCalcResult | null;
  candleTime: number;
  time: string;
  tp1Hit: boolean;
  tp2Hit: boolean;
}

export interface SignalHistoryItem {
  time: string;
  date: string;
  asset: string;
  tf: string;
  source: ProviderType;
  type: 'BUY' | 'SELL';
  entry: string;
  tp1: string;
  sl: string;
  status: string;
}

export interface RiskConfig {
  balance: number;
  riskPct: number;
  dailyCap: number;
  contractMode: ContractModeType;
  commission: number;
}

export interface ChartLayers {
  sr: boolean;
  liq: boolean;
  ict: boolean;
}

export interface QaLogEntry {
  id: string;
  text: string;
  status: 'pass' | 'fail' | 'info';
}
