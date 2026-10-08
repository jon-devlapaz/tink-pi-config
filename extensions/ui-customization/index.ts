import { homedir } from "node:os";
import { relative } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const OSC_PATTERN =
  /(?:\u001b\]|\u009d)(?:[^\u0007\u001b\u009c]|\u001b(?!\\))*(?:\u0007|\u001b\\|\u009c)/g;
const CSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
const ESCAPE_PATTERN = /\u001b(?:[()][0-2A-Z]|[ -/]*[@-~])/g;

function sanitizeTerminalLabel(text: string) {
  return text
    .replace(OSC_PATTERN, "")
    .replace(CSI_PATTERN, "")
    .replace(ESCAPE_PATTERN, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

function formatDirectory(cwd: string) {
  const home = homedir();
  if (cwd === home) return "~";
  const display = cwd.startsWith(`${home}/`) ? `~/${relative(home, cwd)}` : cwd;
  return sanitizeTerminalLabel(display);
}

export default function uiCustomization(pi: ExtensionAPI) {
  function install(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;

    ctx.ui.setHeader(() => ({
      render(_width: number) {
        return [];
      },
      invalidate() {},
    }));
    ctx.ui.setTitle(`pi · ${formatDirectory(ctx.cwd)}`);
  }

  pi.on("session_start", (_event, ctx) => install(ctx));

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode === "tui") ctx.ui.setHeader(undefined);
  });
}
