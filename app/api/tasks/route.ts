import { getUserId } from "@/lib/auth";
import { createTaskSchema } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { isTaskVisibleInSchedule, shouldMarkLegacy } from "@/lib/task-period";
import { v4 as uuid } from "uuid";

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * 每日/每周 rollover：
 *  - area=today 未完成：created_at（北京时间）早于今天 → is_legacy=true
 *  - area=week  未完成：created_at（北京时间）早于本周一 → is_legacy=true
 */
async function rolloverLegacyTasks(supabase: SupabaseClient, userId: string) {
  const { data: rows, error } = await supabase
    .from("tasks")
    .select("id,area,is_completed,is_legacy,created_at,version")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("is_completed", false)
    .in("area", ["today", "week"]);
  if (error || !rows) return;

  const updates: Array<{ id: string; is_legacy: boolean; version: number }> = [];

  for (const r of rows) {
    const shouldLegacy = shouldMarkLegacy({
      area: r.area,
      isCompleted: r.is_completed,
      createdAt: r.created_at,
    });
    if (shouldLegacy !== r.is_legacy) {
      updates.push({ id: r.id, is_legacy: shouldLegacy, version: Number(r.version ?? 0) + 1 });
    }
  }

  if (!updates.length) return;
  await Promise.all(
    updates.map((u) =>
      supabase
        .from("tasks")
        .update({ is_legacy: u.is_legacy, version: u.version })
        .eq("id", u.id)
        .eq("user_id", userId),
    ),
  );
}

// GET /api/tasks?area=today|week|later
export async function GET(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  try {
    await rolloverLegacyTasks(supabase, userId);
  } catch {
    // rollover 失败不阻塞正常读取
  }

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

  const visible = (data ?? []).filter((task) => isTaskVisibleInSchedule({
    area: task.area,
    isCompleted: task.is_completed,
    createdAt: task.created_at,
    completedAt: task.completed_at,
  }));

  return Response.json({ data: visible, requestId });
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
