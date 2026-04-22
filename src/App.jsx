import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const SERVICES = [
  { id: "codex", name: "Codex", mark: "CX" },
  { id: "claude", name: "Claude", mark: "CL" },
  { id: "cursor", name: "Cursor", mark: "CR" },
  { id: "gemini", name: "Gemini", mark: "GM" },
  { id: "copilot", name: "Copilot", mark: "CP" },
];
const VISIBLE_SERVICE_IDS = new Set(["codex", "claude"]);
const THEME_KEY = "ai-usage-theme";
const LANGUAGE_KEY = "ai-usage-language";
const COPY = {
  es: {
    updated: "Actualizado",
    waiting: "Esperando datos locales",
    light: "Claro",
    dark: "Oscuro",
    extraUsage: "Uso extra",
    cost: "Coste",
    today: "Hoy",
    last30Days: "Ultimos 30 dias",
    used: "usado",
    thisMonth: "Este mes",
    noLocalLimits: "No hay limites locales para este proveedor.",
    connectClaudeText: "Conecta Claude para leer los limites reales.",
    connectClaude: "Conectar Claude",
    usage: "Uso",
    currentSession: "Sesion actual",
    weekly: "Semanal",
    monthly: "Mensual",
    resetsNow: "Se restablece ahora",
    resetsIn: "Se restablece en",
    now: "ahora",
    agoMinutes: (minutes) => `hace ${minutes}m`,
    agoHours: (hours) => `hace ${hours}h`,
    missing: "No existe",
    cycleSessions: "Sesiones del ciclo",
    liveApiUnavailable: "API real no disponible.",
    cachedWebRead: "Ultima lectura web conservada por fallo temporal.",
  },
  en: {
    updated: "Updated",
    waiting: "Waiting for local data",
    light: "Light",
    dark: "Dark",
    extraUsage: "Extra usage",
    cost: "Cost",
    today: "Today",
    last30Days: "Last 30 days",
    used: "used",
    thisMonth: "This month",
    noLocalLimits: "No local limits are available for this provider.",
    connectClaudeText: "Connect Claude to read real limits.",
    connectClaude: "Connect Claude",
    usage: "Usage",
    currentSession: "Current session",
    weekly: "Weekly",
    monthly: "Monthly",
    resetsNow: "Resets now",
    resetsIn: "Resets in",
    now: "now",
    agoMinutes: (minutes) => `${minutes}m ago`,
    agoHours: (hours) => `${hours}h ago`,
    missing: "Missing",
    cycleSessions: "Cycle sessions",
    liveApiUnavailable: "Live API unavailable.",
    cachedWebRead: "Last web reading kept after a temporary failure.",
  },
};

const fallbackSummary = {
  generatedAt: null,
  activeSources: 0,
  totalSources: SERVICES.length,
  services: SERVICES.map((service) => emptyService(service.id, service.name, service.mark)),
};

export default function App() {
  const [summary, setSummary] = useState(fallbackSummary);
  const [selectedId, setSelectedId] = useState("codex");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [language, setLanguage] = useState(() => localStorage.getItem(LANGUAGE_KEY) || "es");

  useEffect(() => {
    let cancelled = false;
    loadSummary().then((next) => {
      if (!cancelled) setSummary(next);
    });

    const interval = window.setInterval(() => {
      loadSummary().then((next) => {
        if (!cancelled) setSummary(next);
      });
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!window.aiUsage?.onSummaryUpdated) return undefined;
    return window.aiUsage.onSummaryUpdated(setSummary);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  const services = useMemo(() => orderServices(summary.services), [summary.services]);
  const visibleServices = useMemo(() => services.filter((service) => VISIBLE_SERVICE_IDS.has(service.id)), [services]);
  const selected =
    visibleServices.find((service) => service.id === selectedId) || visibleServices[0] || fallbackSummary.services[0];
  const copy = COPY[language] || COPY.es;

  return (
    <main className="screen">
      <section className="usage-popover">
        <div className="usage-content">
          <header className="service-header">
            <div>
              <h1>{selected.name}</h1>
              <p>{summary.generatedAt ? `${copy.updated} ${relativeTime(summary.generatedAt, language)}` : copy.waiting}</p>
            </div>
            <div className="header-actions">
              <span>{displayStatusLabel(selected.statusLabel, language)}</span>
              <button className="pill-toggle" type="button" onClick={() => setLanguage(language === "es" ? "en" : "es")}>
                {language === "es" ? "EN" : "ES"}
              </button>
              <button className="pill-toggle" type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? copy.light : copy.dark}
              </button>
            </div>
          </header>

          <section className="limits-stack">
            {selected.limits?.length ? (
              selected.limits.map((limit) => <LimitBlock key={`${selected.id}-${limit.name}`} limit={limit} language={language} />)
            ) : selected.status === "planned" ? (
              <FutureProvider service={selected} language={language} />
            ) : selected.id === "claude" ? (
              <ClaudeConnectState service={selected} language={language} />
            ) : (
              <p className="empty">{displayServiceDetail(selected.detail, language) || copy.noLocalLimits}</p>
            )}
          </section>

          <section className="usage-section">
            <h2>{copy.extraUsage}</h2>
            <Meter value={extraUsagePercent(selected.extraUsage)} />
            <div className="row muted">
              <span>{extraUsageLabel(selected.extraUsage, language)}</span>
              <strong>{extraUsagePercent(selected.extraUsage)}% {copy.used}</strong>
            </div>
          </section>

          <section className="usage-section">
            <h2>{copy.cost}</h2>
            <button className="cost-row" type="button">
              <span>{copy.today}: {todayFromDetail(selected.detail)} · {selected.metric}</span>
              <span aria-hidden="true">›</span>
            </button>
            <p className="muted">{copy.last30Days}: {selected.metric}</p>
          </section>
        </div>

        <nav className="service-tabs" aria-label="Servicios">
          {visibleServices.map((service) => (
            <button
              className={`tab-button ${service.id === selected.id ? "active" : ""}`}
              data-live={service.status === "live"}
              key={service.id}
              onClick={() => setSelectedId(service.id)}
              type="button"
            >
              <AgentIcon id={service.id} label={service.name} />
              <span className="tab-label">{shortName(service)}</span>
            </button>
          ))}
        </nav>

      </section>
    </main>
  );
}

function LimitBlock({ limit, language }) {
  const copy = COPY[language] || COPY.es;
  return (
    <section className="limit-block">
      <h2>{displayLimitName(limit.name, language)}</h2>
      <Meter value={limit.usedPercent} />
      <div className="row muted">
        <span>{limit.usedPercent}% {copy.used}</span>
        <strong>{formatReset(limit.resetAt, language)}</strong>
      </div>
    </section>
  );
}

function Meter({ value }) {
  return (
    <div className="thin-bar" aria-hidden="true">
      <span style={{ width: `${clamp(value)}%` }} />
    </div>
  );
}

function FutureProvider({ service, language }) {
  return (
    <section className="future-card">
      <AgentIcon id={service.id} label={service.name} />
      <div>
        <h2>{service.name}</h2>
        <p>{displayServiceDetail(service.detail, language)}</p>
      </div>
    </section>
  );
}

function ClaudeConnectState({ service, language }) {
  const copy = COPY[language] || COPY.es;
  return (
    <section className="future-card">
      <AgentIcon id="claude" label="Claude" />
      <div>
        <h2>Claude</h2>
        <p>{displayServiceDetail(service.detail, language) || copy.connectClaudeText}</p>
        {window.aiUsage?.connectClaude ? (
          <button className="inline-action" type="button" onClick={() => window.aiUsage.connectClaude()}>
            {copy.connectClaude}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function AgentIcon({ id, label }) {
  const title = `${label} icon`;
  if (id === "codex") {
    return (
      <svg className="agent-icon codex-icon" viewBox="0 0 24 24" role="img" aria-label={title}>
        <path d="M12 3.1c1.4 0 2.6.7 3.4 1.8 1.3-.1 2.6.5 3.3 1.7.7 1.2.7 2.6.1 3.7.7 1.1.7 2.6.1 3.8-.7 1.2-2 1.8-3.3 1.7-.8 1.1-2 1.8-3.4 1.8s-2.6-.7-3.4-1.8c-1.3.1-2.6-.5-3.3-1.7-.7-1.2-.7-2.6-.1-3.8-.7-1.1-.7-2.6-.1-3.8.7-1.2 2-1.8 3.3-1.7.8-1 2-1.7 3.4-1.7Z" />
        <path d="M8.8 7.1 15.2 11v6M15.2 7.1 8.8 11v6M5.9 10.2 12 13.8l6.1-3.6" />
      </svg>
    );
  }
  if (id === "claude") {
    return (
      <svg className="agent-icon claude-icon" viewBox="0 0 24 24" role="img" aria-label={title}>
        <path d="M12 2.6 13.7 8.5l5.5-2.9-2.9 5.5 5.9 1.7-5.9 1.7 2.9 5.5-5.5-2.9L12 22.8l-1.7-5.9L4.8 19.8l2.9-5.5-5.9-1.7 5.9-1.7-2.9-5.5 5.5 2.9L12 2.6Z" />
      </svg>
    );
  }
  if (id === "cursor") {
    return (
      <svg className="agent-icon cursor-icon" viewBox="0 0 24 24" role="img" aria-label={title}>
        <path d="M12 2.8 19.8 7.3v9.1L12 21 4.2 16.4V7.3L12 2.8Z" />
        <path d="M12 2.8v18.1M4.4 7.4l7.6 4.5 7.6-4.5" />
      </svg>
    );
  }
  if (id === "gemini") {
    return (
      <svg className="agent-icon gemini-icon" viewBox="0 0 24 24" role="img" aria-label={title}>
        <path d="M12 2.8c1.1 5.2 3.9 8 9.2 9.2-5.3 1.2-8.1 4-9.2 9.2-1.2-5.2-4-8-9.2-9.2 5.2-1.2 8-4 9.2-9.2Z" />
      </svg>
    );
  }
  return (
    <svg className="agent-icon copilot-icon" viewBox="0 0 24 24" role="img" aria-label={title}>
      <path d="M7.2 10.2c0-2.7 2.1-4.7 4.8-4.7s4.8 2 4.8 4.7v4.5c0 2-1.6 3.8-3.7 3.8h-2.2c-2.1 0-3.7-1.8-3.7-3.8v-4.5Z" />
      <path d="M7.3 10.4 4.4 12v3.3l2.8 1.2M16.7 10.4l2.9 1.6v3.3l-2.8 1.2" />
      <path d="M10 12.6h.1M13.9 12.6h.1" />
    </svg>
  );
}

async function loadSummary() {
  if (window.aiUsage?.getSummary) return window.aiUsage.getSummary();
  try {
    const response = await fetch("/api/summary", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    return fallbackSummary;
  }
}

function orderServices(services) {
  const wanted = ["codex", "claude", "cursor", "gemini", "copilot"];
  return [...services].sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id));
}

function shortName(service) {
  if (service.id === "copilot") return "Copilot";
  return service.name.replace(" Code", "");
}

function displayLimitName(name, language) {
  const copy = COPY[language] || COPY.es;
  if (!name) return copy.usage;
  if (name.match(/sesion|session/i)) return copy.currentSession;
  if (name.match(/semanal|weekly/i)) return copy.weekly;
  if (name.match(/ciclo|monthly/i)) return copy.monthly;
  return name;
}

function formatReset(value, language) {
  const copy = COPY[language] || COPY.es;
  if (!value) return "";
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return copy.resetsNow;
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${copy.resetsIn} ${days}d ${hours}h`;
  if (hours > 0) return `${copy.resetsIn} ${hours}h ${mins}m`;
  return `${copy.resetsIn} ${mins}m`;
}

function relativeTime(value, language) {
  const copy = COPY[language] || COPY.es;
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return copy.now;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return copy.agoMinutes(minutes);
  return copy.agoHours(Math.floor(minutes / 60));
}

function todayFromDetail(detail) {
  const match = String(detail || "").match(/(?:Hoy|Today):\s*([^.]*)/i);
  return match ? match[1].trim() : "local";
}

function extraUsagePercent(extraUsage) {
  if (!extraUsage) return 0;
  if (Number.isFinite(Number(extraUsage.utilization))) return clamp(extraUsage.utilization);
  const used = Number(extraUsage.used);
  const limit = Number(extraUsage.limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return clamp((used / limit) * 100);
}

function extraUsageLabel(extraUsage, language) {
  const copy = COPY[language] || COPY.es;
  if (!extraUsage) return `${copy.thisMonth}: 0.00 / 0.00`;
  const currency = extraUsage.currency || "USD";
  return `${copy.thisMonth}: ${money(extraUsage.used, currency)} / ${money(extraUsage.limit, currency)}`;
}

function money(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

function statusUrl(id) {
  if (id === "claude") return "https://status.anthropic.com/";
  if (id === "cursor") return "https://status.cursor.com/";
  if (id === "gemini") return "https://status.cloud.google.com/";
  if (id === "copilot") return "https://www.githubstatus.com/";
  return "https://status.openai.com/";
}

function displayStatusLabel(label, language) {
  if (!label) return "";
  if (language === "en") {
    return String(label)
      .replace(/^Sin datos$/i, "No data")
      .replace(/^Próximamente$/i, "Soon");
  }
  return label;
}

function displayServiceDetail(detail, language) {
  if (!detail) return "";
  if (language !== "en") return detail;
  return String(detail)
    .replace(/^No existe /, "Missing ")
    .replace(/Hoy:/g, "Today:")
    .replace(/Sesiones del ciclo:/g, "Cycle sessions:")
    .replace(/API real no disponible\./g, "Live API unavailable.")
    .replace(/Ultima lectura web conservada por fallo temporal\./g, "Last web reading kept after a temporary failure.")
    .replace(/La integración de uso para este proveedor se implementará en futuras versiones\./g, "Usage integration for this provider will be implemented in a future version.")
    .replace(/Abre la herramienta como app Electron para leer datos locales\./g, "Open the tool as an Electron app to read local data.");
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function emptyService(id, name, mark) {
  return {
    id,
    name,
    mark,
    statusLabel: "",
    metric: "-",
    detail: "Abre la herramienta como app Electron para leer datos locales.",
    limits: [],
  };
}
