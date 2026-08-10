export function mergeLegacyWeekTasks<T extends { id: string }>(tasks: {
  today: T[];
  later: T[];
  week?: T[];
}) {
  const later = new Map<string, T>();
  for (const task of tasks.week ?? []) later.set(task.id, task);
  for (const task of tasks.later) later.set(task.id, task);
  return { today: tasks.today, later: [...later.values()] };
}
