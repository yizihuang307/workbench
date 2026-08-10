import { getUserId } from "@/lib/auth";
import { createTaskSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { getRolloverDecision, isTaskInPeriod, isTaskVisibleInSchedule, type TaskPeriod } from "@/lib/task-period";
import { getUserTimezone, rolloverDueTasks } from "@/lib/server/rollover-due-tasks";
import { v4 as uuid } from "uuid";

// GET /api/tasks?area=today|later&period=all|this-week|next-week|this-month
export async function GET(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  let timeZone: string;
  try {
    ({ timeZone } = await rolloverDueTasks(supabase, userId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "任务到期迁移失败";
    return new AppError("INTERNAL_ERROR", message).toResponse(requestId);
  }

  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area");
  const period = searchParams.get("period") ?? "all";
  const periods: TaskPeriod[] = ["all", "this-week", "next-week", "this-month"];
  if (area && !["today", "later"].includes(area)) {
    return new AppError("VALIDATION_ERROR", "area 参数无效").toResponse(requestId);
  }
  if (!periods.includes(period as TaskPeriod)) {
    return new AppError("VALIDATION_ERROR", "period 参数无效").toResponse(requestId);
  }
  if (period !== "all" && area !== "later") {
    return new AppError("VALIDATION_ERROR", "period 仅适用于后续安排").toResponse(requestId);
  }

  let query = supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_key", { ascending: true });

  if (area) {
    query = query.eq("area", area);
  }

  const { data, error } = await query;
  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  const visible = (data ?? []).filter((task) => isTaskVisibleInSchedule({
    area: task.area,
    isCompleted: task.is_completed,
    createdAt: task.created_at,
    completedAt: task.completed_at,
  }, undefined, timeZone) && isTaskInPeriod({
    expectedCompletionDate: task.expected_completion_date,
  }, period as TaskPeriod, undefined, timeZone));

  return Response.json({ data: visible, requestId });
}

// POST /api/tasks
export async function POST(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();

  const parsed = createTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "参数无效",
    ).toResponse(requestId);
  }

  const supabase = createAdminClient();
  const timeZone = await getUserTimezone(supabase, userId);
  const now = new Date();
  const decision = getRolloverDecision({
    area: parsed.data.area,
    isCompleted: false,
    expectedCompletionDate: parsed.data.expectedCompletionDate ?? null,
    createdAt: now,
  }, now, timeZone);

  const { data: last } = await supabase
    .from("tasks")
    .select("sort_key")
    .eq("user_id", userId)
    .eq("area", decision.area)
    .is("deleted_at", null)
    .order("sort_key", { ascending: false })
    .limit(1);

  const sortKey = last?.[0]?.sort_key
    ? String(Number(last[0].sort_key) + 100000000000)
    : String(100000000000);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title: parsed.data.title,
      area: decision.area,
      expected_completion_date: parsed.data.expectedCompletionDate ?? null,
      is_overdue: decision.isOverdue,
      sort_key: sortKey,
      version: 1,
    })
    .select()
    .single();

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId }, { status: 201 });
}
