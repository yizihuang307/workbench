export type CompletionSource = "today" | "week" | "later";
export type CompletionRecord = { taskId: string; label: string; source: CompletionSource; completedAt: number };

const MAX_HISTORY = 5000;

export function cleanCompletionHistory(value: unknown): CompletionRecord[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const records: CompletionRecord[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Partial<CompletionRecord>;
    const taskId = typeof item.taskId === "string" ? item.taskId : "";
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 200) : "";
    const source = item.source;
    const completedAt = typeof item.completedAt === "number" && Number.isFinite(item.completedAt) ? item.completedAt : 0;
    if (!taskId || !label || ids.has(taskId) || (source !== "today" && source !== "week" && source !== "later") || completedAt <= 0) continue;
    ids.add(taskId);
    records.push({ taskId, label, source, completedAt });
  }
  return records.sort((a, b) => b.completedAt - a.completedAt).slice(0, MAX_HISTORY);
}

export function addCompletion(history: CompletionRecord[], record: CompletionRecord) {
  return [record, ...history.filter((item) => item.taskId !== record.taskId)].sort((a, b) => b.completedAt - a.completedAt).slice(0, MAX_HISTORY);
}

export function removeCompletion(history: CompletionRecord[], taskId: string) {
  return history.filter((item) => item.taskId !== taskId);
}

export function dayStart(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function weekStart(timestamp: number) {
  const start = dayStart(timestamp);
  const day = new Date(start).getDay();
  return start - ((day + 6) % 7) * 86400000;
}

export function completionsForDay(history: CompletionRecord[], anchor: number) {
  const start = dayStart(anchor), end = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), new Date(start).getDate() + 1).getTime();
  return history.filter((item) => item.completedAt >= start && item.completedAt < end);
}

export function completionsForWeek(history: CompletionRecord[], anchor: number) {
  const start = weekStart(anchor), end = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), new Date(start).getDate() + 7).getTime();
  return history.filter((item) => item.completedAt >= start && item.completedAt < end);
}
