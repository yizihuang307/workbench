import assert from "node:assert/strict";
import test from "node:test";
import { addCompletion, cleanCompletionHistory, completionsForDay, completionsForWeek, removeCompletion, weekStart } from "../app/completion-history";

test("completion is unique per task and restoring removes it", () => {
  const first = addCompletion([], { taskId: "a", label: "初版", source: "today", completedAt: 10 });
  const updated = addCompletion(first, { taskId: "a", label: "新版", source: "week", completedAt: 20 });
  assert.deepEqual(updated, [{ taskId: "a", label: "新版", source: "week", completedAt: 20 }]);
  assert.deepEqual(removeCompletion(updated, "a"), []);
});

test("daily history uses local calendar boundaries", () => {
  const noon = new Date(2026, 7, 3, 12).getTime();
  const history = [
    { taskId: "a", label: "今天", source: "today" as const, completedAt: noon },
    { taskId: "b", label: "昨天", source: "week" as const, completedAt: new Date(2026, 7, 2, 23, 59).getTime() },
  ];
  assert.deepEqual(completionsForDay(history, noon).map((item) => item.taskId), ["a"]);
});

test("weekly history starts on Monday and includes every source", () => {
  const monday = new Date(2026, 7, 3, 10).getTime();
  assert.equal(weekStart(new Date(2026, 7, 9, 23).getTime()), new Date(2026, 7, 3).getTime());
  const history = [
    { taskId: "a", label: "今日", source: "today" as const, completedAt: monday },
    { taskId: "b", label: "本周", source: "week" as const, completedAt: new Date(2026, 7, 9, 23, 59).getTime() },
    { taskId: "c", label: "后续", source: "later" as const, completedAt: new Date(2026, 7, 10).getTime() },
  ];
  assert.deepEqual(completionsForWeek(history, monday).map((item) => item.taskId), ["a", "b"]);
});

test("damaged and duplicate stored history recovers safely", () => {
  const parsed = cleanCompletionHistory([
    { taskId: "a", label: " 保留 ", source: "today", completedAt: 2 },
    { taskId: "a", label: "重复", source: "week", completedAt: 1 },
    { taskId: "b", label: "", source: "later", completedAt: 3 },
    { taskId: "c", label: "错误", source: "unknown", completedAt: 4 },
  ]);
  assert.deepEqual(parsed, [{ taskId: "a", label: "保留", source: "today", completedAt: 2 }]);
});
