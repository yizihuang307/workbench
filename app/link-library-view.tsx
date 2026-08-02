"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_GROUP, infoId, safeUrl, UNGROUPED, updateSystemLink, urlMeta, visibleLinks, type InfoStore, type LinkGroup, type LinkSortMode, type SystemItem } from "./information";

type Props = { store: InfoStore; setStore: React.Dispatch<React.SetStateAction<InfoStore>>; storageError: boolean; onNotice: (message: string) => void };

const LINKS_VIEW_KEY = "workbench.links.view.v1";
type ViewMode = "grid" | "list";

function loadInitial() {
  let view: ViewMode = "grid", sort: LinkSortMode = "manual", group = ALL_GROUP;
  try {
    const raw = localStorage.getItem(LINKS_VIEW_KEY);
    if (raw) { const value = JSON.parse(raw); if (value.view === "list") view = "list"; if (value.sort === "recent-open" || value.sort === "name") sort = value.sort; if (typeof value.group === "string") group = value.group; }
  } catch { /* 忽略损坏的偏好 */ }
  return { view, sort, group };
}

export default function LinkLibraryView({ store, setStore, storageError, onNotice }: Props) {
  const initial = useRef(loadInitial());
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(initial.current.view);
  const [sortMode, setSortMode] = useState<LinkSortMode>(initial.current.sort);
  const [activeGroup, setActiveGroup] = useState<string>(initial.current.group);
  const [newSystem, setNewSystem] = useState(false);
  const [systemMenuId, setSystemMenuId] = useState<string | null>(null);
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [draftGroup, setDraftGroup] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const groups = useMemo(() => [...store.linkGroups].sort((a, b) => a.order - b.order), [store.linkGroups]);
  const results = useMemo(() => visibleLinks(store, activeGroup, query, sortMode), [store, activeGroup, query, sortMode]);
  const editingSystem = store.systems.find((item) => item.id === editingSystemId) ?? null;

  // 持久化视图偏好
  useEffect(() => { try { localStorage.setItem(LINKS_VIEW_KEY, JSON.stringify({ view: viewMode, sort: sortMode, group: activeGroup })); } catch { /* 忽略 */ } }, [viewMode, sortMode, activeGroup]);

  // 关闭操作菜单
  useEffect(() => {
    function outside(event: PointerEvent) { if (!(event.target instanceof Element) || !event.target.closest(".system-row")) setSystemMenuId(null); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") { setSystemMenuId(null); setNewSystem(false); setGroupManageOpen(false); } }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  });

  function openLink(item: SystemItem) {
    const target = item.links.find((link) => link.id === item.defaultLinkId) || item.links[0];
    window.open(target.url, "_blank", "noopener,noreferrer");
    // 记录最近打开时间
    setStore((current) => ({ ...current, systems: current.systems.map((value) => value.id === item.id ? { ...value, lastOpenedAt: Date.now() } : value) }));
  }

  function addGroup() {
    const name = draftGroup.trim().slice(0, 40);
    if (!name || store.linkGroups.some((group) => group.name === name)) { onNotice(name ? "分组名称不能重复" : "分组名称不能为空"); return; }
    setStore((current) => ({ ...current, linkGroups: [...current.linkGroups, { id: infoId(), name, order: current.linkGroups.length, createdAt: Date.now() }] }));
    setDraftGroup("");
  }

  function removeGroup(group: LinkGroup) {
    if (!window.confirm(`删除分组“${group.name}”？组内链接将移到“未分组”。`)) return;
    setStore((current) => ({ ...current, linkGroups: current.linkGroups.filter((item) => item.id !== group.id).map((item, index) => ({ ...item, order: index })), systems: current.systems.map((item) => item.groupId === group.id ? { ...item, groupId: UNGROUPED } : item) }));
    if (activeGroup === group.id) setActiveGroup(UNGROUPED);
    onNotice("分组已删除");
  }

  // 拖拽排序：列内重排 + 跨分组移动
  function onDropToItem(target: SystemItem) {
    if (!draggedId || draggedId === target.id) { setDraggedId(null); return; }
    setStore((current) => {
      const list = sortMode === "manual" ? [...current.systems].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt) : [...current.systems];
      const fromIndex = list.findIndex((item) => item.id === draggedId);
      const targetIndex = list.findIndex((item) => item.id === target.id);
      if (fromIndex < 0 || targetIndex < 0) return current;
      const [picked] = list.splice(fromIndex, 1);
      list.splice(targetIndex, 0, picked);
      // 若目标在不同分组，跟随目标分组
      const moved = picked.groupId !== target.groupId ? { ...picked, groupId: target.groupId } : picked;
      const reordered = list.map((item, index) => item.id === moved.id ? { ...moved, order: index } : { ...item, order: index });
      return { ...current, systems: reordered };
    });
    setDraggedId(null);
  }

  // 拖到分组标签上 = 移动到该分组
  function onDropToGroup(groupId: string) {
    if (!draggedId) return;
    setStore((current) => ({ ...current, systems: current.systems.map((item) => item.id === draggedId ? { ...item, groupId } : item) }));
    setDraggedId(null);
  }

  return <div className="link-library">
    <header className="info-toolbar">
      <div className="info-index" aria-label="分组索引" onDragOver={(event) => event.preventDefault()} onDrop={() => onDropToGroup(ALL_GROUP)}>
        <button className={activeGroup === ALL_GROUP ? "active" : ""} onClick={() => setActiveGroup(ALL_GROUP)}>全部</button>
        <button className={activeGroup === UNGROUPED ? "active" : ""} onDragOver={(event) => event.preventDefault()} onDrop={() => onDropToGroup(UNGROUPED)} onClick={() => setActiveGroup(UNGROUPED)}>未分组</button>
        {groups.map((group) => <button key={group.id} className={activeGroup === group.id ? "active" : ""} onDragOver={(event) => event.preventDefault()} onDrop={() => onDropToGroup(group.id)} onClick={() => setActiveGroup(group.id)}>{group.name}</button>)}
      </div>
      <button className="info-manage" onClick={() => setGroupManageOpen(true)}>管理分组</button>
    </header>
    <div className="info-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索链接名称或网址" aria-label="搜索链接" />
      <div className="link-sort">
        {(["manual", "recent-open", "name"] as LinkSortMode[]).map((mode) => <button key={mode} className={sortMode === mode ? "active" : ""} onClick={() => setSortMode(mode)}>{mode === "manual" ? "手动" : mode === "recent-open" ? "最近打开" : "名称"}</button>)}
        <i />
        <button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")} aria-label="网格视图">▦</button>
        <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} aria-label="列表视图">☰</button>
      </div>
      <small>{query ? `共 ${results.length} 项` : ""}</small>
    </div>

    <section className={`system-section ${systemMenuId ? "menu-open" : ""}`}>
      <header><div><h2>常用链接</h2><span>共 {query ? results.length : store.systems.length} 项</span></div><button onClick={() => setNewSystem(true)} aria-label="新增常用链接">＋</button></header>
      <div className={`system-grid ${viewMode}`}>
        {results.map((item) => {
          const target = item.links.find((link) => link.id === item.defaultLinkId) || item.links[0];
          return <article className="system-row" key={item.id} draggable onDragStart={() => setDraggedId(item.id)} onDragEnd={() => setDraggedId(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); onDropToItem(item); }}>
            <button className="system-open" onClick={() => openLink(item)} title={item.name}>
              <b><i aria-hidden>{item.name.slice(0, 1).toUpperCase()}</i>{/^https?:\/\//.test(item.icon) && <img src={item.icon} alt="" onError={(event) => { const fallback = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(target.url).hostname)}&sz=64`; if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback; else event.currentTarget.style.display = "none"; }} />}</b>
              <span><HighlightText text={item.name} query={query} /></span>
              <small><HighlightText text={new URL(target.url).hostname} query={query} /></small>
            </button>
            <button className="system-remove" aria-label={`操作${item.name}`} aria-expanded={systemMenuId === item.id} onClick={() => setSystemMenuId((current) => current === item.id ? null : item.id)}>···</button>
            {systemMenuId === item.id && <div className="system-menu" role="menu">
              <button onClick={() => { setSystemMenuId(null); setEditingSystemId(item.id); }}>编辑名称和网址</button>
              <button className="danger" onClick={() => { setSystemMenuId(null); if (window.confirm(`确定删除“${item.name}”吗？`)) setStore((current) => ({ ...current, systems: current.systems.filter((system) => system.id !== item.id) })); }}>删除</button>
            </div>}
          </article>;
        })}
        {!results.length && <div className="info-empty"><b>↗</b><span>{query ? "没有匹配的链接" : "粘贴网址，名称和图标会自动生成"}</span>{!query && <button onClick={() => setNewSystem(true)}>添加第一个链接</button>}</div>}
      </div>
    </section>

    {newSystem && <SystemDialog onClose={() => setNewSystem(false)} onSave={async (name, input, remote) => {
      const meta = urlMeta(input); if (!meta) { onNotice("请输入有效的 http/https 网址"); return; }
      const duplicate = store.systems.some((system) => system.links.some((link) => link.url === meta.url));
      if (duplicate && !window.confirm("这个网址可能已经保存，仍要继续吗？")) return;
      const now = Date.now(), linkId = infoId();
      setStore((current) => ({ ...current, systems: [...current.systems, { id: infoId(), sectionId: current.sections[0]?.id || "", groupId: activeGroup === ALL_GROUP ? UNGROUPED : activeGroup, name: name.trim() || remote?.title || meta.name, icon: remote?.icon || meta.icon, links: [{ id: linkId, url: remote?.finalUrl || meta.url, label: "主页" }], defaultLinkId: linkId, order: current.systems.length, lastOpenedAt: 0, createdAt: now, updatedAt: now }] }));
      setNewSystem(false); onNotice("链接已添加");
    }} />}
    {editingSystem && <SystemEditDialog item={editingSystem} onClose={() => setEditingSystemId(null)} onSave={(name, url) => {
      const normalized = safeUrl(url); if (!normalized) { onNotice("请输入有效的 http/https 网址"); return false; }
      if (store.systems.some((item) => item.id !== editingSystem.id && item.links.some((link) => link.url === normalized))) { onNotice("这个网址已经存在"); return false; }
      setStore((current) => { const updated = updateSystemLink(current, editingSystem.id, name, normalized); if (!updated) return current; return { ...updated, systems: updated.systems.map((item) => item.id === editingSystem.id ? { ...item, icon: new URL(normalized).origin + "/favicon.ico" } : item) }; });
      setEditingSystemId(null); onNotice("链接已更新"); return true;
    }} />}
    {groupManageOpen && <div className="info-dialog-backdrop"><section className="info-dialog" role="dialog" aria-modal="true" aria-label="管理分组">
      <button className="info-dialog-close" onClick={() => setGroupManageOpen(false)} aria-label="关闭">×</button>
      <h2>管理链接分组</h2>
      <div className="section-add"><input autoFocus value={draftGroup} maxLength={40} onChange={(event) => setDraftGroup(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addGroup()} placeholder="新分组名称" /><button onClick={addGroup}>新增分组</button></div>
      <div className="section-manage-row"><span>未分组</span><span>{store.systems.filter((item) => item.groupId === UNGROUPED).length} 项</span></div>
      {groups.map((group) => <div className="section-manage-row" key={group.id}><input value={group.name} maxLength={40} onChange={(event) => setStore((current) => ({ ...current, linkGroups: current.linkGroups.map((item) => item.id === group.id ? { ...item, name: event.target.value } : item) }))} /><span>{store.systems.filter((item) => item.groupId === group.id).length} 项</span><button className="section-delete" onClick={() => removeGroup(group)}>删除分组</button></div>)}
    </section></div>}
    {storageError && <p className="storage-warn">本地存储异常，改动可能无法保存</p>}
  </div>;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const needle = query.trim(); if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((part, index) => part.toLocaleLowerCase() === needle.toLocaleLowerCase() ? <mark key={index}>{part}</mark> : part)}</>;
}

function SystemDialog({ onSave, onClose }: { onSave: (name: string, url: string, meta: Awaited<ReturnType<typeof fetchSiteMetadata>>) => Promise<void>; onClose: () => void }) {
  const [url, setUrl] = useState(""); const [name, setName] = useState(""); const [nameEdited, setNameEdited] = useState(false); const [loading, setLoading] = useState(false); const [meta, setMeta] = useState<Awaited<ReturnType<typeof fetchSiteMetadata>>>(null);
  const recognition = useRef<Promise<Awaited<ReturnType<typeof fetchSiteMetadata>>> | null>(null);
  async function recognize() { const normalized = safeUrl(url); if (!normalized) return null; if (recognition.current) return recognition.current; setLoading(true); recognition.current = fetchSiteMetadata(normalized); try { const next = await recognition.current; setMeta(next); if (!nameEdited) setName(next?.title || urlMeta(normalized)?.name || ""); return next; } finally { recognition.current = null; setLoading(false); } }
  async function submit() { if (!safeUrl(url)) return; const next = meta || await recognize(); const finalName = (name || next?.title || urlMeta(url)?.name || "").trim(); if (!finalName) return; await onSave(finalName, url, next); }
  return <div className="info-dialog-backdrop"><section className="info-dialog small" role="dialog" aria-modal="true" aria-label="新增常用链接">
    <button className="info-dialog-close" onClick={onClose} aria-label="关闭">×</button>
    <h2>新增常用链接</h2>
    <div className="dialog-fields">
      <label className="dialog-field"><span>网址</span><input autoFocus value={url} onChange={(event) => { setUrl(event.target.value); setMeta(null); }} onBlur={() => void recognize()} placeholder="https://example.com" /></label>
      <label className="dialog-field"><span>名称</span><input value={name} maxLength={200} onChange={(event) => { setName(event.target.value); setNameEdited(true); }} placeholder={loading ? "正在识别网站名称…" : "自动填充，可修改"} /></label>
    </div>
    <footer><button onClick={onClose}>取消</button><button className="primary" disabled={!safeUrl(url)} onClick={() => void submit()}>{loading ? "识别中…" : "添加"}</button></footer>
  </section></div>;
}

function SystemEditDialog({ item, onSave, onClose }: { item: SystemItem; onSave: (name: string, url: string) => boolean; onClose: () => void }) {
  const target = item.links.find((link) => link.id === item.defaultLinkId) || item.links[0];
  const [name, setName] = useState(item.name); const [url, setUrl] = useState(target.url);
  return <div className="info-dialog-backdrop"><section className="info-dialog small" role="dialog" aria-modal="true" aria-label="编辑常用链接">
    <button className="info-dialog-close" onClick={onClose} aria-label="关闭">×</button>
    <h2>编辑常用链接</h2>
    <div className="dialog-fields">
      <label className="dialog-field"><span>名称</span><input autoFocus value={name} maxLength={200} onChange={(event) => setName(event.target.value)} /></label>
      <label className="dialog-field"><span>网址</span><input value={url} onChange={(event) => setUrl(event.target.value)} /></label>
    </div>
    <footer><button onClick={onClose}>取消</button><button className="primary" disabled={!name.trim() || !safeUrl(url)} onClick={() => onSave(name, url)}>保存</button></footer>
  </section></div>;
}

async function fetchSiteMetadata(url: string) {
  try { const response = await fetch("/api/site-metadata", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }); if (!response.ok) return null; return await response.json() as { title: string; icon: string; finalUrl: string }; } catch { return null; }
}
