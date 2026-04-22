const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ORDER = ["codex", "claude", "cursor", "gemini", "copilot"];
const CLAUDE_OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_WEB_API_URL = "https://claude.ai/api";
const CLAUDE_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CLAUDE_WEB_CACHE_TTL_MS = 15 * 60_000;

let lastClaudeWebService = null;

async function getSummary() {
  const services = await Promise.all(ORDER.map((id) => {
    if (id === "codex") return readCodex();
    if (id === "claude") return readClaude();
    if (id === "cursor") return futureService("cursor", "Cursor", "CR", "Cursor local/API", "https://cursor.com/");
    if (id === "gemini") return futureService("gemini", "Gemini", "GM", "Google AI Studio / Cloud", "https://aistudio.google.com/usage");
    return futureService("copilot", "Copilot", "CP", "GitHub Copilot", "https://github.com/settings/copilot");
  }));

  return {
    generatedAt: new Date().toISOString(),
    activeSources: services.filter((service) => service.status === "live").length,
    totalSources: services.length,
    services,
  };
}

function readCodex() {
  const sessionsDir = path.join(os.homedir(), ".codex", "sessions");
  const service = baseService("codex", "Codex", "CX", "Local ~/.codex/sessions");

  if (!fs.existsSync(sessionsDir)) {
    return {
      ...service,
      status: "needs_config",
      statusLabel: "Sin datos",
      detail: `No existe ${sessionsDir}`,
    };
  }

  const files = walkFiles(sessionsDir, ".jsonl")
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, 80);

  let latestRate = null;
  let latestInfo = null;
  let latestTimestamp = null;
  let monthlyTokens = 0;
  let todayTokens = 0;
  let sessionCount = 0;
  const monthStart = startOfMonth();
  const now = new Date();

  for (const file of files) {
    const parsed = readCodexSession(file);
    if (!parsed.timestamp) continue;

    if (parsed.tokens && parsed.timestamp >= monthStart) {
      monthlyTokens += parsed.tokens;
      sessionCount += 1;
    }
    if (parsed.tokens && sameDay(parsed.timestamp, now)) {
      todayTokens += parsed.tokens;
    }
    if (parsed.rateLimits && (!latestTimestamp || parsed.timestamp > latestTimestamp)) {
      latestRate = parsed.rateLimits;
      latestInfo = parsed.info;
      latestTimestamp = parsed.timestamp;
    }
  }

  const limits = [];
  const sessionPercent = sessionUsagePercent(latestInfo);
  if (sessionPercent !== null) {
    limits.push(limit("Sesion actual", sessionPercent, null));
  }
  if (latestRate?.primary) limits.push(rateLimit(latestRate.primary, "5 h"));
  if (latestRate?.secondary) limits.push(rateLimit(latestRate.secondary, "Semanal"));

  return {
    ...service,
    status: "live",
    statusLabel: latestRate?.plan_type || "local",
    metric: `${compact(monthlyTokens)} tokens`,
    detail: `Hoy: ${compact(todayTokens)}. Sesiones del ciclo: ${sessionCount}.`,
    limits,
  };
}

function readCodexSession(file) {
  let lastUsage = null;
  let lastInfo = null;
  let lastRate = null;
  let lastTimestamp = null;

  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event?.payload?.type !== "token_count") continue;
        if (event.payload.info?.total_token_usage) {
          lastUsage = event.payload.info.total_token_usage;
          lastInfo = event.payload.info;
          lastTimestamp = new Date(event.timestamp);
        }
        if (event.payload.rate_limits) {
          lastRate = event.payload.rate_limits;
        }
      } catch {
        // Ignore partial JSON lines from active sessions.
      }
    }
  } catch {
    return {};
  }

  return {
    timestamp: lastTimestamp,
    tokens: tokenTotal(lastUsage),
    rateLimits: lastRate,
    info: lastInfo,
  };
}

async function readClaude() {
  const local = readClaudeLocalUsage();
  const oauth = await readClaudeOAuthUsage(local);
  if (oauth) return oauth;

  const cookieHeader = readClaudeCookieHeader();
  if (cookieHeader) {
    const web = await readClaudeWebUsage(local, cookieHeader);
    if (web) {
      lastClaudeWebService = { service: web, cachedAt: Date.now() };
      return web;
    }
    if (lastClaudeWebService && Date.now() - lastClaudeWebService.cachedAt < CLAUDE_WEB_CACHE_TTL_MS) {
      return {
        ...lastClaudeWebService.service,
        detail: `${lastClaudeWebService.service.detail} Ultima lectura web conservada por fallo temporal.`,
      };
    }
  }

  return local;
}

function readClaudeLocalUsage() {
  const usageDir = path.join(os.homedir(), ".claude", "usage-data", "session-meta");
  const service = baseService("claude", "Claude", "CL", "Local ~/.claude/usage-data");

  if (!fs.existsSync(usageDir)) {
    return {
      ...service,
      status: "needs_config",
      statusLabel: "Sin datos",
      detail: `No existe ${usageDir}`,
    };
  }

  const files = walkFiles(usageDir, ".json");
  const monthStart = startOfMonth();
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  const now = new Date();
  let monthlyTokens = 0;
  let todayTokens = 0;
  let sessionCount = 0;

  for (const file of files) {
    try {
      const meta = JSON.parse(fs.readFileSync(file, "utf8"));
      const timestamp = new Date(meta.start_time);
      const tokens = Number(meta.input_tokens || 0) + Number(meta.output_tokens || 0);
      if (timestamp >= monthStart && timestamp < monthEnd) {
        monthlyTokens += tokens;
        sessionCount += 1;
      }
      if (sameDay(timestamp, now)) todayTokens += tokens;
    } catch {
      // Ignore malformed metadata files.
    }
  }

  return {
    ...service,
    status: "live",
    statusLabel: "local",
    metric: `${compact(monthlyTokens)} tokens`,
    detail: `Hoy: ${compact(todayTokens)}. Sesiones del ciclo: ${sessionCount}. API real no disponible.`,
    limits: [],
  };
}

async function readClaudeOAuthUsage(local) {
  const credentialsPath = path.join(os.homedir(), ".claude", ".credentials.json");
  let credentials = null;

  try {
    credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8")).claudeAiOauth;
  } catch {
    return null;
  }

  const token = credentials?.accessToken;
  if (!token) return null;

  // Current Claude Code tokens often only include user:inference, which the usage
  // endpoint rejects. Skip those quickly and leave web/manual cookie as fallback.
  const scopes = Array.isArray(credentials.scopes) ? credentials.scopes : [];
  if (scopes.length && !scopes.includes("user:profile")) return null;

  try {
    const response = await fetch(CLAUDE_OAUTH_USAGE_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "claude-code/2.1.0",
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;
    const json = await response.json();
    return claudeApiService(json, {
      base: local,
      source: "Claude OAuth API",
      statusLabel: claudePlanLabel(credentials),
    });
  } catch {
    return null;
  }
}

async function readClaudeWebUsage(local, cookieHeader) {
  try {
    const organizations = await claudeWebGet("/organizations", cookieHeader);
    const organization = selectClaudeOrganization(organizations);
    if (!organization?.uuid) return null;

    const usage = await claudeWebGet(`/organizations/${organization.uuid}/usage`, cookieHeader);
    const account = await optionalClaudeWebGet("/account", cookieHeader);
    const overage = await optionalClaudeWebGet(`/organizations/${organization.uuid}/overage_spend_limit`, cookieHeader);
    const service = claudeApiService(usage, {
      base: local,
      source: "Claude Web API",
      statusLabel: claudeWebPlanLabel(account, organization.uuid) || organization.name || "web",
    });

    if (overage?.is_enabled && Number.isFinite(Number(overage.used_credits)) && Number.isFinite(Number(overage.monthly_credit_limit))) {
      service.extraUsage = {
        used: Number(overage.used_credits) / 100,
        limit: Number(overage.monthly_credit_limit) / 100,
        currency: overage.currency || "USD",
      };
    }
    return service;
  } catch {
    return null;
  }
}

async function claudeWebGet(endpoint, cookieHeader) {
  const response = await fetch(`${CLAUDE_WEB_API_URL}${endpoint}`, {
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader,
      "User-Agent": CLAUDE_BROWSER_USER_AGENT,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Claude web API HTTP ${response.status}`);
  return response.json();
}

async function optionalClaudeWebGet(endpoint, cookieHeader) {
  try {
    return await claudeWebGet(endpoint, cookieHeader);
  } catch {
    return null;
  }
}

function readClaudeCookieHeader() {
  const appDataDir = process.env.AI_USAGE_DATA_DIR;
  const candidates = [
    process.env.AI_USAGE_CLAUDE_COOKIE,
    appDataDir ? readClaudeCookieJson(path.join(appDataDir, "claude-cookies.json")) : null,
    appDataDir ? readTextIfExists(path.join(appDataDir, "claude-cookie.txt")) : null,
    readClaudeCookieJson(path.join(os.homedir(), ".agentbar", "claude-cookies.json")),
    readTextIfExists(path.join(os.homedir(), ".agentbar", "claude-cookie.txt")),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeClaudeCookieHeader(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function readClaudeCookieJson(file) {
  try {
    const cookies = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(cookies)) return null;
    const now = Date.now() / 1000;
    const usable = cookies
      .filter((cookie) => cookie?.name && cookie?.value)
      .filter((cookie) => !cookie.expirationDate || cookie.expirationDate > now);
    if (!usable.some((cookie) => cookie.name === "sessionKey" && cookie.value.startsWith("sk-ant-"))) return null;
    return usable.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  } catch {
    return null;
  }
}

function normalizeClaudeCookieHeader(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withoutPrefix = raw.replace(/^Cookie:\s*/i, "").trim();
  if (withoutPrefix.startsWith("sk-ant-")) return `sessionKey=${withoutPrefix}`;
  const match = withoutPrefix.match(/(?:^|;\s*)sessionKey=([^;]+)/);
  if (!match?.[1]?.startsWith("sk-ant-")) return null;
  return withoutPrefix;
}

function readTextIfExists(file) {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  } catch {
    return null;
  }
}

function claudeApiService(json, options) {
  const limits = [];
  addClaudeWindow(limits, json.five_hour, "Sesion actual");
  addClaudeWindow(limits, json.seven_day, "Semanal");
  addClaudeWindow(limits, json.seven_day_sonnet, "Sonnet");
  addClaudeWindow(limits, json.seven_day_opus, "Opus");

  const service = {
    ...options.base,
    source: options.source,
    status: "live",
    statusLabel: options.statusLabel || "Claude",
    detail: options.base.detail.replace(" API real no disponible", ""),
    limits,
  };

  if (json.extra_usage?.is_enabled) {
    service.extraUsage = {
      used: centsToUnits(json.extra_usage.used_credits),
      limit: centsToUnits(json.extra_usage.monthly_limit),
      currency: json.extra_usage.currency || "USD",
      utilization: clamp(json.extra_usage.utilization),
    };
  }
  return service;
}

function addClaudeWindow(limits, window, name) {
  if (!window || window.utilization === undefined || window.utilization === null) return;
  limits.push(limit(name, Number(window.utilization), window.resets_at || null));
}

function selectClaudeOrganization(organizations) {
  if (!Array.isArray(organizations)) return null;
  return organizations.find((org) => Array.isArray(org.capabilities) && org.capabilities.includes("chat"))
    || organizations.find((org) => !Array.isArray(org.capabilities) || !org.capabilities.length || !org.capabilities.every((capability) => capability === "api"))
    || organizations[0]
    || null;
}

function claudePlanLabel(credentials) {
  return credentials?.subscriptionType || credentials?.rateLimitTier || "oauth";
}

function claudeWebPlanLabel(account, orgId) {
  const membership = account?.memberships?.find((item) => item?.organization?.uuid === orgId) || account?.memberships?.[0];
  const org = membership?.organization;
  return org?.rate_limit_tier || org?.billing_type || null;
}

function centsToUnits(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number / 100 : null;
}

function futureService(id, name, mark, source, url) {
  return {
    ...baseService(id, name, mark, source),
    status: "planned",
    statusLabel: "Próximamente",
    metric: "Futuras versiones",
    detail: "La integración de uso para este proveedor se implementará en futuras versiones.",
    url,
    limits: [],
  };
}

function baseService(id, name, mark, source) {
  return {
    id,
    name,
    mark,
    source,
    status: "idle",
    statusLabel: "local",
    metric: "-",
    detail: "",
    url: null,
    limits: [],
  };
}

function rateLimit(value, fallbackName) {
  const minutes = Number(value.window_minutes || 0);
  const name = minutes === 300 ? "5 h" : minutes === 10080 ? "Semanal" : fallbackName;
  const usedPercent = clamp(Math.round(Number(value.used_percent || 0)));
  const resetAt = value.resets_at ? new Date(Number(value.resets_at) * 1000).toISOString() : null;
  return limit(name, usedPercent, resetAt);
}

function limit(name, usedPercent, resetAt) {
  const used = clamp(usedPercent);
  return {
    name,
    usedPercent: used,
    remainingPercent: clamp(100 - used),
    resetAt,
  };
}

function sessionUsagePercent(info) {
  const total = Number(info?.last_token_usage?.total_tokens || 0);
  const context = Number(info?.model_context_window || 0);
  if (!total || !context) return null;
  return clamp(Math.round((total / context) * 100));
}

function tokenTotal(usage) {
  return Number(usage?.total_tokens || 0);
}

function walkFiles(root, extension) {
  const found = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      if (entry.isFile() && entry.name.endsWith(extension)) found.push(fullPath);
    }
  }
  return found;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function compact(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

module.exports = { getSummary };
