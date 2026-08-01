import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders the records navigation entry as available", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("records", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/"), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await response.text();
  assert.match(html, />记录</);
  assert.doesNotMatch(html, /记录功能即将开放/);
});

test("AI organizer fails safely when the server key is absent", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("organize", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/api/organize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "测试记录" }) }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "AI 服务尚未配置" });
});

test("AI organizer rejects malformed and empty input before checking configuration", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("invalid-organize", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const malformed = await worker.fetch(new Request("http://localhost/api/organize", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), env, context);
  assert.equal(malformed.status, 400);
  const empty = await worker.fetch(new Request("http://localhost/api/organize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "   " }) }), env, context);
  assert.equal(empty.status, 400);
});

test("record move menu opens on hover and escapes the scrolling list", async () => {
  const [view, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/records-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(view, /onMouseEnter=\{\(event\) => showMoveMenu/);
  assert.match(view, /onFocus=\{\(event\) => showMoveMenu/);
  assert.match(css, /\.record-menu \{[^}]*width: 88px/);
  assert.match(css, /\.record-move-menu \{[^}]*position: fixed/);
  assert.match(css, /\.record-move-menu \{[^}]*z-index: 100/);
});

test("record search fills its complete toolbar row", async () => {
  const css = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"));
  assert.match(css, /\.record-toolbar \{[^}]*grid-template-columns: minmax\(0,1fr\)/);
  assert.match(css, /\.record-toolbar \{[^}]*justify-content: stretch/);
  assert.match(css, /\.record-toolbar-title \{[^}]*width: 100%/);
  assert.match(css, /\.record-toolbar input \{ width: 100%/);
});

test("record count and AI action share the editor header", async () => {
  const [view, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/records-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(view, /<header><span className="editor-category">.*className="editor-count">.*className=\{`save-state.*className="ai-button"/s);
  assert.match(css, /\.save-state \{[^}]*color:[^}]*white-space: nowrap/);
  assert.doesNotMatch(css, /\.save-state \{[^}]*margin-left: auto/);
  assert.match(css, /\.record-editor > header \.ai-button \{[^}]*min-height: 44px;[^}]*margin-left: auto/);
  assert.match(css, /\.record-editor > header \.ai-button > span \{[^}]*min-height: 32px;[^}]*padding: 0 9px/);
  assert.match(css, /\.editor-category \{[^}]*min-height: 32px;[^}]*padding: 0 9px/);
  assert.doesNotMatch(view, /<footer><span>\{selected\.body\.length\}/);
});
