import assert from "node:assert/strict";
import test from "node:test";
import { beijingDate, beijingMonday, isTaskVisibleInSchedule, shouldMarkLegacy } from "../lib/task-period";

const now = "2026-08-07T15:00:00.000Z"; // 北京时间 2026-08-07 23:00（周五）

test("北京时区的今天和周一边界稳定", () => {
  assert.equal(beijingDate(now), "2026-08-07");
  assert.equal(beijingMonday(now), "2026-08-03");
});

test("今日安排保留今天完成项并隐藏昨天完成项", () => {
  assert.equal(isTaskVisibleInSchedule({
    area: "today",
    isCompleted: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-06T16:00:00.000Z",
  }, now), true);
  assert.equal(isTaskVisibleInSchedule({
    area: "today",
    isCompleted: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-06T15:59:59.999Z",
  }, now), false);
});

test("本周安排保留本周完成项并隐藏上周完成项", () => {
  assert.equal(isTaskVisibleInSchedule({
    area: "week",
    isCompleted: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-02T16:00:00.000Z",
  }, now), true);
  assert.equal(isTaskVisibleInSchedule({
    area: "week",
    isCompleted: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-02T15:59:59.999Z",
  }, now), false);
});

test("后续安排保留当天完成项并在第二天隐藏", () => {
  assert.equal(isTaskVisibleInSchedule({
    area: "later",
    isCompleted: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-06T16:00:00.000Z",
  }, now), true);
  assert.equal(isTaskVisibleInSchedule({
    area: "later",
    isCompleted: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-06T15:59:59.999Z",
  }, now), false);
});

test("未完成任务始终显示，并按今日或本周边界标记遗留", () => {
  assert.equal(shouldMarkLegacy({
    area: "today",
    isCompleted: false,
    createdAt: "2026-08-06T15:59:59.999Z",
  }, now), true);
  assert.equal(shouldMarkLegacy({
    area: "today",
    isCompleted: false,
    createdAt: "2026-08-06T16:00:00.000Z",
  }, now), false);
  assert.equal(shouldMarkLegacy({
    area: "week",
    isCompleted: false,
    createdAt: "2026-08-02T15:59:59.999Z",
  }, now), true);
  assert.equal(shouldMarkLegacy({
    area: "week",
    isCompleted: false,
    createdAt: "2026-08-02T16:00:00.000Z",
  }, now), false);
  assert.equal(shouldMarkLegacy({
    area: "later",
    isCompleted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  }, now), false);
});

test("缺失完成时间的数据不会被误隐藏", () => {
  assert.equal(isTaskVisibleInSchedule({
    area: "today",
    isCompleted: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
  }, now), true);
});
