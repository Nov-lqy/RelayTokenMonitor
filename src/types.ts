export type Locale = "zh" | "en";

export interface StoredKeyView {
  id: string;
  name: string;
  skMasked: string;
  note: string;
  enabled: boolean;
  lastKnownRemaining?: number;
}

export interface AppConfigView {
  baseUrl: string;
  accessTokenMasked: string;
  hasAccessToken: boolean;
  userId: string;
  keys: StoredKeyView[];
  refreshIntervalSeconds: number;
  autoRefreshEnabled: boolean;
  lowBalanceThreshold: number;
  quotaPerUnit: number;
  locale: Locale;
  autostart: boolean;
  currentKeyId?: string;
  configPath: string;
}

export interface BalanceView {
  remainingCny: number;
  quota: number;
  usedQuota: number;
  isLow: boolean;
  error?: string;
  cachedAt?: number | string;
}

export interface DayUsageView {
  date: string;
  totalTokens: number;
}

export interface ModelUsageView {
  modelName: string;
  totalTokens: number;
  quota: number;
}

export interface UsageSummaryView {
  byDay: DayUsageView[];
  byModel: ModelUsageView[];
}

export interface SyncKeysResult {
  added: number;
}

export interface KeyUsageView {
  remainingCny: number;
  name: string;
  totalGranted: number;
  totalUsed: number;
  totalAvailable: number;
  unlimitedQuota: boolean;
}
