import assert from "node:assert/strict";
import test from "node:test";
import { emptyRecordStore, moveAndDeleteCategory, parseRecordStore, validCategoryName, visibleRecords } from "../app/records";

test("pinned records stay first and otherwise sort by update time", () => {
  const store = emptyRecordStore(1);
  store.records = [
    { id: "new", categoryId: "quick", body: "新的", pinned: false, createdAt: 3, updatedAt: 3 },
    { id: "pin-old", categoryId: "quick", body: "置顶", pinned: true, createdAt: 1, updatedAt: 1 },
    { id: "old", categoryId: "quick", body: "旧的", pinned: false, createdAt: 2, updatedAt: 2 },
  ];
  assert.deepEqual(visibleRecords(store, "all", "").map((item) => item.id), ["pin-old", "new", "old"]);
});

test("search combines category and body filters", () => {
  const store = emptyRecordStore(1);
  store.records = [
    { id: "a", categoryId: "quick", body: "项目复盘", pinned: false, createdAt: 1, updatedAt: 1 },
    { id: "b", categoryId: "meeting", body: "项目周会", pinned: false, createdAt: 2, updatedAt: 2 },
  ];
  assert.deepEqual(visibleRecords(store, "quick", "项目").map((item) => item.id), ["a"]);
});

test("deleting a category migrates records and the default category atomically", () => {
  const store = emptyRecordStore(1);
  store.records = [{ id: "a", categoryId: "quick", body: "内容", pinned: false, createdAt: 1, updatedAt: 1 }];
  const next = moveAndDeleteCategory(store, "quick", "meeting");
  assert.equal(next.categories.some((item) => item.id === "quick"), false);
  assert.equal(next.records[0].categoryId, "meeting");
  assert.equal(next.defaultCategoryId, "meeting");
});

test("damaged record data is rejected safely", () => {
  assert.equal(parseRecordStore('{"categories":[],"records":[]}'), null);
  assert.equal(parseRecordStore("not json"), null);
});

test("damaged references recover and duplicate ids are discarded", () => {
  const parsed = parseRecordStore(JSON.stringify({
    categories: [
      { id: "a", name: "分类", createdAt: 1 },
      { id: "a", name: "重复 ID", createdAt: 2 },
      { id: "b", name: "分类", createdAt: 3 },
    ],
    records: [
      { id: "r", categoryId: "missing", body: "保留", createdAt: 1, updatedAt: 1 },
      { id: "r", categoryId: "a", body: "重复", createdAt: 2, updatedAt: 2 },
    ],
    defaultCategoryId: "missing",
  }));
  assert.ok(parsed);
  assert.deepEqual(parsed.categories.map((item) => item.id), ["a"]);
  assert.equal(parsed.defaultCategoryId, "a");
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].categoryId, "a");
});

test("1000 records filter and sort without losing results", () => {
  const store = emptyRecordStore(1);
  store.records = Array.from({ length: 1000 }, (_, index) => ({
    id: String(index), categoryId: index % 2 ? "quick" : "meeting", body: `记录 ${index} 关键字`,
    pinned: index === 9, createdAt: index, updatedAt: index,
  }));
  const result = visibleRecords(store, "quick", "关键字");
  assert.equal(result.length, 500);
  assert.equal(result[0].id, "9");
});

test("category names reject blanks and duplicates and cap long input", () => {
  const store = emptyRecordStore(1);
  assert.equal(validCategoryName(store.categories, "   "), null);
  assert.equal(validCategoryName(store.categories, "随手记"), null);
  assert.equal(validCategoryName(store.categories, "随手记", "quick"), "随手记");
  assert.equal(validCategoryName(store.categories, "a".repeat(50)), "a".repeat(40));
});
