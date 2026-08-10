import { getUserId } from "@/lib/auth";
import { createResourceSchema, updateResourceSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { createDeletionToken } from "@/app/api/undo/route";
import { v4 as uuid } from "uuid";

// GET /api/resources?categoryId=xxx&search=xxx
export async function GET(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search");

  let query = supabase
    .from("resources")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("sort_key", { ascending: true });

  if (categoryId && categoryId !== "all") query = query.eq("category_id", categoryId);
  if (search) query = query.ilike("plain_text", `%${search}%`);

  const { data, error } = await query;
  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId });
}

// POST /api/resources
export async function POST(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();

  const parsed = createResourceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "参数无效",
    ).toResponse(requestId);
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("resources")
    .insert({
      user_id: userId,
      category_id: parsed.data.categoryId,
      title: "未命名资料",
      title_mode: "auto",
      document_json: parsed.data.documentJson,
      plain_text: parsed.data.plainText,
      sort_key: String(Date.now()),
      version: 1,
    })
    .select()
    .single();

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId }, { status: 201 });
}