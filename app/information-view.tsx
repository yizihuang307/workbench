"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deleteResourceSection, htmlText, infoId, safeUrl, totalFileBytes, updateSystemLink, urlMeta, visibleResources, visibleSystems, type InfoSection, type InfoStore, type ResourceItem, type SystemItem } from "./information";
import InformationEditor from "./information-editor";

type Props = { store: InfoStore; setStore: React.Dispatch<React.SetStateAction<InfoStore>>; storageError: boolean; onNotice: (message: string) => void };

export default function InformationView({ store, setStore, storageError, onNotice }: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newSystem, setNewSystem] = useState(false);
  const [systemMenuId, setSystemMenuId] = useState<string | null>(null);
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [draftSection, setDraftSection] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const previousScroll = useRef(0);
  const draftId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resourceSections = store.sections.filter((section) => section.type === "resources");
  const systemSection = store.sections.find((section) => section.type === "systems");
  const editing = store.resources.find((item) => item.id === editingId) ?? null;
  const results = useMemo(() => visibleResources(store, "all", query), [store, query]);
  const systemResults = useMemo(() => visibleSystems(store, query), [store, query]);
  const editingSystem = store.systems.find((item) => item.id === editingSystemId) ?? null;

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

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
    function key(event: KeyboardEvent) { if (event.key === "Escape") { if (editingId) closeEditor(); else { setManageOpen(false); setNewSystem(false); setSystemMenuId(null); setExpandedSectionId(null); } } }
    function outside(event: PointerEvent) { if (!(event.target instanceof Element) || !event.target.closest(".system-row")) setSystemMenuId(null); }
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", outside); return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  });
  function updateResource(id: string, updater: (item: ResourceItem) => ResourceItem) {
    setSaveState("saving");
    setStore((current) => ({ ...current, resources: current.resources.map((item) => item.id === id ? updater(item) : item) }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveState("saved"), 450);
  }
  function createResource(sectionId: string) {
    // eslint-disable-next-line react-hooks/purity -- event-handler timestamp, not render output
    const now = Date.now(), item: ResourceItem = { id: infoId(), sectionId, title: "未命名资料", titleAuto: true, blocks: [{ id: infoId(), type: "text", text: "" }], pinned: false, createdAt: now, updatedAt: now };
    setStore((current) => ({ ...current, resources: [item, ...current.resources] })); draftId.current = item.id; openEditor(item.id);
  }
  function deleteResource(item: ResourceItem) {
    if (!window.confirm(`确定删除“${item.title}”吗？其中的本地文件也会被删除。`)) return;
    setStore((current) => ({ ...current, resources: current.resources.filter((resource) => resource.id !== item.id) })); closeEditor(); onNotice("资料已删除");
  }
  function addSection() {
    const name = draftSection.trim().slice(0, 40);
    if (!name || store.sections.some((section) => section.name === name)) { onNotice(name ? "分区名称不能重复" : "分区名称不能为空"); return; }
    setStore((current) => ({ ...current, sections: [...current.sections, { id: infoId(), name, type: "resources", order: current.sections.length, createdAt: Date.now() }] })); setDraftSection("");
  }
  function removeSection(section: InfoSection) {
    const target = resourceSections.find((item) => item.id !== section.id);
    if (!target) { onNotice("至少需要保留一个资料分区"); return; }
    const count = store.resources.filter((item) => item.sectionId === section.id).length;
    if (!window.confirm(count ? `删除“${section.name}”后，其中 ${count} 项资料将移到“${target.name}”。是否继续？` : `确定删除空分区“${section.name}”吗？`)) return;
    setStore((current) => deleteResourceSection(current, section.id, target.id) || current);
    setExpandedSectionId((current) => current === section.id ? null : current);
    onNotice(count ? `分区已删除，${count} 项资料已移到“${target.name}”` : "分区已删除");
  }

  if (editing) return <ResourceWorkspace item={editing} sections={resourceSections} saveState={storageError ? "error" : saveState} fileBytes={totalFileBytes(store)} onClose={closeEditor} onDelete={() => deleteResource(editing)} onUpdate={(updater) => updateResource(editing.id, updater)} onNotice={onNotice} />;

  return <div className="info-page">
    <header className="info-toolbar">
      <div className="info-index" aria-label="分区索引">{store.sections.map((section) => <button key={section.id} onClick={() => document.getElementById(`info-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{section.name}</button>)}</div>
      <button className="info-manage" onClick={() => setManageOpen(true)}>管理分区</button>
    </header>
    <div className="info-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资料、链接或文件名" aria-label="搜索信息" /><small>{query ? `共 ${results.length + systemResults.length} 项` : ""}</small></div>

    {systemSection && <section className={`system-section ${systemMenuId ? "menu-open" : ""}`} id={`info-${systemSection.id}`}>
      <header><div><h2>{systemSection.name}</h2><span>共 {query ? systemResults.length : store.systems.length} 项</span></div><button onClick={() => setNewSystem(true)} aria-label="新增常用链接">＋</button></header>
      <div className="system-grid">{systemResults.map((item) => {
        const target = item.links.find((link) => link.id === item.defaultLinkId) || item.links[0];
        return <article className="system-row" key={item.id}><button className="system-open" onClick={() => window.open(target.url, "_blank", "noopener,noreferrer")} title={item.name}><b><i aria-hidden>{item.name.slice(0,1).toUpperCase()}</i>{/^https?:\/\//.test(item.icon) && <img src={item.icon} alt="" onError={(event) => { const fallback=`https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(target.url).hostname)}&sz=64`; if(event.currentTarget.src!==fallback)event.currentTarget.src=fallback; else event.currentTarget.style.display="none"; }} />}</b><span><HighlightText text={item.name} query={query} /></span><small><HighlightText text={new URL(target.url).hostname} query={query} /></small></button><button className="system-remove" aria-label={`操作${item.name}`} aria-expanded={systemMenuId === item.id} onClick={() => setSystemMenuId((current) => current === item.id ? null : item.id)}>···</button>{systemMenuId === item.id && <div className="system-menu" role="menu"><button onClick={() => { setSystemMenuId(null); setEditingSystemId(item.id); }}>编辑名称和网址</button><button className="danger" onClick={() => { setSystemMenuId(null); if (window.confirm(`确定删除“${item.name}”吗？`)) setStore((current) => ({ ...current, systems: current.systems.filter((system) => system.id !== item.id) })); }}>删除</button></div>}</article>;
      })}{!systemResults.length && <div className="info-empty"><b>↗</b><span>{query ? "没有匹配的常用链接" : "粘贴网址，名称和图标会自动生成"}</span>{!query && <button onClick={() => setNewSystem(true)}>添加第一个系统</button>}</div>}</div>
    </section>}

    <div className="resource-sections">{resourceSections.map((section) => {
      const items = query ? results.filter((item) => item.sectionId === section.id) : visibleResources(store, section.id, "");
      const expanded = expandedSectionId === section.id;
      return <section className={`resource-section ${expanded ? "expanded" : ""}`} id={`info-${section.id}`} key={section.id}><header><div><h2>{section.name}</h2><span>共 {items.length} 项</span></div><button onClick={() => createResource(section.id)} aria-label={`在${section.name}中新建资料`}>＋</button></header><div className="resource-preview">{items.slice(0,expanded ? items.length : 5).map((item) => <ResourceRow key={item.id} item={item} query={query} onOpen={() => openEditor(item.id)} onPin={() => setStore((current) => ({ ...current, resources: current.resources.map((resource) => resource.id === item.id ? { ...resource, pinned: !resource.pinned, updatedAt: Date.now() } : resource) }))} />)}{!items.length && <div className="info-empty compact"><span>{query ? "没有匹配结果" : "这里还没有资料"}</span></div>}</div>{items.length > 5 && <button className="view-all" onClick={() => setExpandedSectionId(expanded ? null : section.id)}>{expanded ? "收起" : "查看全部"} <span>{expanded ? "↑" : "→"}</span></button>}</section>;
    })}</div>

    {newSystem && <SystemDialog onClose={() => setNewSystem(false)} onSave={async (name,input,remote) => {
      const meta = urlMeta(input); if (!meta || !systemSection) { onNotice("请输入有效的 http/https 网址"); return; }
      const duplicate = store.systems.some((system) => system.links.some((link) => link.url === meta.url));
      if (duplicate && !window.confirm("这个网址可能已经保存，仍要继续吗？")) return;
      const now = Date.now(), linkId = infoId();
      setStore((current) => ({ ...current, systems: [...current.systems, { id: infoId(), sectionId: systemSection.id, name: name.trim() || remote?.title || meta.name, icon: remote?.icon || meta.icon, links: [{ id: linkId, url: remote?.finalUrl || meta.url, label: "主页" }], defaultLinkId: linkId, order: current.systems.length, createdAt: now, updatedAt: now }] })); setNewSystem(false); onNotice("常用链接已添加");
    }} />}
    {editingSystem && <SystemEditDialog item={editingSystem} onClose={() => setEditingSystemId(null)} onSave={(name,url) => { const normalized = safeUrl(url); if (!normalized) { onNotice("请输入有效的 http/https 网址"); return false; } if (store.systems.some((item) => item.id !== editingSystem.id && item.links.some((link) => link.url === normalized))) { onNotice("这个网址已经存在"); return false; } setStore((current) => { const updated = updateSystemLink(current, editingSystem.id, name, normalized); if (!updated) return current; return { ...updated, systems: updated.systems.map((item) => item.id === editingSystem.id ? { ...item, icon: new URL(normalized).origin + "/favicon.ico" } : item) }; }); setEditingSystemId(null); onNotice("常用链接已更新"); return true; }} />}
    {manageOpen && <div className="info-dialog-backdrop"><section className="info-dialog" role="dialog" aria-modal="true" aria-label="管理分区"><button className="info-dialog-close" onClick={() => setManageOpen(false)} aria-label="关闭">×</button><h2>管理分区</h2><div className="section-add"><input autoFocus value={draftSection} maxLength={40} onChange={(event) => setDraftSection(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addSection()} placeholder="新分区名称" /><button onClick={addSection}>新增资料分区</button></div>{resourceSections.map((section) => <div className="section-manage-row" key={section.id}><input value={section.name} maxLength={40} onChange={(event) => setStore((current) => ({ ...current, sections: current.sections.map((item) => item.id === section.id ? { ...item, name: event.target.value } : item) }))} /><span>{store.resources.filter((item) => item.sectionId === section.id).length} 项</span><button className="section-delete" onClick={() => removeSection(section)} disabled={resourceSections.length <= 1}>删除分区</button></div>)}</section></div>}
  </div>;
}

function ResourceRow({ item, query, onOpen, onPin }: { item: ResourceItem; query: string; onOpen: () => void; onPin: () => void }) {
  const summary = item.blocks.map((block) => block.type === "text" ? block.text : block.type === "link" ? block.domain : block.name).filter(Boolean).join(" · ");
  return <article className="resource-row"><button className={`resource-pin ${item.pinned ? "active" : ""}`} onClick={onPin} aria-label={item.pinned ? "取消置顶" : "置顶"}>{item.pinned ? "★" : "☆"}</button><button className="resource-main" onClick={onOpen}><strong><HighlightText text={item.title} query={query} /></strong><span><HighlightText text={summary || "开始添加内容"} query={query} /></span><small>{new Date(item.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></button></article>;
}

function HighlightText({ text, query }: { text: string; query: string }) { const needle=query.trim(); if(!needle)return <>{text}</>; const parts=text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`,"ig")); return <>{parts.map((part,index)=>part.toLocaleLowerCase()===needle.toLocaleLowerCase()?<mark key={index}>{part}</mark>:part)}</>; }

function ResourceWorkspace({ item, sections, saveState, fileBytes, onClose, onDelete, onUpdate, onNotice }: { item: ResourceItem; sections: InfoSection[]; saveState: string; fileBytes: number; onClose: () => void; onDelete: () => void; onUpdate: (updater: (item: ResourceItem) => ResourceItem) => void; onNotice: (message: string) => void }) {
  return <section className="resource-workspace"><header><button className="workspace-back" onClick={onClose}>← 返回总览</button><select value={item.sectionId} onChange={(event) => onUpdate((current) => ({ ...current, sectionId: event.target.value, updatedAt: Date.now() }))}>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select><span className={`workspace-save ${saveState}`}>{saveState === "saving" ? "保存中…" : saveState === "error" ? "保存失败" : "已保存"}</span><button className="workspace-danger" onClick={onDelete}>删除</button><button className="workspace-close" onClick={onClose} aria-label="关闭">×</button></header><div className="workspace-title"><input value={item.title} maxLength={200} onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value.slice(0, 200), titleAuto: false, updatedAt: Date.now() }))} aria-label="资料标题" /><span>{item.title.length}/200</span></div><InformationEditor item={item} fileBytes={fileBytes} onUpdate={onUpdate} onNotice={onNotice} /></section>;
}
function SystemDialog({ onSave, onClose }: { onSave: (name:string,url:string,meta:Awaited<ReturnType<typeof fetchSiteMetadata>>)=>Promise<void>; onClose:()=>void }) { const [url,setUrl]=useState(""); const [name,setName]=useState(""); const [nameEdited,setNameEdited]=useState(false); const [loading,setLoading]=useState(false); const [meta,setMeta]=useState<Awaited<ReturnType<typeof fetchSiteMetadata>>>(null); const recognition=useRef<Promise<Awaited<ReturnType<typeof fetchSiteMetadata>>>|null>(null); async function recognize(){const normalized=safeUrl(url); if(!normalized)return null; if(recognition.current)return recognition.current; setLoading(true); recognition.current=fetchSiteMetadata(normalized); try{const next=await recognition.current; setMeta(next); if(!nameEdited)setName(next?.title||urlMeta(normalized)?.name||""); return next;}finally{recognition.current=null;setLoading(false);}} async function submit(){ if(!safeUrl(url))return; const next=meta||await recognize(); const finalName=(name||next?.title||urlMeta(url)?.name||"").trim(); if(!finalName)return; await onSave(finalName,url,next); } return <div className="info-dialog-backdrop"><section className="info-dialog small" role="dialog" aria-modal="true" aria-label="新增常用链接"><button className="info-dialog-close" onClick={onClose} aria-label="关闭">×</button><h2>新增常用链接</h2><div className="dialog-fields"><label className="dialog-field"><span>网址</span><input autoFocus value={url} onChange={(event)=>{setUrl(event.target.value);setMeta(null);}} onBlur={()=>void recognize()} placeholder="https://example.com" /></label><label className="dialog-field"><span>名称</span><input value={name} maxLength={200} onChange={(event)=>{setName(event.target.value);setNameEdited(true);}} placeholder={loading?"正在识别网站名称…":"自动填充，可修改"} /></label></div><footer><button onClick={onClose}>取消</button><button className="primary" disabled={!safeUrl(url)} onClick={()=>void submit()}>{loading?"识别中…":"添加"}</button></footer></section></div>; }
function SystemEditDialog({ item, onSave, onClose }: { item:SystemItem; onSave:(name:string,url:string)=>boolean; onClose:()=>void }) { const target=item.links.find((link)=>link.id===item.defaultLinkId)||item.links[0]; const [name,setName]=useState(item.name); const [url,setUrl]=useState(target.url); return <div className="info-dialog-backdrop"><section className="info-dialog small" role="dialog" aria-modal="true" aria-label="编辑常用链接"><button className="info-dialog-close" onClick={onClose} aria-label="关闭">×</button><h2>编辑常用链接</h2><div className="dialog-fields"><label className="dialog-field"><span>名称</span><input autoFocus value={name} maxLength={200} onChange={(event)=>setName(event.target.value)} /></label><label className="dialog-field"><span>网址</span><input value={url} onChange={(event)=>setUrl(event.target.value)} /></label></div><footer><button onClick={onClose}>取消</button><button className="primary" disabled={!name.trim()||!safeUrl(url)} onClick={()=>onSave(name,url)}>保存</button></footer></section></div>; }
async function fetchSiteMetadata(url:string){ try{const response=await fetch("/api/site-metadata",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})}); if(!response.ok)return null; return await response.json() as {title:string;icon:string;finalUrl:string};}catch{return null;} }
