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

test("renders the notes navigation entry as available", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("records", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/"), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await response.text();
  assert.match(html, />随手记</);
  assert.doesNotMatch(html, /记录功能即将开放/);
});

test("navigation and information page slogans use the confirmed names", async () => {
  const [page, links, resources] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/link-library-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/resource-board-view.tsx", import.meta.url), "utf8")),
  ]);
  assert.match(page, />今日事<\/button>/);
  assert.match(page, />随手记<\/button>/);
  assert.match(page, />传送门<\/button>/);
  assert.match(page, />资料库<\/button>/);
  assert.match(links, /<span aria-hidden>🚀<\/span> 链接存到位，效率翻一倍/);
  assert.match(resources, /<span aria-hidden>📚<\/span> 知识常积攒，好运常相伴/);
  assert.doesNotMatch(links, /<h1>传送门<\/h1>/);
  assert.doesNotMatch(resources, /<h1>资料库<\/h1>/);
});

test("schedule exposes completion history with daily and weekly views", async () => {
  const [page, model, css] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/completion-history.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
  ]);
  assert.match(page, />完成记录<\/button>/);
  assert.doesNotMatch(page, />便签模式<\/button>/);
  assert.doesNotMatch(page, /onOpenSticky/);
  assert.match(page, /完成记录<\/button>[\s\S]*<DisplaySettings[\s\S]*快速记录<\/button>/);
  assert.match(page, /function DisplaySettings/);
  assert.match(page, /aria-haspopup="menu" aria-expanded=\{open\}/);
  assert.match(page, /if \(event\.key === "Escape"\) setOpen\(false\)/);
  assert.match(page, /type="checkbox" checked=\{hideDone\}/);
  assert.doesNotMatch(page, /onOpenHistory/);
  assert.doesNotMatch(page, /className="progress"[^\n]*<label/);
  assert.match(page, /className="area-header-actions"/);
  assert.match(page, /type="date"/);
  assert.match(page, /CalendarDays/);
  assert.match(page, /ChevronDown/);
  assert.match(page, /className="task-menu task-period-menu"/);
  assert.doesNotMatch(page, /<select value=\{period\}/);
  assert.doesNotMatch(page, /className="task-date-clear"/);
  assert.match(page, /picker\.showPicker\(\)/);
  assert.match(page, /task\.done\s*\?\s*<span className="task-date-label"/);
  assert.match(page, /task\.isOverdue && !task\.done && <em>已逾期<\/em>/);
  assert.match(page, /aria-label="选择完成记录日期"/);
  assert.match(page, /WEEKDAY_SLOGANS\[today\.getDay\(\)\]/);
  assert.match(page, /蓄力开新局，万事皆顺意/);
  assert.match(page, /敛神蓄气力，前路自可期/);
  assert.match(css, /\.hero-intro > p \{ font-size: 14px; \}/);
  assert.doesNotMatch(page, />回到今天<\/button>/);
  assert.match(page, /className="history-item-title"/);
  assert.match(css, /\.history-list article \{[^}]*grid-template-columns: 24px minmax\(0,1fr\) auto/s);
  assert.match(css, /\.history-list article small \{[^}]*white-space: nowrap/s);
  assert.match(css, /@media \(min-width: 901px\) \{[\s\S]*\.page \{[\s\S]*height: 100dvh;[\s\S]*overflow: hidden;/);
  assert.match(css, /\.board > \.task-area \{[^}]*height: 560px;[^}]*padding: 21px;/s);
  assert.match(css, /\.page > \.board > \.task-area \{[\s\S]*height: auto;[\s\S]*min-height: 0;/);
  assert.match(page, /className=\{`task-area area-\$\{group\}/);
  assert.match(css, /\.task-list \{[^}]*overflow: auto;[^}]*scrollbar-gutter: stable/s);
  assert.match(css, /\.area-header-actions \{[^}]*flex: 0 0 auto;[^}]*margin-left: auto/s);
  assert.match(css, /\.page-action-button:hover, \.page-action-button\[aria-expanded="true"\] \{ background: var\(--violet-3\); \}/);
  assert.match(css, /\.page-settings-popover/);
  assert.match(page, />按日查看<\/button>/);
  assert.match(page, />按周查看<\/button>/);
  assert.match(page, /addCompletion\(current\.completionHistory/);
  assert.match(page, /removeCompletion\(current\.completionHistory/);
  assert.match(model, /const MAX_HISTORY = 5000/);
  assert.match(css, /\.completion-history/);
});

test("completion history includes archived completed tasks", async () => {
  const [stateRoute, completedRoute] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/api/workbench-state/route.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/api/tasks/completed/route.ts", import.meta.url), "utf8")),
  ]);
  assert.match(stateRoute, /completedTasksResult[\s\S]*\.eq\("is_completed", true\)/);
  assert.match(stateRoute, /state\.schedule\.completionHistory\.map\(\(item\) => item\.taskId\)/);
  assert.doesNotMatch(completedRoute, /\.is\("deleted_at", null\)/);
});

test("macOS widget reuses today tasks and completion API", async () => {
  const [widget, helper, proxy, login, css, swift, page, win, pkg] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/widget/today/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/desktop-widget.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../proxy.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/(auth)/login/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../desktop-widget/Sources/TodayWidget/main.swift", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../desktop-widget/windows/Program.cs", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../package.json", import.meta.url), "utf8")),
  ]);
  assert.match(widget, /fetch\("\/api\/tasks\?area=today"/);
  assert.match(widget, /method: "PATCH"/);
  assert.match(widget, /isCompleted, version: task\.version/);
  assert.match(widget, /setInterval\(refresh, 8_000\)/);
  assert.match(widget, /workbench-widget-refresh/);
  assert.match(widget, /if \(updatingRef\.current\) return/);
  assert.match(helper, /postWidget\("\/reload"\)/);
  assert.match(helper, /path: "\/show" \| "\/quit" \| "\/reload"/);
  assert.match(swift, /POST", request.path == "\/reload"/);
  assert.match(swift, /didBecomeKeyNotification/);
  assert.match(page, /notifyDesktopWidgetRefresh/);
  assert.match(page, /pullRemoteState/);
  assert.match(page, /fetch\("\/api\/tasks\?area=today"/);
  assert.match(page, /saveTimer\.current = null;/);
  assert.match(page, /setInterval\(refresh, 4_000\)/);
  assert.match(widget, /setDateLabel\(/);
  assert.match(widget, /today-widget-opacity/);
  assert.match(widget, /workbench-widget-opacity-v2/);
  assert.doesNotMatch(widget, /刷新今日安排/);
  assert.match(widget, /useState\(0\.5\)/);
  assert.match(css, /border-radius: 18px/);
  assert.match(css, /--widget-bg-alpha, \.5/);
  assert.match(swift, /cornerRadius = 18/);
  assert.doesNotMatch(css, /\.today-widget \{[^}]*backdrop-filter/s);
  assert.match(widget, /messageHandlers\?\.widget/);
  assert.match(widget, /startWidgetDrag/);
  assert.match(swift, /performDrag\(with:/);
  assert.match(helper, /127\.0\.0\.1:17891/);
  assert.match(helper, /workbench-today:\/\/show/);
  assert.match(proxy, /pathname\.startsWith\("\/widget\/"\)/);
  assert.match(login, /new URLSearchParams\(window\.location\.search\)\.get\("next"\)/);
  assert.match(css, /\.today-widget \{/);
  assert.match(swift, /window\.minSize = defaultSize/);
  assert.match(swift, /setContentSize\(size\)/);
  assert.match(swift, /setFrameAutosaveName\("TodayWidgetWindow"\)/);
  assert.match(swift, /NWListener\(using: \.tcp, on: 17891\)/);
  assert.match(widget, /chrome\?\.webview\?\.postMessage/);
  assert.match(helper, /widget:win/);
  assert.match(helper, /isWindowsHost/);
  assert.match(win, /ControlPort = 17891/);
  assert.match(win, /path == "\/show"/);
  assert.match(win, /path == "\/reload"/);
  assert.match(win, /workbench-today/);
  assert.match(win, /chrome.webview.postMessage/);
  assert.match(pkg, /"widget:win"/);
});

test("completing a task launches the preloaded local firework at its row center", async () => {
  const [page, effect, assets, css, animation] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/task-completion-effect.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/lottie-assets.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../public/firework.json", import.meta.url), "utf8")),
  ]);
  assert.match(page, /rect\.left \+ rect\.width \/ 2/);
  assert.match(page, /rect\.top \+ rect\.height \/ 2/);
  assert.match(page, /if \(!task\.done && rect\) actions\.triggerCelebration/);
  assert.match(assets, /FIREWORK_ANIMATION_PATH = "\/firework\.json"/);
  assert.match(effect, /loadAnimationData\(FIREWORK_ANIMATION_PATH\)/);
  assert.match(effect, /animationData,/);
  assert.match(effect, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.task-completion-effect \{[^}]*position: fixed;[^}]*pointer-events: none/s);
  assert.match(animation, /"nm":"fireworks_display/);
});

test("sidebar cat preloads, reuses and cycles through three local animations", async () => {
  const [page, cat, assets, css, love, laugh, cry] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/sidebar-cat.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/lottie-assets.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../public/cats/love.json", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../public/cats/laugh.json", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../public/cats/cry.json", import.meta.url), "utf8")),
  ]);
  assert.match(page, /<SidebarCat \/>/);
  assert.match(assets, /"\/cats\/love\.json"/);
  assert.match(assets, /"\/cats\/laugh\.json"/);
  assert.match(assets, /"\/cats\/cry\.json"/);
  assert.match(cat, /爱心猫[\s\S]*大笑猫[\s\S]*哭泣猫/);
  assert.match(cat, /\(current \+ 1\) % CATS\.length/);
  assert.match(cat, /preloadLottieAnimations\(\[\.\.\.CAT_ANIMATION_PATHS, FIREWORK_ANIMATION_PATH\]\)/);
  assert.match(cat, /animations\.current\[index\] = animation/);
  assert.match(cat, /animation\.goToAndPlay\(0, true\)/);
  assert.match(cat, /loop: !reduceMotion/);
  assert.match(cat, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.sidebar-cat \{[^}]*margin-top: auto/s);
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*\.sidebar-cat \{ display: none; \}/);
  for (const animation of [love, laugh, cry]) {
    assert.doesNotThrow(() => JSON.parse(animation));
  }
});

test("schedule restores a user-scoped cache before cloud revalidation", async () => {
  const [page, cache] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../lib/workbench-cache.ts", import.meta.url), "utf8")),
  ]);
  assert.match(page, /const cloudRequest = loadWorkbenchState/);
  assert.match(page, /readScheduleCache<Store>\(currentUserId\.current\)/);
  assert.match(page, /setStore\(normalizeStore\(cached\)\);[\s\S]*setReady\(true\)/);
  assert.match(page, /const cloud = await cloudRequest;[\s\S]*setStore\(normalizeStore\(cloud\.schedule\)\)/);
  assert.match(page, /writeScheduleCache\(currentUserId\.current, snapshot\.schedule\)/);
  assert.match(page, /clearScheduleCache\(currentUserId\.current\)/);
  assert.match(cache, /workbench:schedule:v1:/);
  assert.match(cache, /MAX_CACHE_AGE = 7 \* 24 \* 60 \* 60 \* 1000/);
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
  assert.match(page, /<span aria-hidden>📅<\/span>今日事/);
  assert.match(page, /<span aria-hidden>📝<\/span>随手记/);
  assert.match(page, /<span aria-hidden>🔗<\/span>传送门/);
  assert.match(page, /<span aria-hidden>📚<\/span>资料库/);
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
  assert.match(linkView, /onEdit=/);
  assert.match(linkView, /deleteLinkGroup/);
  assert.match(resourceView, /className="section-delete compact-delete"/);
  assert.match(resourceView, /deleteResourceSection/);
  assert.match(resourceView, /role="alertdialog"/);
  assert.match(resourceView, /<InformationItemMenu/);
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
  assert.match(view, /<InformationItemMenu/);
  assert.match(view, /aria-label=\{`上移\$\{section\.name\}`\}/);
  assert.match(view, /aria-label=\{`下移\$\{section\.name\}`\}/);
  assert.match(view, /<OverflowTitle text=\{item\.title\}/);
  assert.match(view, /node\.scrollWidth > node\.clientWidth \? text : ""/);
  assert.match(css, /\.board-column\.dragging/);
  assert.match(css, /\.board-column-body \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto/s);
  assert.match(css, /\.board-card-main \{[^}]*width: 0;[^}]*min-width: 0;[^}]*overflow: hidden/s);
  assert.match(css, /\.information-item-menu/);
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
  assert.match(links, /aria-label="浏览链接分组"/);
  assert.match(links, /columnsRef\.current\?\.scrollBy/);
  assert.match(links, /className=\{`link-column board-column/);
  assert.match(links, /EditableGroupRow/);
  assert.match(links, /draggedId === item\.id \? " dragging"/);
  assert.match(resources, /draggedId === item\.id \? " dragging"/);
  const css = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"));
  assert.match(css, /\.link-column \.system-row \{[^}]*background: #fff/);
});

test("workbench auto-syncs remote changes without writing them back immediately", async () => {
  const page = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8"));
  assert.match(page, /const applyingRemote = useRef\(false\)/);
  assert.match(page, /const pullRemoteState = useCallback/);
  assert.match(page, /if \(applyingRemote\.current\) \{\s*applyingRemote\.current = false;\s*return;/);
  assert.match(page, /notifyDesktopWidgetRefresh/);
  assert.match(page, /fetch\("\/api\/tasks\?area=today"/);
  assert.match(page, /saveTimer\.current = null;/);
  assert.match(page, /setInterval\(refresh, 4_000\)/);
});

test("shared information controls match the record interaction pattern", async () => {
  const [links, resources, records, menu, css, page] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/link-library-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/resource-board-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/records-view.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/information-item-menu.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
  ]);
  assert.match(menu, /className="move-trigger"/);
  assert.match(menu, /information-move-menu/);
  assert.match(css, /\.information-item-menu, \.information-move-menu/);
  assert.match(records, /setDeleteTarget\(item\)/);
  assert.match(records, /title="删除记录"/);
  assert.match(links, /ungroupedName/);
  assert.match(resources, /className="workspace-category"/);
  assert.match(resources, /sectionName=/);
  assert.match(resources, /board-scroll-controls/);
  assert.doesNotMatch(page, /activePage === "links" \|\| activePage === "resources"/);
  assert.match(page, /setTimeout\(\(\) => setNotice\(""\), 3200\)/);
});
