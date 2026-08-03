import { getUserId } from "@/lib/auth";
import { updateTaskSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { createDeletionToken } from "@/app/api/undo/route";
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
      parsed.error.errors[0]?.message ?? "参数无效",
    ).toResponse(requestId);
  }

  const supabase = createAdminClient();

  const dbPatch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) dbPatch.title = parsed.data.title;
  if (parsed.data.area !== undefined) dbPatch.area = parsed.data.area;
  if (parsed.data.isCompleted !== undefined) {
    dbPatch.is_completed = parsed.data.isCompleted;
    if (parsed.data.isCompleted) dbPatch.completed_at = new Date().toISOString();
    else dbPatch.completed_at = null;
  }
  if (parsed.data.isP0 !== undefined) dbPatch.is_p0 = parsed.data.isP0;
  if (parsed.data.isLegacy !== undefined) dbPatch.is_legacy = parsed.data.isLegacy;
  if (parsed.data.sortKey !== undefined) dbPatch.sort_key = parsed.data.sortKey;
  dbPatch.version = parsed.data.version + 1;

  const { data, error } = await supabase
    .from("tasks")
    .update(dbPatch)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("version", parsed.data.version)
    .select()
    .single();

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