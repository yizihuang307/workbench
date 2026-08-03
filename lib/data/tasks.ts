import { createClient } from "@/lib/supabase/server";
import type { Task, TaskArea } from "@/types/domain";
import { AppError, conflict, notFound } from "@/lib/errors";

// ===== 查询 =====

export async function getTasks(userId: string, area?: TaskArea) {
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_key", { ascending: true });

  if (area) query = query.eq("area", area);
  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return (data ?? []) as Task[];
}

export async function getCompletedTasks(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("is_completed", true)
    .is("deleted_at", null)
    .order("completed_at", { ascending: false });

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return (data ?? []) as Task[];
}

// ===== 创建 =====

export async function createTask(
  userId: string,
  title: string,
  area: TaskArea,
  sortKey?: string,
) {
  const supabase = await createClient();

  // 获取最大 sort_key
  if (!sortKey) {
    const { data: last } = await supabase
      .from("tasks")
      .select("sort_key")
      .eq("user_id", userId)
      .eq("area", area)
      .is("deleted_at", null)
      .order("sort_key", { ascending: false })
      .limit(1);

    const lastSort = last?.[0]?.sort_key ?? 0;
    sortKey = String(Number(lastSort) + 100000000000);
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title,
      area,
      sort_key: sortKey,
      version: 1,
    })
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return data as Task;
}

// ===== 更新 =====

export async function updateTask(
  userId: string,
  taskId: string,
  patch: Partial<Pick<Task, "title" | "area" | "is_completed" | "is_p0" | "is_legacy" | "sort_key" | "completed_at">>,
  version: number,
) {
  const supabase = await createClient();

  // 乐观锁：version 必须匹配
  const { data, error } = await supabase
    .from("tasks")
    .update({
      ...patch,
      version: version + 1,
    })
    .eq("id", taskId)
    .eq("user_id", userId)
    .eq("version", version)
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  if (!data) throw conflict("任务已被修改，请刷新后重试");

  return data as Task;
}

// ===== 删除 =====

export async function deleteTask(userId: string, taskId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

// ===== 撤销删除 =====

export async function undoDeleteTask(userId: string, taskId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: null })
    .eq("id", taskId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

// ===== 排序 =====

export async function moveTask(
  userId: string,
  taskId: string,
  targetArea: TaskArea,
  beforeId?: string,
) {
  const supabase = await createClient();

  // 调用数据库函数完成排序
  const { error } = await supabase.rpc("move_task", {
    p_user_id: userId,
    p_task_id: taskId,
    p_target_area: targetArea,
    p_before_id: beforeId ?? null,
  });

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

// ===== 跨日处理 =====

export async function markLegacy(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ is_legacy: true })
    .eq("user_id", userId)
    .eq("area", "today")
    .eq("is_completed", false)
    .is("deleted_at", null);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}