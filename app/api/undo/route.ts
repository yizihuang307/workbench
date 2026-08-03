import { undoDeleteSchema } from "@/lib/validation";
import { getUserId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { v4 as uuid } from "uuid";

// 撤销 token 过期时间：5 秒
const TOKEN_TTL_MS = 5000;
const tokenStore = new Map<string, { entity: string; id: string; expiresAt: number }>();

// 定时清理过期 token
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of tokenStore) {
    if (value.expiresAt < now) tokenStore.delete(key);
  }
}, 10000);

export async function POST(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();

  const parsed = undoDeleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      "撤销请求无效",
    ).toResponse(requestId);
  }

  const { entity, id, deletionToken } = parsed.data;
  const stored = tokenStore.get(deletionToken);

  if (!stored || stored.id !== id || stored.entity !== entity || stored.expiresAt < Date.now()) {
    tokenStore.delete(deletionToken);
    return new AppError("NOT_FOUND", "撤销已过期，无法恢复").toResponse(requestId);
  }

  tokenStore.delete(deletionToken);

  const supabase = createAdminClient();
  const table = entity === "task" ? "tasks" : entity === "record" ? "records" : entity === "link" ? "links" : "resources";

  const { error } = await supabase
    .from(table)
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);
  }

  return Response.json({ success: true, requestId });
}

// 生成删除 token（服务端调用）
export function createDeletionToken(entity: string, id: string): string {
  const token = uuid();
  tokenStore.set(token, { entity, id, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}