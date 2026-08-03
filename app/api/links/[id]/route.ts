import { getUserId } from "@/lib/auth";
import { updateLinkSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { createDeletionToken } from "@/app/api/undo/route";
import { v4 as uuid } from "uuid";

// PATCH /api/links/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = uuid();
  const userId = await getUserId();
  const { id } = await params;

  const parsed = updateLinkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      parsed.error.errors[0]?.message ?? "参数无效",
    ).toResponse(requestId);
  }

  const supabase = createAdminClient();

  const dbPatch: Record<string, unknown> = {};
  if (parsed.data.groupId !== undefined) dbPatch.group_id = parsed.data.groupId;
  if (parsed.data.url !== undefined) {
    dbPatch.url = parsed.data.url;
    dbPatch.normalized_url = parsed.data.url.replace(/\/$/, "").toLowerCase();
  }
  if (parsed.data.name !== undefined) dbPatch.name = parsed.data.name;
  dbPatch.version = parsed.data.version + 1;

  const { data, error } = await supabase
    .from("links")
    .update(dbPatch)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("version", parsed.data.version)
    .select()
    .single();

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);
  if (!data) return new AppError("CONFLICT", "链接已被修改，请刷新后重试").toResponse(requestId);

  return Response.json({ data, requestId });
}

// DELETE /api/links/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = uuid();
  const userId = await getUserId();
  const { id } = await params;

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("links")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  const deletionToken = createDeletionToken("link", id);

  return Response.json({ success: true, deletionToken, requestId });
}

// POST /api/links/[id]/open - 记录打开
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = uuid();
  const userId = await getUserId();
  const { id } = await params;

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("links")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ success: true, requestId });
}