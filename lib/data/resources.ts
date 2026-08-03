import { createClient } from "@/lib/supabase/server";
import type { ResourceItem, ResourceCategory } from "@/types/domain";
import { AppError, conflict } from "@/lib/errors";

// ===== 分类 =====

export async function getResourceCategories(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resource_categories")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_key", { ascending: true });

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return (data ?? []) as ResourceCategory[];
}

export async function createResourceCategory(userId: string, name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resource_categories")
    .insert({
      user_id: userId,
      name,
      sort_key: String(Date.now()),
      is_seed: false,
    })
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return data as ResourceCategory;
}

export async function updateResourceCategory(userId: string, categoryId: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("resource_categories")
    .update({ name })
    .eq("id", categoryId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

export async function deleteResourceCategory(
  userId: string,
  categoryId: string,
  migrateToId: string,
) {
  const supabase = await createClient();

  const { error: migrateError } = await supabase
    .from("resources")
    .update({ category_id: migrateToId })
    .eq("category_id", categoryId)
    .eq("user_id", userId);

  if (migrateError) throw new AppError("INTERNAL_ERROR", migrateError.message);

  const { error } = await supabase
    .from("resource_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", categoryId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

// ===== 资料 =====

export async function getResources(
  userId: string,
  categoryId?: string,
  search?: string,
) {
  const supabase = await createClient();
  let query = supabase
    .from("resources")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("sort_key", { ascending: true });

  if (categoryId && categoryId !== "all") {
    query = query.eq("category_id", categoryId);
  }
  if (search) {
    query = query.ilike("plain_text", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return (data ?? []) as ResourceItem[];
}

export async function createResource(
  userId: string,
  categoryId: string,
  documentJson = "{}",
  plainText = "",
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .insert({
      user_id: userId,
      category_id: categoryId,
      title: "未命名资料",
      title_mode: "auto",
      document_json: documentJson,
      plain_text: plainText,
      sort_key: String(Date.now()),
      version: 1,
    })
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return data as ResourceItem;
}

export async function updateResource(
  userId: string,
  resourceId: string,
  patch: Partial<Pick<ResourceItem, "category_id" | "title" | "title_mode" | "document_json" | "plain_text" | "is_pinned" | "sort_key">>,
  version: number,
) {
  const supabase = await createClient();

  const dbPatch: Record<string, unknown> = {};
  if (patch.category_id !== undefined) dbPatch.category_id = patch.category_id;
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.title_mode !== undefined) dbPatch.title_mode = patch.title_mode;
  if (patch.document_json !== undefined) dbPatch.document_json = patch.document_json;
  if (patch.plain_text !== undefined) dbPatch.plain_text = patch.plain_text;
  if (patch.is_pinned !== undefined) dbPatch.is_pinned = patch.is_pinned;
  if (patch.sort_key !== undefined) dbPatch.sort_key = patch.sort_key;
  dbPatch.version = version + 1;

  const { data, error } = await supabase
    .from("resources")
    .update(dbPatch)
    .eq("id", resourceId)
    .eq("user_id", userId)
    .eq("version", version)
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  if (!data) throw conflict("资料已被修改，请刷新后重试");

  return data as ResourceItem;
}

export async function deleteResource(userId: string, resourceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("resources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", resourceId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

export async function undoDeleteResource(userId: string, resourceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("resources")
    .update({ deleted_at: null })
    .eq("id", resourceId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}