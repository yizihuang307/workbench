import { getUserId } from "@/lib/auth";
import { updateTaskSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { createDeletionToken } from "@/app/api/undo/route";
import { calendarDate, getRolloverDecision } from "@/lib/task-period";
import { getUserTimezone } from "@/lib/server/rollover-due-tasks";
import { v4 as uuid } from "uuid";

// PATCH /api/tasks/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = uuid();
  const userId = await getUserId();
  const { id } = await params;

  const parsed = updateTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "参数无效",
    ).toResponse(requestId);
  }

  const supabase = createAdminClient();
  const { data: current, error: readError } = await supabase
    .from("tasks")
    .select("area,is_completed,is_overdue,expected_completion_date,created_at,version")
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) return new AppError("INTERNAL_ERROR", readError.message).toResponse(requestId);
  if (!current || current.version !== parsed.data.version) {
    return new AppError("CONFLICT", "任务已被修改，请刷新后重试").toResponse(requestId);
  }

  const dbPatch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) dbPatch.title = parsed.data.title;
  if (parsed.data.area !== undefined) dbPatch.area = parsed.data.area;
  if (parsed.data.isCompleted !== undefined) {
    dbPatch.is_completed = parsed.data.isCompleted;
    if (parsed.data.isCompleted) dbPatch.completed_at = new Date().toISOString();
    else dbPatch.completed_at = null;
  }
  if (parsed.data.isP0 !== undefined) dbPatch.is_p0 = parsed.data.isP0;
  if (parsed.data.expectedCompletionDate !== undefined) {
    dbPatch.expected_completion_date = parsed.data.expectedCompletionDate;
  }
  if (parsed.data.sortKey !== undefined) dbPatch.sort_key = parsed.data.sortKey;

  const finalCompleted = parsed.data.isCompleted ?? current.is_completed;
  if (finalCompleted) {
    dbPatch.is_overdue = false;
  } else if (
    parsed.data.expectedCompletionDate !== undefined ||
    parsed.data.area !== undefined
  ) {
    const now = new Date();
    const timeZone = await getUserTimezone(supabase, userId);
    const expectedDate = parsed.data.expectedCompletionDate === undefined
      ? current.expected_completion_date
      : parsed.data.expectedCompletionDate;
    const decision = getRolloverDecision({
      area: parsed.data.area ?? current.area,
      isCompleted: false,
      expectedCompletionDate: expectedDate,
      createdAt: current.created_at,
    }, now, timeZone);
    const movedBackToLater = parsed.data.expectedCompletionDate !== undefined &&
      expectedDate !== null &&
      expectedDate > calendarDate(now, timeZone);
    dbPatch.area = movedBackToLater ? "later" : decision.area;
    dbPatch.is_overdue = movedBackToLater ? false : decision.isOverdue;
  }
  dbPatch.version = parsed.data.version + 1;

  const { data, error } = await supabase
    .from("tasks")
    .update(dbPatch)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("version", parsed.data.version)
    .select()
    .maybeSingle();

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);
  if (!data) return new AppError("CONFLICT", "任务已被修改，请刷新后重试").toResponse(requestId);

  return Response.json({ data, requestId });
}

// DELETE /api/tasks/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = uuid();
  const userId = await getUserId();
  const { id } = await params;

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  // 生成撤销 token
  const deletionToken = createDeletionToken("task", id);

  return Response.json({ success: true, deletionToken, requestId });
}