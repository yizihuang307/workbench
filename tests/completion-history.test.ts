import assert from "node:assert/strict";
import test from "node:test";
import { addCompletion, cleanCompletionHistory, completionsForDay, completionsForWeek, removeCompletion, weekStart } from "../app/completion-history";

test("completion is unique per task and restoring removes it", () => {
  const first = addCompletion([], { taskId: "a", label: "初版", completedAt: 10 });
  const updated = addCompletion(first, { taskId: "a", label: "新版", completedAt: 20, expectedCompletionDate: "2026-08-20" });
  assert.deepEqual(updated, [{ taskId: "a", label: "新版", completedAt: 20, expectedCompletionDate: "2026-08-20" }]);
  assert.deepEqual(removeCompletion(updated, "a"), []);
});

test("daily history uses local calendar boundaries", () => {
  const noon = new Date(2026, 7, 3, 12).getTime();
  const history = [
    { taskId: "a", label: "今天", completedAt: noon },
    { taskId: "b", label: "昨天", completedAt: new Date(2026, 7, 2, 23, 59).getTime() },
  ];
  assert.deepEqual(completionsForDay(history, noon).map((item) => item.taskId), ["a"]);
});

test("weekly history starts on Monday", () => {
  const monday = new Date(2026, 7, 3, 10).getTime();
  assert.equal(weekStart(new Date(2026, 7, 9, 23).getTime()), new Date(2026, 7, 3).getTime());
  const history = [
    { taskId: "a", label: "今日", completedAt: monday },
    { taskId: "b", label: "本周", completedAt: new Date(2026, 7, 9, 23, 59).getTime() },
    { taskId: "c", label: "后续", completedAt: new Date(2026, 7, 10).getTime() },
  ];
  assert.deepEqual(completionsForWeek(history, monday).map((item) => item.taskId), ["a", "b"]);
});

test("damaged and duplicate stored history recovers safely", () => {
  const parsed = cleanCompletionHistory([
    { taskId: "a", label: " 保留 ", source: "today", completedAt: 2, expectedCompletionDate: "2026-08-03" },
    { taskId: "a", label: "重复", source: "week", completedAt: 1 },
    { taskId: "b", label: "", source: "later", completedAt: 3 },
    { taskId: "c", label: "可兼容旧来源", source: "unknown", completedAt: 4 },
  ]);
  assert.deepEqual(parsed, [
    { taskId: "c", label: "可兼容旧来源", completedAt: 4 },
    { taskId: "a", label: "保留", completedAt: 2, expectedCompletionDate: "2026-08-03" },
  ]);
});
