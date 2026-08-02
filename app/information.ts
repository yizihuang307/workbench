export type InfoSectionType = "resources";
export type InfoSection = { id: string; name: string; type: InfoSectionType; order: number; createdAt: number };
export type SystemLink = { id: string; url: string; label: string };
// v2：链接按分组管理，记录最近打开时间用于“最近打开”排序。
export type LinkGroup = { id: string; name: string; order: number; createdAt: number };
export type SystemItem = { id: string; sectionId: string; groupId: string; name: string; icon: string; links: SystemLink[]; defaultLinkId: string; order: number; lastOpenedAt: number; createdAt: number; updatedAt: number };
export type TextBlock = { id: string; type: "text"; text: string };
export type LinkBlock = { id: string; type: "link"; url: string; title: string; domain: string };
export type FileBlock = { id: string; type: "file"; name: string; mime: string; size: number; dataUrl: string };
export type InfoBlock = TextBlock | LinkBlock | FileBlock;
// v2：资源增加 order 字段支持看板内手动排序；保留 documentHtml 以兼容统一文档编辑器。
export type ResourceItem = { id: string; sectionId: string; title: string; titleAuto?: boolean; documentHtml?: string; blocks: InfoBlock[]; pinned: boolean; order: number; createdAt: number; updatedAt: number };
export type InfoStore = { version: 2; linkGroups: LinkGroup[]; sections: InfoSection[]; systems: SystemItem[]; resources: ResourceItem[] };

// 链接分组：空字符串代表“未分组”。
export const UNGROUPED = "";
export const ALL_GROUP = "all";
export type LinkSortMode = "manual" | "recent-open" | "name";
export type ResourceSortMode = "manual" | "name" | "updated";

export const INFO_KEY = "workbench.information.v1";
export const DOCUMENT_LIMIT = 30000;
export const FILE_LIMIT = 20 * 1024 * 1024;
export const TOTAL_FILE_LIMIT = 200 * 1024 * 1024;

export function infoId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

export function emptyInfoStore(now = Date.now()): InfoStore {
  return { version: 2, linkGroups: [], sections: [
    { id: "work", name: "工作资料", type: "resources", order: 0, createdAt: now },
    { id: "learning", name: "学习收藏", type: "resources", order: 1, createdAt: now + 1 },
  ], systems: [], resources: [] };
}

export function safeUrl(input: string) {
  try {
    const value = input.trim();
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function escapeAttribute(value: string) { return escapeHtml(value).replace(/'/g, "&#39;"); }

export function htmlText(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(p|div|h1|h2|h3|li|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export function sanitizeDocumentHtml(input: string) {
  const withoutDanger = input.replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<!--([\s\S]*?)-->/g, "");
  const allowed = new Set(["p","div","br","h1","h2","h3","strong","b","em","i","u","s","ul","ol","li","blockquote","table","tbody","thead","tr","td","th","figure","figcaption","span"]);
  return withoutDanger.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (whole, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (tag === "a") {
      if (whole.startsWith("</")) return "</a>";
      const href = rawAttrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
      const url = safeUrl(href);
      return url ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">` : "<span>";
    }
    if (tag === "img") {
      const fileId = rawAttrs.match(/\bdata-file-id\s*=\s*["']([^"']+)["']/i)?.[1];
      const width = Math.max(160, Math.min(900, Number(rawAttrs.match(/\bdata-width\s*=\s*["']([^"']+)["']/i)?.[1]) || 520));
      return fileId ? `<img data-file-id="${escapeAttribute(fileId)}" data-width="${width}" alt="">` : "";
    }
    if (!allowed.has(tag)) return "";
    if (whole.startsWith("</")) return `</${tag}>`;
    if (tag === "br") return "<br>";
    const fileId = rawAttrs.match(/\bdata-file-id\s*=\s*["']([^"']+)["']/i)?.[1];
    const checked = rawAttrs.match(/\bdata-checked\s*=\s*["'](true|false)["']/i)?.[1]?.toLowerCase();
    const taskType = rawAttrs.match(/\bdata-type\s*=\s*["'](taskList|taskItem)["']/i)?.[1];
    const attachment = /\bdata-attachment\s*=\s*["']true["']/i.test(rawAttrs);
    const attrs = fileId ? ` data-file-id="${escapeAttribute(fileId)}"${attachment ? ' data-attachment="true"' : ""} contenteditable="false"` : `${taskType ? ` data-type="${taskType}"` : ""}${checked ? ` data-checked="${checked}"` : ""}`;
    return `<${tag}${attrs}>`;
  }).slice(0, 250000);
}

export function legacyDocumentHtml(blocks: InfoBlock[]) {
  return sanitizeDocumentHtml(blocks.map((block) => {
    if (block.type === "text") return `<p>${escapeHtml(block.text).replace(/\r?\n/g, "<br>")}</p>`;
    if (block.type === "link") return `<p><a href="${escapeAttribute(block.url)}">${escapeHtml(block.title || block.domain)}</a></p>`;
    return `<figure data-file-id="${escapeAttribute(block.id)}" contenteditable="false"><span>${escapeHtml(block.name)}</span><figcaption>${escapeHtml(block.name)}</figcaption></figure>`;
  }).join(""));
}

export function tableHtml(rows = 2, columns = 2) {
  const safeRows = Math.min(10, Math.max(1, Math.floor(rows) || 1));
  const safeColumns = Math.min(10, Math.max(1, Math.floor(columns) || 1));
  return `<table><tbody>${Array.from({ length: safeRows }, () => `<tr>${Array.from({ length: safeColumns }, () => "<td><br></td>").join("")}</tr>`).join("")}</tbody></table><p><br></p>`;
}

export function linkifyPlainText(text: string) {
  const pattern = /(?:https?:\/\/|www\.)[^\s<>，。！？；：]+/gi;
  let last = 0, output = "";
  for (const match of text.matchAll(pattern)) {
    const index = match.index || 0; let visible = match[0];
    const trailing = visible.match(/[),.!?，。！？；：]+$/)?.[0] || "";
    visible = visible.slice(0, visible.length - trailing.length);
    const url = safeUrl(visible);
    output += escapeHtml(text.slice(last, index));
    output += url ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(visible)}</a>${escapeHtml(trailing)}` : escapeHtml(match[0]);
    last = index + match[0].length;
  }
  return output + escapeHtml(text.slice(last));
}

export function urlMeta(input: string) {
  const normalized = safeUrl(input);
  if (!normalized) return null;
  const url = new URL(normalized);
  const host = url.hostname.replace(/^www\./, "");
  const name = host.split(".")[0] || host;
  return { url: normalized, domain: host, name: name.charAt(0).toLocaleUpperCase() + name.slice(1), icon: name.charAt(0).toLocaleUpperCase() || "站" };
}

export function totalFileBytes(store: InfoStore) {
  return store.resources.flatMap((item) => item.blocks).reduce((sum, block) => sum + (block.type === "file" ? block.size : 0), 0);
}

export function dataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(","); if (comma < 0) return Number.POSITIVE_INFINITY;
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(dataUrl.slice(0, comma))) return Math.max(0, Math.floor(payload.replace(/\s/g, "").length * 3 / 4) - (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0));
  try { return new TextEncoder().encode(decodeURIComponent(payload)).length; } catch { return Number.POSITIVE_INFINITY; }
}

export function deriveTitle(blocks: InfoBlock[]) {
  const link = blocks.find((block): block is LinkBlock => block.type === "link" && Boolean(block.title.trim()));
  if (link) return link.title.trim().slice(0, 200);
  const file = blocks.find((block): block is FileBlock => block.type === "file" && Boolean(block.name.trim()));
  if (file) return file.name.trim().slice(0, 200);
  const text = blocks.find((block): block is TextBlock => block.type === "text" && Boolean(block.text.trim()));
  return text ? text.text.trim().split(/\r?\n/)[0].slice(0, 200) : "未命名资料";
}

export function deriveDocumentTitle(documentHtml: string, blocks: InfoBlock[]) {
  const first = htmlText(documentHtml).split(/\r?\n/).find((line) => line.trim())?.trim();
  return first ? first.slice(0, 200) : deriveTitle(blocks);
}

export function sortResources(items: ResourceItem[], mode: ResourceSortMode): ResourceItem[] {
  const list = [...items];
  if (mode === "name") return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title, "zh"));
  if (mode === "updated") return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order || a.createdAt - b.createdAt);
}

export function visibleResources(store: InfoStore, sectionId: string, query: string, mode: ResourceSortMode = "manual") {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = store.resources.filter((item) => {
    if (sectionId !== "all" && item.sectionId !== sectionId) return false;
    if (!needle) return true;
    const searchable = [item.title, item.documentHtml ? htmlText(item.documentHtml) : "", ...item.blocks.flatMap((block) => block.type === "text" ? [block.text] : block.type === "link" ? [block.title, block.domain] : [block.name])].join("\n").toLocaleLowerCase();
    return searchable.includes(needle);
  });
  return sortResources(filtered, mode);
}

export function sortLinks(links: SystemItem[], mode: LinkSortMode): SystemItem[] {
  const list = [...links];
  if (mode === "recent-open") return list.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || a.createdAt - b.createdAt);
  if (mode === "name") return list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  return list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function visibleLinks(store: InfoStore, groupId: string, query: string, mode: LinkSortMode = "manual") {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = [...store.systems].filter((item) => {
    if (groupId !== ALL_GROUP && item.groupId !== groupId) return false;
    if (!needle) return true;
    return [item.name, ...item.links.flatMap((link) => [link.label, link.url])].join("\n").toLocaleLowerCase().includes(needle);
  });
  return sortLinks(filtered, mode);
}

export function updateSystemLink(store: InfoStore, id: string, nameInput: string, urlInput: string, now = Date.now()) {
  const name = nameInput.trim().slice(0, 200), url = safeUrl(urlInput);
  if (!name || !url) return null;
  let found = false;
  const systems = store.systems.map((item) => {
    if (item.id !== id) return item;
    found = true;
    const link = item.links.find((value) => value.id === item.defaultLinkId) || item.links[0];
    return { ...item, name, links: item.links.map((value) => value.id === link.id ? { ...value, url } : value), updatedAt: now };
  });
  return found ? { ...store, systems } : null;
}

export function deleteResourceSection(store: InfoStore, sectionId: string, targetSectionId: string) {
  if (store.sections.length <= 1 || sectionId === targetSectionId || !store.sections.some((section) => section.id === sectionId) || !store.sections.some((section) => section.id === targetSectionId)) return null;
  return { ...store, sections: store.sections.filter((section) => section.id !== sectionId).map((section, index) => ({ ...section, order: index })), resources: store.resources.map((item) => item.sectionId === sectionId ? { ...item, sectionId: targetSectionId } : item) };
}

export function parseInfoStore(raw: string): InfoStore | null {
  try {
    const value = JSON.parse(raw) as Partial<InfoStore> & { version?: number; sections?: unknown[] };
    if (!Array.isArray(value.sections) || !Array.isArray(value.systems) || !Array.isArray(value.resources)) return null;
    const isV2 = value.version === 2;
    const ids = new Set<string>(), names = new Set<string>();
    // v2 仅保留 resources 类型分区；v1 的 systems 分区被丢弃。
    const sections: InfoSection[] = (value.sections as InfoSection[]).flatMap((item): InfoSection[] => {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string" || item.type !== "resources") return [];
      const name = item.name.trim().slice(0, 40);
      if (!name || ids.has(item.id) || names.has(name)) return [];
      ids.add(item.id); names.add(name);
      return [{ id: item.id, name, type: "resources", order: Number(item.order) || 0, createdAt: Number(item.createdAt) || Date.now() }];
    });
    if (!sections.length) return null;
    const firstSectionId = sections[0].id;
    const seen = new Set<string>();
    // v2 链接分组
    const linkGroups: LinkGroup[] = isV2 && Array.isArray((value as { linkGroups?: unknown[] }).linkGroups)
      ? (value as { linkGroups: LinkGroup[] }).linkGroups.flatMap((item): LinkGroup[] => {
          if (!item || typeof item.id !== "string" || typeof item.name !== "string" || ids.has(item.id)) return [];
          const name = item.name.trim().slice(0, 40); if (!name) return [];
          ids.add(item.id);
          return [{ id: item.id, name, order: Number(item.order) || 0, createdAt: Number(item.createdAt) || Date.now() }];
        }).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      : [];
    const systems: SystemItem[] = value.systems.flatMap((item): SystemItem[] => {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string" || seen.has(item.id) || !Array.isArray(item.links)) return [];
      const links = item.links.flatMap((link): SystemLink[] => {
        if (!link || typeof link.id !== "string" || typeof link.url !== "string") return [];
        const url = safeUrl(link.url); return url ? [{ id: link.id, url, label: typeof link.label === "string" ? link.label.trim().slice(0, 40) : "" }] : [];
      }).slice(0, 20);
      if (!links.length) return [];
      seen.add(item.id);
      const rawIcon = typeof item.icon === "string" ? item.icon.trim() : "";
      const fallbackIcon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(links[0].url).hostname)}&sz=64`;
      const icon = /^https?:\/\//i.test(rawIcon) ? safeUrl(rawIcon)?.slice(0, 2048) || fallbackIcon : fallbackIcon;
      const groupId = isV2 && typeof (item as SystemItem).groupId === "string" && linkGroups.some((group) => group.id === (item as SystemItem).groupId) ? (item as SystemItem).groupId : UNGROUPED;
      return [{ id: item.id, sectionId: firstSectionId, groupId, name: item.name.trim().slice(0, 200) || new URL(links[0].url).hostname, icon, links, defaultLinkId: links.some((link) => link.id === item.defaultLinkId) ? item.defaultLinkId : links[0].id, order: Number(item.order) || 0, lastOpenedAt: Number((item as SystemItem).lastOpenedAt) || 0, createdAt: Number(item.createdAt) || Date.now(), updatedAt: Number(item.updatedAt) || Date.now() }];
    });
    const resources: ResourceItem[] = value.resources.flatMap((item): ResourceItem[] => {
      if (!item || typeof item.id !== "string" || seen.has(item.id) || !Array.isArray(item.blocks)) return [];
      let acceptedFiles = 0;
      const blocks = item.blocks.flatMap((block): InfoBlock[] => {
        if (!block || typeof block.id !== "string") return [];
        if (block.type === "text" && typeof block.text === "string") return [{ id: block.id, type: "text", text: block.text.slice(0, 30000) }];
        if (block.type === "link" && typeof block.url === "string") { const meta = urlMeta(block.url); return meta ? [{ id: block.id, type: "link", url: meta.url, title: typeof block.title === "string" ? block.title.slice(0, 200) : meta.name, domain: meta.domain }] : []; }
        if (block.type === "file" && acceptedFiles < 20 && typeof block.name === "string" && typeof block.dataUrl === "string" && block.dataUrl.startsWith("data:") && Number(block.size) <= FILE_LIMIT && dataUrlBytes(block.dataUrl) <= FILE_LIMIT) { acceptedFiles += 1; return [{ id: block.id, type: "file", name: block.name.slice(0, 200), mime: typeof block.mime === "string" ? block.mime.slice(0, 100) : "application/octet-stream", size: Math.max(dataUrlBytes(block.dataUrl), Math.max(0, Number(block.size) || 0)), dataUrl: block.dataUrl }]; }
        return [];
      }).slice(0, 40);
      let documentHtml = typeof item.documentHtml === "string" ? sanitizeDocumentHtml(item.documentHtml) : undefined;
      if (documentHtml && htmlText(documentHtml).length > DOCUMENT_LIMIT) documentHtml = `<p>${escapeHtml(htmlText(documentHtml).slice(0, DOCUMENT_LIMIT)).replace(/\r?\n/g, "<br>")}</p>`;
      if (!blocks.length && !htmlText(documentHtml || "")) return [];
      seen.add(item.id);
      const derived = documentHtml ? deriveDocumentTitle(documentHtml, blocks) : deriveTitle(blocks);
      const rawTitle = typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 200) : derived;
      const repairTruncatedAutoTitle = rawTitle.length === 1 && derived.length > 1 && derived.startsWith(rawTitle);
      return [{ id: item.id, sectionId: sections.some((section) => section.id === item.sectionId) ? item.sectionId : firstSectionId, title: repairTruncatedAutoTitle ? derived : rawTitle, titleAuto: repairTruncatedAutoTitle || Boolean(item.titleAuto), documentHtml, blocks, pinned: Boolean(item.pinned), order: Number(item.order) || 0, createdAt: Number(item.createdAt) || Date.now(), updatedAt: Number(item.updatedAt) || Date.now() }];
    });
    const store: InfoStore = { version: 2, linkGroups, sections: sections.sort((a, b) => a.order - b.order), systems, resources };
    if (totalFileBytes(store) > TOTAL_FILE_LIMIT) store.resources = store.resources.map((item) => ({ ...item, blocks: item.blocks.filter((block) => block.type !== "file") }));
    return store;
  } catch { return null; }
}
