// ===== 基础类型 =====

export type TaskArea = "today" | "week" | "later";

export type Task = {
  id: string;
  userId: string;
  title: string;
  area: TaskArea;
  isCompleted: boolean;
  isP0: boolean;
  isLegacy: boolean;
  sortKey: string; // numeric(20,10) as string
  completedAt: string | null; // timestamptz
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type RecordCategory = {
  id: string;
  userId: string;
  name: string;
  sortKey: string;
  isDefaultSeed: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type RecordItem = {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  titleMode: "auto" | "manual";
  documentJson: string; // JSON serialized TipTap document
  plainText: string;
  isPinned: boolean;
  sortKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type RecordAsset = {
  id: string;
  userId: string;
  recordId: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  sortKey: string;
  createdAt: string;
};

export type LinkGroup = {
  id: string;
  userId: string;
  name: string;
  sortKey: string;
  isSystem: boolean; // "未分组" is system group
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Link = {
  id: string;
  userId: string;
  groupId: string;
  url: string;
  normalizedUrl: string;
  name: string;
  faviconUrl: string | null;
  sortKey: string;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ResourceCategory = {
  id: string;
  userId: string;
  name: string;
  sortKey: string;
  isSeed: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ResourceItem = {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  titleMode: "auto" | "manual";
  documentJson: string;
  plainText: string;
  isPinned: boolean;
  sortKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ResourceAsset = {
  id: string;
  userId: string;
  resourceId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sortKey: string;
  createdAt: string;
};

export type AiRun = {
  id: string;
  userId: string;
  recordId: string;
  status: "pending" | "running" | "completed" | "failed";
  inputHash: string;
  resultText: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  requestId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type UserProfile = {
  id: string; // = auth.users.id
  displayName: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type UserPreferences = {
  userId: string;
  quickRecordCategoryId: string | null;
  hideCompleted: boolean;
  schemaVersion: number;
  updatedAt: string;
};

// ===== API 类型 =====

export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
    field?: string;
  };
};

export type UndoDeleteRequest = {
  entity: "task" | "record" | "link" | "resource";
  id: string;
  deletionToken: string;
};

export type ReorderRequest = {
  entity: "task" | "link" | "resource";
  id: string;
  targetGroupId?: string;
  beforeId?: string;
  version: number;
};

export type ImportLocalRequest = {
  schemaVersion: number;
  payload: Record<string, unknown>;
};