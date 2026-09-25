import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "router-status";
const HISTORY_LIMIT = 20;

interface RouteRecord {
  timestamp: number;
  requestedModel?: string;
  routedVia?: string;
  status: number;
  fallbackAttempts: number;
  fallbackTrail?: string;
}

function getHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === want && value !== "") return value;
  }
}

function decodeRoute(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseFallbackAttempts(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type Paint = {
  fg(
    color:
      | "accent"
      | "success"
      | "error"
      | "warning"
      | "muted"
      | "dim"
      | "text"
      | "toolTitle"
      | "syntaxFunction"
      | "syntaxKeyword"
      | "syntaxString"
      | "syntaxType"
      | "mdLink",
    text: string,
  ): string;
};

const PROVIDER_TINTS = [
  "accent",
  "success",
  "toolTitle",
  "syntaxFunction",
  "syntaxKeyword",
  "syntaxString",
  "syntaxType",
  "mdLink",
] as const;

function requestedModelFromPayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("model" in payload))
    return;
  const model = payload.model;
  return typeof model === "string" && model.length > 0 ? model : undefined;
}

function tintFor(name: string): (typeof PROVIDER_TINTS)[number] {
  let hash = 0;
  for (const ch of name) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  return PROVIDER_TINTS[hash % PROVIDER_TINTS.length]!;
}

function paintRouted(theme: Paint, routed: string): string {
  const slash = routed.indexOf("/");
  if (slash <= 0) return theme.fg(tintFor(routed), routed);
  const provider = routed.slice(0, slash);
  const model = routed.slice(slash + 1);
  return (
    theme.fg(tintFor(provider), provider) +
    theme.fg("dim", "/") +
    theme.fg("text", model)
  );
}

function paintFallback(theme: Paint, attempts: number, label: string): string {
  if (attempts <= 0) return "";
  return theme.fg("dim", " · ") + theme.fg("warning", label);
}

function formatStatus(record: RouteRecord, theme: Paint): string {
  if (record.status >= 400)
    return theme.fg("error", `route ✗ HTTP ${record.status}`);
  const fallback = paintFallback(
    theme,
    record.fallbackAttempts,
    `↻${record.fallbackAttempts}`,
  );
  if (!record.routedVia) {
    const requested = record.requestedModel
      ? theme.fg("muted", record.requestedModel)
      : theme.fg("dim", `HTTP ${record.status}`);
    return requested + fallback;
  }
  const routed = paintRouted(theme, record.routedVia);
  if (!record.requestedModel || record.requestedModel === record.routedVia)
    return routed + fallback;
  return (
    theme.fg("muted", record.requestedModel) +
    theme.fg("dim", " → ") +
    routed +
    fallback
  );
}

function formatLatest(record: RouteRecord, theme: Paint): string {
  const httpColor = record.status >= 400 ? "error" : "success";
  const fallbackColor = record.fallbackAttempts > 0 ? "warning" : "dim";
  const lines = [
    `${theme.fg("dim", "Requested:")} ${record.requestedModel ? theme.fg("muted", record.requestedModel) : theme.fg("dim", "unknown")}`,
    `${theme.fg("dim", "Routed via:")} ${record.routedVia ? paintRouted(theme, record.routedVia) : theme.fg("dim", "(none)")}`,
    `${theme.fg("dim", "HTTP:")} ${theme.fg(httpColor, String(record.status))}`,
    `${theme.fg("dim", "Fallbacks:")} ${theme.fg(fallbackColor, String(record.fallbackAttempts))}`,
  ];
  if (record.fallbackTrail)
    lines.push(
      `${theme.fg("dim", "Trail:")} ${theme.fg("warning", record.fallbackTrail)}`,
    );
  return lines.join("\n");
}

type RouteAction = "latest" | "history" | "clear" | "help";

function parseRouteAction(token: string): RouteAction {
  if (token === "" || token === "latest") return "latest";
  if (token === "history" || token === "clear") return token;
  return "help";
}

function formatHistoryLine(record: RouteRecord, theme: Paint): string {
  const time = theme.fg(
    "dim",
    new Date(record.timestamp).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  );
  const requested = record.requestedModel ?? "unknown";
  const routed = record.routedVia;
  const summary =
    routed && requested !== routed
      ? theme.fg("muted", requested) +
        theme.fg("dim", " → ") +
        paintRouted(theme, routed)
      : routed
        ? paintRouted(theme, routed)
        : theme.fg("muted", requested);
  const fallback = paintFallback(
    theme,
    record.fallbackAttempts,
    `fallback ${record.fallbackAttempts}`,
  );
  if (record.status >= 400) {
    return `${time}  ${summary}${theme.fg("dim", " · ")}${theme.fg("error", `HTTP ${record.status}`)}${fallback}`;
  }
  return `${time}  ${summary}${fallback}`;
}

export default function (pi: ExtensionAPI) {
  let pendingRequestedModel: string | undefined;
  let last: RouteRecord | undefined;
  let history: RouteRecord[] = [];

  const reset = (ctx: {
    ui: { setStatus(key: string, text: string | undefined): void };
  }) => {
    pendingRequestedModel = undefined;
    last = undefined;
    history = [];
    ctx.ui.setStatus(STATUS_KEY, undefined);
  };

  pi.on("before_provider_request", (event) => {
    pendingRequestedModel = requestedModelFromPayload(event.payload);
  });

  pi.on("after_provider_response", (event, ctx) => {
    const routedRaw = getHeader(event.headers, "x-routed-via");
    const attemptsRaw = getHeader(event.headers, "x-fallback-attempts");
    const trailRaw = getHeader(event.headers, "x-fallback-trail");
    if (
      routedRaw === undefined &&
      attemptsRaw === undefined &&
      trailRaw === undefined
    )
      return;

    const record: RouteRecord = {
      timestamp: Date.now(),
      requestedModel: pendingRequestedModel,
      routedVia: routedRaw ? decodeRoute(routedRaw) : undefined,
      status: event.status,
      fallbackAttempts: parseFallbackAttempts(attemptsRaw),
      fallbackTrail: trailRaw,
    };
    last = record;
    history.unshift(record);
    if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
    ctx.ui.setStatus(STATUS_KEY, formatStatus(record, ctx.ui.theme));
  });

  pi.registerCommand("route", {
    description: "Show upstream model routing",
    getArgumentCompletions: (prefix) => {
      const items = [
        { value: "history", label: "history" },
        { value: "clear", label: "clear" },
      ];
      const filtered = items.filter((item) =>
        item.value.startsWith(prefix.trim()),
      );
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const token = args.trim().split(/\s+/)[0] ?? "";
      const action = parseRouteAction(token);
      const theme = ctx.ui.theme;
      switch (action) {
        case "latest":
          ctx.ui.notify(
            last ? formatLatest(last, theme) : "No routing data yet.",
            "info",
          );
          return;
        case "history":
          ctx.ui.notify(
            history.length === 0
              ? "No routing history."
              : history
                  .map((record) => formatHistoryLine(record, theme))
                  .join("\n"),
            "info",
          );
          return;
        case "clear":
          reset(ctx);
          ctx.ui.notify("Routing history cleared.", "info");
          return;
        case "help":
          ctx.ui.notify(
            "Usage: /route | /route history | /route clear",
            "warning",
          );
          return;
        default: {
          const _exhaustive: never = action;
          return _exhaustive;
        }
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    reset(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
