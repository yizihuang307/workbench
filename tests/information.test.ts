import assert from "node:assert/strict";
import test from "node:test";
import { deriveTitle, emptyInfoStore, FILE_LIMIT, parseInfoStore, safeUrl, totalFileBytes, urlMeta, visibleResources } from "../app/information";

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

test("search covers title text domain and filename and preserves sort", () => {
  const store = emptyInfoStore(1);
  store.resources = [
    { id: "a", sectionId: "work", title: "旧资料", pinned: false, createdAt: 1, updatedAt: 1, blocks: [{ id: "l", type: "link", url: "https://example.com", title: "示例", domain: "example.com" }] },
    { id: "b", sectionId: "learning", title: "新资料", pinned: true, createdAt: 2, updatedAt: 2, blocks: [{ id: "f", type: "file", name: "研究报告.pdf", mime: "application/pdf", size: 1, dataUrl: "data:application/pdf;base64,AA==" }] },
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
  assert.equal(parsed.systems[0].sectionId, "systems");
  assert.equal(parsed.resources.length, 1);
  assert.deepEqual(parsed.resources[0].blocks.map((block) => block.type), ["text"]);
});

test("file byte total is exact across mixed blocks", () => {
  const store = emptyInfoStore(1);
  store.resources = [{ id: "r", sectionId: "work", title: "资料", pinned: false, createdAt: 1, updatedAt: 1, blocks: [
    { id: "t", type: "text", text: "文字" }, { id: "f", type: "file", name: "a", mime: "x", size: 123, dataUrl: "data:x;base64,AA==" },
  ] }];
  assert.equal(totalFileBytes(store), 123);
});

test("1000 resources remain searchable without loss", () => {
  const store = emptyInfoStore(1);
  store.resources = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), sectionId: index % 2 ? "work" : "learning", title: `资料 ${index}`, pinned: index === 9, createdAt: index, updatedAt: index, blocks: [{ id: `t${index}`, type: "text" as const, text: `关键字 ${index}` }] }));
  assert.equal(visibleResources(store, "work", "关键字").length, 500);
  assert.equal(visibleResources(store, "work", "关键字")[0].id, "9");
});
