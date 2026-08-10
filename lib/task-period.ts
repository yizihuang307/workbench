export type TaskArea = "today" | "later";
export type TaskPeriod = "all" | "this-week" | "next-week" | "this-month";

export type TaskPeriodFields = {
  area: TaskArea;
  isCompleted: boolean;
  createdAt: string | number | Date;
  completedAt?: string | number | Date | null;
  expectedCompletionDate?: string | null;
};

export type RolloverDecision = {
  area: TaskArea;
  isOverdue: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(value: string | number | Date) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("无效时间");
  return date;
}

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function fromIsoDate(value: string) {
  if (!isIsoDate(value)) throw new RangeError("无效 ISO 日期");
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value: string, days: number) {
  const date = fromIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = fromIsoDateUnchecked(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function fromIsoDateUnchecked(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function calendarDate(
  value: string | number | Date = new Date(),
  timeZone = "Asia/Shanghai",
) {
  return dateParts(asDate(value), timeZone);
}

export function mondayOfWeek(
  value: string | number | Date = new Date(),
  timeZone = "Asia/Shanghai",
) {
  const today = calendarDate(value, timeZone);
  const day = fromIsoDate(today).getUTCDay();
  return addDays(today, -((day + 6) % 7));
}

/** 向后兼容旧调用方；新代码应传入用户时区调用 calendarDate。 */
export function beijingDate(value: string | number | Date) {
  return calendarDate(value, "Asia/Shanghai");
}

/** 向后兼容旧调用方；新代码应传入用户时区调用 mondayOfWeek。 */
export function beijingMonday(now: string | number | Date = new Date()) {
  return mondayOfWeek(now, "Asia/Shanghai");
}

export function periodRange(
  period: Exclude<TaskPeriod, "all">,
  now: string | number | Date = new Date(),
  timeZone = "Asia/Shanghai",
) {
  const today = calendarDate(now, timeZone);
  const monday = mondayOfWeek(now, timeZone);
  if (period === "this-week") return { start: monday, end: addDays(monday, 6) };
  if (period === "next-week") {
    const start = addDays(monday, 7);
    return { start, end: addDays(start, 6) };
  }
  const start = `${today.slice(0, 7)}-01`;
  const nextMonth = fromIsoDate(start);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return { start, end: addDays(nextMonth.toISOString().slice(0, 10), -1) };
}

export function isTaskInPeriod(
  task: Pick<TaskPeriodFields, "expectedCompletionDate">,
  period: TaskPeriod,
  now: string | number | Date = new Date(),
  timeZone = "Asia/Shanghai",
) {
  if (period === "all") return true;
  const date = task.expectedCompletionDate;
  if (!date || !isIsoDate(date)) return false;
  const { start, end } = periodRange(period, now, timeZone);
  return date >= start && date <= end;
}

export function getRolloverDecision(
  task: TaskPeriodFields,
  now: string | number | Date = new Date(),
  timeZone = "Asia/Shanghai",
): RolloverDecision {
  if (task.isCompleted) return { area: task.area, isOverdue: false };
  const today = calendarDate(now, timeZone);
  const expected = task.expectedCompletionDate;
  if (task.area === "later") {
    if (!expected || expected > today) return { area: "later", isOverdue: false };
    return { area: "today", isOverdue: expected < today };
  }
  const created = calendarDate(task.createdAt, timeZone);
  return {
    area: "today",
    isOverdue: expected ? expected < today : created < today,
  };
}

export function isTaskVisibleInSchedule(
  task: TaskPeriodFields,
  now: string | number | Date = new Date(),
  timeZone = "Asia/Shanghai",
  hideCompleted = false,
) {
  if (!task.isCompleted) return true;
  if (hideCompleted) return false;
  if (!task.completedAt) return true;
  return calendarDate(task.completedAt, timeZone) === calendarDate(now, timeZone);
}
