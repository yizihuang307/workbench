export type TaskArea = "today" | "week" | "later";

export type TaskPeriodFields = {
  area: TaskArea;
  isCompleted: boolean;
  createdAt: string | number | Date;
  completedAt?: string | number | Date | null;
};

function asDate(value: string | number | Date) {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

export function beijingDate(value: string | number | Date) {
  const date = asDate(value);
  date.setUTCHours(date.getUTCHours() + 8);
  return date.toISOString().slice(0, 10);
}

export function beijingMonday(now: string | number | Date = new Date()) {
  const date = asDate(now);
  date.setUTCHours(date.getUTCHours() + 8);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function shouldMarkLegacy(
  task: Pick<TaskPeriodFields, "area" | "isCompleted" | "createdAt">,
  now: string | number | Date = new Date(),
) {
  if (task.isCompleted || task.area === "later") return false;
  const createdDate = beijingDate(task.createdAt);
  return task.area === "today"
    ? createdDate < beijingDate(now)
    : createdDate < beijingMonday(now);
}

export function isTaskVisibleInSchedule(
  task: TaskPeriodFields,
  now: string | number | Date = new Date(),
) {
  if (!task.isCompleted || !task.completedAt) return true;
  const completedDate = beijingDate(task.completedAt);
  return task.area === "week"
    ? completedDate >= beijingMonday(now)
    : completedDate >= beijingDate(now);
}
