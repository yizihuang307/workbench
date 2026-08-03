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
  assert.match(css, /\.record-menu \{[^}]*width: 112px/);
  assert.match(css, /\.record-menu button \{[^}]*min-height: 36px;[^}]*padding: 0 10px;[^}]*font-size: 13px/s);
  assert.match(css, /\.record-move-menu \{[^}]*position: fixed/);
  assert.match(css, /\.record-move-menu \{[^}]*z-index: 1000/);
  assert.match(css, /\.record-move-menu \{[^}]*width: 112px/);
  assert.match(css, /\.record-move-menu button \{[^}]*min-height: 36px;[^}]*padding: 0 10px;[^}]*font-size: 13px/s);
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

test("modern violet design system and active navigation stay in place", async () => {
  const [page, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(page, /<span aria-hidden>📅<\/span>安排/);
  assert.match(page, /<span aria-hidden>📝<\/span>记录/);
  assert.match(page, /<span aria-hidden>🔗<\/span>链接/);
  assert.match(page, /<span aria-hidden>📚<\/span>资料/);
  assert.doesNotMatch(page, /<span aria-hidden>🌤️<\/span>心情/);
  assert.doesNotMatch(page, /<div className="mood-block">/);
  assert.match(page, /心情模块暂时隐藏/);
  assert.match(css, /\.sidebar nav \{ grid-template-columns: repeat\(4,1fr\);/);
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
  const [view, editor, model, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/resource-board-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/information-editor.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/information.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(view, /<InformationEditor/);
  assert.match(editor, /useEditor\(\{/);
  assert.match(editor, /immediatelyRender: false/);
  assert.match(editor, /attributes: \{ class: "tiptap-document", "aria-label": "资料正文" \}/);
  for (const label of ["文字样式", "加粗", "斜体", "项目符号", "编号", "待办", "表格", "附件", "撤销", "重做"]) assert.match(editor, new RegExp(`(?:aria-label=|action\\()"${label}"`));
  assert.match(editor, /handlePaste\(view, event\)/);
  assert.match(editor, /handleDrop\(view, event\)/);
  assert.match(editor, /input[^>]*multiple type="file"/);
  assert.match(editor, /TaskItem\.configure\(\{ nested: true \}\)/);
  assert.match(editor, /from "lucide-react"/);
  assert.match(editor, /event\.target === event\.currentTarget/);
  assert.match(editor, /TableKit\.configure/);
  assert.match(editor, /tableActive && <div className="table-context"/);
  assert.match(editor, /addRowAfter\(\)/);
  assert.match(editor, /deleteColumn\(\)/);
  assert.match(editor, /resourceImage/);
  assert.match(editor, /image-resize-handle/);
  assert.match(editor, /title="点击放大"/);
  assert.match(editor, /resource-image-preview/);
  assert.match(editor, /resourceAttachment/);
  assert.doesNotMatch(editor, /document\.execCommand/);
  assert.match(model, /sanitizeDocumentHtml/);
  assert.match(model, /linkifyPlainText/);
  assert.match(css, /\.tiptap-document a \{[^}]*text-decoration: underline/);
  assert.match(css, /ul:not\(\[data-type="taskList"\]\) \{ list-style-type: disc/);
  assert.match(css, /\.tiptap-document ol \{ list-style-type: decimal/);
  assert.match(css, /\.tiptap-document \{ width: 100%; min-height: 58vh/);
  assert.match(css, /grid-template-columns: 20px minmax\(0,1fr\)/);
  assert.match(css, /li > div > p \{ min-height: 1\.75em; margin: 0; \}/);
  assert.match(css, /\.tiptap-document \.tableWrapper \{[^}]*overflow-x: auto/);
  assert.match(css, /\.image-resize-handle/);
});

test("record and information filter tabs use restrained color markers", async () => {
  const [css, design] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../design.md", import.meta.url), "utf8")),
  ]);
  assert.match(css, /--blue-9:\s*#0090ff/);
  assert.match(css, /\.category-bar > button:not\(\.category-manage\)::before, \.category-tab > button::before,[\s\S]*\.info-index button::before \{[\s\S]*width: 8px;[\s\S]*border-radius: 50%/);
  assert.match(css, /\.category-tab:nth-child\(2\) > button::before, \.info-index button:nth-child\(2\)::before \{ background: var\(--success-9\)/);
  assert.doesNotMatch(css, /\.category-manage::before/);
  assert.match(design, /\*\*Tab 色标圆点\*\*/);
  assert.match(design, /管理、设置、删除等动作按钮不加圆点/);
});

test("desktop record list and editor scroll independently", async () => {
  const css = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"));
  assert.match(css, /@media \(min-width: 641px\) \{[\s\S]*\.records-page \{[\s\S]*height: 100vh;[\s\S]*overflow: hidden;/);
  assert.match(css, /\.records-layout \{[\s\S]*min-height: 0;[\s\S]*flex: 1 1 auto;/);
  assert.match(css, /\.record-browser, \.record-editor \{ min-height: 0; overflow: hidden; \}/);
  assert.match(css, /\.record-list, \.record-document-editor \{[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior: contain;/);
});

test("information management exposes complete edit, move and delete actions", async () => {
  const [linkView, resourceView, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/link-library-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/resource-board-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(linkView, /aria-label="编辑常用链接"/);
  assert.match(linkView, /编辑名称和网址/);
  assert.match(linkView, /deleteLinkGroup/);
  assert.match(resourceView, /className="section-delete compact-delete"/);
  assert.match(resourceView, /deleteResourceSection/);
  assert.match(resourceView, /role="alertdialog"/);
  assert.match(resourceView, /className="resource-actions-menu"/);
  assert.match(resourceView, /确认删除/);
  assert.match(resourceView, /迁移并删除分区/);
  assert.match(linkView, /迁移并删除分组/);
  assert.doesNotMatch(resourceView, /className="board-card-move"/);
  assert.doesNotMatch(linkView, /className="system-move"/);
  assert.match(css, /\.sort-popover \{[^}]*z-index: 30/);
});

test("information search is a single direct input without a decorative outer box", async () => {
  const [view, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/link-library-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(view, /<div className="info-search search-only"><input/);
  assert.doesNotMatch(view, /<label className="info-search"><span/);
  assert.match(css, /\.info-search \{[^}]*border: 0/);
  assert.match(css, /\.info-search input \{[^}]*border: 1px solid/);
});

test("information link creation and search use the revised interaction", async () => {
  const [view, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/link-library-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.doesNotMatch(view, /重新识别名称和 Logo/);
  assert.doesNotMatch(view, /粘贴网址后，将自动识别网站名称和 Logo/);
  assert.match(view, /<span>名称<\/span>/);
  assert.match(view, /自动填充，可修改/);
  assert.match(view, /nameEditedRef\.current/);
  assert.match(view, /function HighlightText/);
  assert.match(css, /\.system-open mark, \.resource-main mark/);
});

test("resource board exposes tested manual category and cross-column movement", async () => {
  const [view, model, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/resource-board-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/information.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(model, /export function reorderResourceSections/);
  assert.match(model, /export function moveResource/);
  assert.match(view, /reorderResourceSections/);
  assert.match(view, /moveResource/);
  assert.match(view, /className=\{`board-card\$\{draggedId === item\.id \? " dragging"/);
  assert.match(view, /className="resource-actions-menu"/);
  assert.match(view, /aria-label=\{`上移\$\{section\.name\}`\}/);
  assert.match(view, /aria-label=\{`下移\$\{section\.name\}`\}/);
  assert.match(css, /\.board-column\.dragging/);
  assert.match(css, /\.resource-actions-menu/);
});

test("mobile resource board remains a fixed-width horizontal board", async () => {
  const css = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"));
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*\.board-columns \{[^}]*overflow-x: auto/s);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*\.board-column \{[^}]*flex: 0 0 min\(82vw, 304px\)/s);
});

test("link grouping uses the same safe ordering primitives and manual drag state", async () => {
  const [view, model] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/link-library-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/information.ts", import.meta.url), "utf8")),
  ]);
  assert.match(model, /export function reorderLinkGroups/);
  assert.match(model, /export function moveLink/);
  assert.match(model, /export function deleteLinkGroup/);
  assert.match(view, /className=\{`system-row\$\{draggedId === item\.id \? " dragging"/);
  assert.match(view, /reorderLinkGroups/);
  assert.match(view, /deleteLinkGroup/);
  assert.match(view, /moveLink/);
});

test("links and resources use compact manual boards without redundant tabs or sort controls", async () => {
  const [links, resources] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/link-library-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/resource-board-view.tsx", import.meta.url), "utf8")),
  ]);
  assert.doesNotMatch(links, />排序：|aria-label="网格视图"|aria-label="列表视图"|aria-label="分组索引"/);
  assert.doesNotMatch(resources, />排序：|aria-label="分区索引"/);
  assert.match(links, /className="link-columns"/);
  assert.match(links, /className=\{`link-column/);
  assert.match(links, /draggedId === item\.id \? " dragging"/);
  assert.match(resources, /draggedId === item\.id \? " dragging"/);
  const css = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"));
  assert.match(css, /\.link-column \.system-row \{[^}]*background: #fff/);
});

test("information hydration and cross-tab sync do not write stale data back", async () => {
  const page = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8"));
  assert.match(page, /const suppressInfoSave = useRef\(false\)/);
  assert.match(page, /suppressInfoSave\.current = true; setInfoStore\(parsedInfo\)/);
  assert.match(page, /if \(suppressInfoSave\.current\) \{ suppressInfoSave\.current = false; return; \}/);
});
