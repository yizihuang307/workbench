import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarDate,
  getRolloverDecision,
  isIsoDate,
  isTaskInPeriod,
  isTaskVisibleInSchedule,
  mondayOfWeek,
  periodRange,
} from "../lib/task-period";
import { createTaskSchema, updateTaskSchema } from "../lib/validation/index";
import { mergeLegacyWeekTasks } from "../lib/workbench-task-state";

const now = "2026-08-09T16:30:00.000Z"; // 上海周一 00:30，纽约周日 12:30

test("任意 IANA 时区按当地日历计算今天和周一", () => {
  assert.equal(calendarDate(now, "Asia/Shanghai"), "2026-08-10");
  assert.equal(mondayOfWeek(now, "Asia/Shanghai"), "2026-08-10");
  assert.equal(calendarDate(now, "America/New_York"), "2026-08-09");
  assert.equal(mondayOfWeek(now, "America/New_York"), "2026-08-03");
});

test("严格校验真实 YYYY-MM-DD 且支持 null", () => {
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2023-02-29"), false);
  assert.equal(isIsoDate("2026-8-01"), false);
  assert.equal(createTaskSchema.safeParse({ title: "a", area: "later", expectedCompletionDate: null }).success, true);
  assert.equal(createTaskSchema.safeParse({ title: "a", area: "week" }).success, false);
  assert.equal(updateTaskSchema.safeParse({ version: 1, expectedCompletionDate: "2026-02-30" }).success, false);
});

test("本周、下周、本月范围边界正确", () => {
  assert.deepEqual(periodRange("this-week", now, "Asia/Shanghai"), {
    start: "2026-08-10", end: "2026-08-16",
  });
  assert.deepEqual(periodRange("next-week", now, "Asia/Shanghai"), {
    start: "2026-08-17", end: "2026-08-23",
  });
  assert.deepEqual(periodRange("this-month", now, "Asia/Shanghai"), {
    start: "2026-08-01", end: "2026-08-31",
  });
});

test("无日期仅在全部，日期筛选互斥且包含边界", () => {
  assert.equal(isTaskInPeriod({ expectedCompletionDate: null }, "all", now), true);
  assert.equal(isTaskInPeriod({ expectedCompletionDate: null }, "this-week", now), false);
  assert.equal(isTaskInPeriod({ expectedCompletionDate: "2026-08-16" }, "this-week", now), true);
  assert.equal(isTaskInPeriod({ expectedCompletionDate: "2026-08-17" }, "this-week", now), false);
  assert.equal(isTaskInPeriod({ expectedCompletionDate: "2026-08-17" }, "next-week", now), true);
});

test("未完成后续事项按今天、过去、未来日期迁移", () => {
  const base = { area: "later" as const, isCompleted: false, createdAt: now };
  assert.deepEqual(getRolloverDecision({ ...base, expectedCompletionDate: "2026-08-10" }, now), {
    area: "today", isOverdue: false,
  });
  assert.deepEqual(getRolloverDecision({ ...base, expectedCompletionDate: "2026-08-09" }, now), {
    area: "today", isOverdue: true,
  });
  assert.deepEqual(getRolloverDecision({ ...base, expectedCompletionDate: "2026-08-11" }, now), {
    area: "later", isOverdue: false,
  });
});

test("完成事项不迁移；今日无日期跨日才逾期", () => {
  assert.deepEqual(getRolloverDecision({
    area: "later", isCompleted: true, expectedCompletionDate: "2026-08-09", createdAt: now,
  }, now), { area: "later", isOverdue: false });
  assert.deepEqual(getRolloverDecision({
    area: "today", isCompleted: false, expectedCompletionDate: null,
    createdAt: "2026-08-08T00:00:00.000Z",
  }, now), { area: "today", isOverdue: true });
  assert.deepEqual(getRolloverDecision({
    area: "today", isCompleted: false, expectedCompletionDate: "2026-08-11",
    createdAt: "2026-08-08T00:00:00.000Z",
  }, now), { area: "today", isOverdue: false });
});

test("完成当天可见，次日及隐藏开关下不可见", () => {
  const task = {
    area: "later" as const, isCompleted: true, createdAt: now,
    completedAt: "2026-08-09T16:00:00.000Z",
  };
  assert.equal(isTaskVisibleInSchedule(task, now, "Asia/Shanghai"), true);
  assert.equal(isTaskVisibleInSchedule(task, "2026-08-10T16:00:00.000Z", "Asia/Shanghai"), false);
  assert.equal(isTaskVisibleInSchedule(task, now, "Asia/Shanghai", true), false);
});

test("旧 week 状态完整并入 later，later 同 ID 优先", () => {
  const week = { id: "a", done: true, priority: true, order: 3 };
  const later = { id: "a", done: false, priority: false, order: 4 };
  const result = mergeLegacyWeekTasks({ today: [], week: [week], later: [later] });
  assert.deepEqual(result, { today: [], later: [later] });
});
