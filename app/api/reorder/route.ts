import { reorderSchema } from "@/lib/validation";
import { getUserId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { v4 as uuid } from "uuid";

export async function POST(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();

  const parsed = reorderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "参数无效",
      parsed.error.issues[0]?.path.join("."),
    ).toResponse(requestId);
  }

  const { entity, id, targetGroupId, beforeId, version } = parsed.data;
  const supabase = createAdminClient();

  // 使用数据库事务完成排序
  const { error } = entity === "task"
    ? await supabase.rpc("move_task", {
      p_user_id: userId,
      p_task_id: id,
      p_target_area: targetGroupId,
      p_before_id: beforeId ?? null,
      p_version: version,
    })
    : await supabase.rpc("reorder_entity", {
      p_user_id: userId,
      p_table: entity === "link" ? "links" : "resources",
      p_id: id,
      p_group_col: entity === "link" ? "group_id" : "category_id",
      p_target_group_id: targetGroupId ?? null,
      p_before_id: beforeId ?? null,
      p_version: version,
    });

  if (error) {
    if (error.message.includes("version")) {
      return new AppError("CONFLICT", "数据已被修改，请刷新后重试").toResponse(requestId);
    }
    return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);
  }

  return Response.json({ success: true, requestId });
}