"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deleteResourceSection, htmlText, infoId, moveResource, reorderResourceSections, totalFileBytes, visibleResources, type InfoSection, type InfoStore, type ResourceItem } from "./information";
import InformationEditor from "./information-editor";

type Props = { store: InfoStore; setStore: React.Dispatch<React.SetStateAction<InfoStore>>; storageError: boolean; onNotice: (message: string) => void };

export default function ResourceBoardView({ store, setStore, storageError, onNotice }: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [draftSection, setDraftSection] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dropSectionId, setDropSectionId] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<ResourceItem | null>(null);
  const previousScroll = useRef(0);
  const draftId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sections = useMemo(() => [...store.sections].sort((a, b) => a.order - b.order), [store.sections]);
  const editing = store.resources.find((item) => item.id === editingId) ?? null;

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  // 全局搜索时退化为统一列表视图
  const searching = query.trim().length > 0;
  const searchResults = useMemo(() => searching ? visibleResources(store, "all", query, "manual") : [], [store, query, searching]);

  function openEditor(id: string) { previousScroll.current = window.scrollY; setEditingId(id); }
  function closeEditor() {
    if (draftId.current) {
      const draft = store.resources.find((item) => item.id === draftId.current);
      const meaningful = Boolean(draft && (htmlText(draft.documentHtml || "").trim() || draft.blocks.some((block) => block.type === "file" || block.type === "link" || (block.type === "text" && block.text.trim()))));
      if (!meaningful) setStore((current) => ({ ...current, resources: current.resources.filter((item) => item.id !== draftId.current) }));
      draftId.current = null;
    }
    setEditingId(null); requestAnimationFrame(() => window.scrollTo({ top: previousScroll.current }));
  }

  useEffect(() => {
    function key(event: KeyboardEvent) { if (event.key === "Escape") { if (editingId) closeEditor(); else setManageOpen(false); } }
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  });

  function updateResource(id: string, updater: (item: ResourceItem) => ResourceItem) {
    setSaveState("saving");
    setStore((current) => ({ ...current, resources: current.resources.map((item) => item.id === id ? updater(item) : item) }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveState("saved"), 450);
  }
  function createResource(sectionId: string) {
    const now = new Date().valueOf(), item: ResourceItem = { id: infoId(), sectionId, title: "未命名资料", titleAuto: true, blocks: [{ id: infoId(), type: "text", text: "" }], pinned: false, order: 0, createdAt: now, updatedAt: now };
    setStore((current) => ({ ...current, resources: [item, ...current.resources] })); draftId.current = item.id; openEditor(item.id);
  }
  function deleteResource(item: ResourceItem) {
    setStore((current) => ({ ...current, resources: current.resources.filter((resource) => resource.id !== item.id) })); closeEditor();
    setDeleted(item);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeleted(null), 5000);
  }
  function undoDelete() {
    if (!deleted) return;
    setStore((current) => ({ ...current, resources: [deleted, ...current.resources] }));
    setDeleted(null); if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  function addSection() {
    const name = draftSection.trim().slice(0, 40);
    if (!name || store.sections.some((section) => section.name === name)) { onNotice(name ? "分区名称不能重复" : "分区名称不能为空"); return; }
    setStore((current) => ({ ...current, sections: [...current.sections, { id: infoId(), name, type: "resources", order: current.sections.length, createdAt: Date.now() }] })); setDraftSection("");
  }
  function removeSection(section: InfoSection) {
    const target = sections.find((item) => item.id !== section.id);
    if (!target) { onNotice("至少需要保留一个资料分区"); return; }
    const count = store.resources.filter((item) => item.sectionId === section.id).length;
    if (!window.confirm(count ? `删除“${section.name}”后，其中 ${count} 项资料将移到“${target.name}”。是否继续？` : `确定删除空分区“${section.name}”吗？`)) return;
    setStore((current) => deleteResourceSection(current, section.id, target.id) || current);
    onNotice(count ? `分区已删除，${count} 项资料已移到“${target.name}”` : "分区已删除");
  }

  function moveSection(dragged: string, target: string, position: "before" | "after" = "before") {
    setStore((current) => reorderResourceSections(current, dragged, target, position) || current);
  }
  function commitSectionName(id: string, value: string, fallback: string) {
    const name = value.trim().slice(0, 40);
    if (!name || store.sections.some((section) => section.id !== id && section.name === name)) {
      onNotice(name ? "分区名称不能重复" : "分区名称不能为空");
      setStore((current) => ({ ...current, sections: current.sections.map((section) => section.id === id ? { ...section, name: fallback } : section) }));
      return;
    }
    setStore((current) => ({ ...current, sections: current.sections.map((section) => section.id === id ? { ...section, name } : section) }));
  }

  // 卡片拖拽：列内排序 + 跨列移动
  function onDropToCard(target: ResourceItem) {
    if (!draggedId || draggedId === target.id) { setDraggedId(null); return; }
    setStore((current) => moveResource(current, draggedId, target.sectionId, target.id) || current);
    setDraggedId(null);
  }
  // 拖到空白列 = 移动到该列末尾
  function onDropToColumn(sectionId: string) {
    if (!draggedId) return;
    setStore((current) => moveResource(current, draggedId, sectionId) || current);
    setDraggedId(null);
  }

  if (editing) return <ResourceWorkspace item={editing} sections={sections} saveState={storageError ? "error" : saveState} fileBytes={totalFileBytes(store)} onClose={closeEditor} onDelete={() => deleteResource(editing)} onUpdate={(updater) => updateResource(editing.id, updater)} onNotice={onNotice} />;

  return <div className="resource-board">
    <header className="info-toolbar compact-toolbar">
      <span />
      <button className="info-manage" onClick={() => setManageOpen(true)}>管理分区</button>
    </header>
    <div className="info-search search-only">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资料、链接或文件名" aria-label="搜索资料" />
      <small>{searching ? `共 ${searchResults.length} 项` : ""}</small>
    </div>

    {searching ? (
      <div className="resource-search-list">
        {searchResults.map((item) => <ResourceRow key={item.id} item={item} query={query} onOpen={() => openEditor(item.id)} onPin={() => setStore((current) => ({ ...current, resources: current.resources.map((resource) => resource.id === item.id ? { ...resource, pinned: !resource.pinned, updatedAt: Date.now() } : resource) }))} />)}
        {!searchResults.length && <div className="info-empty"><span>没有匹配结果</span></div>}
      </div>
    ) : (
      <div className="board-columns">
        {sections.map((section) => {
          const items = visibleResources(store, section.id, "", "manual");
          return <section className={`board-column${draggedSectionId === section.id ? " dragging" : ""}${dropSectionId === section.id ? " drop-target" : ""}`} key={section.id} id={`board-${section.id}`} onDragOver={(event) => { event.preventDefault(); setDropSectionId(section.id); }} onDragLeave={() => setDropSectionId((current) => current === section.id ? null : current)} onDrop={(event) => { if (draggedSectionId) { const position = event.clientX > event.currentTarget.getBoundingClientRect().left + event.currentTarget.getBoundingClientRect().width / 2 ? "after" : "before"; moveSection(draggedSectionId, section.id, position); setDraggedSectionId(null); } else onDropToColumn(section.id); setDropSectionId(null); }}>
            <header className="board-column-header" draggable onDragStart={(event) => { event.stopPropagation(); setDraggedId(null); setDraggedSectionId(section.id); }} onDragEnd={() => { setDraggedSectionId(null); setDropSectionId(null); }} title="拖动调整分类顺序">
              <div><span className="drag-grip" aria-hidden>⠿</span><h2>{section.name}</h2><span>{items.length}</span></div>
              <button onClick={() => createResource(section.id)} aria-label={`在${section.name}中新建资料`}>＋</button>
            </header>
            <div className="board-column-body">
              {items.map((item) => <article key={item.id} className={`board-card${draggedId === item.id ? " dragging" : ""}`} draggable onDragStart={() => { setDraggedSectionId(null); setDraggedId(item.id); }} onDragEnd={() => { setDraggedId(null); setDropSectionId(null); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); onDropToCard(item); }}><span className="drag-grip" aria-hidden>⠿</span>
                <button className={`resource-pin ${item.pinned ? "active" : ""}`} onClick={() => setStore((current) => ({ ...current, resources: current.resources.map((resource) => resource.id === item.id ? { ...resource, pinned: !resource.pinned, updatedAt: Date.now() } : resource) }))} aria-label={item.pinned ? "取消置顶" : "置顶"}>{item.pinned ? "★" : "☆"}</button>
                <button className="board-card-main" onClick={() => openEditor(item.id)}>
                  <strong><HighlightText text={item.title} query="" /></strong>
                  <span>{item.blocks.map((block) => block.type === "text" ? block.text : block.type === "link" ? block.domain : block.name).filter(Boolean).join(" · ") || "开始添加内容"}</span>
                  <small>{new Date(item.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small>
                </button>
                <select className="board-card-move" value={item.sectionId} onChange={(event) => setStore((current) => moveResource(current, item.id, event.target.value) || current)} aria-label={`移动“${item.title}”到其他分类`}>
                  {sections.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                </select>
              </article>)}
              {!items.length && <div className="board-column-empty"><span>拖动卡片到这里，或点上方＋新建</span></div>}
            </div>
          </section>;
        })}
      </div>
    )}

    {manageOpen && <div className="info-dialog-backdrop"><section className="info-dialog" role="dialog" aria-modal="true" aria-label="管理分区">
      <button className="info-dialog-close" onClick={() => setManageOpen(false)} aria-label="关闭">×</button>
      <h2>管理资料分区</h2>
      <div className="section-add"><input autoFocus value={draftSection} maxLength={40} onChange={(event) => setDraftSection(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addSection()} placeholder="新分区名称" /><button onClick={addSection}>新增资料分区</button></div>
      {sections.map((section, index) => <div className="section-manage-row" key={section.id}><input value={section.name} maxLength={40} onFocus={(event) => { event.currentTarget.dataset.original = section.name; }} onChange={(event) => setStore((current) => ({ ...current, sections: current.sections.map((item) => item.id === section.id ? { ...item, name: event.target.value } : item) }))} onBlur={(event) => commitSectionName(section.id, event.currentTarget.value, event.currentTarget.dataset.original || section.name)} /><span>{store.resources.filter((item) => item.sectionId === section.id).length} 项</span><div className="section-order"><button onClick={() => index > 0 && moveSection(section.id, sections[index - 1].id)} disabled={index === 0} aria-label={`上移${section.name}`}>↑</button><button onClick={() => index < sections.length - 1 && moveSection(section.id, sections[index + 1].id, "after")} disabled={index === sections.length - 1} aria-label={`下移${section.name}`}>↓</button></div><button className="section-delete compact-delete" onClick={() => removeSection(section)} disabled={sections.length <= 1} aria-label={`删除${section.name}`}>×</button></div>)}
    </section></div>}
    {storageError && <p className="storage-warn">本地存储异常，改动可能无法保存</p>}
    {deleted && <div className="undo" role="status"><span>已删除“{deleted.title}”</span><button onClick={undoDelete}>撤销</button></div>}
  </div>;
}

function ResourceRow({ item, query, onOpen, onPin }: { item: ResourceItem; query: string; onOpen: () => void; onPin: () => void }) {
  const summary = item.blocks.map((block) => block.type === "text" ? block.text : block.type === "link" ? block.domain : block.name).filter(Boolean).join(" · ");
  return <article className="resource-row"><button className={`resource-pin ${item.pinned ? "active" : ""}`} onClick={onPin} aria-label={item.pinned ? "取消置顶" : "置顶"}>{item.pinned ? "★" : "☆"}</button><button className="resource-main" onClick={onOpen}><strong><HighlightText text={item.title} query={query} /></strong><span><HighlightText text={summary || "开始添加内容"} query={query} /></span><small>{new Date(item.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></button></article>;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const needle = query.trim(); if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((part, index) => part.toLocaleLowerCase() === needle.toLocaleLowerCase() ? <mark key={index}>{part}</mark> : part)}</>;
}

function ResourceWorkspace({ item, sections, saveState, fileBytes, onClose, onDelete, onUpdate, onNotice }: { item: ResourceItem; sections: InfoSection[]; saveState: string; fileBytes: number; onClose: () => void; onDelete: () => void; onUpdate: (updater: (item: ResourceItem) => ResourceItem) => void; onNotice: (message: string) => void }) {
  return <section className="resource-workspace"><header><button className="workspace-back" onClick={onClose}>← 返回看板</button><select value={item.sectionId} onChange={(event) => onUpdate((current) => ({ ...current, sectionId: event.target.value, updatedAt: Date.now() }))}>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select><span className={`workspace-save ${saveState}`}>{saveState === "saving" ? "保存中…" : saveState === "error" ? "保存失败" : "已保存"}</span><button className="workspace-danger" onClick={onDelete}>删除</button><button className="workspace-close" onClick={onClose} aria-label="关闭">×</button></header><div className="workspace-title"><input value={item.title} maxLength={200} onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value.slice(0, 200), titleAuto: false, updatedAt: Date.now() }))} aria-label="资料标题" /><span>{item.title.length}/200</span></div><InformationEditor item={item} fileBytes={fileBytes} onUpdate={onUpdate} onNotice={onNotice} /></section>;
}
