import { createClient } from "@/lib/supabase/server";
import type { RecordItem, RecordCategory } from "@/types/domain";
import { AppError, conflict } from "@/lib/errors";

// ===== 分类 =====

export async function getRecordCategories(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("record_categories")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_key", { ascending: true });

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return (data ?? []) as RecordCategory[];
}

export async function createRecordCategory(userId: string, name: string, sortKey?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("record_categories")
    .insert({
      user_id: userId,
      name,
      sort_key: sortKey ?? String(Date.now()),
      is_default_seed: false,
    })
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return data as RecordCategory;
}

export async function updateRecordCategory(userId: string, categoryId: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("record_categories")
    .update({ name })
    .eq("id", categoryId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

export async function deleteRecordCategory(
  userId: string,
  categoryId: string,
  migrateToId: string,
) {
  const supabase = await createClient();

  // 事务：迁移记录 + 删除分类
  const { error: migrateError } = await supabase
    .from("records")
    .update({ category_id: migrateToId })
    .eq("category_id", categoryId)
    .eq("user_id", userId);

  if (migrateError) throw new AppError("INTERNAL_ERROR", migrateError.message);

  const { error } = await supabase
    .from("record_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", categoryId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

// ===== 记录 =====

export async function getRecords(
  userId: string,
  categoryId?: string,
  search?: string,
) {
  const supabase = await createClient();
  let query = supabase
    .from("records")
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
  return (data ?? []) as RecordItem[];
}

export async function createRecord(
  userId: string,
  categoryId: string,
  documentJson = "{}",
  plainText = "",
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("records")
    .insert({
      user_id: userId,
      category_id: categoryId,
      title: "未命名记录",
      title_mode: "auto",
      document_json: documentJson,
      plain_text: plainText,
      sort_key: String(Date.now()),
      version: 1,
    })
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  return data as RecordItem;
}

export async function updateRecord(
  userId: string,
  recordId: string,
  patch: Partial<{
    category_id: string;
    title: string;
    title_mode: "auto" | "manual";
    document_json: string;
    plain_text: string;
    is_pinned: boolean;
    sort_key: string;
  }>,
  version: number,
) {
  const supabase = await createClient();

  // 转换 camelCase → snake_case 用于数据库
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
    .from("records")
    .update(dbPatch)
    .eq("id", recordId)
    .eq("user_id", userId)
    .eq("version", version)
    .select()
    .single();

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
  if (!data) throw conflict("记录已被修改，请刷新后重试");

  return data as RecordItem;
}

export async function deleteRecord(userId: string, recordId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", recordId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}

export async function undoDeleteRecord(userId: string, recordId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("records")
    .update({ deleted_at: null })
    .eq("id", recordId)
    .eq("user_id", userId);

  if (error) throw new AppError("INTERNAL_ERROR", error.message);
}