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
  assert.match(view, /createPortal\(<div className="record-move-menu"/);
  assert.match(view, /onMouseEnter=\{keepMoveMenuOpen\}/);
  assert.match(view, /rect\.right \+ menuWidth <= window\.innerWidth/);
  assert.match(css, /\.record-menu \{[^}]*width: 88px/);
  assert.match(css, /\.record-move-menu \{[^}]*position: fixed/);
  assert.match(css, /\.record-move-menu \{[^}]*z-index: 1000/);
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

test("modern violet design system and emoji navigation stay in place", async () => {
  const [page, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(page, /<span aria-hidden>📅<\/span>安排/);
  assert.match(page, /<span aria-hidden>📝<\/span>记录/);
  assert.match(page, /<span aria-hidden>🔖<\/span>信息/);
  assert.match(page, /<span aria-hidden>🌤️<\/span>心情/);
  assert.match(css, /--violet-9:\s*#5b5bd6/);
  assert.match(css, /--amber-9:\s*#ffc53d/);
  assert.match(css, /--success-9:\s*#30a46c/);
  assert.match(css, /--tomato-11:\s*#d13415/);
  assert.match(css, /backdrop-filter:\s*blur\(18px\)/);
});

test("desktop record controls use the compact size system", async () => {
  const css = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"));
  assert.match(css, /--control-compact:\s*36px/);
  assert.match(css, /\.quick-note footer button \{[^}]*min-height: var\(--control-compact\)/s);
  assert.match(css, /\.category-bar > button, \.category-tab \{[^}]*min-height: var\(--control-compact\)/s);
  assert.match(css, /\.records-modal > header h2 \{[^}]*font-size: 20px/s);
  assert.match(css, /@media \(max-width: 640px\) \{[^}]*--control-compact: 44px/s);
});

test("design system documents the confirmed density and visual guardrails", async () => {
  const design = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../design.md", import.meta.url), "utf8"));
  assert.match(design, /primary: "#5b5bd6"/);
  assert.match(design, /control-compact: 36px/);
  assert.match(design, /control-default: 40px/);
  assert.match(design, /touch-target: 44px/);
  assert.match(design, /error: "#d13415"/);
  assert.match(design, /重点卡片使用浅紫同色系纯色或透明色调，不使用渐变/);
  assert.match(design, /琥珀黄只承担小面积提醒/);
  assert.match(design, /## Overview[\s\S]*## Colors[\s\S]*## Typography[\s\S]*## Layout[\s\S]*## Elevation & Depth[\s\S]*## Shapes[\s\S]*## Components[\s\S]*## Do's and Don'ts/);
});

test("desktop information controls use the compact size system", async () => {
  const css = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"));
  assert.match(css, /\.info-index button, \.info-manage \{[^}]*min-height: var\(--control-compact\)/s);
  assert.match(css, /\.system-section header button, \.resource-section header button \{[^}]*width: var\(--control-compact\)[^}]*height: var\(--control-compact\)/s);
  assert.match(css, /\.info-dialog footer button, \.section-add button \{[^}]*min-height: var\(--control-compact\)/s);
  assert.match(css, /\.info-dialog > input, \.section-add input, \.section-manage-row input \{[^}]*min-height: 40px/s);
  assert.match(css, /\.info-search \{[^}]*min-height: 40px/s);
  assert.match(css, /\.block-actions button \{[^}]*width: var\(--control-compact\)[^}]*height: var\(--control-compact\)/s);
  assert.match(css, /\.file-block a \{[^}]*min-height: var\(--control-compact\)/s);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*\.info-index button, \.info-manage,[\s\S]*min-height: var\(--control-compact\)/);
});

test("information detail is one accessible document editor with complete core controls", async () => {
  const [view, model, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/information-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/information.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(view, /contentEditable[^>]*role="textbox"[^>]*aria-multiline="true"/);
  for (const label of ["文字样式", "加粗", "斜体", "项目符号列表", "编号列表", "待办列表", "插入表格", "添加附件", "撤销", "重做"]) assert.match(view, new RegExp(`aria-label="${label}"`));
  assert.match(view, /onPaste=\{handlePaste\}/);
  assert.match(view, /onDrop=.*addFiles/s);
  assert.match(view, /event\.key === "Backspace" \|\| event\.key === "Delete"/);
  assert.match(view, /setPreviewFile\(file\)/);
  assert.match(view, /editTable\("row-add"\)/);
  assert.match(view, /editTable\("column-remove"\)/);
  assert.match(model, /sanitizeDocumentHtml/);
  assert.match(model, /linkifyPlainText/);
  assert.match(css, /\.document-editor a \{[^}]*text-decoration: underline/);
  assert.match(css, /\.document-editor table \{[^}]*overflow-x: auto/);
});
