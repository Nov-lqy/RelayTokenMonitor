import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  BarChart3,
  Brain,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  Info,
  KeyRound,
  Link2,
  Power,
  RefreshCw,
  Settings,
  Shirt,
  SunMedium,
  X,
  Zap,
} from "lucide-react";
import { t } from "./i18n";
import type { AppConfigView, BalanceView, Locale } from "./types";
import "./styles.css";

type ViewName = "dashboard" | "settings" | "detail";
type ModelName = "flash" | "pro";
type BalanceState = "loading" | "ok" | "error" | "nokey";

/** Temporary dashboard shape until Task 8 rewires the home view. */
type BalanceData = {
  isAvailable: boolean;
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
};
type UsageModel = {
  key: string;
  name: string;
  totalTokens: number;
  requestCount: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  responseTokens: number;
  cost: number;
};
type UsageDay = {
  date: string;
  flashTokens: number;
  flashCacheHit: number;
  flashCacheMiss: number;
  flashResponse: number;
  proTokens: number;
  proCacheHit: number;
  proCacheMiss: number;
  proResponse: number;
  totalTokens: number;
  totalCost: number;
};
type UsageResult = {
  models: UsageModel[];
  days: UsageDay[];
  monthCost: number;
};

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
const recentUsageDays = (days: UsageDay[], count = 7): UsageDay[] => {
  const source = new Map(days.filter((day) => day.date <= todayStr()).map((day) => [day.date, day]));
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = dateKey(addDays(today, index - count + 1));
    return (
      source.get(date) ?? {
        date,
        flashTokens: 0,
        flashCacheHit: 0,
        flashCacheMiss: 0,
        flashResponse: 0,
        proTokens: 0,
        proCacheHit: 0,
        proCacheMiss: 0,
        proResponse: 0,
        totalTokens: 0,
        totalCost: 0,
      }
    );
  });
};
const refreshIntervalValues = [60, 300, 1800, 3600] as const;

function App() {
  const [view, setView] = React.useState<ViewName>("dashboard");
  const [model, setModel] = React.useState<ModelName>("flash");

  const [balance, setBalance] = React.useState<BalanceData | null>(null);
  const [balanceState, setBalanceState] = React.useState<BalanceState>("loading");
  const [balanceError, setBalanceError] = React.useState("");

  const [usage, setUsage] = React.useState<UsageResult | null>(null);
  const [usageState, setUsageState] = React.useState<BalanceState>("nokey");
  const [usageError, setUsageError] = React.useState("");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = React.useState(60);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(false);
  const [locale, setLocale] = React.useState<Locale>("zh");

  const loadBalance = React.useCallback(() => {
    setBalanceState("loading");
    void invoke<BalanceView>("fetch_balance")
      .then((data) => {
        if (data.error) {
          const message =
            data.error.toLowerCase().includes("unauthorized")
              ? t(locale, "unauthorized")
              : data.error;
          setBalanceError(message);
          setBalance(null);
          setBalanceState(
            data.error.includes("未配置") || data.error.toLowerCase().includes("access token")
              ? "nokey"
              : "error",
          );
          return;
        }
        setBalance({
          isAvailable: !data.isLow,
          currency: "CNY",
          totalBalance: data.remainingCny.toFixed(2),
          grantedBalance: String(data.quota),
          toppedUpBalance: String(data.usedQuota),
        });
        setBalanceError("");
        setBalanceState("ok");
      })
      .catch((error) => {
        const message = typeof error === "string" ? error : "查询失败";
        setBalanceError(message);
        setBalance(null);
        setBalanceState(message.includes("未配置") ? "nokey" : "error");
      });
  }, [locale]);

  const loadUsage = React.useCallback(() => {
    // Task 8 will wire fetch_usage_summary; keep dashboard from crashing for now.
    setUsage(null);
    setUsageError("");
    setUsageState("nokey");
  }, []);

  const refreshAll = React.useCallback(() => {
    loadBalance();
    loadUsage();
  }, [loadBalance, loadUsage]);

  React.useEffect(() => {
    refreshAll();
  }, [refreshAll]);

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
    const timer = window.setInterval(refreshAll, refreshIntervalSeconds * 1000);
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
          balance={balance}
          balanceState={balanceState}
          balanceError={balanceError}
          usage={usage}
          usageState={usageState}
          usageError={usageError}
          onRefresh={refreshAll}
          onClose={hideWindow}
          onSettings={() => setView("settings")}
          onDetail={(nextModel) => {
            setModel(nextModel);
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
      {view === "detail" && (
        <ModelDetailPanel model={model} usage={usage} usageState={usageState} onBack={() => setView("dashboard")} />
      )}
    </div>
  );
}

function BrandIcon({ size = 32 }: { size?: number }) {
  return (
    <div className="brand-icon" style={{ width: size, height: size }}>
      <img src="/assets/deepseek-color.png" alt="DeepSeek" />
    </div>
  );
}

function DashboardPanel({
  balance,
  balanceState,
  balanceError,
  usage,
  usageState,
  usageError,
  onRefresh,
  onClose,
  onSettings,
  onDetail,
}: {
  balance: BalanceData | null;
  balanceState: BalanceState;
  balanceError: string;
  usage: UsageResult | null;
  usageState: BalanceState;
  usageError: string;
  onRefresh: () => void;
  onClose: () => void;
  onSettings: () => void;
  onDetail: (model: ModelName) => void;
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
  const flash = usage?.models.find((item) => item.key === "flash") ?? null;
  const pro = usage?.models.find((item) => item.key === "pro") ?? null;
  const maxTokens = Math.max(flash?.totalTokens ?? 0, pro?.totalTokens ?? 0, 1);
  const today = usage?.days.find((day) => day.date === todayStr()) ?? null;
  const todayCost = usageState === "ok" && today ? today.totalCost : null;
  const monthCost = usageState === "ok" && usage ? usage.monthCost : null;

  return (
    <section className="panel dashboard-panel" data-testid="dashboard-panel">
      <header className="panel-header" data-tauri-drag-region>
        <div className="title-lockup" data-tauri-drag-region>
          <BrandIcon size={36} />
          <h1>DeepSeek Monitor</h1>
        </div>
        <div className="header-actions">
          <button aria-label="刷新" onClick={onRefresh}>
            <RefreshCw size={22} />
          </button>
          <div className="skin-menu-wrap">
            <button
              aria-label="Toggle theme"
              className="skin-toggle"
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
              onClick={toggleTheme}
            >
              <Shirt size={21} />
            </button>
          </div>
          <button aria-label="设置" onClick={onSettings}>
            <Settings size={23} />
          </button>
          <button aria-label="关闭" onClick={onClose}>
            <X size={25} />
          </button>
        </div>
      </header>

      <BalanceCard
        balance={balance}
        state={balanceState}
        error={balanceError}
        todayCost={todayCost}
        monthCost={monthCost}
      />

      <div className="usage-stack">
        <UsageRow
          modelKey="flash"
          data={flash}
          maxTokens={maxTokens}
          state={usageState}
          onClick={() => onDetail("flash")}
        />
        <UsageRow
          modelKey="pro"
          data={pro}
          maxTokens={maxTokens}
          state={usageState}
          onClick={() => onDetail("pro")}
        />
      </div>

      <UsageChart usage={usage} state={usageState} error={usageError} />
    </section>
  );
}

function BalanceCard({
  balance,
  state,
  error,
  todayCost,
  monthCost,
}: {
  balance: BalanceData | null;
  state: BalanceState;
  error: string;
  todayCost: number | null;
  monthCost: number | null;
}) {
  const symbol = balance?.currency === "USD" ? "$" : "¥";
  const amount =
    state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置"
        : state === "error"
          ? "查询失败"
          : `${symbol}${balance?.totalBalance ?? "0.00"}`;
  const statusText = state === "ok" ? (balance?.isAvailable ? "可用" : "余额不足") : "—";
  const statusOff = state === "ok" && balance != null && !balance.isAvailable;

  return (
    <article className="card balance-card">
      <div className="card-title-row">
        <div className="caption-with-icon">
          <CreditCard size={15} />
          <span>账户余额</span>
        </div>
        <div className={`status-pill ${statusOff ? "off" : ""}`}>
          <span />
          {statusText}
        </div>
      </div>
      <div className={`balance-amount ${state !== "ok" ? "balance-dim" : ""}`}>{amount}</div>
      {state === "error" && <div className="balance-error">{error}</div>}
      <div className="metric-grid">
        <div className="mini-card">
          <div className="caption-with-icon orange">
            <SunMedium size={15} />
            <span>当日消耗</span>
          </div>
          <strong>{todayCost != null ? fmtMoney(todayCost) : "—"}</strong>
        </div>
        <div className="mini-card">
          <div className="caption-with-icon orange">
            <CalendarDays size={15} />
            <span>本月消费</span>
          </div>
          <strong>{monthCost != null ? fmtMoney(monthCost) : "—"}</strong>
        </div>
      </div>
    </article>
  );
}

function UsageRow({
  modelKey,
  data,
  maxTokens,
  state,
  onClick,
}: {
  modelKey: ModelName;
  data: UsageModel | null;
  maxTokens: number;
  state: BalanceState;
  onClick: () => void;
}) {
  const isFlash = modelKey === "flash";
  const name = isFlash ? "V4 Flash" : "V4 Pro";
  const tokensText = data
    ? `${fmtInt(data.totalTokens)} Tokens`
    : state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置 Token"
        : state === "error"
          ? "用量不可用"
          : "—";
  const cost = data ? fmtMoney(data.cost) : "—";
  const ratio = data && data.cost > 0 ? `${fmtTokensShort(data.totalTokens / data.cost)} T/¥` : "—";
  const width = data ? `${Math.max(2, (data.totalTokens / maxTokens) * 100)}%` : "0%";

  return (
    <button className="card usage-row" onClick={onClick}>
      <div className={`model-badge ${isFlash ? "flash" : "pro"}`}>
        {isFlash ? <Zap size={27} fill="currentColor" /> : <Brain size={25} />}
      </div>
      <div className="usage-main">
        <h2>{name}</h2>
        <div className="token-line">
          <span>{tokensText}</span>
          <div className="progress-track">
            <i className={isFlash ? "flash-fill" : "pro-fill"} style={{ width }} />
          </div>
        </div>
        {data && data.cacheHitTokens + data.cacheMissTokens > 0 && (
          <span className={`cache-hit-rate ${isFlash ? "flash" : "pro"}`}>
            缓存命中{" "}
            {((data.cacheHitTokens / (data.cacheHitTokens + data.cacheMissTokens)) * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="usage-price">
        <strong>{cost}</strong>
        <span>{ratio}</span>
      </div>
    </button>
  );
}

function UsageChart({
  usage,
  state,
  error,
}: {
  usage: UsageResult | null;
  state: BalanceState;
  error: string;
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  const MIN_BAR = 3;
  const days = recentUsageDays(usage?.days ?? []);
  const points = days.map((day) => {
    // Flash 与 Pro 合并，不分模型
    const hit = day.flashCacheHit + day.proCacheHit;
    const miss = day.flashCacheMiss + day.proCacheMiss;
    const response = day.flashResponse + day.proResponse;
    return { date: day.date, hit, miss, response, total: hit + miss + response };
  });
  const maxVal = Math.max(...points.map((point) => point.total), 1);
  const sumHit = points.reduce((sum, point) => sum + point.hit, 0);
  const sumMiss = points.reduce((sum, point) => sum + point.miss, 0);
  const sumTotal = points.reduce((sum, point) => sum + point.total, 0);
  const hitRate = sumHit + sumMiss > 0 ? ((sumHit / (sumHit + sumMiss)) * 100).toFixed(0) : "0";
  const placeholder =
    state === "loading"
      ? "查询中…"
      : state === "nokey"
        ? "未配置用量 Token"
        : state === "error"
          ? error
          : "暂无数据";

  return (
    <article className="card chart-card">
      <div className="card-title-row">
        <div className="caption-with-icon">
          <BarChart3 size={16} className="brand-blue" />
          <span>缓存命中明细</span>
        </div>
        <span className="chart-total">
          {state === "ok" ? `命中率 ${hitRate}% · 合计 ${fmtTokensShort(sumTotal)}` : "—"}
        </span>
      </div>
      {state === "ok" && points.length > 0 ? (
        <>
          <div className="bars" onMouseLeave={() => setHoveredIdx(null)}>
            {points.map((point, idx) => (
              <div className="bar-column" key={point.date}>
                {hoveredIdx === idx && point.total > 0 && (
                  <div
                    className={`bar-tooltip${
                      idx <= 1 ? " align-left" : idx >= points.length - 2 ? " align-right" : ""
                    }`}
                  >
                    <div className="bar-tooltip-head">
                      <span className="bar-tooltip-date">{point.date}</span>
                      <strong>{fmtInt(point.total)} tokens</strong>
                    </div>
                    <span className="bar-tooltip-row">
                      <i className="dot hit" />输入（命中缓存）
                      <strong>{fmtInt(point.hit)} tokens</strong>
                    </span>
                    <span className="bar-tooltip-row">
                      <i className="dot miss" />输入（未命中缓存）
                      <strong>{fmtInt(point.miss)} tokens</strong>
                    </span>
                    <span className="bar-tooltip-row">
                      <i className="dot response" />输出
                      <strong>{fmtInt(point.response)} tokens</strong>
                    </span>
                  </div>
                )}
                <span className="bar-value">
                  {point.total > 0 ? fmtTokensShort(point.total) : "0"}
                </span>
                <div className="bar-slot">
                  <div
                    className="cache-bar"
                    style={{
                      height: `${point.total > 0 ? Math.max(MIN_BAR, (point.total / maxVal) * 100) : MIN_BAR}%`,
                    }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {point.total > 0 ? (
                      <>
                        {point.hit > 0 && <i className="seg hit" style={{ flexGrow: point.hit }} />}
                        {point.miss > 0 && <i className="seg miss" style={{ flexGrow: point.miss }} />}
                        {point.response > 0 && (
                          <i className="seg response" style={{ flexGrow: point.response }} />
                        )}
                      </>
                    ) : (
                      <i className="seg empty" />
                    )}
                  </div>
                </div>
                <span className="bar-day">{mmdd(point.date)}</span>
              </div>
            ))}
          </div>
          <div className="chart-legend-bottom">
            <span className="chart-legend-item">
              <i className="dot hit" />命中
            </span>
            <span className="chart-legend-item">
              <i className="dot miss" />未命中
            </span>
            <span className="chart-legend-item">
              <i className="dot response" />输出
            </span>
          </div>
        </>
      ) : (
        <div className="chart-placeholder">{placeholder}</div>
      )}
    </article>
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
  const [showToken, setShowToken] = React.useState(false);
  const [refresh, setRefresh] = React.useState(60);
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [threshold, setThreshold] = React.useState(5);
  const [localLocale, setLocalLocale] = React.useState<Locale>(locale);
  const [autostart, setAutostart] = React.useState(false);
  const [appVersion, setAppVersion] = React.useState("0.1.0");
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
      .catch(() => setAppVersion("0.1.0"));
  }, []);

  const applyConfig = React.useCallback(
    (next: AppConfigView) => {
      const normalized = normalizeConfig(next);
      setConfig(normalized);
      setBaseUrl(normalized.baseUrl || "");
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
  }, [accessToken, applyConfig, autoRefresh, autostart, baseUrl, localLocale, refresh, threshold]);

  const probeConnection = React.useCallback(() => {
    setBusy(true);
    setStatus(t(localLocale, "probing"));
    void invoke<ProbeResult>("probe_connection")
      .then((probe) => {
        const joined = probe.messages.join(" ");
        if (joined.toLowerCase().includes("unauthorized")) {
          setStatus(t(localLocale, "unauthorized"));
          return;
        }
        if (probe.userSelfOk) {
          setStatus(`${t(localLocale, "probeOk")}: ${probe.messages.join("; ")}`);
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
  model,
  usage,
  usageState,
  onBack,
}: {
  model: ModelName;
  usage: UsageResult | null;
  usageState: BalanceState;
  onBack: () => void;
}) {
  const isFlash = model === "flash";
  const data = usage?.models.find((item) => item.key === model) ?? null;
  const title = isFlash ? "V4 Flash" : "V4 Pro";
  const tintClass = isFlash ? "flash" : "pro";
  const cost = data ? fmtMoney(data.cost) : "—";
  const totalText = data ? fmtTokensShort(data.totalTokens) : "—";

  const days = recentUsageDays(usage?.days ?? []);
  const points = days.map((day) => {
    const hit = isFlash ? day.flashCacheHit : day.proCacheHit;
    const miss = isFlash ? day.flashCacheMiss : day.proCacheMiss;
    const response = isFlash ? day.flashResponse : day.proResponse;
    return { date: day.date, hit, miss, response, total: hit + miss + response };
  });
  const maxVal = Math.max(...points.map((point) => point.total), 1);
  const rangeText =
    points.length > 0 ? `${mmdd(points[0].date)} - ${mmdd(points[points.length - 1].date)}` : "";

  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  const MIN_BAR = 3; // 整根柱子的最小可见高度百分比（含空数据占位）

  return (
    <section className="panel detail-panel" data-testid="detail-panel">
      <button className="floating-close" onClick={onBack} aria-label="返回主面板">
        <X size={20} />
      </button>
      <article className="card detail-hero" data-tauri-drag-region>
        <div className={`model-badge large ${tintClass}`}>
          {isFlash ? <Zap size={34} fill="currentColor" /> : <Brain size={33} />}
        </div>
        <div>
          <h1>{title}</h1>
          <p>{cost}</p>
        </div>
      </article>

      <div className="detail-metrics">
        <article className="card metric-card">
          <span>API 请求次数</span>
          <strong className={tintClass}>{data ? fmtInt(data.requestCount) : "—"}</strong>
        </article>
        <article className="card metric-card">
          <span>Tokens</span>
          <strong className={tintClass}>{totalText}</strong>
        </article>
      </div>

      <article className="card detail-chart">
        <div className="detail-chart-head">
          <div>
            <h2>按日 Token 消耗</h2>
            <span>{rangeText}</span>
          </div>
        </div>
        {usageState === "ok" && points.length > 0 ? (
          <>
            <div className="detail-bars" onMouseLeave={() => setHoveredIdx(null)}>
              {points.map((point, idx) => (
                <div className="detail-bar-column" key={point.date}>
                  {hoveredIdx === idx && point.total > 0 && (
                    <div
                      className={`bar-tooltip${
                        idx <= 1 ? " align-left" : idx >= points.length - 2 ? " align-right" : ""
                      }`}
                    >
                      <div className="bar-tooltip-head">
                        <span className="bar-tooltip-date">{point.date}</span>
                        <strong>{fmtInt(point.total)} tokens</strong>
                      </div>
                      <span className="bar-tooltip-row">
                        <i className="dot hit" />输入（命中缓存）
                        <strong>{fmtInt(point.hit)} tokens</strong>
                      </span>
                      <span className="bar-tooltip-row">
                        <i className="dot miss" />输入（未命中缓存）
                        <strong>{fmtInt(point.miss)} tokens</strong>
                      </span>
                      <span className="bar-tooltip-row">
                        <i className="dot response" />输出
                        <strong>{fmtInt(point.response)} tokens</strong>
                      </span>
                    </div>
                  )}
                  <span>{point.total > 0 ? fmtTokensShort(point.total) : ""}</span>
                  <div className="detail-bar-slot">
                    {/* 柱高按当天合计占最大值的比例；内部三段用 flex-grow 按真实 token 数分配，比例精确且永不溢出裁剪 */}
                    <div
                      className="detail-bar-stacked"
                      style={{
                        height: `${point.total > 0 ? Math.max(MIN_BAR, (point.total / maxVal) * 100) : MIN_BAR}%`,
                      }}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      {point.total > 0 ? (
                        <>
                          {point.hit > 0 && <i className="seg hit" style={{ flexGrow: point.hit }} />}
                          {point.miss > 0 && <i className="seg miss" style={{ flexGrow: point.miss }} />}
                          {point.response > 0 && <i className="seg response" style={{ flexGrow: point.response }} />}
                        </>
                      ) : (
                        <i className="seg empty" />
                      )}
                    </div>
                  </div>
                  <em>{mmdd(point.date)}</em>
                </div>
              ))}
            </div>
            <div className="chart-legend-bottom">
              <span className="chart-legend-item"><i className="dot hit" />命中</span>
              <span className="chart-legend-item"><i className="dot miss" />未命中</span>
              <span className="chart-legend-item"><i className="dot response" />输出</span>
            </div>
          </>
        ) : (
          <div className="chart-placeholder">
            {usageState === "nokey" ? "未配置用量 Token" : usageState === "loading" ? "查询中…" : "暂无数据"}
          </div>
        )}
      </article>
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
