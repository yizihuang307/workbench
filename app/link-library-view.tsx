"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_GROUP, deleteLinkGroup, infoId, moveLink, reorderLinkGroups, safeUrl, siteIcon, UNGROUPED, updateSystemLink, urlMeta, visibleLinks, type InfoStore, type LinkGroup, type SystemItem } from "./information";
import InformationItemMenu from "./information-item-menu";

type Props = { store: InfoStore; setStore: React.Dispatch<React.SetStateAction<InfoStore>>; storageError: boolean; onNotice: (message: string) => void };

export default function LinkLibraryView({ store, setStore, storageError, onNotice }: Props) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>(UNGROUPED);
  const [newSystem, setNewSystem] = useState(false);
  const [systemMenu, setSystemMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [draftGroup, setDraftGroup] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState(UNGROUPED);
  const columnsRef = useRef<HTMLDivElement | null>(null);

  const groups = useMemo(() => [...store.linkGroups].sort((a, b) => a.order - b.order), [store.linkGroups]);
  const columns = useMemo(() => [{ id: UNGROUPED, name: store.ungroupedName, order: store.ungroupedOrder, createdAt: 0 }, ...groups].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt), [groups, store.ungroupedName, store.ungroupedOrder]);
  const editingSystem = store.systems.find((item) => item.id === editingSystemId) ?? null;

  // 关闭操作菜单
  useEffect(() => {
    function outside(event: PointerEvent) { if (!(event.target instanceof Element) || !event.target.closest(".system-row, .information-item-menu, .information-move-menu")) setSystemMenu(null); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") { setSystemMenu(null); setNewSystem(false); setEditingSystemId(null); setGroupManageOpen(false); } }
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
    setStore((current) => ({ ...current, linkGroups: [...current.linkGroups, { id: infoId(), name, order: Math.max(current.ungroupedOrder, ...current.linkGroups.map((group) => group.order)) + 1, createdAt: Date.now() }] }));
    setDraftGroup("");
  }

  function requestRemoveGroup(group: LinkGroup) {
    const target = [UNGROUPED, ...groups.map((item) => item.id)].find((id) => id !== group.id) ?? UNGROUPED;
    setGroupManageOpen(false); setDeleteGroupId(group.id); setMoveTarget(target);
  }
  function confirmRemoveGroup() {
    if (!deleteGroupId && deleteGroupId !== "") return;
    setStore((current) => deleteLinkGroup(current, deleteGroupId, moveTarget) || current);
    if (activeGroup === deleteGroupId) setActiveGroup(moveTarget);
    setDeleteGroupId(null); onNotice("分组已迁移并删除");
  }
  function commitGroupName(id: string, value: string, fallback: string) {
    const name = value.trim().slice(0, 40);
    if (!name || store.linkGroups.some((group) => group.id !== id && group.name === name)) {
      onNotice(name ? "分组名称不能重复" : "分组名称不能为空");
      setStore((current) => ({ ...current, linkGroups: current.linkGroups.map((group) => group.id === id ? { ...group, name: fallback } : group) }));
      return;
    }
    setStore((current) => ({ ...current, linkGroups: current.linkGroups.map((group) => group.id === id ? { ...group, name } : group) }));
  }

  // 拖拽排序：列内重排 + 跨分组移动
  function draggedLink(event: React.DragEvent) {
    return event.dataTransfer.getData("application/x-workbench-link") || draggedId;
  }

  function onDropToItem(event: React.DragEvent, target: SystemItem) {
    const linkId = draggedLink(event);
    if (!linkId || linkId === target.id) { setDraggedId(null); return; }
    setStore((current) => moveLink(current, linkId, target.groupId, target.id) || current);
    setDraggedId(null);
  }

  // 拖到分组标签上 = 移动到该分组
  function onDropToGroup(event: React.DragEvent, groupId: string) {
    const linkId = draggedLink(event);
    if (!linkId) return;
    if (groupId === ALL_GROUP) { setDraggedId(null); return; }
    setStore((current) => moveLink(current, linkId, groupId) || current);
    setDraggedId(null);
  }

  return <div className="link-library">
    <header className="info-toolbar compact-toolbar">
      <div className="info-page-heading"><p><span aria-hidden>🚀</span> 链接存到位，效率翻一倍</p></div>
      <button className="info-manage" onClick={() => setGroupManageOpen(true)}>管理分组</button>
    </header>
    <div className="info-search search-only"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索链接名称或网址" aria-label="搜索链接" /></div>

    <div className="board-scroll-controls" aria-label="浏览链接分组"><button type="button" onClick={() => columnsRef.current?.scrollBy({ left: -320, behavior: "smooth" })} aria-label="向左查看分组">‹</button><button type="button" onClick={() => columnsRef.current?.scrollBy({ left: 320, behavior: "smooth" })} aria-label="向右查看分组">›</button></div>
    <div className="link-columns" ref={columnsRef}>
      {columns.map((group) => {
        const items = visibleLinks(store, group.id, query, "manual");
        return <section key={group.id || "ungrouped"} className={`link-column board-column ${dropGroupId === group.id ? " drop-target" : ""} ${draggedGroupId === group.id ? " dragging" : ""} ${systemMenu && items.some((item) => item.id === systemMenu.id) ? " menu-open" : ""}`} onDragOver={(event) => { event.preventDefault(); setDropGroupId(group.id); }} onDragLeave={() => setDropGroupId((current) => current === group.id ? null : current)} onDrop={(event) => { event.preventDefault(); if (draggedGroupId !== null) setStore((current) => reorderLinkGroups(current, draggedGroupId, group.id, event.clientX > event.currentTarget.getBoundingClientRect().left + event.currentTarget.clientWidth / 2 ? "after" : "before") || current); else onDropToGroup(event, group.id); setDraggedGroupId(null); setDropGroupId(null); }}>
          <header className="link-column-header board-column-header" draggable onDragStart={(event) => { event.stopPropagation(); setDraggedId(null); setDraggedGroupId(group.id); }} onDragEnd={() => { setDraggedGroupId(null); setDropGroupId(null); }}><div><span className="drag-grip" aria-hidden>⠿</span><h2>{group.name}</h2><small>{items.length}</small></div><button type="button" onClick={() => { setActiveGroup(group.id); setNewSystem(true); }} aria-label={`在${group.name}新增链接`}>＋</button></header>
          <div className="link-column-body board-column-body">
        {items.map((item) => {
          const target = item.links.find((link) => link.id === item.defaultLinkId) || item.links[0];
          return <article className={`system-row${draggedId === item.id ? " dragging" : ""}`} key={item.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-workbench-link", item.id); setDraggedGroupId(null); setDraggedId(item.id); }} onDragEnd={() => { setDraggedId(null); setDropGroupId(null); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDropToItem(event, item); }}>
            <span className="drag-grip" aria-hidden>⠿</span>
            <button className="system-open" onClick={() => openLink(item)} title={item.name}>
              <b><i aria-hidden>{item.name.slice(0, 1).toUpperCase()}</i>{/^https?:\/\//.test(item.icon) && <img src={item.icon} alt="" onError={(event) => { const fallback = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(target.url).hostname)}&sz=64`; if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback; else event.currentTarget.style.display = "none"; }} />}</b>
              <span><HighlightText text={item.name} query={query} /></span>
              <small><HighlightText text={new URL(target.url).hostname} query={query} /></small>
            </button>
            <button className="system-remove" aria-label={`操作${item.name}`} aria-expanded={systemMenu?.id === item.id} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setSystemMenu((current) => current?.id === item.id ? null : { id: item.id, top: rect.bottom + 4, left: Math.max(8, rect.right - 112) }); }}>···</button>
          </article>;
        })}
        {!items.length && <div className="info-empty compact"><span>{query ? "没有匹配的链接" : "拖动链接到这里，或点上方＋添加"}</span></div>}
          </div>
        </section>;
      })}
    </div>
    {systemMenu && (() => { const item = store.systems.find((value) => value.id === systemMenu.id); if (!item) return null; return <InformationItemMenu top={systemMenu.top} left={systemMenu.left} targets={[{ id: UNGROUPED, name: store.ungroupedName }, ...groups].filter((group) => group.id !== item.groupId)} onMove={(groupId) => { setStore((current) => moveLink(current, item.id, groupId) || current); setSystemMenu(null); }} onEdit={() => { setSystemMenu(null); setEditingSystemId(item.id); }} deleteLabel="删除链接" onDelete={() => { setSystemMenu(null); if (window.confirm(`确定删除“${item.name}”吗？`)) setStore((current) => ({ ...current, systems: current.systems.filter((system) => system.id !== item.id) })); }} />; })()}

    {newSystem && <SystemDialog onClose={() => setNewSystem(false)} onSave={async (name, input, remote) => {
      const meta = urlMeta(input); if (!meta) { onNotice("请输入有效的 http/https 网址"); return; }
      const duplicate = store.systems.some((system) => system.links.some((link) => link.url === meta.url));
      if (duplicate && !window.confirm("这个网址可能已经保存，仍要继续吗？")) return;
      const now = Date.now(), linkId = infoId();
      const finalUrl = remote?.finalUrl || meta.url;
      setStore((current) => ({ ...current, systems: [...current.systems, { id: infoId(), sectionId: current.sections[0]?.id || "", groupId: activeGroup === ALL_GROUP ? UNGROUPED : activeGroup, name: name.trim() || remote?.title || meta.name, icon: siteIcon(finalUrl, remote?.icon), links: [{ id: linkId, url: finalUrl, label: "主页" }], defaultLinkId: linkId, order: current.systems.length, lastOpenedAt: 0, createdAt: now, updatedAt: now }] }));
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
      <div className="section-add"><input autoFocus value={draftGroup} maxLength={40} onChange={(event) => setDraftGroup(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addGroup(); }} placeholder="新分组名称" /><button type="button" onClick={addGroup}>新增分组</button></div>
      <EditableGroupRow key={`ungrouped-${store.ungroupedName}`} name={store.ungroupedName} count={store.systems.filter((item) => item.groupId === UNGROUPED).length} protectedCategory onCommit={(name) => setStore((current) => ({ ...current, ungroupedName: name }))} />
      {groups.map((group, index) => <EditableGroupRow key={group.id} name={group.name} count={store.systems.filter((item) => item.groupId === group.id).length} onCommit={(name) => commitGroupName(group.id, name, group.name)} order={<div className="section-order"><button type="button" onClick={() => index > 0 && setStore((current) => reorderLinkGroups(current, group.id, groups[index - 1].id) || current)} disabled={index === 0} aria-label={`上移${group.name}`}>↑</button><button type="button" onClick={() => index < groups.length - 1 && setStore((current) => reorderLinkGroups(current, group.id, groups[index + 1].id, "after") || current)} disabled={index === groups.length - 1} aria-label={`下移${group.name}`}>↓</button></div>} onDelete={() => requestRemoveGroup(group)} />)}
    </section></div>}
    {deleteGroupId && <div className="info-dialog-backdrop"><section className="info-dialog small" role="dialog" aria-modal="true" aria-label="迁移并删除链接分组"><button className="info-dialog-close" onClick={() => setDeleteGroupId(null)} aria-label="关闭">×</button><h2>迁移并删除分组</h2><div className="category-delete-dialog"><p>先选择链接要迁移到的分组，再删除“{groups.find((item) => item.id === deleteGroupId)?.name}”。</p><select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}><option value={UNGROUPED}>未分组</option>{groups.filter((item) => item.id !== deleteGroupId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><footer><button onClick={() => setDeleteGroupId(null)}>取消</button><button className="danger" onClick={confirmRemoveGroup}>迁移并删除</button></footer></div></section></div>}
    {storageError && <p className="storage-warn">本地存储异常，改动可能无法保存</p>}
  </div>;
}

function EditableGroupRow({ name, count, protectedCategory = false, order, onCommit, onDelete }: { name: string; count: number; protectedCategory?: boolean; order?: React.ReactNode; onCommit: (name: string) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState(name);
  function commit() { const next = draft.trim().slice(0, 40) || name; setDraft(next); onCommit(next); }
  return <div className="section-manage-row"><input value={draft} maxLength={40} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><span>{count} 项</span>{protectedCategory ? <span className="protected-category">默认</span> : order}{onDelete && <button type="button" className="section-delete compact-delete" onClick={onDelete} aria-label={`删除${name}`}>×</button>}</div>;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const needle = query.trim(); if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((part, index) => part.toLocaleLowerCase() === needle.toLocaleLowerCase() ? <mark key={index}>{part}</mark> : part)}</>;
}

function SystemDialog({ onSave, onClose }: { onSave: (name: string, url: string, meta: Awaited<ReturnType<typeof fetchSiteMetadata>>) => Promise<void>; onClose: () => void }) {
  const [url, setUrl] = useState(""); const [name, setName] = useState(""); const [loading, setLoading] = useState(false); const [meta, setMeta] = useState<Awaited<ReturnType<typeof fetchSiteMetadata>>>(null);
  const nameEditedRef = useRef(false);
  const recognition = useRef<Promise<Awaited<ReturnType<typeof fetchSiteMetadata>>> | null>(null);
  async function recognize() { const normalized = safeUrl(url); if (!normalized) return null; if (recognition.current) return recognition.current; setLoading(true); recognition.current = fetchSiteMetadata(normalized); try { const next = await recognition.current; setMeta(next); if (!nameEditedRef.current) setName(next?.title || urlMeta(normalized)?.name || ""); return next; } finally { recognition.current = null; setLoading(false); } }
  async function submit() { if (!safeUrl(url)) return; const next = meta || await recognize(); const finalName = (name || next?.title || urlMeta(url)?.name || "").trim(); if (!finalName) return; await onSave(finalName, url, next); }
  return <div className="info-dialog-backdrop"><section className="info-dialog small" role="dialog" aria-modal="true" aria-label="新增链接">
    <button className="info-dialog-close" onClick={onClose} aria-label="关闭">×</button>
    <h2>新增链接</h2>
    <div className="dialog-fields">
      <label className="dialog-field"><span>网址</span><input autoFocus value={url} onChange={(event) => { setUrl(event.target.value); setMeta(null); }} onBlur={() => void recognize()} placeholder="https://example.com" /></label>
      <label className="dialog-field"><span>名称</span><input value={name} maxLength={200} onChange={(event) => { setName(event.target.value); nameEditedRef.current = true; }} placeholder={loading ? "正在识别网站名称…" : "自动填充，可修改"} /></label>
    </div>
    <footer><button onClick={onClose}>取消</button><button className="primary" disabled={!safeUrl(url)} onClick={() => void submit()}>添加</button></footer>
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
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 1800);
  try { const response = await fetch("/api/site-metadata", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }), signal: controller.signal }); if (!response.ok) return null; return await response.json() as { title: string; icon: string; finalUrl: string }; } catch { return null; } finally { clearTimeout(timer); }
}
