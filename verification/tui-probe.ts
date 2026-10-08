import fs from "node:fs";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { visibleWidth } from "@earendil-works/pi-tui";
export default function (pi: any) {
  const log = (event: any) =>
    fs.appendFileSync(process.env.PROBE_LOG!, JSON.stringify(event) + "\n");
  let calls = 0;
  pi.registerProvider("footer-test", {
    baseUrl: "http://127.0.0.1:1",
    apiKey: "local-test-only",
    api: "footer-test-api",
    models: [
      {
        id: "fixture",
        name: "Footer fixture",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 4096,
      },
    ],
    streamSimple: (model: any, context: any, options: any) => {
      const stream = createAssistantMessageEventStream();
      const n = ++calls;
      log({ event: "model-call", n });
      void (async () => {
        const issueTodo =
          context.messages.at(-1)?.role === "user" &&
          JSON.stringify(context.messages.at(-1)?.content).includes(
            "PLUMBING-CREATE-TODO",
          );
        const text = n % 2 ? "TURN-COMPLETE" : "Inspect the next test.";
        const msg: any = {
          role: "assistant",
          content: [],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 100,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 105,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        };
        stream.push({ type: "start", partial: msg });
        if (issueTodo) {
          msg.content.push({
            type: "toolCall",
            id: "todo-ui-" + n,
            name: "todo",
            arguments: { action: "create", subject: "TUI synthetic task" },
          });
          msg.stopReason = "toolUse";
          stream.push({ type: "done", reason: "toolUse", message: msg });
          stream.end();
          return;
        }
        msg.content.push({ type: "text", text: "" });
        stream.push({ type: "text_start", contentIndex: 0, partial: msg });
        await new Promise((resolve) => setTimeout(resolve, 100));
        msg.content[0].text = text;
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: text,
          partial: msg,
        });
        stream.push({
          type: "text_end",
          contentIndex: 0,
          content: text,
          partial: msg,
        });
        stream.push({ type: "done", reason: "stop", message: msg });
        stream.end();
      })();
      return stream;
    },
  });
  pi.on("session_start", (_e: any, ctx: any) => {
    log({ event: "ready", mode: ctx.mode });
    const setFooter = ctx.ui.setFooter.bind(ctx.ui);
    ctx.ui.setFooter = (factory: any) => {
      log({ event: "footer-install", enabled: !!factory });
      return setFooter(
        factory
          ? (...args: any[]) => {
              const c = factory(...args);
              const render = c.render.bind(c);
              c.render = (width: number) => {
                const lines = render(width);
                log({
                  event: "footer-render",
                  width,
                  widths: lines.map(visibleWidth),
                  lines,
                });
                return lines;
              };
              return c;
            }
          : undefined,
      );
    };
    const setEditor = ctx.ui.setEditorComponent.bind(ctx.ui);
    ctx.ui.setEditorComponent = (factory: any) => {
      log({ event: "editor-install", enabled: !!factory });
      return setEditor(factory);
    };
    const setText = ctx.ui.setEditorText.bind(ctx.ui);
    ctx.ui.setEditorText = (text: string) => {
      log({ event: "editor-text", text });
      return setText(text);
    };
  });
  pi.on("input", (e: any) => {
    log({ event: "input", text: e.text });
  });
  pi.on("tool_execution_end", (e: any) =>
    log({ event: "tool-end", tool: e.toolName, isError: e.isError }),
  );
  pi.on("agent_settled", () => {
    log({ event: "settled" });
  });
}
