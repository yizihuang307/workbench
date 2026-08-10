import { z } from "zod";
import { isIsoDate } from "@/lib/task-period";

// ===== 通用校验 =====

export const titleSchema = z
  .string()
  .min(1, "标题不能为空")
  .max(200, "标题最多 200 字")
  .transform((v) => v.trim());

export const bodySchema = z
  .string()
  .max(30000, "正文最多 30000 字");

export const groupNameSchema = z
  .string()
  .min(1, "名称不能为空")
  .max(40, "名称最多 40 字")
  .transform((v) => v.trim());

export const urlSchema = z
  .string()
  .url("请输入有效的网址")
  .refine((v) => /^https?:\/\//i.test(v), "仅支持 http/https 网址");

export const idSchema = z.string().uuid("无效的 ID");

export const versionSchema = z.number().int().min(1, "版本号无效");

// ===== Task =====

export const isoDateSchema = z.string().refine(isIsoDate, "日期必须为有效的 YYYY-MM-DD").nullable();

export const createTaskSchema = z.object({
  title: titleSchema,
  area: z.enum(["today", "later"]),
  expectedCompletionDate: isoDateSchema.optional(),
});

export const updateTaskSchema = z.object({
  title: titleSchema.optional(),
  area: z.enum(["today", "later"]).optional(),
  isCompleted: z.boolean().optional(),
  isP0: z.boolean().optional(),
  expectedCompletionDate: isoDateSchema.optional(),
  sortKey: z.string().optional(),
  version: versionSchema,
});

// ===== Record =====

export const createRecordSchema = z.object({
  categoryId: idSchema,
  documentJson: z.string().default("{}"),
  plainText: z.string().default(""),
});

export const updateRecordSchema = z.object({
  categoryId: idSchema.optional(),
  title: titleSchema.optional(),
  titleMode: z.enum(["auto", "manual"]).optional(),
  documentJson: z.string().optional(),
  plainText: z.string().optional(),
  isPinned: z.boolean().optional(),
  version: versionSchema,
});

// ===== Link =====

export const createLinkSchema = z.object({
  groupId: idSchema,
  url: urlSchema,
  name: titleSchema.optional(),
});

export const updateLinkSchema = z.object({
  groupId: idSchema.optional(),
  url: urlSchema.optional(),
  name: titleSchema.optional(),
  version: versionSchema,
});

// ===== Resource =====

export const createResourceSchema = z.object({
  categoryId: idSchema,
  documentJson: z.string().default("{}"),
  plainText: z.string().default(""),
});

export const updateResourceSchema = z.object({
  categoryId: idSchema.optional(),
  title: titleSchema.optional(),
  titleMode: z.enum(["auto", "manual"]).optional(),
  documentJson: z.string().optional(),
  plainText: z.string().optional(),
  isPinned: z.boolean().optional(),
  version: versionSchema,
});

// ===== Reorder =====

export const reorderSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("task"),
    id: idSchema,
    targetGroupId: z.enum(["today", "later"]).optional(),
    beforeId: idSchema.optional(),
    version: versionSchema,
  }),
  z.object({
    entity: z.enum(["link", "resource"]),
    id: idSchema,
    targetGroupId: idSchema.optional(),
    beforeId: idSchema.optional(),
    version: versionSchema,
  }),
]);

// ===== AI =====

export const aiOrganizeSchema = z.object({
  recordId: idSchema,
  version: versionSchema,
  mode: z.enum(["replace", "append"]).optional(),
});

// ===== Undo =====

export const undoDeleteSchema = z.object({
  entity: z.enum(["task", "record", "link", "resource"]),
  id: idSchema,
  deletionToken: z.string().min(1),
});

// ===== Site Metadata =====

export const siteMetadataSchema = z.object({
  url: urlSchema,
});

// ===== Asset Upload =====

export const assetUploadSchema = z.object({
  entityType: z.enum(["record", "resource"]),
  entityId: idSchema,
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024, "单文件最大 20MB"),
  originalName: z.string().max(255),
});