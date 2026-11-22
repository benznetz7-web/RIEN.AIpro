import { BaseSymbolSpec, LanguageType, TimeframeProfile, TimeframeType } from '../types/trading';

export const APP_VERSION = 'NETHAGA_PRO_v7.0_ALLINONE';
export const RELEASE_DATE = '2026-11-22';

export const STORAGE_KEYS = {
  history: 'nethaga_signal_history_v6',
  language: 'nethaga_language_v6',
  alerts: 'nethaga_alerts_v6',
  provider: 'nethaga_provider_v6',
  symbol: 'nethaga_active_symbol_v6',
  riskBal: 'nethaga_risk_balance_v70',
  riskPct: 'nethaga_risk_pct_v70',
  dailyCap: 'nethaga_risk_dailycap_v70',
  contractMode: 'nethaga_contract_mode_v70',
  commission: 'nethaga_commission_v70',
  riskState: 'nethaga_risk_ledger_v70',
  lock: 'nethaga_active_lock_v70',
  layers: 'nethaga_chart_layers_v70',
} as const;

export const BIQUOTE_BASE = 'https://biquote.io';
export const BIQUOTE_HUB = 'https://biquote.io/hubs/tick';

export const FRESHNESS_LIMITS_SEC: Record<TimeframeType, number> = {
  M1: 25,
  M5: 60,
  M15: 150,
  M30: 240,
  H1: 360,
  H4: 600,
  D1: 900,
  W1: 1800,
};

export const SYMBOL_SPECS: Record<string, BaseSymbolSpec> = {
  XAUUSD: { group: 'GOLD', label: 'Gold / USD', digits: 2, pointSize: 0.01, pipSize: 0.1, tickSize: 0.01, contractSize: 100, quoteCcy: 'USD', volumeMin: 0.01, volumeStep: 0.01, slippagePoints: 15, roundStep: 10, verified: true },
  EURUSD: { group: 'FX', label: 'EUR / USD', digits: 5, pointSize: 0.00001, pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, quoteCcy: 'USD', volumeMin: 0.01, volumeStep: 0.01, slippagePoints: 5, roundStep: 0.005, verified: true },
  GBPUSD: { group: 'FX', label: 'GBP / USD', digits: 5, pointSize: 0.00001, pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, quoteCcy: 'USD', volumeMin: 0.01, volumeStep: 0.01, slippagePoints: 6, roundStep: 0.005, verified: true },
  USDJPY: { group: 'FX', label: 'USD / JPY', digits: 3, pointSize: 0.001, pipSize: 0.01, tickSize: 0.001, contractSize: 100000, quoteCcy: 'JPY', volumeMin: 0.01, volumeStep: 0.01, slippagePoints: 5, roundStep: 0.5, verified: true },
  AUDUSD: { group: 'FX', label: 'AUD / USD', digits: 5, pointSize: 0.00001, pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, quoteCcy: 'USD', volumeMin: 0.01, volumeStep: 0.01, slippagePoints: 5, roundStep: 0.005, verified: true },
  USDCAD: { group: 'FX', label: 'USD / CAD', digits: 5, pointSize: 0.00001, pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, quoteCcy: 'CAD', volumeMin: 0.01, volumeStep: 0.01, slippagePoints: 6, roundStep: 0.005, verified: true },
  USDCHF: { group: 'FX', label: 'USD / CHF', digits: 5, pointSize: 0.00001, pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, quoteCcy: 'CHF', volumeMin: 0.01, volumeStep: 0.01, slippagePoints: 6, roundStep: 0.005, verified: true },
  NZDUSD: { group: 'FX', label: 'NZD / USD', digits: 5, pointSize: 0.00001, pipSize: 0.0001, tickSize: 0.00001, contractSize: 100000, quoteCcy: 'USD', volumeMin: 0.01, volumeStep: 0.01, slippagePoints: 6, roundStep: 0.005, verified: true },
};

export const SUPPORTED_SYMBOLS = Object.keys(SYMBOL_SPECS);
export const TIMEFRAMES: TimeframeType[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export const TF_PROFILES: Record<TimeframeType, TimeframeProfile> = {
  M1: { biquote: '1m', seconds: 60, label: 'M1', role: 'Scalp (High Noise — Use Small Lot)', htf: 'M15', cooldownBars: 3, maxSpreadRatioAtr: 0.45, bosLookback: 22 },
  M5: { biquote: '5m', seconds: 300, label: 'M5', role: 'Fast Scalping & S/R Bounce', htf: 'H1', cooldownBars: 2, maxSpreadRatioAtr: 0.4, bosLookback: 20 },
  M15: { biquote: '15m', seconds: 900, label: 'M15', role: 'Intraday Key-Level Entry', htf: 'H1', cooldownBars: 2, maxSpreadRatioAtr: 0.35, bosLookback: 18 },
  M30: { biquote: '30m', seconds: 1800, label: 'M30', role: 'Intraday Swing & Retest', htf: 'H4', cooldownBars: 2, maxSpreadRatioAtr: 0.35, bosLookback: 16 },
  H1: { biquote: '1h', seconds: 3600, label: 'H1', role: 'Primary Structure & S/R TP/SL', htf: 'H4', cooldownBars: 1, maxSpreadRatioAtr: 0.35, bosLookback: 16 },
  H4: { biquote: '4h', seconds: 14400, label: 'H4', role: 'Major Key Levels & Wide TP/SL', htf: 'D1', cooldownBars: 1, maxSpreadRatioAtr: 0.35, bosLookback: 14 },
  D1: { biquote: '1d', seconds: 86400, label: 'D1', role: 'Macro Key Levels & Swing Plan', htf: 'W1', cooldownBars: 1, maxSpreadRatioAtr: 0.35, bosLookback: 14 },
  W1: { biquote: '1d', seconds: 604800, label: 'W1', role: 'Weekly Macro Levels (From 1d Bars)', htf: 'W1', cooldownBars: 1, maxSpreadRatioAtr: 0.35, bosLookback: 12 },
};

export interface TranslationBundle {
  subtitle: string;
  goldLabel: string;
  profileTitle: string;
  marketSessions: string;
  riskTitle: string;
  lblBalance: string;
  lblRiskPct: string;
  lblDailyLimit: string;
  lblContractMode: string;
  lblCommission: string;
  selectTF: string;
  candleClose: string;
  signalRule: string;
  matrixTitle: string;
  winrate: string;
  entryPrice: string;
  chartTitle: string;
  signalHistory: string;
  traderTipTitle: string;
  rule1: string;
  rule2: string;
  rule3: string;
  rule4: string;
  modalTitle: string;
  modalDesc: string;
  apiBtn: string;
  refreshBtn: string;
  goldWatchlist: string;
  forexWatchlist: string;
  alertOn: string;
  alertOff: string;
  copySignal: string;
}

export const TRANSLATIONS: Record<LanguageType, TranslationBundle> = {
  en: {
    subtitle: 'Key Levels (S/R) + Liquidity + Price Action + ICT · All Timeframes',
    goldLabel: 'Active Instrument',
    profileTitle: 'Market Quality & Danger Tier',
    marketSessions: 'Market Sessions (UTC)',
    riskTitle: 'Risk Supporter (Non-Blocking Lot & Cost Advisor)',
    lblBalance: 'Equity ($ USD)',
    lblRiskPct: 'Base Risk / Trade (%)',
    lblDailyLimit: 'Daily Loss Alert (%)',
    lblContractMode: 'Contract Type',
    lblCommission: 'Commission ($/lot RT)',
    selectTF: 'Timeframe',
    candleClose: 'Next Bar Close (UTC)',
    signalRule: 'All TFs enabled · S/R + PA + Liquidity + ICT',
    matrixTitle: 'Pre-Market Key-Level Map & If–Then Scenarios (R2 / R1 / Price / S1 / S2)',
    winrate: 'Multi-Strategy Confluence',
    entryPrice: 'Entry Zone',
    chartTitle: 'Key Levels (S/R) + Liquidity + ICT Chart',
    signalHistory: 'Saved READY Signal History',
    traderTipTitle: 'How to Trade This Engine',
    rule1: 'Check H1/H4/D1/W1 first for Key Levels (S1/R1/PDH/PDL), then drop to M5/M15 for entry.',
    rule2: 'In 20–35% Danger (Caution): cut Lot/Risk by 50% and take quick TP1 — never shrink SL into noise.',
    rule3: 'In 50%+ Clean Trend: use full budget & trail runner to TP2/TP3 Key Level.',
    rule4: 'Past walk-forward stats never guarantee future performance.',
    modalTitle: 'NETHAGA QA Suite & Live Diagnostics',
    modalDesc: 'Tests Key Levels, W1 daily aggregation, Danger-Tier adaptation, Zero-Lookahead Backtest, Freshness, and Live BIQUOTE API/SignalR.',
    apiBtn: 'QA & Diagnostics',
    refreshBtn: 'Refresh',
    goldWatchlist: 'Gold Watchlist',
    forexWatchlist: 'Forex Watchlist (Majors)',
    alertOn: '20m: ON',
    alertOff: '20m: OFF',
    copySignal: 'Copy Analysis',
  },
  kh: {
    subtitle: 'ប្រព័ន្ធវិភាគ Key Level (S/R) + Liquidity + Price Action + ICT · គ្រប់ Timeframe',
    goldLabel: 'គូរូបិយប័ណ្ណកំពុងវិភាគ',
    profileTitle: 'គុណភាពទីផ្សារ & កម្រិតគ្រោះថ្នាក់',
    marketSessions: 'វគ្គទីផ្សារ (UTC)',
    riskTitle: 'ជំនួយការគណនា Lot & ថ្លៃដើម (មិនបិទ Signal ទេ)',
    lblBalance: 'ដើមទុន ($ USD)',
    lblRiskPct: 'Risk ដើម (%)',
    lblDailyLimit: 'ការពារខាតប្រចាំថ្ងៃ (%)',
    lblContractMode: 'ប្រភេទ Contract',
    lblCommission: 'កម្រៃជើងសារ ($/lot)',
    selectTF: 'Timeframe',
    candleClose: 'ទៀនបន្ទាប់បិទ (UTC)',
    signalRule: 'ប្រើបានគ្រប់ TF · S/R + PA + Liquidity + ICT',
    matrixTitle: 'ផែនទី Key Level អនាគត & ផែនការ ២ ផ្លូវ (R2 / R1 / Price / S1 / S2)',
    winrate: 'កម្រិតស្របគ្នាគ្រប់យុទ្ធសាស្ត្រ',
    entryPrice: 'តំបន់ចូល',
    chartTitle: 'ក្រាហ្វ Key Levels (S/R) + Liquidity + ICT',
    signalHistory: 'ប្រវត្តិ Signal READY',
    traderTipTitle: 'របៀបប្រើប្រាស់ប្រកបដោយប្រសិទ្ធភាព',
    rule1: 'មើល H1/H4/D1/W1 រក Key Level (S1/R1/PDH/PDL) សិន រួចចុះមក M5/M15 រកចំណុចចូល។',
    rule2: 'ពេលទីផ្សារមានគ្រោះថ្នាក់ ២០–៣៥% (Caution): កាត់ Lot ៥០% និងយក TP1 លឿន — កុំបង្រួម SL ចូល Noise។',
    rule3: 'ពេលទីផ្សារស្អាត ៥០%+: ប្រើ Risk ពេញ និងទុក Runner រត់ទៅ TP2/TP3។',
    rule4: 'Backtest អតីតកាលមិនធានាផលចំណេញអនាគតទេ។',
    modalTitle: 'តេស្តស្វ័យប្រវត្តិ ២០ ចំណុច & BIQUOTE',
    modalDesc: 'តេស្ត Key Levels, ការបូក W1, Danger Tier, Backtest និង BIQUOTE Live។',
    apiBtn: 'តេស្ត & ត្រួតពិនិត្យ',
    refreshBtn: 'ផ្ទុកឡើងវិញ',
    goldWatchlist: 'បញ្ជីមាស (Gold)',
    forexWatchlist: 'បញ្ជីរូបិយប័ណ្ណ (Forex)',
    alertOn: '20m: បើក',
    alertOff: '20m: បិទ',
    copySignal: 'ចម្លង',
  },
};
