import { getRolloverDecision } from "@/lib/task-period";
import { createAdminClient } from "@/lib/supabase/admin";

export const DEFAULT_TIMEZONE = "Asia/Shanghai";

type SupabaseResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type SupabaseClient = ReturnType<typeof createAdminClient>;

export async function getUserTimezone(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle() as Awaited<SupabaseResult<{ timezone?: string }>>;
  if (error) throw new Error(`读取用户时区失败：${error.message}`);
  return data?.timezone || DEFAULT_TIMEZONE;
}

export async function rolloverDueTasks(
  supabase: SupabaseClient,
  userId: string,
  now: string | number | Date = new Date(),
) {
  const timeZone = await getUserTimezone(supabase, userId);
  const { data: rows, error } = await supabase
    .from("tasks")
    .select("id,area,is_completed,is_overdue,expected_completion_date,created_at,version")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("is_completed", false) as Awaited<SupabaseResult<Array<{
      id: string;
      area: "today" | "later";
      is_completed: boolean;
      is_overdue: boolean;
      expected_completion_date: string | null;
      created_at: string;
      version: number;
    }>>>;
  if (error) throw new Error(`读取待迁移任务失败：${error.message}`);

  let updated = 0;
  for (const row of rows ?? []) {
    const decision = getRolloverDecision({
      area: row.area,
      isCompleted: row.is_completed,
      expectedCompletionDate: row.expected_completion_date,
      createdAt: row.created_at,
    }, now, timeZone);
    if (decision.area === row.area && decision.isOverdue === row.is_overdue) continue;

    const { data, error: updateError } = await supabase
      .from("tasks")
      .update({
        area: decision.area,
        is_overdue: decision.isOverdue,
        version: row.version + 1,
      })
      .eq("id", row.id)
      .eq("user_id", userId)
      .eq("version", row.version)
      .select("id") as Awaited<SupabaseResult<Array<{ id: string }>>>;
    if (updateError) throw new Error(`迁移任务 ${row.id} 失败：${updateError.message}`);
    // 空数组表示并发请求已先更新；下次读取会基于新版本再次判定。
    if (data?.length) updated += 1;
  }

  return { timeZone, updated };
}
