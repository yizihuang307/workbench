export type RecordCategory = { id: string; name: string; createdAt: number };
export type RecordImage = { id: string; dataUrl: string; name: string };
export type RecordBlock = { type: "text"; text: string } | ({ type: "image" } & RecordImage);
export type RecordItem = { id: string; categoryId: string; body: string; blocks?: RecordBlock[]; images?: RecordImage[]; pinned: boolean; createdAt: number; updatedAt: number };
export type RecordStore = { version: 1; categories: RecordCategory[]; records: RecordItem[]; defaultCategoryId: string; aiConsent: boolean };

export const RECORDS_KEY = "workbench.records.v1";

export function recordId() {
  return crypto.randomUUID();
}

export function emptyRecordStore(now = Date.now()): RecordStore {
  const inbox = { id: "quick", name: "随手记", createdAt: now };
  const meeting = { id: "meeting", name: "会议纪要", createdAt: now + 1 };
  return { version: 1, categories: [inbox, meeting], records: [], defaultCategoryId: inbox.id, aiConsent: false };
}

export function parseRecordStore(raw: string): RecordStore | null {
  try {
    const value = JSON.parse(raw) as Partial<RecordStore>;
    if (!Array.isArray(value.categories) || !Array.isArray(value.records)) return null;
    const seenCategoryIds = new Set<string>();
    const seenCategoryNames = new Set<string>();
    const categories = value.categories.filter((item) => {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string") return false;
      const name = item.name.trim().slice(0, 40);
      if (!name || seenCategoryIds.has(item.id) || seenCategoryNames.has(name)) return false;
      seenCategoryIds.add(item.id);
      seenCategoryNames.add(name);
      return true;
    }).map((item) => ({ id: item.id, name: item.name.trim().slice(0, 40), createdAt: Number(item.createdAt) || Date.now() }));
    if (!categories.length) return null;
    const categoryIds = new Set(categories.map((item) => item.id));
    const fallback = categoryIds.has(value.defaultCategoryId ?? "") ? String(value.defaultCategoryId) : categories[0].id;
    const seenRecordIds = new Set<string>();
    const records = value.records.filter((item) => {
      if (!item || typeof item.id !== "string" || typeof item.body !== "string" || seenRecordIds.has(item.id)) return false;
      seenRecordIds.add(item.id);
      return true;
    }).map((item) => {
      const images = Array.isArray(item.images) ? item.images.filter(validImage).slice(0, 5).map(cleanImage) : [];
      const blocks = Array.isArray(item.blocks) ? item.blocks.flatMap((block): RecordBlock[] => {
        if (block?.type === "text" && typeof block.text === "string") return [{ type: "text", text: block.text.slice(0, 30000) }];
        if (block?.type === "image" && validImage(block)) return [{ type: "image", ...cleanImage(block) }];
        return [];
      }).slice(0, 100) : undefined;
      return {
      id: item.id,
      categoryId: categoryIds.has(item.categoryId) ? item.categoryId : fallback,
      body: item.body.slice(0, 30000),
      blocks,
      images,
      pinned: Boolean(item.pinned),
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
    }; });
    return { version: 1, categories, records, defaultCategoryId: fallback, aiConsent: Boolean(value.aiConsent) };
  } catch {
    return null;
  }
}

export function visibleRecords(store: RecordStore, categoryId: string, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return store.records.filter((item) => (categoryId === "all" || item.categoryId === categoryId) && (!needle || item.body.toLocaleLowerCase().includes(needle)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export function validCategoryName(categories: RecordCategory[], name: string, currentId?: string) {
  const clean = name.trim().slice(0, 40);
  if (!clean || categories.some((item) => item.id !== currentId && item.name === clean)) return null;
  return clean;
}

export function moveAndDeleteCategory(store: RecordStore, fromId: string, toId: string): RecordStore {
  if (fromId === toId || !store.categories.some((item) => item.id === fromId) || !store.categories.some((item) => item.id === toId)) return store;
  return {
    ...store,
    categories: store.categories.filter((item) => item.id !== fromId),
    records: store.records.map((item) => item.categoryId === fromId ? { ...item, categoryId: toId, updatedAt: Date.now() } : item),
    defaultCategoryId: store.defaultCategoryId === fromId ? toId : store.defaultCategoryId,
  };
}

export function applyAiResult(store: RecordStore, recordId: string, result: string, mode: "replace" | "append", now = Date.now()): RecordStore {
  return { ...store, records: store.records.map((record) => {
    if (record.id !== recordId) return record;
    const currentBlocks = recordBlocks(record);
    const nextBlocks: RecordBlock[] = mode === "replace"
      ? [{ type: "text", text: result }, ...currentBlocks.filter((block) => block.type === "image")]
      : [...currentBlocks, { type: "text", text: `\n\n—— AI 整理结果 ——\n${result}` }];
    return { ...record, body: blocksText(nextBlocks).slice(0, 30000), blocks: nextBlocks, images: [], updatedAt: now };
  }) };
}

export function recordBlocks(record: RecordItem): RecordBlock[] {
  if (record.blocks?.length) return record.blocks;
  return [{ type: "text", text: record.body }, ...(record.images || []).map((image): RecordBlock => ({ type: "image", ...image }))];
}

export function blocksText(blocks: RecordBlock[]) {
  return blocks.filter((block): block is Extract<RecordBlock, { type: "text" }> => block.type === "text").map((block) => block.text).join("");
}

function validImage(image: unknown): image is RecordImage {
  const value = image as Partial<RecordImage> | null;
  return Boolean(value && typeof value.id === "string" && typeof value.dataUrl === "string" && value.dataUrl.startsWith("data:image/"));
}

function cleanImage(image: RecordImage): RecordImage {
  return { id: image.id, dataUrl: image.dataUrl, name: typeof image.name === "string" ? image.name.slice(0, 120) : "粘贴的图片" };
}
