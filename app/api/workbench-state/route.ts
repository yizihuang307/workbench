import { getUserId } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { isIsoDate, isTaskVisibleInSchedule } from "@/lib/task-period";
import { rolloverDueTasks } from "@/lib/server/rollover-due-tasks";
import { mergeLegacyWeekTasks } from "@/lib/workbench-task-state";
import { z } from "zod";
import { v4 as uuid } from "uuid";

const id = z.string().uuid();
const timestamp = z.number().finite().nonnegative();
const taskSchema = z.object({
  id,
  label: z.string().trim().min(1).max(200),
  done: z.boolean(),
  priority: z.boolean(),
  expectedCompletionDate: z.string().refine(isIsoDate).nullable().optional(),
  isOverdue: z.boolean().optional(),
  createdAt: timestamp,
  completedAt: timestamp.nullable().optional(),
});
const completionSchema = z.object({
  taskId: id,
  label: z.string().max(200),
  expectedCompletionDate: z.string().refine(isIsoDate).nullable().optional(),
  completedAt: timestamp,
});
const categorySchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  createdAt: timestamp,
});
const recordSchema = z.object({
  id,
  categoryId: id,
  body: z.string().max(30000),
  blocks: z.array(z.unknown()).max(100).optional(),
  images: z.array(z.unknown()).max(5).optional(),
  pinned: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
const linkGroupSchema = categorySchema.extend({ order: z.number().finite() });
const systemSchema = z.object({
  id,
  groupId: z.string(),
  name: z.string().trim().min(1).max(200),
  icon: z.string().max(2048),
  links: z.array(z.object({
    id: z.string(),
    url: z.string().url().refine((value) => /^https?:\/\//i.test(value)),
    label: z.string().max(40),
  })).min(1).max(20),
  defaultLinkId: z.string(),
  order: z.number().finite(),
  lastOpenedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const sectionSchema = categorySchema.extend({
  type: z.literal("resources"),
  order: z.number().finite(),
});
const resourceSchema = z.object({
  id,
  sectionId: id,
  title: z.string().max(200),
  titleAuto: z.boolean().optional(),
  documentHtml: z.string().max(250000).optional(),
  blocks: z.array(z.unknown()).max(40),
  pinned: z.boolean(),
  order: z.number().finite(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const stateSchema = z.object({
  schedule: z.object({
    savedDate: z.string().max(10),
    tasks: z.object({
      today: z.array(taskSchema).max(5000),
      week: z.array(taskSchema).max(5000).optional(),
      later: z.array(taskSchema).max(5000),
    }),
    hideDone: z.boolean(),
    mood: z.number().int().min(0).max(4),
    quickNotes: z.array(z.unknown()).max(100),
    completionHistory: z.array(completionSchema).max(10000),
  }),
  records: z.object({
    categories: z.array(categorySchema).min(1).max(500),
    records: z.array(recordSchema).max(5000),
    defaultCategoryId: id,
    aiConsent: z.boolean(),
  }),
  information: z.object({
    ungroupedName: z.string().trim().min(1).max(40),
    ungroupedOrder: z.number().finite(),
    linkGroups: z.array(linkGroupSchema).max(500),
    sections: z.array(sectionSchema).min(1).max(500),
    systems: z.array(systemSchema).max(5000),
    resources: z.array(resourceSchema).max(5000),
  }),
});

type Supabase = ReturnType<typeof createAdminClient>;
const SORT_GAP = 1_000_000;

function requestError(message: string, requestId: string) {
  return new AppError("VALIDATION_ERROR", message).toResponse(requestId);
}

function parseDocument(value: unknown) {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function plainTextFromHtml(html: string) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function ensureDefaults(supabase: Supabase, userId: string) {
  const defaults = [
    ["record_categories", [
      { user_id: userId, name: "随手记", sort_key: String(SORT_GAP), is_default_seed: true },
      { user_id: userId, name: "会议纪要", sort_key: String(SORT_GAP * 2), is_default_seed: true },
    ]],
    ["link_groups", [
      { user_id: userId, name: "未分组", sort_key: "0", is_system: true },
    ]],
    ["resource_categories", [
      { user_id: userId, name: "工作资料", sort_key: String(SORT_GAP), is_seed: true },
      { user_id: userId, name: "学习收藏", sort_key: String(SORT_GAP * 2), is_seed: true },
    ]],
  ] as const;

  for (const [table, rows] of defaults) {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (error) throw error;
    if (!count) {
      const { error: insertError } = await supabase.from(table).insert([...rows]);
      if (insertError) throw insertError;
    }
  }

  const { error } = await supabase.from("user_preferences").upsert(
    { user_id: userId, hide_completed: false, schema_version: 2 },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (error) throw error;
  const { error: migrationError } = await supabase
    .from("user_preferences")
    .update({ hide_completed: false, schema_version: 2 })
    .eq("user_id", userId)
    .lt("schema_version", 2);
  if (migrationError) throw migrationError;
}

async function readState(supabase: Supabase, userId: string) {
  await ensureDefaults(supabase, userId);
  const { timeZone } = await rolloverDueTasks(supabase, userId);
  const [
    tasksResult,
    recordCategoriesResult,
    recordsResult,
    linkGroupsResult,
    linksResult,
    resourceCategoriesResult,
    resourcesResult,
    preferencesResult,
  ] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", userId).is("deleted_at", null).order("sort_key"),
    supabase.from("record_categories").select("*").eq("user_id", userId).is("deleted_at", null).order("sort_key"),
    supabase.from("records").select("*").eq("user_id", userId).is("deleted_at", null).order("sort_key"),
    supabase.from("link_groups").select("*").eq("user_id", userId).is("deleted_at", null).order("sort_key"),
    supabase.from("links").select("*").eq("user_id", userId).is("deleted_at", null).order("sort_key"),
    supabase.from("resource_categories").select("*").eq("user_id", userId).is("deleted_at", null).order("sort_key"),
    supabase.from("resources").select("*").eq("user_id", userId).is("deleted_at", null).order("sort_key"),
    supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  const failed = [
    tasksResult,
    recordCategoriesResult,
    recordsResult,
    linkGroupsResult,
    linksResult,
    resourceCategoriesResult,
    resourcesResult,
    preferencesResult,
  ].find((result) => result.error);
  if (failed?.error) throw failed.error;

  const taskGroups: Record<"today" | "later", unknown[]> = { today: [], later: [] };
  const completionHistory: unknown[] = [];
  for (const row of tasksResult.data ?? []) {
    const area = row.area === "today" ? "today" : "later";
    const task = {
      id: row.id,
      label: row.title,
      done: row.is_completed,
      priority: row.is_p0,
      expectedCompletionDate: row.expected_completion_date,
      isOverdue: row.is_overdue,
      createdAt: new Date(row.created_at).getTime(),
      completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
    };
    if (isTaskVisibleInSchedule({
      area,
      isCompleted: row.is_completed,
      expectedCompletionDate: row.expected_completion_date,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }, undefined, timeZone, preferencesResult.data?.hide_completed ?? false)) {
      taskGroups[area].push(task);
    }
    if (row.is_completed && row.completed_at) {
      completionHistory.push({
        taskId: row.id,
        label: row.title,
        expectedCompletionDate: row.expected_completion_date,
        completedAt: new Date(row.completed_at).getTime(),
      });
    }
  }

  const recordCategories = recordCategoriesResult.data ?? [];
  const preferences = preferencesResult.data;
  const defaultCategoryId = recordCategories.some((row) => row.id === preferences?.quick_record_category_id)
    ? preferences.quick_record_category_id
    : recordCategories[0].id;

  const systemGroup = (linkGroupsResult.data ?? []).find((row) => row.is_system);
  const customGroups = (linkGroupsResult.data ?? []).filter((row) => !row.is_system);
  const systemGroupOrder = (linkGroupsResult.data ?? []).findIndex((row) => row.id === systemGroup?.id);

  return {
    schedule: {
      version: 1,
      savedDate: new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      tasks: taskGroups,
      hideDone: preferences?.hide_completed ?? false,
      mood: 2,
      quickNotes: [],
      completionHistory,
    },
    records: {
      version: 1,
      categories: recordCategories.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: new Date(row.created_at).getTime(),
      })),
      records: (recordsResult.data ?? []).map((row) => {
        const document = parseDocument(row.document_json);
        return {
          id: row.id,
          categoryId: row.category_id,
          body: row.plain_text,
          blocks: Array.isArray(document.blocks) ? document.blocks : undefined,
          images: Array.isArray(document.images) ? document.images : undefined,
          pinned: row.is_pinned,
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime(),
        };
      }),
      defaultCategoryId,
      aiConsent: false,
    },
    information: {
      version: 2,
      ungroupedName: systemGroup?.name ?? "未分组",
      ungroupedOrder: Math.max(0, systemGroupOrder),
      linkGroups: customGroups.map((row) => ({
        id: row.id,
        name: row.name,
        order: (linkGroupsResult.data ?? []).findIndex((group) => group.id === row.id),
        createdAt: new Date(row.created_at).getTime(),
      })),
      sections: (resourceCategoriesResult.data ?? []).map((row, index) => ({
        id: row.id,
        name: row.name,
        type: "resources" as const,
        order: index,
        createdAt: new Date(row.created_at).getTime(),
      })),
      systems: (linksResult.data ?? []).map((row, index) => ({
        id: row.id,
        sectionId: "",
        groupId: row.group_id === systemGroup?.id ? "" : row.group_id,
        name: row.name,
        icon: row.favicon_url || "",
        links: [{ id: row.id, url: row.url, label: "主页" }],
        defaultLinkId: row.id,
        order: index,
        lastOpenedAt: row.last_opened_at ? new Date(row.last_opened_at).getTime() : 0,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
      })),
      resources: (resourcesResult.data ?? []).map((row, index) => {
        const document = parseDocument(row.document_json);
        return {
          id: row.id,
          sectionId: row.category_id,
          title: row.title,
          titleAuto: row.title_mode === "auto",
          documentHtml: typeof document.documentHtml === "string" ? document.documentHtml : undefined,
          blocks: Array.isArray(document.blocks) ? document.blocks : [],
          plainText: row.plain_text || "",
          pinned: row.is_pinned,
          order: index,
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime(),
        };
      }),
    },
  };
}

async function rejectForeignIds(
  supabase: Supabase,
  table: string,
  ids: string[],
  userId: string,
) {
  if (!ids.length) return;
  const { data, error } = await supabase.from(table).select("id,user_id").in("id", ids);
  if (error) throw error;
  if (data?.some((row) => row.user_id !== userId)) throw new Error(`Invalid ${table} id`);
}

async function upsertOwned(
  supabase: Supabase,
  table: string,
  rows: Array<Record<string, unknown>>,
  userId: string,
) {
  if (!rows.length) return;
  await rejectForeignIds(supabase, table, rows.map((row) => String(row.id)), userId);
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function softDeleteMissing(
  supabase: Supabase,
  table: string,
  keepIds: string[],
  userId: string,
  extra?: { column: string; value: unknown },
) {
  let query = supabase.from(table).select("id").eq("user_id", userId).is("deleted_at", null);
  if (extra) query = query.eq(extra.column, extra.value);
  const { data, error } = await query;
  if (error) throw error;
  const missing = (data ?? []).map((row) => row.id).filter((value) => !keepIds.includes(value));
  if (!missing.length) return;
  const { error: updateError } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", missing);
  if (updateError) throw updateError;
}

async function writeState(
  supabase: Supabase,
  userId: string,
  state: z.infer<typeof stateSchema>,
) {
  await ensureDefaults(supabase, userId);
  const { data: systemGroup, error: groupError } = await supabase
    .from("link_groups")
    .select("id")
    .eq("user_id", userId)
    .eq("is_system", true)
    .is("deleted_at", null)
    .single();
  if (groupError) throw groupError;

  const recordCategoryIds = new Set(state.records.categories.map((item) => item.id));
  const resourceCategoryIds = new Set(state.information.sections.map((item) => item.id));
  const linkGroupIds = new Set(state.information.linkGroups.map((item) => item.id));
  if (!recordCategoryIds.has(state.records.defaultCategoryId)) throw new Error("Invalid default category");
  if (state.records.records.some((item) => !recordCategoryIds.has(item.categoryId))) throw new Error("Invalid record category");
  if (state.information.resources.some((item) => !resourceCategoryIds.has(item.sectionId))) throw new Error("Invalid resource category");
  if (state.information.systems.some((item) => item.groupId && !linkGroupIds.has(item.groupId))) throw new Error("Invalid link group");

  await upsertOwned(supabase, "record_categories", state.records.categories.map((item, index) => ({
    id: item.id,
    user_id: userId,
    name: item.name,
    sort_key: String(index * SORT_GAP),
    is_default_seed: false,
    deleted_at: null,
  })), userId);
  await upsertOwned(supabase, "resource_categories", state.information.sections.map((item, index) => ({
    id: item.id,
    user_id: userId,
    name: item.name,
    sort_key: String(index * SORT_GAP),
    is_seed: false,
    deleted_at: null,
  })), userId);
  await upsertOwned(supabase, "link_groups", state.information.linkGroups.map((item) => ({
    id: item.id,
    user_id: userId,
    name: item.name,
    sort_key: String(Math.max(0, Math.round(item.order)) * SORT_GAP),
    is_system: false,
    deleted_at: null,
  })), userId);
  const { error: ungroupedError } = await supabase.from("link_groups").update({
    name: state.information.ungroupedName,
    sort_key: String(Math.max(0, Math.round(state.information.ungroupedOrder)) * SORT_GAP),
  }).eq("id", systemGroup.id).eq("user_id", userId);
  if (ungroupedError) throw ungroupedError;

  const completionTimes = new Map(state.schedule.completionHistory.map((item) => [item.taskId, item.completedAt]));
  const allTasksById = new Map<string, z.infer<typeof taskSchema> & {
    area: "today" | "later";
    index: number;
  }>();
  const mergedTaskGroups = mergeLegacyWeekTasks(state.schedule.tasks);
  mergedTaskGroups.today.forEach((item, index) => {
    allTasksById.set(item.id, { ...item, area: "today", index });
  });
  mergedTaskGroups.later.forEach((item, index) => {
    allTasksById.set(item.id, { ...item, area: "later", index });
  });
  const allTasks = [...allTasksById.values()];
  await upsertOwned(supabase, "tasks", allTasks.map((item) => ({
    id: item.id,
    user_id: userId,
    title: item.label,
    area: item.area,
    is_completed: item.done,
    is_p0: item.priority,
    expected_completion_date: item.expectedCompletionDate ?? null,
    is_overdue: item.done ? false : (item.isOverdue ?? false),
    sort_key: String(item.index * SORT_GAP),
    completed_at: item.done
      ? new Date(item.completedAt ?? completionTimes.get(item.id) ?? Date.now()).toISOString()
      : null,
    version: 1,
    created_at: new Date(item.createdAt).toISOString(),
    deleted_at: null,
  })), userId);
  await upsertOwned(supabase, "records", state.records.records.map((item, index) => ({
    id: item.id,
    user_id: userId,
    category_id: item.categoryId,
    title: item.body.trim().split(/\r?\n/)[0]?.slice(0, 200) || "未命名记录",
    title_mode: "auto",
    document_json: JSON.stringify({ blocks: item.blocks, images: item.images }),
    plain_text: item.body,
    is_pinned: item.pinned,
    sort_key: String(index * SORT_GAP),
    version: 1,
    created_at: new Date(item.createdAt).toISOString(),
    deleted_at: null,
  })), userId);
  await upsertOwned(supabase, "links", state.information.systems.map((item) => {
    const target = item.links.find((link) => link.id === item.defaultLinkId) ?? item.links[0];
    return {
      id: item.id,
      user_id: userId,
      group_id: item.groupId || systemGroup.id,
      url: target.url,
      normalized_url: target.url.replace(/\/$/, "").toLowerCase(),
      name: item.name,
      favicon_url: item.icon || null,
      sort_key: String(Math.max(0, Math.round(item.order)) * SORT_GAP),
      last_opened_at: item.lastOpenedAt ? new Date(item.lastOpenedAt).toISOString() : null,
      version: 1,
      created_at: new Date(item.createdAt).toISOString(),
      deleted_at: null,
    };
  }), userId);
  await upsertOwned(supabase, "resources", state.information.resources.map((item) => ({
    id: item.id,
    user_id: userId,
    category_id: item.sectionId,
    title: item.title.trim() || "未命名资料",
    title_mode: item.titleAuto ? "auto" : "manual",
    document_json: JSON.stringify({ documentHtml: item.documentHtml, blocks: item.blocks }),
    plain_text: [
      plainTextFromHtml(item.documentHtml ?? ""),
      ...item.blocks.map((block) => {
        if (!block || typeof block !== "object") return "";
        const value = block as Record<string, unknown>;
        return String(value.text ?? value.title ?? value.name ?? "");
      }),
    ].filter(Boolean).join("\n").slice(0, 30000),
    is_pinned: item.pinned,
    sort_key: String(Math.max(0, Math.round(item.order)) * SORT_GAP),
    version: 1,
    created_at: new Date(item.createdAt).toISOString(),
    deleted_at: null,
  })), userId);

  await Promise.all([
    softDeleteMissing(supabase, "tasks", allTasks.map((item) => item.id), userId),
    softDeleteMissing(supabase, "records", state.records.records.map((item) => item.id), userId),
    softDeleteMissing(supabase, "links", state.information.systems.map((item) => item.id), userId),
    softDeleteMissing(supabase, "resources", state.information.resources.map((item) => item.id), userId),
    softDeleteMissing(supabase, "record_categories", [...recordCategoryIds], userId),
    softDeleteMissing(supabase, "resource_categories", [...resourceCategoryIds], userId),
    softDeleteMissing(supabase, "link_groups", [...linkGroupIds], userId, { column: "is_system", value: false }),
  ]);

  const { error: preferenceError } = await supabase.from("user_preferences").upsert({
    user_id: userId,
    quick_record_category_id: state.records.defaultCategoryId,
    hide_completed: state.schedule.hideDone,
    schema_version: 2,
  }, { onConflict: "user_id" });
  if (preferenceError) throw preferenceError;
}

export async function GET() {
  const requestId = uuid();
  try {
    const userId = await getUserId();
    const state = await readState(createAdminClient(), userId);
    return Response.json({ data: state, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "加载云端数据失败";
    return new AppError("INTERNAL_ERROR", message).toResponse(requestId);
  }
}

export async function PUT(request: Request) {
  const requestId = uuid();
  try {
    const userId = await getUserId();
    const parsed = stateSchema.safeParse(await request.json());
    if (!parsed.success) return requestError(parsed.error.issues[0]?.message ?? "状态数据无效", requestId);
    await writeState(createAdminClient(), userId, parsed.data);
    return Response.json({ success: true, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存云端数据失败";
    return new AppError("INTERNAL_ERROR", message).toResponse(requestId);
  }
}
