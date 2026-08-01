export type InfoSectionType = "systems" | "resources";
export type InfoSection = { id: string; name: string; type: InfoSectionType; order: number; createdAt: number };
export type SystemLink = { id: string; url: string; label: string };
export type SystemItem = { id: string; sectionId: string; name: string; icon: string; links: SystemLink[]; defaultLinkId: string; order: number; createdAt: number; updatedAt: number };
export type TextBlock = { id: string; type: "text"; text: string };
export type LinkBlock = { id: string; type: "link"; url: string; title: string; domain: string };
export type FileBlock = { id: string; type: "file"; name: string; mime: string; size: number; dataUrl: string };
export type InfoBlock = TextBlock | LinkBlock | FileBlock;
export type ResourceItem = { id: string; sectionId: string; title: string; blocks: InfoBlock[]; pinned: boolean; createdAt: number; updatedAt: number };
export type InfoStore = { version: 1; sections: InfoSection[]; systems: SystemItem[]; resources: ResourceItem[] };

export const INFO_KEY = "workbench.information.v1";
export const FILE_LIMIT = 20 * 1024 * 1024;
export const TOTAL_FILE_LIMIT = 200 * 1024 * 1024;

export function infoId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

export function emptyInfoStore(now = Date.now()): InfoStore {
  return { version: 1, sections: [
    { id: "systems", name: "常用系统", type: "systems", order: 0, createdAt: now },
    { id: "work", name: "工作资料", type: "resources", order: 1, createdAt: now + 1 },
    { id: "learning", name: "学习收藏", type: "resources", order: 2, createdAt: now + 2 },
  ], systems: [], resources: [] };
}

export function safeUrl(input: string) {
  try {
    const value = input.trim();
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
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

export function deriveTitle(blocks: InfoBlock[]) {
  const link = blocks.find((block): block is LinkBlock => block.type === "link" && Boolean(block.title.trim()));
  if (link) return link.title.trim().slice(0, 200);
  const file = blocks.find((block): block is FileBlock => block.type === "file" && Boolean(block.name.trim()));
  if (file) return file.name.trim().slice(0, 200);
  const text = blocks.find((block): block is TextBlock => block.type === "text" && Boolean(block.text.trim()));
  return text ? text.text.trim().split(/\r?\n/)[0].slice(0, 200) : "未命名资料";
}

export function visibleResources(store: InfoStore, sectionId: string, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return store.resources.filter((item) => {
    if (sectionId !== "all" && item.sectionId !== sectionId) return false;
    if (!needle) return true;
    const searchable = [item.title, ...item.blocks.flatMap((block) => block.type === "text" ? [block.text] : block.type === "link" ? [block.title, block.domain] : [block.name])].join("\n").toLocaleLowerCase();
    return searchable.includes(needle);
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export function parseInfoStore(raw: string): InfoStore | null {
  try {
    const value = JSON.parse(raw) as Partial<InfoStore>;
    if (!Array.isArray(value.sections) || !Array.isArray(value.systems) || !Array.isArray(value.resources)) return null;
    const ids = new Set<string>(), names = new Set<string>();
    const sections: InfoSection[] = value.sections.flatMap((item): InfoSection[] => {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string" || (item.type !== "systems" && item.type !== "resources")) return [];
      const name = item.name.trim().slice(0, 40);
      if (!name || ids.has(item.id) || names.has(name)) return [];
      ids.add(item.id); names.add(name);
      return [{ id: item.id, name, type: item.type, order: Number(item.order) || 0, createdAt: Number(item.createdAt) || Date.now() }];
    });
    if (!sections.length) return null;
    const systemSection = sections.find((item) => item.type === "systems")?.id;
    const resourceSection = sections.find((item) => item.type === "resources")?.id;
    const seen = new Set<string>();
    const systems: SystemItem[] = value.systems.flatMap((item): SystemItem[] => {
      if (!systemSection || !item || typeof item.id !== "string" || typeof item.name !== "string" || seen.has(item.id) || !Array.isArray(item.links)) return [];
      const links = item.links.flatMap((link): SystemLink[] => {
        if (!link || typeof link.id !== "string" || typeof link.url !== "string") return [];
        const url = safeUrl(link.url); return url ? [{ id: link.id, url, label: typeof link.label === "string" ? link.label.trim().slice(0, 40) : "" }] : [];
      }).slice(0, 20);
      if (!links.length) return [];
      seen.add(item.id);
      return [{ id: item.id, sectionId: sections.some((section) => section.id === item.sectionId && section.type === "systems") ? item.sectionId : systemSection, name: item.name.trim().slice(0, 200) || new URL(links[0].url).hostname, icon: typeof item.icon === "string" ? item.icon.slice(0, 2) : "站", links, defaultLinkId: links.some((link) => link.id === item.defaultLinkId) ? item.defaultLinkId : links[0].id, order: Number(item.order) || 0, createdAt: Number(item.createdAt) || Date.now(), updatedAt: Number(item.updatedAt) || Date.now() }];
    });
    const resources: ResourceItem[] = value.resources.flatMap((item): ResourceItem[] => {
      if (!resourceSection || !item || typeof item.id !== "string" || seen.has(item.id) || !Array.isArray(item.blocks)) return [];
      const blocks = item.blocks.flatMap((block): InfoBlock[] => {
        if (!block || typeof block.id !== "string") return [];
        if (block.type === "text" && typeof block.text === "string") return [{ id: block.id, type: "text", text: block.text.slice(0, 30000) }];
        if (block.type === "link" && typeof block.url === "string") { const meta = urlMeta(block.url); return meta ? [{ id: block.id, type: "link", url: meta.url, title: typeof block.title === "string" ? block.title.slice(0, 200) : meta.name, domain: meta.domain }] : []; }
        if (block.type === "file" && typeof block.name === "string" && typeof block.dataUrl === "string" && block.dataUrl.startsWith("data:") && Number(block.size) <= FILE_LIMIT) return [{ id: block.id, type: "file", name: block.name.slice(0, 200), mime: typeof block.mime === "string" ? block.mime.slice(0, 100) : "application/octet-stream", size: Math.max(0, Number(block.size) || 0), dataUrl: block.dataUrl }];
        return [];
      }).slice(0, 40);
      if (!blocks.length) return [];
      seen.add(item.id);
      return [{ id: item.id, sectionId: sections.some((section) => section.id === item.sectionId && section.type === "resources") ? item.sectionId : resourceSection, title: typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 200) : deriveTitle(blocks), blocks, pinned: Boolean(item.pinned), createdAt: Number(item.createdAt) || Date.now(), updatedAt: Number(item.updatedAt) || Date.now() }];
    });
    return { version: 1, sections: sections.sort((a, b) => a.order - b.order), systems, resources: totalFileBytes({ version: 1, sections, systems, resources }) <= TOTAL_FILE_LIMIT ? resources : resources.map((item) => ({ ...item, blocks: item.blocks.filter((block) => block.type !== "file") })) };
  } catch { return null; }
}
