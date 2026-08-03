import { getUserId } from "@/lib/auth";
import { createTaskSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { v4 as uuid } from "uuid";

// GET /api/tasks?area=today|week|later
export async function GET(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area");

  let query = supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_key", { ascending: true });

  if (area && ["today", "week", "later"].includes(area)) {
    query = query.eq("area", area);
  }

  const { data, error } = await query;
  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId });
}

// POST /api/tasks
export async function POST(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();

  const parsed = createTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new AppError(
      "VALIDATION_ERROR",
      parsed.error.errors[0]?.message ?? "参数无效",
    ).toResponse(requestId);
  }

  const supabase = createAdminClient();

  // 获取最大 sort_key
  const { data: last } = await supabase
    .from("tasks")
    .select("sort_key")
    .eq("user_id", userId)
    .eq("area", parsed.data.area)
    .is("deleted_at", null)
    .order("sort_key", { ascending: false })
    .limit(1);

  const sortKey = last?.[0]?.sort_key
    ? String(Number(last[0].sort_key) + 100000000000)
    : String(100000000000);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title: parsed.data.title,
      area: parsed.data.area,
      sort_key: sortKey,
      version: 1,
    })
    .select()
    .single();

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId }, { status: 201 });
}