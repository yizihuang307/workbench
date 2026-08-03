import { getUserId } from "@/lib/auth";
import { groupNameSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { v4 as uuid } from "uuid";

// PATCH /api/record-categories/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = uuid();
  const userId = await getUserId();
  const { id } = await params;

  const body = await request.json();
  const parsed = groupNameSchema.safeParse(body.name);
  if (!parsed.success) {
    return new AppError("VALIDATION_ERROR", "分类名称无效").toResponse(requestId);
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("record_categories")
    .update({ name: parsed.data })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ success: true, requestId });
}

// DELETE /api/record-categories/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = uuid();
  const userId = await getUserId();
  const { id } = await params;

  const { searchParams } = new URL(request.url);
  const migrateToId = searchParams.get("migrateToId");

  const supabase = createAdminClient();

  if (migrateToId) {
    // 迁移记录到目标分类
    const { error: migrateError } = await supabase
      .from("records")
      .update({ category_id: migrateToId })
      .eq("category_id", id)
      .eq("user_id", userId);

    if (migrateError) return new AppError("INTERNAL_ERROR", migrateError.message).toResponse(requestId);
  }

  const { error } = await supabase
    .from("record_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ success: true, requestId });
}