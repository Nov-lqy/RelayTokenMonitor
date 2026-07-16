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
  cachedAt?: string;
}
