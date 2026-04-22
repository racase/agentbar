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

  const services = useMemo(() => orderServices(summary.services), [summary.services]);
  const visibleServices = useMemo(() => services.filter((service) => VISIBLE_SERVICE_IDS.has(service.id)), [services]);
  const selected =
    visibleServices.find((service) => service.id === selectedId) || visibleServices[0] || fallbackSummary.services[0];

  return (
    <main className="screen">
      <section className="usage-popover">
        <div className="usage-content">
          <header className="service-header">
            <div>
              <h1>{selected.name}</h1>
              <p>{summary.generatedAt ? `Actualizado ${relativeTime(summary.generatedAt)}` : "Esperando datos locales"}</p>
            </div>
            <div className="header-actions">
              <span>{selected.statusLabel}</span>
              <button className="theme-toggle" type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? "Claro" : "Oscuro"}
              </button>
            </div>
          </header>

          <section className="limits-stack">
            {selected.limits?.length ? (
              selected.limits.map((limit) => <LimitBlock key={`${selected.id}-${limit.name}`} limit={limit} />)
            ) : selected.status === "planned" ? (
              <FutureProvider service={selected} />
            ) : selected.id === "claude" ? (
              <ClaudeConnectState service={selected} />
            ) : (
              <p className="empty">{selected.detail || "No hay limites locales para este proveedor."}</p>
            )}
          </section>

          <section className="usage-section">
            <h2>Uso extra</h2>
            <Meter value={extraUsagePercent(selected.extraUsage)} />
            <div className="row muted">
              <span>{extraUsageLabel(selected.extraUsage)}</span>
              <strong>{extraUsagePercent(selected.extraUsage)}% usado</strong>
            </div>
          </section>

          <section className="usage-section">
            <h2>Coste</h2>
            <button className="cost-row" type="button">
              <span>Hoy: {todayFromDetail(selected.detail)} · {selected.metric}</span>
              <span aria-hidden="true">›</span>
            </button>
            <p className="muted">Ultimos 30 dias: {selected.metric}</p>
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

function LimitBlock({ limit }) {
  return (
    <section className="limit-block">
      <h2>{displayLimitName(limit.name)}</h2>
      <Meter value={limit.usedPercent} />
      <div className="row muted">
        <span>{limit.usedPercent}% usado</span>
        <strong>{formatReset(limit.resetAt)}</strong>
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

function FutureProvider({ service }) {
  return (
    <section className="future-card">
      <AgentIcon id={service.id} label={service.name} />
      <div>
        <h2>{service.name}</h2>
        <p>{service.detail}</p>
      </div>
    </section>
  );
}

function ClaudeConnectState({ service }) {
  return (
    <section className="future-card">
      <AgentIcon id="claude" label="Claude" />
      <div>
        <h2>Claude</h2>
        <p>{service.detail || "Conecta Claude para leer los limites reales."}</p>
        {window.aiUsage?.connectClaude ? (
          <button className="inline-action" type="button" onClick={() => window.aiUsage.connectClaude()}>
            Conectar Claude
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
        <path d="M12 3.2 19.6 7.6v8.8L12 20.8l-7.6-4.4V7.6L12 3.2Z" />
        <path d="M8 9.2h8M8 12h8M8 14.8h5.2" />
      </svg>
    );
  }
  if (id === "claude") {
    return (
      <svg className="agent-icon claude-icon" viewBox="0 0 24 24" role="img" aria-label={title}>
        <path d="M12 3.2c1.1 4.8 3.7 7.5 8.6 8.8-4.9 1.3-7.5 4-8.6 8.8-1.2-4.8-3.8-7.5-8.6-8.8 4.8-1.3 7.4-4 8.6-8.8Z" />
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

function displayLimitName(name) {
  if (!name) return "Uso";
  if (name.match(/sesion|session/i)) return "Sesion actual";
  if (name.match(/semanal|weekly/i)) return "Semanal";
  if (name.match(/ciclo|monthly/i)) return "Mensual";
  return name;
}

function formatReset(value) {
  if (!value) return "";
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "Se restablece ahora";
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `Se restablece en ${days}d ${hours}h`;
  if (hours > 0) return `Se restablece en ${hours}h ${mins}m`;
  return `Se restablece en ${mins}m`;
}

function relativeTime(value) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  return `hace ${Math.floor(minutes / 60)}h`;
}

function todayFromDetail(detail) {
  const match = String(detail || "").match(/Hoy:\s*([^.]*)/i);
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

function extraUsageLabel(extraUsage) {
  if (!extraUsage) return "Este mes: 0.00 / 0.00";
  const currency = extraUsage.currency || "USD";
  return `Este mes: ${money(extraUsage.used, currency)} / ${money(extraUsage.limit, currency)}`;
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
