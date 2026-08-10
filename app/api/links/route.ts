import { getUserId } from "@/lib/auth";
import { createLinkSchema, updateLinkSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { createDeletionToken } from "@/app/api/undo/route";
import { v4 as uuid } from "uuid";

// GET /api/links?groupId=xxx&search=xxx
export async function GET(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");
  const search = searchParams.get("search");

  let query = supabase
    .from("links")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_key", { ascending: true });

  if (groupId) query = query.eq("group_id", groupId);
  if (search) query = query.or(`name.ilike.%${search}%,url.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId });
}

// POST /api/links
export async function POST(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();

  const parsed = createLinkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "参数无效",
    ).toResponse(requestId);
  }

  const supabase = createAdminClient();

  const url = parsed.data.url;
  const normalizedUrl = url.replace(/\/$/, "").toLowerCase();

  const { data, error } = await supabase
    .from("links")
    .insert({
      user_id: userId,
      group_id: parsed.data.groupId,
      url,
      normalized_url: normalizedUrl,
      name: parsed.data.name ?? url,
      sort_key: String(Date.now()),
      version: 1,
    })
    .select()
    .single();

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId }, { status: 201 });
}