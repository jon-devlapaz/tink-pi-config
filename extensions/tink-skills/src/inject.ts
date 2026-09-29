import type { ContextEvent } from "@earendil-works/pi-coding-agent";
import type { Injection } from "./hook.ts";

type AgentMessage = ContextEvent["messages"][number];

export const FRAMING =
  "tink: the skill below was selected for this request. Apply its instructions to the user's request; do not mention this mechanism unless the user asks.";

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function frameSkill(injection: Injection) {
  return `${FRAMING}\n<tink-skill name="${escapeAttribute(injection.skill)}" digest="${escapeAttribute(injection.treeDigest)}">\n${injection.content}\n</tink-skill>`;
}

function findAnchor(messages: AgentMessage[], anchorTimestamp?: number) {
  let last = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    if (
      anchorTimestamp === undefined ||
      message.timestamp === anchorTimestamp
    ) {
      return i;
    }
    if (last < 0) last = i;
  }
  return last;
}

export function applyInjection(
  messages: AgentMessage[],
  injection: Injection,
  anchorTimestamp?: number,
): AgentMessage[] | undefined {
  const index = findAnchor(messages, anchorTimestamp);
  if (index < 0) return undefined;
  const target = messages[index];
  if (target.role !== "user") return undefined;
  const block = frameSkill(injection);
  const content =
    typeof target.content === "string"
      ? [
          { type: "text" as const, text: target.content },
          { type: "text" as const, text: block },
        ]
      : [...target.content, { type: "text" as const, text: block }];
  const next = messages.slice();
  next[index] = { ...target, content };
  return next;
}
