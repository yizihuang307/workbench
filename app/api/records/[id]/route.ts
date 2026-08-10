import { getUserId } from "@/lib/auth";
import { updateRecordSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { createDeletionToken } from "@/app/api/undo/route";
import { v4 as uuid } from "uuid";

// PATCH /api/records/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = uuid();
  const userId = await getUserId();
  const { id } = await params;

  const parsed = updateRecordSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "参数无效",
    ).toResponse(requestId);
  }

  const supabase = createAdminClient();

  const dbPatch: Record<string, unknown> = {};
  if (parsed.data.categoryId !== undefined) dbPatch.category_id = parsed.data.categoryId;
  if (parsed.data.title !== undefined) dbPatch.title = parsed.data.title;
  if (parsed.data.titleMode !== undefined) dbPatch.title_mode = parsed.data.titleMode;
  if (parsed.data.documentJson !== undefined) dbPatch.document_json = parsed.data.documentJson;
  if (parsed.data.plainText !== undefined) dbPatch.plain_text = parsed.data.plainText;
  if (parsed.data.isPinned !== undefined) dbPatch.is_pinned = parsed.data.isPinned;
  dbPatch.version = parsed.data.version + 1;

  const { data, error } = await supabase
    .from("records")
    .update(dbPatch)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("version", parsed.data.version)
    .select()
    .single();

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);
  if (!data) return new AppError("CONFLICT", "记录已被修改，请刷新后重试").toResponse(requestId);

  return Response.json({ data, requestId });
}

// DELETE /api/records/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = uuid();
  const userId = await getUserId();
  const { id } = await params;

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  const deletionToken = createDeletionToken("record", id);

  return Response.json({ success: true, deletionToken, requestId });
}