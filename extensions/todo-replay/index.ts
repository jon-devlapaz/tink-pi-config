import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
  SessionEntry,
  SessionMessageEntry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

export const SNAPSHOT = "todo.persistence.snapshot";

export function replayEntries(entries: SessionEntry[]): SessionEntry[] {
  return entries.map((entry) => {
    if (entry.type !== "custom" || entry.customType !== SNAPSHOT) return entry;
    return {
      ...entry,
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: entry.id,
        toolName: "todo",
        content: [],
        details: entry.data as Extract<
          SessionMessageEntry["message"],
          { role: "toolResult" }
        >["details"],
        isError: false,
        timestamp: Date.parse(entry.timestamp),
      },
    };
  });
}

export function persistenceApi(pi: ExtensionAPI): ExtensionAPI {
  return new Proxy(pi, {
    get(target, key, receiver) {
      if (key === "registerTool")
        return (tool: ToolDefinition) => {
          if (tool.name !== "todo") return target.registerTool(tool);
          target.registerTool({
            ...tool,
            async execute(...args) {
              const result = await tool.execute(...args);
              const details = result.details as {
                tasks?: unknown;
                nextId?: unknown;
                error?: unknown;
              };
              if (
                !details ||
                !Array.isArray(details.tasks) ||
                !Number.isSafeInteger(details.nextId)
              ) {
                throw new Error(
                  "Todo returned an invalid persistence snapshot",
                );
              }
              const params = args[1] as { action?: string };
              if (
                !details.error &&
                ["create", "update", "delete", "clear"].includes(
                  params.action ?? "",
                )
              ) {
                target.appendEntry(SNAPSHOT, {
                  tasks: details.tasks,
                  nextId: details.nextId,
                });
              }
              return result;
            },
          });
        };
      if (key === "on")
        return (
          event: string,
          handler: (event: unknown, ctx: ExtensionContext) => unknown,
        ) => {
          if (
            !["session_start", "session_tree", "session_compact"].includes(
              event,
            )
          ) {
            return Reflect.apply(target.on, target, [event, handler]);
          }
          return Reflect.apply(target.on, target, [
            event,
            (value: unknown, ctx: ExtensionContext) => {
              const manager = new Proxy(ctx.sessionManager, {
                get(sm, property) {
                  if (property === "getBranch")
                    return () => replayEntries(sm.getBranch());
                  const value = Reflect.get(sm, property, sm);
                  return typeof value === "function" ? value.bind(sm) : value;
                },
              });
              const context = new Proxy(ctx, {
                get(c, property) {
                  return property === "sessionManager"
                    ? manager
                    : Reflect.get(c, property, c);
                },
              });
              return handler(value, context);
            },
          ]);
        };
      return Reflect.get(target, key, receiver);
    },
  });
}

export default async function todoPersistence(pi: ExtensionAPI) {
  const vendor = pathToFileURL(
    join(getAgentDir(), "npm/node_modules/@juicesharp/rpiv-todo/index.ts"),
  ).href;
  const { default: register } = (await import(vendor)) as {
    default: ExtensionFactory;
  };
  await register(persistenceApi(pi));
}
