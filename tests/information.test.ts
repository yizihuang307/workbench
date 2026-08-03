import assert from "node:assert/strict";
import test from "node:test";
import { ALL_GROUP, dataUrlBytes, deleteLinkGroup, deleteResourceSection, deriveTitle, DOCUMENT_LIMIT, emptyInfoStore, FILE_LIMIT, htmlText, legacyDocumentHtml, linkifyPlainText, moveLink, moveResource, parseInfoStore, reorderLinkGroups, reorderResourceSections, safeUrl, sanitizeDocumentHtml, sortLinks, sortResources, tableHtml, totalFileBytes, UNGROUPED, updateSystemLink, urlMeta, visibleLinks, visibleResources, type InfoStore, type ResourceItem, type SystemItem } from "../app/information";

test("unsafe and malformed links are rejected", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("not a url"), null);
  assert.equal(safeUrl("example.com"), "https://example.com/");
});

test("URL metadata has a stable local fallback", () => {
  assert.deepEqual(urlMeta("https://www.openrouter.ai/models")?.domain, "openrouter.ai");
  assert.equal(urlMeta("https://www.openrouter.ai")?.name, "Openrouter");
});

test("title derives from link, file, then first text line", () => {
  assert.equal(deriveTitle([{ id: "t", type: "text", text: "第一行\n第二行" }]), "第一行");
  assert.equal(deriveTitle([{ id: "f", type: "file", name: "方案.pdf", mime: "application/pdf", size: 1, dataUrl: "data:application/pdf;base64,AA==" }]), "方案.pdf");
});

function makeResource(patch: Partial<ResourceItem> = {}): ResourceItem {
  return { id: "r", sectionId: "work", title: "资料", titleAuto: false, pinned: false, order: 0, createdAt: 1, updatedAt: 1, blocks: [{ id: "t", type: "text", text: "正文" }], ...patch };
}

test("search covers title text domain and filename and preserves sort", () => {
  const store = emptyInfoStore(1);
  store.resources = [
    { id: "a", sectionId: "work", title: "旧资料", pinned: false, order: 0, createdAt: 1, updatedAt: 1, blocks: [{ id: "l", type: "link", url: "https://example.com", title: "示例", domain: "example.com" }] },
    { id: "b", sectionId: "learning", title: "新资料", pinned: true, order: 0, createdAt: 2, updatedAt: 2, blocks: [{ id: "f", type: "file", name: "研究报告.pdf", mime: "application/pdf", size: 1, dataUrl: "data:application/pdf;base64,AA==" }] },
  ];
  assert.deepEqual(visibleResources(store, "all", "报告").map((item) => item.id), ["b"]);
  assert.deepEqual(visibleResources(store, "all", "").map((item) => item.id), ["b", "a"]);
});

test("damaged stores, duplicate ids, unsafe files and missing sections recover safely", () => {
  assert.equal(parseInfoStore("not-json"), null);
  const parsed = parseInfoStore(JSON.stringify({ version: 1, sections: [
    { id: "systems", name: "常用系统", type: "systems", order: 0 },
    { id: "work", name: "工作资料", type: "resources", order: 1 },
  ], systems: [{ id: "x", sectionId: "missing", name: "系统", links: [{ id: "l", url: "example.com", label: "主页" }] }], resources: [
    { id: "x", sectionId: "missing", blocks: [{ id: "t", type: "text", text: "重复 ID" }] },
    { id: "r", sectionId: "missing", blocks: [{ id: "bad", type: "file", name: "大文件", size: FILE_LIMIT + 1, dataUrl: "data:x;base64,AA==" }, { id: "t", type: "text", text: "保留" }] },
  ] }));
  assert.ok(parsed);
  // v2：systems 分区被丢弃，链接进入“未分组”。
  assert.equal(parsed.systems[0].groupId, UNGROUPED);
  assert.equal(parsed.sections.length, 1);
  assert.equal(parsed.sections[0].name, "工作资料");
  assert.equal(parsed.resources.length, 1);
  assert.equal(parsed.resources[0].sectionId, "work");
  assert.deepEqual(parsed.resources[0].blocks.map((block) => block.type), ["text"]);
});

test("file byte total is exact across mixed blocks", () => {
  const store = emptyInfoStore(1);
  store.resources = [{ id: "r", sectionId: "work", title: "资料", pinned: false, order: 0, createdAt: 1, updatedAt: 1, blocks: [
    { id: "t", type: "text", text: "文字" }, { id: "f", type: "file", name: "a", mime: "x", size: 123, dataUrl: "data:x;base64,AA==" },
  ] }];
  assert.equal(totalFileBytes(store), 123);
});

test("1000 resources remain searchable without loss", () => {
  const store = emptyInfoStore(1);
  store.resources = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), sectionId: index % 2 ? "work" : "learning", title: `资料 ${index}`, pinned: index === 9, order: 0, createdAt: index, updatedAt: index, blocks: [{ id: `t${index}`, type: "text" as const, text: `关键字 ${index}` }] }));
  assert.equal(visibleResources(store, "work", "关键字").length, 500);
  assert.equal(visibleResources(store, "work", "关键字")[0].id, "9");
});

test("v1 systems section is dropped in v2 migration", () => {
  const parsed = parseInfoStore(JSON.stringify({ version: 1, sections: [
    { id: "systems", name: "常用系统", type: "systems", order: 0 },
    { id: "work", name: "工作资料", type: "resources", order: 1 },
  ], systems: [], resources: [] }));
  assert.equal(parsed?.version, 2);
  assert.equal(parsed?.sections.length, 1);
  assert.equal(parsed?.sections[0].name, "工作资料");
  assert.equal(parsed?.linkGroups.length, 0);
});

test("single-character accidental auto titles recover to the full first line", () => {
  const parsed = parseInfoStore(JSON.stringify({ version: 1, sections: [
    { id: "systems", name: "常用链接", type: "systems", order: 0 },
    { id: "work", name: "工作资料", type: "resources", order: 1 },
  ], systems: [], resources: [{ id: "r", sectionId: "work", title: "y", blocks: [{ id: "t", type: "text", text: "yes 完整标题\n正文" }], createdAt: 1, updatedAt: 1 }] }));
  assert.equal(parsed?.resources[0].title, "yes 完整标题");
  assert.equal(parsed?.resources[0].titleAuto, true);
});

test("legacy blocks become one ordered document without embedding attachment data", () => {
  const html = legacyDocumentHtml([
    { id: "t", type: "text", text: "第一行\n第二行" },
    { id: "l", type: "link", url: "https://example.com/path", title: "示例", domain: "example.com" },
    { id: "f", type: "file", name: "方案.png", mime: "image/png", size: 2, dataUrl: "data:image/png;base64,AA==" },
  ]);
  assert.match(html, /第一行<br>第二行/);
  assert.match(html, /href="https:\/\/example\.com\/path"/);
  assert.match(html, /data-file-id="f"/);
  assert.doesNotMatch(html, /base64/);
});

test("document sanitizer keeps note formatting and strips executable content", () => {
  const html = sanitizeDocumentHtml('<h2 onclick="evil()">标题</h2><script>alert(1)</script><a href="javascript:alert(1)">坏链接</a><a href="https://example.com">好链接</a><table><tbody><tr><td>x</td></tr></tbody></table>');
  assert.match(html, /^<h2>标题<\/h2>/);
  assert.doesNotMatch(html, /script|onclick|javascript:/i);
  assert.match(html, /href="https:\/\/example\.com\/"/);
  assert.match(html, /<table>/);
});

test("plain text extraction supports title and search without leaking markup", () => {
  assert.equal(htmlText("<h2>标题 &amp; 说明</h2><p>第二行<br>继续</p>"), "标题 & 说明\n第二行\n继续");
});

test("table helper clamps extreme dimensions", () => {
  assert.equal((tableHtml(2, 2).match(/<td>/g) || []).length, 4);
  assert.equal((tableHtml(0, 99).match(/<td>/g) || []).length, 10);
});

test("stored rich documents survive parsing and remain searchable", () => {
  const parsed = parseInfoStore(JSON.stringify({ version: 1, sections: [
    { id: "systems", name: "常用链接", type: "systems", order: 0 },
    { id: "work", name: "工作资料", type: "resources", order: 1 },
  ], systems: [], resources: [{ id: "r", sectionId: "work", title: "资料", documentHtml: '<h2>项目 Alpha</h2><p>https://example.com</p>', blocks: [{ id: "t", type: "text", text: "旧正文" }], createdAt: 1, updatedAt: 1 }] }));
  assert.match(parsed?.resources[0].documentHtml || "", /项目 Alpha/);
  assert.equal(visibleResources(parsed!, "all", "alpha")[0].id, "r");
});

test("plain URLs become safe links while punctuation and unsafe text stay intact", () => {
  const linked = linkifyPlainText("官网 https://example.com/a?b=1，备用 www.openai.com。 javascript:alert(1)");
  assert.match(linked, /href="https:\/\/example\.com\/a\?b=1"/);
  assert.match(linked, /href="https:\/\/www\.openai\.com\/"/);
  assert.match(linked, /<\/a>，/);
  assert.doesNotMatch(linked, /href="javascript:/);
});

test("corrupted oversized rich text is recovered at the product limit", () => {
  const parsed = parseInfoStore(JSON.stringify({ version: 1, sections: [
    { id: "systems", name: "常用链接", type: "systems", order: 0 },
    { id: "work", name: "工作资料", type: "resources", order: 1 },
  ], systems: [], resources: [{ id: "r", sectionId: "work", title: "大文档", documentHtml: `<h2>${"中".repeat(DOCUMENT_LIMIT + 5000)}</h2>`, blocks: [], createdAt: 1, updatedAt: 1 }] }));
  assert.equal(htmlText(parsed?.resources[0].documentHtml || "").length, DOCUMENT_LIMIT);
});

test("sanitizer preserves multilingual text, emoji, task structure and attachment references", () => {
  const html = sanitizeDocumentHtml('<p>中文 English 日本語 🚀</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false">待办</li><li data-type="taskItem" data-checked="true">完成</li></ul><figure data-file-id="f"><img src="data:image/png;base64,evil"></figure>');
  assert.match(html, /中文 English 日本語 🚀/);
  assert.match(html, /data-checked="false"/);
  assert.match(html, /data-checked="true"/);
  assert.match(html, /data-type="taskList"/);
  assert.match(html, /data-type="taskItem"/);
  assert.match(html, /data-file-id="f"/);
  assert.doesNotMatch(html, /base64|src=/);
});

test("file recovery verifies encoded size and enforces the 20 attachment boundary", () => {
  assert.equal(dataUrlBytes("data:text/plain;base64,SGVsbG8="), 5);
  assert.equal(dataUrlBytes("data:text/plain,hello%20world"), 11);
  const files = Array.from({ length: 21 }, (_, index) => ({ id: `f${index}`, type: "file", name: `${index}.txt`, mime: "text/plain", size: 1, dataUrl: "data:text/plain;base64,QQ==" }));
  const parsed = parseInfoStore(JSON.stringify({ version: 1, sections: [
    { id: "systems", name: "常用链接", type: "systems", order: 0 },
    { id: "work", name: "工作资料", type: "resources", order: 1 },
  ], systems: [], resources: [{ id: "r", sectionId: "work", title: "附件", blocks: files, createdAt: 1, updatedAt: 1 }] }));
  assert.equal(parsed?.resources[0].blocks.length, 20);
});

function makeSystem(patch: Partial<SystemItem> = {}): SystemItem {
  return { id: "s", sectionId: "work", groupId: UNGROUPED, name: "示例", icon: "https://example.com/favicon.ico", links: [{ id: "l", url: "https://example.com/", label: "主页" }], defaultLinkId: "l", order: 0, lastOpenedAt: 0, createdAt: 1, updatedAt: 1, ...patch };
}

test("system icon URL survives storage parsing", () => {
  const store: InfoStore = { ...emptyInfoStore(1), systems: [makeSystem()] };
  assert.equal(parseInfoStore(JSON.stringify(store))?.systems[0].icon, "https://example.com/favicon.ico");
});

test("legacy letter icons migrate to a persistent favicon URL", () => {
  const store: InfoStore = { ...emptyInfoStore(1), systems: [makeSystem({ icon: "S" })] };
  assert.match(parseInfoStore(JSON.stringify(store))?.systems[0].icon || "", /^https:\/\/www\.google\.com\/s2\/favicons\?/);
});

test("link search includes common link names, domains and URLs", () => {
  const store: InfoStore = { ...emptyInfoStore(1), systems: [makeSystem({ name: "企业微信文档", links: [{ id: "l", url: "https://docs.example.com/work", label: "主页" }] })] };
  assert.deepEqual(visibleLinks(store, ALL_GROUP, "微信", "manual").map((item) => item.id), ["s"]);
  assert.deepEqual(visibleLinks(store, ALL_GROUP, "example.com", "manual").map((item) => item.id), ["s"]);
  assert.equal(visibleLinks(store, ALL_GROUP, "不存在", "manual").length, 0);
});

test("editing a common link updates both name and URL safely", () => {
  const store: InfoStore = { ...emptyInfoStore(1), systems: [makeSystem({ name: "旧名称", icon: "旧" })] };
  const updated = updateSystemLink(store, "s", "新名称", "new.example/path", 2);
  assert.equal(updated?.systems[0].name, "新名称");
  assert.equal(updated?.systems[0].links[0].url, "https://new.example/path");
  assert.equal(updateSystemLink(store, "s", "", "javascript:alert(1)", 2), null);
});

test("deleting a resource section migrates its resources and refuses deleting the last section", () => {
  const store = emptyInfoStore(1);
  store.resources = [makeResource({ sectionId: "learning" })];
  const deleted = deleteResourceSection(store, "learning", "work");
  assert.equal(deleted?.sections.some((section) => section.id === "learning"), false);
  assert.equal(deleted?.resources[0].sectionId, "work");
  assert.equal(deleteResourceSection(deleted!, "work", "work"), null);
});

test("links filter by group, search host and respect sort mode", () => {
  const store = emptyInfoStore(1);
  store.linkGroups = [{ id: "g1", name: "工具", order: 0, createdAt: 1 }];
  store.systems = [
    makeSystem({ id: "a", name: "OpenRouter", groupId: UNGROUPED, lastOpenedAt: 5, order: 0, createdAt: 1 }),
    makeSystem({ id: "b", name: "GitHub", groupId: "g1", lastOpenedAt: 9, order: 0, createdAt: 2, links: [{ id: "l", url: "https://github.com", label: "主页" }] }),
  ];
  assert.deepEqual(visibleLinks(store, UNGROUPED, "", "manual").map((item) => item.id), ["a"]);
  assert.deepEqual(visibleLinks(store, "g1", "", "manual").map((item) => item.id), ["b"]);
  assert.equal(visibleLinks(store, ALL_GROUP, "", "manual").length, 2);
  assert.deepEqual(visibleLinks(store, ALL_GROUP, "github", "manual").map((item) => item.id), ["b"]);
  assert.deepEqual(visibleLinks(store, ALL_GROUP, "", "recent-open").map((item) => item.id), ["b", "a"]);
});

test("sortLinks manual mode falls back to createdAt when orders tie", () => {
  const links = [
    makeSystem({ id: "b", name: "B", order: 0, lastOpenedAt: 0, createdAt: 2 }),
    makeSystem({ id: "a", name: "A", order: 0, lastOpenedAt: 0, createdAt: 1 }),
  ];
  assert.deepEqual(sortLinks(links, "manual").map((item) => item.id), ["a", "b"]);
});

test("manual resource sort keeps pinned first then order", () => {
  const items = [
    makeResource({ id: "a", title: "A", pinned: false, order: 2 }),
    makeResource({ id: "b", title: "B", pinned: true, order: 5 }),
    makeResource({ id: "c", title: "C", pinned: false, order: 1 }),
  ];
  assert.deepEqual(sortResources(items, "manual").map((item) => item.id), ["b", "c", "a"]);
  assert.deepEqual(sortResources(items, "name").map((item) => item.id), ["b", "a", "c"]);
});

test("resource sections support stable manual ordering from every edge", () => {
  const store = emptyInfoStore(1);
  store.sections.push({ id: "archive", name: "归档", type: "resources", order: 2, createdAt: 3 });
  const lastToFirst = reorderResourceSections(store, "archive", "work");
  assert.deepEqual(lastToFirst?.sections.map((item) => item.id), ["archive", "work", "learning"]);
  assert.deepEqual(lastToFirst?.sections.map((item) => item.order), [0, 1, 2]);
  const firstToLast = reorderResourceSections(lastToFirst!, "archive", "learning", "after");
  assert.deepEqual(firstToLast?.sections.map((item) => item.id), ["work", "learning", "archive"]);
  assert.equal(reorderResourceSections(store, "missing", "work"), null);
  assert.equal(reorderResourceSections(store, "work", "work"), null);
});

test("resources reorder within a section without touching another section", () => {
  const store = emptyInfoStore(1);
  store.resources = [
    makeResource({ id: "a", sectionId: "work", order: 0 }),
    makeResource({ id: "b", sectionId: "work", order: 1 }),
    makeResource({ id: "c", sectionId: "work", order: 2 }),
    makeResource({ id: "x", sectionId: "learning", order: 0 }),
  ];
  const moved = moveResource(store, "c", "work", "a");
  assert.deepEqual(visibleResources(moved!, "work", "", "manual").map((item) => item.id), ["c", "a", "b"]);
  assert.deepEqual(visibleResources(moved!, "learning", "", "manual").map((item) => item.id), ["x"]);
  assert.deepEqual(moved?.resources.filter((item) => item.sectionId === "work").map((item) => item.order).sort(), [0, 1, 2]);
});

test("resources move across sections to top, middle and empty columns", () => {
  const store = emptyInfoStore(1);
  store.sections.push({ id: "empty", name: "空分类", type: "resources", order: 2, createdAt: 3 });
  store.resources = [
    makeResource({ id: "a", sectionId: "work", order: 0 }),
    makeResource({ id: "b", sectionId: "learning", order: 0 }),
    makeResource({ id: "c", sectionId: "learning", order: 1 }),
  ];
  const middle = moveResource(store, "a", "learning", "c");
  assert.deepEqual(visibleResources(middle!, "learning", "", "manual").map((item) => item.id), ["b", "a", "c"]);
  assert.equal(middle?.resources.find((item) => item.id === "a")?.sectionId, "learning");
  const empty = moveResource(middle!, "a", "empty");
  assert.deepEqual(visibleResources(empty!, "empty", "", "manual").map((item) => item.id), ["a"]);
  assert.deepEqual(visibleResources(empty!, "learning", "", "manual").map((item) => item.id), ["b", "c"]);
  assert.equal(moveResource(store, "a", "missing"), null);
});

test("pinned resources keep their tier while manual movement remains stable", () => {
  const store = emptyInfoStore(1);
  store.resources = [
    makeResource({ id: "p1", pinned: true, order: 0 }),
    makeResource({ id: "p2", pinned: true, order: 1 }),
    makeResource({ id: "n1", pinned: false, order: 2 }),
  ];
  const moved = moveResource(store, "p2", "work", "p1");
  assert.deepEqual(visibleResources(moved!, "work", "", "manual").map((item) => item.id), ["p2", "p1", "n1"]);
});

test("link groups reorder and group deletion preserves links", () => {
  const store = emptyInfoStore(1);
  store.linkGroups = [
    { id: "g1", name: "工具", order: 0, createdAt: 1 },
    { id: "g2", name: "协作", order: 1, createdAt: 2 },
    { id: "g3", name: "学习", order: 2, createdAt: 3 },
  ];
  store.systems = [makeSystem({ id: "a", groupId: "g2" })];
  const reordered = reorderLinkGroups(store, "g3", "g1");
  assert.deepEqual(reordered?.linkGroups.map((item) => item.id), ["g3", "g1", "g2"]);
  const deleted = deleteLinkGroup(reordered!, "g2");
  assert.equal(deleted?.linkGroups.some((item) => item.id === "g2"), false);
  assert.equal(deleted?.systems[0].groupId, UNGROUPED);
  const migrated = deleteLinkGroup(reordered!, "g2", "g1");
  assert.equal(migrated?.systems[0].groupId, "g1");
  assert.equal(deleteLinkGroup(reordered!, "g2", "missing"), null);
});

test("links reorder within and move across groups with normalized orders", () => {
  const store = emptyInfoStore(1);
  store.linkGroups = [{ id: "g", name: "工具", order: 0, createdAt: 1 }];
  store.systems = [
    makeSystem({ id: "a", groupId: UNGROUPED, order: 0 }),
    makeSystem({ id: "b", groupId: "g", order: 0 }),
    makeSystem({ id: "c", groupId: "g", order: 1 }),
  ];
  const moved = moveLink(store, "a", "g", "c");
  assert.deepEqual(visibleLinks(moved!, "g", "", "manual").map((item) => item.id), ["b", "a", "c"]);
  assert.deepEqual(moved?.systems.filter((item) => item.groupId === "g").map((item) => item.order).sort(), [0, 1, 2]);
  assert.equal(moveLink(store, "a", "missing"), null);
});

test("the protected ungrouped name persists and damaged values recover", () => {
  const store = emptyInfoStore(1);
  store.ungroupedName = "待整理";
  assert.equal(parseInfoStore(JSON.stringify(store))?.ungroupedName, "待整理");
  assert.equal(parseInfoStore(JSON.stringify({ ...store, ungroupedName: "   " }))?.ungroupedName, "未分组");
});

test("parsing repairs duplicate and non-finite ordering deterministically", () => {
  const store = emptyInfoStore(1);
  store.sections = [
    { id: "b", name: "B", type: "resources", order: Number.NaN, createdAt: 2 },
    { id: "a", name: "A", type: "resources", order: -99, createdAt: 1 },
  ];
  store.resources = [makeResource({ id: "r2", sectionId: "b", order: Number.NaN, createdAt: 2 }), makeResource({ id: "r1", sectionId: "b", order: 0, createdAt: 1 })];
  const parsed = parseInfoStore(JSON.stringify(store));
  assert.deepEqual(parsed?.sections.map((item) => item.order), [0, 1]);
  assert.deepEqual(visibleResources(parsed!, "b", "", "manual").map((item) => item.id), ["r1", "r2"]);
});
