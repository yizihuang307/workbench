import assert from "node:assert/strict";
import test from "node:test";
import { emptyRecordStore, moveAndDeleteCategory, parseRecordStore, visibleRecords } from "../app/records";

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
