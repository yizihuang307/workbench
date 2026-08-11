import { getUserId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { v4 as uuid } from "uuid";

// GET /api/tasks/completed - 获取已完成任务
export async function GET() {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("is_completed", true)
    .order("completed_at", { ascending: false });

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId });
}