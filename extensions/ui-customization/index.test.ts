import assert from "node:assert/strict";
import test from "node:test";
import uiCustomization from "./index.ts";

function node(lines: string[], children?: any[]): any {
  return {
    ...(children ? { children } : {}),
    render() {
      return children
        ? this.children.flatMap((child: any) => child.render())
        : lines;
    },
    invalidate() {},
    requestRender() {},
  };
}

function fixture(mode = "tui") {
  const handlers = new Map<string, any>();
  const errors = node(["Extension error: STARTUP-FAILURE-7214"]);
  const resources = node([], [node(["[Themes]", "github-dark"])]);
  const document = node([], [resources, errors]);
  const tui = node([], [document]);
  const headers: any[] = [];
  const titles: string[] = [];
  const ctx = {
    mode,
    cwd: "/fixture",
    ui: {
      setHeader(factory: any) {
        headers.push(factory ? factory(tui) : undefined);
      },
      setTitle(title: string) {
        titles.push(title);
      },
    },
  };
  uiCustomization({
    on: (name: string, fn: any) => handlers.set(name, fn),
  } as any);
  return { handlers, tui, document, errors, resources, headers, titles, ctx };
}

test("quiet header never removes resource diagnostics or the transcript tree", async () => {
  const f = fixture();
  try {
    f.handlers.get("session_start")({}, f.ctx);
    f.handlers.get("resources_discover")?.({}, f.ctx);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.deepEqual(f.headers[0].render(120), []);
    assert.deepEqual(f.titles, ["pi · /fixture"]);
    assert.equal(f.tui.children[0], f.document);
    assert.equal(f.document.children[0], f.resources);
    assert.equal(f.document.children[1], f.errors);
    assert(f.tui.render().includes("Extension error: STARTUP-FAILURE-7214"));
  } finally {
    f.handlers.get("session_shutdown")({}, f.ctx);
  }
  assert.equal(f.headers.at(-1), undefined);
});

test("headless startup does not install any UI customization", () => {
  const f = fixture("json");
  f.handlers.get("session_start")({}, f.ctx);
  f.handlers.get("session_shutdown")({}, f.ctx);
  assert.deepEqual(f.headers, []);
  assert.deepEqual(f.titles, []);
});
