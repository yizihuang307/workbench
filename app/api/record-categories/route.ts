import { getUserId } from "@/lib/auth";
import { groupNameSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { v4 as uuid } from "uuid";

// GET /api/record-categories
export async function GET() {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("record_categories")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_key", { ascending: true });

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId });
}

// POST /api/record-categories
export async function POST(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();

  const body = await request.json();
  const parsed = groupNameSchema.safeParse(body.name);
  if (!parsed.success) {
    return new AppError("VALIDATION_ERROR", "分类名称无效").toResponse(requestId);
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("record_categories")
    .insert({
      user_id: userId,
      name: parsed.data,
      sort_key: String(Date.now()),
      is_default_seed: false,
    })
    .select()
    .single();

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId }, { status: 201 });
}