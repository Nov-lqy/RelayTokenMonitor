import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  BarChart3,
  Brain,
  CalendarDays,
  CheckCircle2,
  CloudDownload,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  Info,
  KeyRound,
  Link2,
  Plus,
  Power,
  RefreshCw,
  Settings,
  Shirt,
  Star,
  SunMedium,
  Trash2,
  X,
} from "lucide-react";
import { t, tf } from "./i18n";
import type {
  AppConfigView,
  BalanceView,
  DayUsageView,
  KeyUsageView,
  Locale,
  ModelUsageView,
  StoredKeyView,
  SyncKeysResult,
  UsageSummaryView,
} from "./types";
import "./styles.css";

type ViewName = "dashboard" | "settings" | "keys" | "detail";
type BalanceState = "loading" | "ok" | "error" | "nokey";

type ProbeResult = {
  userSelfOk: boolean;
  sampleKeyOk: boolean;
  messages: string[];
};

function normalizeLocale(value: string | undefined): Locale {
  return value === "en" ? "en" : "zh";
}

function normalizeConfig(raw: AppConfigView): AppConfigView {
  return {
    ...raw,
    accessTokenMasked: raw.accessTokenMasked ?? "",
    userId: raw.userId ?? "",
    locale: normalizeLocale(raw.locale),
  };
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtTokensShort = (n: number) => {
  if (n >= 1e8) return (n / 1e6).toFixed(0) + "M";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
};
const fmtMoney = (n: number) => "¥" + n.toFixed(2);
const mmdd = (date: string) => {
  const parts = date.split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : date;
};
const todayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date: Date, offset: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
};
const recentUsageDays = (days: DayUsageView[], count = 7): DayUsageView[] => {
  const source = new Map(days.filter((day) => day.date <= todayStr()).map((day) => [day.date, day]));
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = dateKey(addDays(today, index - count + 1));
    return source.get(date) ?? { date, totalTokens: 0 };
  });
};

const fmtCachedAt = (value?: number | string) => {
  if (value == null) return null;
  if (typeof value === "number") {
    return new Date(value * 1000).toLocaleString();
  }
  return value;
};

const isNoTokenError = (message: string) =>
  message.includes("未配置") ||
  message.toLowerCase().includes("access token") ||
  message.toLowerCase().includes("no access");
const refreshIntervalValues = [60, 300, 1800, 3600] as const;

function App() {
  const [view, setView] = React.useState<ViewName>("dashboard");
  const [detailModel, setDetailModel] = React.useState<string | null>(null);

  const [balance, setBalance] = React.useState<BalanceView | null>(null);
  const [balanceState, setBalanceState] = React.useState<BalanceState>("loading");
  const [balanceError, setBalanceError] = React.useState("");

  const [usage, setUsage] = React.useState<UsageSummaryView | null>(null);
  const [usageState, setUsageState] = React.useState<BalanceState>("loading");
  const [usageError, setUsageError] = React.useState("");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = React.useState(60);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(false);
  const [locale, setLocale] = React.useState<Locale>("zh");

  const lastBalanceRef = React.useRef<BalanceView | null>(null);
  const lastUsageRef = React.useRef<UsageSummaryView | null>(null);

  const loadBalance = React.useCallback(() => {
    setBalanceState((prev) => (lastBalanceRef.current ? prev : "loading"));
    void invoke<BalanceView>("fetch_balance")
      .then((data) => {
        if (data.error) {
          const message = data.error.toLowerCase().includes("unauthorized")
            ? t(locale, "unauthorized")
            : isNoTokenError(data.error)
              ? t(locale, "noAccessToken")
              : data.error;
          setBalanceError(message);
          if (
            lastBalanceRef.current &&
            !data.error.toLowerCase().includes("unauthorized") &&
            !isNoTokenError(data.error)
          ) {
            setBalance(lastBalanceRef.current);
            setBalanceState("ok");
            return;
          }
          setBalance(null);
          setBalanceState(isNoTokenError(data.error) ? "nokey" : "error");
          return;
        }
        lastBalanceRef.current = data;
        setBalance(data);
        setBalanceError("");
        setBalanceState("ok");
      })
      .catch((error) => {
        const raw = typeof error === "string" ? error : t(locale, "queryFailed");
        const message = raw.toLowerCase().includes("unauthorized")
          ? t(locale, "unauthorized")
          : raw;
        setBalanceError(message);
        if (lastBalanceRef.current && !message.toLowerCase().includes("unauthorized")) {
          setBalance(lastBalanceRef.current);
          setBalanceState("ok");
          return;
        }
        setBalance(null);
        setBalanceState(isNoTokenError(raw) ? "nokey" : "error");
      });
  }, [locale]);

  const loadUsage = React.useCallback((force = false) => {
    setUsageState((prev) => (lastUsageRef.current ? prev : "loading"));
    void invoke<UsageSummaryView>("fetch_usage_summary", { days: 7, force })
      .then((data) => {
        lastUsageRef.current = data;
        setUsage(data);
        setUsageError("");
        setUsageState("ok");
      })
      .catch((error) => {
        const raw = typeof error === "string" ? error : t(locale, "usageUnavailable");
        const message = raw.toLowerCase().includes("unauthorized")
          ? t(locale, "unauthorized")
          : isNoTokenError(raw)
            ? t(locale, "noAccessToken")
            : raw;
        setUsageError(message);
        if (lastUsageRef.current && !raw.toLowerCase().includes("unauthorized") && !isNoTokenError(raw)) {
          setUsage(lastUsageRef.current);
          setUsageState("ok");
          return;
        }
        setUsage(null);
        setUsageState(isNoTokenError(raw) ? "nokey" : "error");
      });
  }, [locale]);

  const refreshAll = React.useCallback(
    (forceUsage = false) => {
      loadBalance();
      loadUsage(forceUsage);
    },
    [loadBalance, loadUsage],
  );

  React.useEffect(() => {
    if (view === "dashboard") {
      // Soft refresh: reuse ~45s usage cache when returning to home.
      refreshAll(false);
    }
  }, [view, refreshAll]);

  React.useEffect(() => {
    void invoke<AppConfigView>("get_app_config")
      .then((raw) => {
        const config = normalizeConfig(raw);
        setRefreshIntervalSeconds(config.refreshIntervalSeconds || 60);
        setAutoRefreshEnabled(config.autoRefreshEnabled);
        setLocale(config.locale);
      })
      .catch(() => {
        setRefreshIntervalSeconds(60);
        setAutoRefreshEnabled(false);
      });
  }, []);

  React.useEffect(() => {
    if (!autoRefreshEnabled) {
      return;
    }
    // Auto tick: balance every time; usage only if cache expired (force=false).
    const timer = window.setInterval(() => refreshAll(false), refreshIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshAll, refreshIntervalSeconds]);

  const hideWindow = React.useCallback(() => {
    void invoke("hide_main_window").catch(() => {
      // Browser preview has no Tauri IPC. Keep it non-blocking for visual checks.
    });
  }, []);

  return (
    <div className="stage">
      {view === "dashboard" && (
        <DashboardPanel
          locale={locale}
          balance={balance}
          balanceState={balanceState}
          balanceError={balanceError}
          usage={usage}
          usageState={usageState}
          usageError={usageError}
          onRefresh={() => refreshAll(true)}
          onClose={hideWindow}
          onKeys={() => setView("keys")}
          onSettings={() => setView("settings")}
          onDetail={(modelName) => {
            setDetailModel(modelName);
            setView("detail");
          }}
        />
      )}
      {view === "settings" && (
        <SettingsPanel
          locale={locale}
          onLocaleChanged={setLocale}
          onRefreshIntervalChanged={setRefreshIntervalSeconds}
          onAutoRefreshChanged={setAutoRefreshEnabled}
          onBack={() => setView("dashboard")}
        />
      )}
      {view === "keys" && (
        <KeysPanel locale={locale} onBack={() => setView("dashboard")} />
      )}
      {view === "detail" && detailModel && (
        <ModelDetailPanel
          locale={locale}
          modelName={detailModel}
          usage={usage}
          usageState={usageState}
          onBack={() => {
            setDetailModel(null);
            setView("dashboard");
          }}
        />
      )}
    </div>
  );
}

function BrandIcon({ size = 32 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, "");
  const hubId = `relayHub-${uid}`;
  return (
    <div className="brand-icon relay-brand-icon" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 128 128" width="100%" height="100%" fill="none">
        <defs>
          <linearGradient id={hubId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6b85ff" />
            <stop offset="100%" stopColor="#4d6bfe" />
          </linearGradient>
        </defs>
        <circle cx="22" cy="64" r="12" fill="#e8ecff" />
        <circle cx="106" cy="64" r="12" fill="#e8ecff" />
        <path
          d="M36 54 C46 34, 82 34, 92 54"
          stroke="#6b85ff"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path
          d="M36 74 C46 94, 82 94, 92 74"
          stroke="#6b85ff"
          strokeWidth="5.5"
          strokeLinecap="round"
          opacity="0.55"
        />
        <circle cx="64" cy="64" r="22" fill={`url(#${hubId})`} />
        <circle cx="64" cy="64" r="9" fill="#ffffff" />
      </svg>
    </div>
  );
}

function DashboardPanel({
  locale,
  balance,
  balanceState,
  balanceError,
  usage,
  usageState,
  usageError,
  onRefresh,
  onClose,
  onKeys,
  onSettings,
  onDetail,
}: {
  locale: Locale;
  balance: BalanceView | null;
  balanceState: BalanceState;
  balanceError: string;
  usage: UsageSummaryView | null;
  usageState: BalanceState;
  usageError: string;
  onRefresh: () => void;
  onClose: () => void;
  onKeys: () => void;
  onSettings: () => void;
  onDetail: (modelName: string) => void;
}) {
  const [theme, setTheme] = React.useState<string>(
    () => localStorage.getItem("ui-theme") || "dark",
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("ui-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const models = usage?.byModel ?? [];
  const maxTokens = Math.max(...models.map((item) => item.totalTokens), 1);
  const daySlots = recentUsageDays(usage?.byDay ?? []);
  const todayTokens = daySlots.find((day) => day.date === todayStr())?.totalTokens ?? null;
  const total7d = daySlots.reduce((sum, day) => sum + day.totalTokens, 0);
  const filterTokenName = usage?.filterTokenName?.trim() || "";
  const unauthorized =
    balanceError.toLowerCase().includes("unauthorized") ||
    balanceError.includes("登录态") ||
    balanceError.includes("Session expired") ||
    usageError.toLowerCase().includes("unauthorized") ||
    usageError.includes("登录态") ||
    usageError.includes("Session expired");

  return (
    <section className="panel dashboard-panel" data-testid="dashboard-panel">
      <header className="panel-header" data-tauri-drag-region>
        <div className="title-lockup" data-tauri-drag-region>
          <BrandIcon size={36} />
          <h1>{t(locale, "appName")}</h1>
        </div>
        <div className="header-actions">
          <button aria-label={t(locale, "refresh")} onClick={onRefresh}>
            <RefreshCw size={22} />
          </button>
          <div className="skin-menu-wrap">
            <button
              aria-label={t(locale, "themeToggle")}
              className="skin-toggle"
              title={theme === "dark" ? t(locale, "themeToLight") : t(locale, "themeToDark")}
              onClick={toggleTheme}
            >
              <Shirt size={21} />
            </button>
          </div>
          <button aria-label={t(locale, "keys")} onClick={onKeys}>
            <KeyRound size={22} />
          </button>
          <button aria-label={t(locale, "settings")} onClick={onSettings}>
            <Settings size={23} />
          </button>
          <button aria-label={t(locale, "close")} onClick={onClose}>
            <X size={25} />
          </button>
        </div>
      </header>

      {unauthorized && (
        <div className="auth-banner" role="alert">
          <span>{t(locale, "unauthorizedHint")}</span>
          <button type="button" className="primary" onClick={onSettings}>
            {t(locale, "goToSettings")}
          </button>
        </div>
      )}

      <BalanceCard
        locale={locale}
        balance={balance}
        state={balanceState}
        error={balanceError}
        todayTokens={usageState === "ok" ? todayTokens : null}
        total7d={usageState === "ok" ? total7d : null}
      />

      {(models.length > 0 || filterTokenName) && (
        <div className="model-section">
          <div className="model-section-head">
            <span className="model-filter-label">
              {filterTokenName
                ? `${t(locale, "currentTokenFilter")}: ${filterTokenName}`
                : t(locale, "allTokensUsage")}
            </span>
          </div>
          {models.length > 0 && (
            <div className="usage-stack">
              {models.map((model) => (
                <ModelUsageRow
                  key={model.modelName}
                  locale={locale}
                  model={model}
                  maxTokens={maxTokens}
                  state={usageState}
                  onClick={() => onDetail(model.modelName)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <UsageChart
        locale={locale}
        byDay={usage?.byDay ?? []}
        state={usageState}
        error={usageError}
        title={t(locale, "tokenUsage7d")}
      />
    </section>
  );
}

function BalanceCard({
  locale,
  balance,
  state,
  error,
  todayTokens,
  total7d,
}: {
  locale: Locale;
  balance: BalanceView | null;
  state: BalanceState;
  error: string;
  todayTokens: number | null;
  total7d: number | null;
}) {
  const isLow = balance?.isLow ?? false;
  const amount =
    state === "loading"
      ? t(locale, "querying")
      : state === "nokey"
        ? t(locale, "noAccessToken")
        : state === "error"
          ? t(locale, "queryFailed")
          : fmtMoney(balance?.remainingCny ?? 0);
  const statusText =
    state === "ok" ? (isLow ? t(locale, "lowBalance") : t(locale, "available")) : "—";

  return (
    <article className={`card balance-card${isLow && state === "ok" ? " balance-low" : ""}`}>
      <div className="card-title-row">
        <div className="caption-with-icon">
          <CreditCard size={15} />
          <span>{t(locale, "accountBalance")}</span>
        </div>
        <div className={`status-pill${isLow && state === "ok" ? " off" : ""}`}>
          <span />
          {statusText}
        </div>
      </div>
      <div className={`balance-amount balance-value ${state !== "ok" ? "balance-dim" : ""}`}>{amount}</div>
      {state === "error" && error && <div className="balance-error">{error}</div>}
      {balance?.cachedAt != null && state === "ok" && (
        <p className="cached-hint">
          {t(locale, "cachedAt")}: {fmtCachedAt(balance.cachedAt)}
        </p>
      )}
      <div className="metric-grid">
        <div className="mini-card">
          <div className="caption-with-icon orange">
            <SunMedium size={15} />
            <span>{t(locale, "todayTokens")}</span>
          </div>
          <strong>{todayTokens != null ? fmtInt(todayTokens) : "—"}</strong>
        </div>
        <div className="mini-card">
          <div className="caption-with-icon orange">
            <CalendarDays size={15} />
            <span>{t(locale, "total7d")}</span>
          </div>
          <strong>{total7d != null ? fmtInt(total7d) : "—"}</strong>
        </div>
      </div>
    </article>
  );
}

function ModelUsageRow({
  locale,
  model,
  maxTokens,
  state,
  onClick,
}: {
  locale: Locale;
  model: ModelUsageView;
  maxTokens: number;
  state: BalanceState;
  onClick: () => void;
}) {
  const tokensText =
    state === "loading"
      ? t(locale, "querying")
      : state === "nokey"
        ? t(locale, "noAccessToken")
        : state === "error"
          ? t(locale, "usageUnavailable")
          : `${fmtInt(model.totalTokens)} ${t(locale, "tokens")}`;
  const width = `${Math.max(2, (model.totalTokens / maxTokens) * 100)}%`;

  return (
    <button className="card usage-row" type="button" onClick={onClick}>
      <div className="model-badge relay">
        <Brain size={24} />
      </div>
      <div className="usage-main">
        <h2>{model.modelName}</h2>
        <div className="token-line">
          <span>{tokensText}</span>
          <div className="progress-track">
            <i className="relay-fill" style={{ width }} />
          </div>
        </div>
      </div>
      <div className="usage-price">
        <strong>{fmtMoney(model.quota)}</strong>
        <span>{t(locale, "quotaUsed")}</span>
      </div>
    </button>
  );
}

function UsageChart({
  locale,
  byDay,
  state,
  error,
  title,
  className,
}: {
  locale: Locale;
  byDay: DayUsageView[];
  state: BalanceState;
  error?: string;
  title: string;
  className?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  const MIN_BAR = 3;
  const points = recentUsageDays(byDay);
  const maxVal = Math.max(...points.map((point) => point.totalTokens), 1);
  const sumTotal = points.reduce((sum, point) => sum + point.totalTokens, 0);
  const placeholder =
    state === "loading"
      ? t(locale, "querying")
      : state === "nokey"
        ? t(locale, "noAccessToken")
        : state === "error"
          ? error || t(locale, "usageUnavailable")
          : t(locale, "noData");

  return (
    <article className={`card chart-card${className ? ` ${className}` : ""}`}>
      <div className="card-title-row">
        <div className="caption-with-icon">
          <BarChart3 size={16} className="brand-blue" />
          <span>{title}</span>
        </div>
        <span className="chart-total">
          {state === "ok" ? `${t(locale, "total7d")} ${fmtTokensShort(sumTotal)}` : "—"}
        </span>
      </div>
      {state === "ok" && points.length > 0 ? (
        <div className="bars" onMouseLeave={() => setHoveredIdx(null)}>
          {points.map((point, idx) => (
            <div className="bar-column" key={point.date}>
              {hoveredIdx === idx && point.totalTokens > 0 && (
                <div
                  className={`bar-tooltip${
                    idx <= 1 ? " align-left" : idx >= points.length - 2 ? " align-right" : ""
                  }`}
                >
                  <div className="bar-tooltip-head">
                    <span className="bar-tooltip-date">{point.date}</span>
                    <strong>
                      {fmtInt(point.totalTokens)} {t(locale, "tokens").toLowerCase()}
                    </strong>
                  </div>
                </div>
              )}
              <span className="bar-value">
                {point.totalTokens > 0 ? fmtTokensShort(point.totalTokens) : "0"}
              </span>
              <div className="bar-slot">
                <div
                  className="token-bar"
                  style={{
                    height: `${point.totalTokens > 0 ? Math.max(MIN_BAR, (point.totalTokens / maxVal) * 100) : MIN_BAR}%`,
                  }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </div>
              <span className="bar-day">{mmdd(point.date)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="chart-placeholder">{placeholder}</div>
      )}
    </article>
  );
}

function KeysPanel({ locale, onBack }: { locale: Locale; onBack: () => void }) {
  const [keys, setKeys] = React.useState<StoredKeyView[]>([]);
  const [currentKeyId, setCurrentKeyId] = React.useState<string | undefined>();
  const [status, setStatus] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [sk, setSk] = React.useState("");
  const [note, setNote] = React.useState("");
  const [showSk, setShowSk] = React.useState(false);

  const applyConfig = React.useCallback((raw: AppConfigView) => {
    const next = normalizeConfig(raw);
    setKeys(next.keys);
    setCurrentKeyId(next.currentKeyId);
    if (next.currentKeyId) {
      setSelectedId(next.currentKeyId);
    } else if (next.keys.length > 0) {
      setSelectedId(next.keys[0].id);
    } else {
      setSelectedId(null);
    }
  }, []);

  React.useEffect(() => {
    void invoke<AppConfigView>("get_app_config")
      .then(applyConfig)
      .catch(() => setStatus(t(locale, "previewMode")));
  }, [applyConfig, locale]);

  const addKey = React.useCallback(() => {
    if (!sk.trim()) {
      setStatus(t(locale, "keySk"));
      return;
    }
    setBusy(true);
    setStatus(t(locale, "saving"));
    void invoke<AppConfigView>("add_key", {
      name: name.trim(),
      sk: sk.trim(),
      note: note.trim(),
    })
      .then((raw) => {
        applyConfig(raw);
        setName("");
        setSk("");
        setNote("");
        setStatus(t(locale, "keyAdded"));
      })
      .catch((error) => {
        setStatus(typeof error === "string" ? error : t(locale, "probeFailed"));
      })
      .finally(() => setBusy(false));
  }, [applyConfig, locale, name, note, sk]);

  const syncKeys = React.useCallback(() => {
    setBusy(true);
    setStatus(t(locale, "syncingKeys"));
    void invoke<SyncKeysResult>("sync_keys_from_panel")
      .then((result) => {
        setStatus(tf(locale, "syncAdded", { n: result.added }));
        return invoke<AppConfigView>("get_app_config");
      })
      .then((raw) => {
        if (raw) applyConfig(raw);
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : t(locale, "probeFailed");
        setStatus(
          message.toLowerCase().includes("unauthorized")
            ? t(locale, "unauthorized")
            : message,
        );
      })
      .finally(() => setBusy(false));
  }, [applyConfig, locale]);

  const deleteSelected = React.useCallback(() => {
    if (!selectedId) {
      setStatus(t(locale, "selectKey"));
      return;
    }
    setBusy(true);
    void invoke<AppConfigView>("delete_key", { id: selectedId })
      .then((raw) => {
        applyConfig(raw);
        setStatus(t(locale, "keyDeleted"));
      })
      .catch((error) => {
        setStatus(typeof error === "string" ? error : t(locale, "probeFailed"));
      })
      .finally(() => setBusy(false));
  }, [applyConfig, locale, selectedId]);

  const setCurrent = React.useCallback(() => {
    if (!selectedId) {
      setStatus(t(locale, "selectKey"));
      return;
    }
    setBusy(true);
    void invoke<AppConfigView>("set_current_key", { id: selectedId })
      .then((raw) => {
        applyConfig(raw);
        setStatus(t(locale, "currentKey"));
      })
      .catch((error) => {
        setStatus(typeof error === "string" ? error : t(locale, "probeFailed"));
      })
      .finally(() => setBusy(false));
  }, [applyConfig, locale, selectedId]);

  const refreshSelected = React.useCallback(() => {
    if (!selectedId) {
      setStatus(t(locale, "selectKey"));
      return;
    }
    setBusy(true);
    setStatus(t(locale, "refreshingKey"));
    void invoke<KeyUsageView>("refresh_key_usage", { id: selectedId })
      .then((usage) => {
        setKeys((prev) =>
          prev.map((key) =>
            key.id === selectedId
              ? {
                  ...key,
                  lastKnownRemaining: usage.unlimitedQuota
                    ? undefined
                    : usage.remainingCny >= 0
                      ? usage.remainingCny
                      : key.lastKnownRemaining,
                  name: usage.name || key.name,
                }
              : key,
          ),
        );
        setStatus(
          usage.unlimitedQuota
            ? `${t(locale, "remaining")}: ${t(locale, "unlimited")}`
            : `${t(locale, "remaining")}: ${fmtMoney(usage.remainingCny)}`,
        );
        return invoke<AppConfigView>("get_app_config");
      })
      .then((raw) => {
        if (raw) applyConfig(raw);
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : t(locale, "probeFailed");
        setStatus(
          message.toLowerCase().includes("unauthorized")
            ? t(locale, "unauthorized")
            : message,
        );
      })
      .finally(() => setBusy(false));
  }, [applyConfig, locale, selectedId]);

  const formatRemaining = (key: StoredKeyView) => {
    if (key.lastKnownRemaining == null) return "—";
    if (!Number.isFinite(key.lastKnownRemaining)) return t(locale, "unlimited");
    return fmtMoney(key.lastKnownRemaining);
  };

  return (
    <section className="settings-panel keys-panel" data-testid="keys-panel">
      <button className="floating-close settings-close" onClick={onBack} aria-label={t(locale, "back")}>
        <X size={20} />
      </button>
      <div className="settings-inner">
        <header className="settings-header" data-tauri-drag-region>
          <BrandIcon size={42} />
          <div>
            <h1>{t(locale, "keys")}</h1>
            <p>{t(locale, "appName")}</p>
          </div>
        </header>

        <SettingsSection icon={<Plus size={15} />} title={t(locale, "addKey")}>
          <div className="key-row">
            <input
              aria-label={t(locale, "keyName")}
              placeholder={t(locale, "keyName")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="key-row password-row">
            <input
              aria-label={t(locale, "keySk")}
              type={showSk ? "text" : "password"}
              placeholder="sk-..."
              value={sk}
              onChange={(event) => setSk(event.target.value)}
            />
            <button
              type="button"
              className="ghost-toggle"
              onClick={() => setShowSk((value) => !value)}
              aria-label={showSk ? t(locale, "hideToken") : t(locale, "showToken")}
            >
              {showSk ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="key-row">
            <input
              aria-label={t(locale, "keyNote")}
              placeholder={t(locale, "keyNote")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="settings-actions keys-toolbar">
            <button className="primary" type="button" onClick={addKey} disabled={busy}>
              {t(locale, "addKey")}
            </button>
            <button className="secondary" type="button" onClick={syncKeys} disabled={busy}>
              <CloudDownload size={14} />
              {t(locale, "syncKeys")}
            </button>
          </div>
        </SettingsSection>

        <SettingsSection icon={<KeyRound size={15} />} title={t(locale, "keys")}>
          {keys.length === 0 ? (
            <p className="muted">{t(locale, "noKeys")}</p>
          ) : (
            <ul className="key-list">
              {keys.map((key) => {
                const selected = selectedId === key.id;
                const current = currentKeyId === key.id;
                return (
                  <li key={key.id}>
                    <button
                      type="button"
                      className={`key-list-item${selected ? " selected" : ""}${current ? " current" : ""}`}
                      onClick={() => setSelectedId(key.id)}
                    >
                      <div className="key-list-main">
                        <strong>
                          {key.name}
                          {current && <span className="current-badge">{t(locale, "currentKey")}</span>}
                        </strong>
                        <span className="key-masked">{key.skMasked}</span>
                        {key.note && <span className="key-note">{key.note}</span>}
                      </div>
                      <div className="key-list-meta">
                        <span>
                          {t(locale, "remaining")}: {formatRemaining(key)}
                        </span>
                        <span className={key.enabled ? "key-enabled" : "key-disabled"}>
                          {key.enabled ? t(locale, "enabled") : t(locale, "disabled")}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="settings-actions keys-toolbar">
            <button className="secondary" type="button" onClick={setCurrent} disabled={busy || !selectedId}>
              <Star size={14} />
              {t(locale, "setCurrent")}
            </button>
            <button className="secondary" type="button" onClick={refreshSelected} disabled={busy || !selectedId}>
              <RefreshCw size={14} />
              {t(locale, "refreshKeyUsage")}
            </button>
            <button className="secondary danger" type="button" onClick={deleteSelected} disabled={busy || !selectedId}>
              <Trash2 size={14} />
              {t(locale, "deleteKey")}
            </button>
          </div>
        </SettingsSection>

        <p className="muted status-line">{status}</p>
      </div>
    </section>
  );
}

function SettingsPanel({
  onBack,
  locale,
  onLocaleChanged,
  onRefreshIntervalChanged,
  onAutoRefreshChanged,
}: {
  onBack: () => void;
  locale: Locale;
  onLocaleChanged: (locale: Locale) => void;
  onRefreshIntervalChanged: (seconds: number) => void;
  onAutoRefreshChanged: (enabled: boolean) => void;
}) {
  const [config, setConfig] = React.useState<AppConfigView | null>(null);
  const [status, setStatus] = React.useState(() => t(locale, "loadingConfig"));
  const [busy, setBusy] = React.useState(false);
  const [baseUrl, setBaseUrl] = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [showToken, setShowToken] = React.useState(false);
  const [refresh, setRefresh] = React.useState(60);
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [threshold, setThreshold] = React.useState(5);
  const [localLocale, setLocalLocale] = React.useState<Locale>(locale);
  const [autostart, setAutostart] = React.useState(false);
  const [appVersion, setAppVersion] = React.useState("0.1.2");
  const configPath = config?.configPath ?? "%APPDATA%\\RelayTokenMonitor\\config.json";

  const intervalLabels: Record<(typeof refreshIntervalValues)[number], string> = {
    60: t(localLocale, "interval1m"),
    300: t(localLocale, "interval5m"),
    1800: t(localLocale, "interval30m"),
    3600: t(localLocale, "interval1h"),
  };

  React.useEffect(() => {
    void invoke<AppConfigView>("get_app_config")
      .then((raw) => {
        const next = normalizeConfig(raw);
        setConfig(next);
        setBaseUrl(next.baseUrl || "");
        setUserId(next.userId || "");
        setRefresh(next.refreshIntervalSeconds || 60);
        setAutoRefresh(next.autoRefreshEnabled);
        setThreshold(next.lowBalanceThreshold ?? 5);
        setLocalLocale(next.locale);
        onLocaleChanged(next.locale);
        setAutostart(next.autostart);
        setStatus(
          next.hasAccessToken
            ? `${t(next.locale, "configured")} ${next.accessTokenMasked || ""}`.trim()
            : t(next.locale, "notConfigured"),
        );
      })
      .catch(() => {
        setStatus(t(localLocale, "previewMode"));
      });
    // Load once on mount; form fields are owned locally until Save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    void getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("0.1.2"));
  }, []);

  const applyConfig = React.useCallback(
    (next: AppConfigView) => {
      const normalized = normalizeConfig(next);
      setConfig(normalized);
      setBaseUrl(normalized.baseUrl || "");
      setUserId(normalized.userId || "");
      setRefresh(normalized.refreshIntervalSeconds || 60);
      setAutoRefresh(normalized.autoRefreshEnabled);
      setThreshold(normalized.lowBalanceThreshold ?? 5);
      setLocalLocale(normalized.locale);
      onLocaleChanged(normalized.locale);
      setAutostart(normalized.autostart);
      onRefreshIntervalChanged(normalized.refreshIntervalSeconds || 60);
      onAutoRefreshChanged(normalized.autoRefreshEnabled);
    },
    [onAutoRefreshChanged, onLocaleChanged, onRefreshIntervalChanged],
  );

  const saveSettings = React.useCallback(() => {
    setBusy(true);
    setStatus(t(localLocale, "saving"));
    void invoke<AppConfigView>("save_settings", {
      baseUrl,
      accessToken,
      userId,
      refreshIntervalSeconds: refresh,
      autoRefreshEnabled: autoRefresh,
      lowBalanceThreshold: threshold,
      locale: localLocale,
      autostart,
    })
      .then((next) => {
        applyConfig(next);
        setAccessToken("");
        setStatus(t(normalizeLocale(next.locale), "saved"));
      })
      .catch((error) => {
        setStatus(typeof error === "string" ? error : t(localLocale, "probeFailed"));
      })
      .finally(() => setBusy(false));
  }, [
    accessToken,
    applyConfig,
    autoRefresh,
    autostart,
    baseUrl,
    localLocale,
    refresh,
    threshold,
    userId,
  ]);

  const probeConnection = React.useCallback(() => {
    setBusy(true);
    setStatus(t(localLocale, "probing"));
    void invoke<ProbeResult>("probe_connection")
      .then((probe) => {
        const joined = probe.messages.join(" ");
        const accessUnauthorized =
          !probe.userSelfOk &&
          (joined.toLowerCase().includes("unauthorized") ||
            joined.includes("登录态") ||
            joined.toLowerCase().includes("access token"));
        if (accessUnauthorized) {
          setStatus(t(localLocale, "unauthorized"));
          return;
        }
        if (probe.userSelfOk) {
          const hint = probe.sampleKeyOk
            ? ""
            : joined.toLowerCase().includes("full sk")
              ? ` — ${t(localLocale, "syncNeedsFullSk")}`
              : "";
          setStatus(`${t(localLocale, "probeOk")}: ${probe.messages.join("; ")}${hint}`);
          return;
        }
        setStatus(`${t(localLocale, "probeFailed")}: ${probe.messages.join("; ")}`);
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : t(localLocale, "probeFailed");
        setStatus(
          message.toLowerCase().includes("unauthorized")
            ? t(localLocale, "unauthorized")
            : message,
        );
      })
      .finally(() => setBusy(false));
  }, [localLocale]);

  return (
    <section className="settings-panel" data-testid="settings-panel">
      <button className="floating-close settings-close" onClick={onBack} aria-label={t(localLocale, "settings")}>
        <X size={20} />
      </button>
      <div className="settings-inner">
        <header className="settings-header" data-tauri-drag-region>
          <BrandIcon size={42} />
          <div>
            <h1>{t(localLocale, "appName")}</h1>
            <p>{t(localLocale, "settings")}</p>
          </div>
        </header>

        <SettingsSection icon={<Link2 size={15} />} title={t(localLocale, "baseUrl")}>
          <div className="key-row">
            <input
              aria-label={t(localLocale, "baseUrl")}
              type="url"
              value={baseUrl}
              placeholder="https://..."
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>
          <p className="muted config-path">
            <span>{configPath}</span>
          </p>
        </SettingsSection>

        <SettingsSection icon={<KeyRound size={15} />} title={t(localLocale, "accessToken")}>
          <p className="muted">{t(localLocale, "accessTokenHelper")}</p>
          <div className="key-row password-row">
            <input
              aria-label={t(localLocale, "accessToken")}
              type={showToken ? "text" : "password"}
              value={accessToken}
              placeholder={
                config?.hasAccessToken
                  ? config.accessTokenMasked || "••••••••••••••••"
                  : ""
              }
              onChange={(event) => setAccessToken(event.target.value)}
            />
            <button
              type="button"
              className="ghost-toggle"
              onClick={() => setShowToken((value) => !value)}
              aria-label={showToken ? t(localLocale, "hideToken") : t(localLocale, "showToken")}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="settings-actions">
            <span className={config?.hasAccessToken ? "configured" : "configured muted-status"}>
              <CheckCircle2 size={17} />
              {config?.hasAccessToken ? t(localLocale, "configured") : t(localLocale, "notConfigured")}
            </span>
          </div>
        </SettingsSection>

        <SettingsSection icon={<Info size={15} />} title={t(localLocale, "userId")}>
          <p className="muted">{t(localLocale, "userIdHelper")}</p>
          <div className="key-row">
            <input
              aria-label={t(localLocale, "userId")}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={userId}
              placeholder="123"
              onChange={(event) => setUserId(event.target.value)}
            />
          </div>
        </SettingsSection>

        <SettingsSection icon={<RefreshCw size={15} />} title={t(localLocale, "autoRefresh")}>
          <Toggle
            label={t(localLocale, "enableAutoRefresh")}
            checked={autoRefresh}
            onChange={setAutoRefresh}
          />
          {autoRefresh && (
            <div className="segmented">
              {refreshIntervalValues.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={refresh === value ? "selected" : ""}
                  onClick={() => setRefresh(value)}
                >
                  {intervalLabels[value]}
                </button>
              ))}
            </div>
          )}
        </SettingsSection>

        <SettingsSection icon={<CreditCard size={15} />} title={t(localLocale, "lowBalanceThreshold")}>
          <p className="muted">{t(localLocale, "thresholdHint")}</p>
          <div className="key-row threshold-row">
            <input
              aria-label={t(localLocale, "lowBalanceThreshold")}
              type="number"
              min={0}
              step={0.5}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value) || 0)}
            />
          </div>
        </SettingsSection>

        <SettingsSection icon={<Globe size={15} />} title={t(localLocale, "language")}>
          <div className="segmented locale-segmented">
            <button
              type="button"
              className={localLocale === "zh" ? "selected" : ""}
              onClick={() => setLocalLocale("zh")}
            >
              中文
            </button>
            <button
              type="button"
              className={localLocale === "en" ? "selected" : ""}
              onClick={() => setLocalLocale("en")}
            >
              English
            </button>
          </div>
        </SettingsSection>

        <SettingsSection icon={<Power size={15} />} title={t(localLocale, "autostart")}>
          <Toggle
            label={t(localLocale, "enableAutostart")}
            checked={autostart}
            onChange={setAutostart}
          />
        </SettingsSection>

        <div className="settings-actions settings-footer-actions">
          <button className="primary" type="button" onClick={saveSettings} disabled={busy}>
            {t(localLocale, "save")}
          </button>
          <button className="secondary" type="button" onClick={probeConnection} disabled={busy}>
            {t(localLocale, "probe")}
          </button>
        </div>
        <p className="muted status-line">{status}</p>

        <SettingsSection icon={<Info size={15} />} title={t(localLocale, "about")}>
          <div className="version-row">
            <span>{t(localLocale, "version")}</span>
            <strong>v{appVersion}</strong>
          </div>
        </SettingsSection>
      </div>
    </section>
  );
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i />
    </label>
  );
}

function ModelDetailPanel({
  locale,
  modelName,
  usage,
  usageState,
  onBack,
}: {
  locale: Locale;
  modelName: string;
  usage: UsageSummaryView | null;
  usageState: BalanceState;
  onBack: () => void;
}) {
  const data = usage?.byModel.find((item) => item.modelName === modelName) ?? null;
  const totalText = data ? fmtTokensShort(data.totalTokens) : "—";
  const quotaText = data ? fmtMoney(data.quota) : "—";

  return (
    <section className="panel detail-panel" data-testid="detail-panel">
      <button className="floating-close" onClick={onBack} aria-label={t(locale, "back")}>
        <X size={20} />
      </button>
      <article className="card detail-hero" data-tauri-drag-region>
        <div className="model-badge large relay">
          <Brain size={33} />
        </div>
        <div>
          <h1>{modelName}</h1>
          <p>{t(locale, "modelDetail")}</p>
        </div>
      </article>

      <div className="detail-metrics">
        <article className="card metric-card">
          <span>{t(locale, "tokens")}</span>
          <strong className="relay">{totalText}</strong>
        </article>
        <article className="card metric-card">
          <span>{t(locale, "quotaUsed")}</span>
          <strong className="relay">{quotaText}</strong>
        </article>
      </div>

      <UsageChart
        locale={locale}
        byDay={data?.byDay ?? []}
        state={usageState}
        title={t(locale, "tokenUsage7d")}
        className="detail-chart"
      />
    </section>
  );
}

// Apply the saved theme before first render to avoid a flash of the wrong skin.
document.documentElement.setAttribute("data-theme", localStorage.getItem("ui-theme") || "dark");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
