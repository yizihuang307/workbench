import { getUserId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { v4 as uuid } from "uuid";

// GET /api/preferences
export async function GET() {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);
  }

  return Response.json({ data: data ?? null, requestId });
}

// PATCH /api/preferences
export async function PATCH(request: Request) {
  const requestId = uuid();
  const userId = await getUserId();
  const supabase = createAdminClient();

  const body = await request.json() as {
    quickRecordCategoryId?: string;
    hideCompleted?: boolean;
  };

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert({
      user_id: userId,
      ...(body.quickRecordCategoryId !== undefined ? { quick_record_category_id: body.quickRecordCategoryId } : {}),
      ...(body.hideCompleted !== undefined ? { hide_completed: body.hideCompleted } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return new AppError("INTERNAL_ERROR", error.message).toResponse(requestId);

  return Response.json({ data, requestId });
}