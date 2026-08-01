"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RecordsView from "./records-view";
import { emptyRecordStore, parseRecordStore, recordId, RECORDS_KEY, type RecordStore } from "./records";
import InformationView from "./information-view";
import { emptyInfoStore, INFO_KEY, parseInfoStore, type InfoStore } from "./information";

type Group = "today" | "week" | "later";
type Task = {
  id: string;
  label: string;
  done: boolean;
  priority: boolean;
  legacy: boolean;
  createdAt: number;
};
type Tasks = Record<Group, Task[]>;
type Store = {
  version: 1;
  savedDate: string;
  tasks: Tasks;
  hideDone: boolean;
  mood: number;
  quickNotes: { id: string; text: string; createdAt: number }[];
};
type Deleted = { task: Task; group: Group; index: number };

const STORAGE_KEY = "workbench.schedule.v1";
const GROUPS: Group[] = ["today", "week", "later"];
const GROUP_NAME: Record<Group, string> = { today: "今日安排", week: "本周安排", later: "后续安排" };
const initialTasks: Tasks = {
  today: [
    makeTask("整理周会要点", { done: true }),
    makeTask("确认新版工作台的信息架构", { legacy: true, priority: true }),
    makeTask("回复设计评审意见", { priority: true }),
    makeTask("准备明天的访谈提纲"),
  ],
  week: [makeTask("完成首页低保真原型"), makeTask("梳理用户反馈清单")],
  later: [makeTask("整理个人常用工具入口"), makeTask("补充会议纪要模板")],
};

function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeTask(label: string, patch: Partial<Task> = {}): Task {
  return { id: id(), label, done: false, priority: false, legacy: false, createdAt: Date.now(), ...patch };
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function emptyStore(): Store {
  return { version: 1, savedDate: localDate(), tasks: initialTasks, hideDone: false, mood: 2, quickNotes: [] };
}

function cleanTask(value: unknown): Task | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Task>;
  if (typeof item.label !== "string" || !item.label.trim()) return null;
  return {
    id: typeof item.id === "string" ? item.id : id(),
    label: item.label.trim().slice(0, 200),
    done: Boolean(item.done),
    priority: Boolean(item.priority),
    legacy: Boolean(item.legacy) && !item.done,
    createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
  };
}

function parseStore(raw: string): Store | null {
  try {
    const value = JSON.parse(raw) as Partial<Store>;
    if (!value.tasks || typeof value.tasks !== "object") return null;
    const tasks = Object.fromEntries(GROUPS.map((group) => [group, Array.isArray(value.tasks?.[group])
      ? value.tasks[group].map(cleanTask).filter(Boolean) as Task[] : []])) as Tasks;
    tasks.week = tasks.week.map((task) => ({ ...task, priority: false, legacy: false }));
    tasks.later = tasks.later.map((task) => ({ ...task, priority: false, legacy: false }));
    const today = localDate();
    if (value.savedDate && value.savedDate !== today) {
      tasks.today = tasks.today.map((task) => ({ ...task, legacy: !task.done || task.legacy }));
    }
    return {
      version: 1,
      savedDate: today,
      tasks,
      hideDone: Boolean(value.hideDone),
      mood: Number.isInteger(value.mood) ? Math.max(0, Math.min(4, Number(value.mood))) : 2,
      quickNotes: Array.isArray(value.quickNotes) ? value.quickNotes.filter((note) => note && typeof note.text === "string").map((note) => ({ id: typeof note.id === "string" ? note.id : id(), text: note.text.slice(0, 2000), createdAt: typeof note.createdAt === "number" ? note.createdAt : Date.now() })).slice(-100) : [],
    };
  } catch {
    return null;
  }
}

export default function Home() {
  const [store, setStore] = useState<Store>(emptyStore);
  const [recordStore, setRecordStore] = useState<RecordStore>(emptyRecordStore);
  const [recordStorageError, setRecordStorageError] = useState(false);
  const [infoStore, setInfoStore] = useState<InfoStore>(emptyInfoStore);
  const [infoStorageError, setInfoStorageError] = useState(false);
  const [activePage, setActivePage] = useState<"schedule" | "records" | "information">("schedule");
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<Group | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [dragged, setDragged] = useState<{ group: Group; id: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandButtons = useRef<Partial<Record<Group, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? parseStore(raw) : null;
    const recordRaw = window.localStorage.getItem(RECORDS_KEY);
    const parsedRecords = recordRaw ? parseRecordStore(recordRaw) : null;
    const infoRaw = window.localStorage.getItem(INFO_KEY);
    const parsedInfo = infoRaw ? parseInfoStore(infoRaw) : null;
    queueMicrotask(() => {
      if (parsed) setStore(parsed);
      else if (raw) {
        setStore({ ...emptyStore(), tasks: { today: [], week: [], later: [] } });
        setNotice("本地数据无法读取，已安全恢复为空状态");
      }
      if (parsedRecords) setRecordStore(parsedRecords);
      else if (recordRaw) setNotice("记录数据无法读取，已保留安全的空记录库");
      if (parsedInfo) setInfoStore(parsedInfo);
      else if (infoRaw) setNotice("信息数据无法读取，已保留安全的空资料库");
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, savedDate: localDate() }));
    } catch {
      queueMicrotask(() => setNotice("保存失败，请清理浏览器空间后重试"));
    }
  }, [ready, store]);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(RECORDS_KEY, JSON.stringify(recordStore)); queueMicrotask(() => setRecordStorageError(false)); }
    catch { queueMicrotask(() => { setRecordStorageError(true); setNotice("记录保存失败，请清理浏览器空间后重试"); }); }
  }, [ready, recordStore]);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(INFO_KEY, JSON.stringify(infoStore)); queueMicrotask(() => setInfoStorageError(false)); }
    catch { queueMicrotask(() => { setInfoStorageError(true); setNotice("信息保存失败，请清理浏览器空间后重试"); }); }
  }, [ready, infoStore]);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      const parsed = parseStore(event.newValue);
      if (parsed) {
        setStore(parsed);
        setNotice("已同步另一标签页的修改");
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    function syncRecords(event: StorageEvent) {
      if (event.key !== RECORDS_KEY || !event.newValue) return;
      const parsed = parseRecordStore(event.newValue);
      if (!parsed) return;
      if (activePage === "records" && document.hasFocus()) {
        setNotice("另一标签页修改了记录，请先刷新确认，避免覆盖当前编辑");
        return;
      }
      setRecordStore(parsed);
      setNotice("已同步另一标签页的记录修改");
    }
    window.addEventListener("storage", syncRecords);
    return () => window.removeEventListener("storage", syncRecords);
  }, [activePage]);

  useEffect(() => {
    function syncInfo(event: StorageEvent) {
      if (event.key !== INFO_KEY || !event.newValue) return;
      const parsed = parseInfoStore(event.newValue);
      if (!parsed) return;
      if (activePage === "information" && document.hasFocus()) { setNotice("另一标签页修改了信息，请刷新确认，避免覆盖当前编辑"); return; }
      setInfoStore(parsed); setNotice("已同步另一标签页的信息修改");
    }
    window.addEventListener("storage", syncInfo); return () => window.removeEventListener("storage", syncInfo);
  }, [activePage]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(expanded || quickOpen));
    return () => document.body.classList.remove("modal-open");
  }, [expanded, quickOpen]);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  function updateTasks(updater: (tasks: Tasks) => Tasks) {
    setStore((current) => ({ ...current, tasks: updater(current.tasks), savedDate: localDate() }));
  }

  function addTask(group: Group, label: string) {
    const clean = label.trim().slice(0, 200);
    if (!clean) return false;
    updateTasks((tasks) => ({ ...tasks, [group]: [...tasks[group], makeTask(clean)] }));
    return true;
  }

  function toggleTask(group: Group, taskId: string) {
    updateTasks((tasks) => ({ ...tasks, [group]: tasks[group].map((task) => task.id === taskId
      ? { ...task, done: !task.done, legacy: !task.done ? false : task.legacy } : task) }));
  }

  function togglePriority(taskId: string) {
    updateTasks((tasks) => ({ ...tasks, today: tasks.today.map((task) => task.id === taskId ? { ...task, priority: !task.priority } : task) }));
  }

  function editTask(group: Group, taskId: string, label: string) {
    const clean = label.trim().slice(0, 200);
    if (!clean) return false;
    updateTasks((tasks) => ({ ...tasks, [group]: tasks[group].map((task) => task.id === taskId ? { ...task, label: clean } : task) }));
    return true;
  }

  function moveTask(from: Group, taskId: string, to: Group, beforeId?: string) {
    if (from === to && taskId === beforeId) return;
    updateTasks((tasks) => {
      const task = tasks[from].find((item) => item.id === taskId);
      if (!task) return tasks;
      if (from === to && beforeId) {
        const list = [...tasks[from]];
        const fromIndex = list.findIndex((item) => item.id === taskId);
        const targetIndex = list.findIndex((item) => item.id === beforeId);
        if (fromIndex < 0 || targetIndex < 0) return tasks;
        list.splice(fromIndex, 1);
        list.splice(targetIndex, 0, task);
        return { ...tasks, [from]: list };
      }
      const next = { ...tasks, [from]: tasks[from].filter((item) => item.id !== taskId) };
      const moved = { ...task, priority: to === "today" ? task.priority : false, legacy: false };
      const target = [...next[to]];
      const index = beforeId ? target.findIndex((item) => item.id === beforeId) : -1;
      target.splice(index < 0 ? target.length : index, 0, moved);
      return { ...next, [to]: target };
    });
  }

  function deleteTask(group: Group, taskId: string) {
    const index = store.tasks[group].findIndex((task) => task.id === taskId);
    if (index < 0) return;
    const task = store.tasks[group][index];
    updateTasks((tasks) => ({ ...tasks, [group]: tasks[group].filter((item) => item.id !== taskId) }));
    setDeleted({ task, group, index });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeleted(null), 5000);
  }

  function undoDelete() {
    if (!deleted) return;
    updateTasks((tasks) => {
      const list = [...tasks[deleted.group]];
      list.splice(Math.min(deleted.index, list.length), 0, deleted.task);
      return { ...tasks, [deleted.group]: list };
    });
    setDeleted(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  const closeExpanded = useCallback(() => {
    const group = expanded;
    setExpanded(null);
    requestAnimationFrame(() => group && expandButtons.current[group]?.focus());
  }, [expanded]);

  const today = new Date();
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(today).replace("星期", " · 星期");
  const actions = { addTask, toggleTask, togglePriority, editTask, moveTask, deleteTask, dragged, setDragged, hideDone: store.hideDone, setHideDone: (hideDone: boolean) => setStore((current) => ({ ...current, hideDone })) };

  return <main className="workbench" aria-busy={!ready}>
    <aside className="sidebar">
      <div className="brand"><span>我</span><div><strong>我的工作台</strong></div></div>
      <nav aria-label="主导航">
        <button className={activePage === "schedule" ? "active" : ""} onClick={() => setActivePage("schedule")}><span>01</span>安排</button>
        <button className={activePage === "records" ? "active" : ""} onClick={() => setActivePage("records")}><span>02</span>记录</button>
        <button className={activePage === "information" ? "active" : ""} onClick={() => setActivePage("information")}><span>03</span>信息</button>
        <button onClick={() => document.getElementById("mood")?.focus()}><span>04</span>心情</button>
      </nav>
    </aside>

    {activePage === "schedule" ? <section className="content">
      <div className="page">
        <header className="hero">
          <div className="hero-intro"><p>{dateLabel}</p><h1>今天，先完成真正重要的事。</h1></div>
          <div className="hero-tools">
            <div className="mood-block"><small>此刻感觉怎么样？</small><Mood value={store.mood} onChange={(mood) => setStore((current) => ({ ...current, mood }))} /></div>
            <button className="quick-button" onClick={() => setQuickOpen(true)}><span className="quick-icon" aria-hidden />快速记录</button>
          </div>
        </header>

        <div className="board">
          <TaskArea group="today" tasks={store.tasks.today} {...actions} onExpand={() => setExpanded("today")} expandRef={(node) => { expandButtons.current.today = node; }} featured />
          <div className="side-areas">
            <TaskArea group="week" tasks={store.tasks.week} {...actions} onExpand={() => setExpanded("week")} expandRef={(node) => { expandButtons.current.week = node; }} />
            <TaskArea group="later" tasks={store.tasks.later} {...actions} onExpand={() => setExpanded("later")} expandRef={(node) => { expandButtons.current.later = node; }} />
          </div>
        </div>
      </div>
    </section> : activePage === "records" ? <section className="content"><RecordsView store={recordStore} setStore={setRecordStore} storageError={recordStorageError} onNotice={setNotice} /></section> : <section className="content"><InformationView store={infoStore} setStore={setInfoStore} storageError={infoStorageError} onNotice={setNotice} /></section>}

    {expanded && <Modal title={GROUP_NAME[expanded]} onClose={closeExpanded}>
      <TaskArea group={expanded} tasks={store.tasks[expanded]} {...actions} onExpand={closeExpanded} expanded />
    </Modal>}
    {quickOpen && <QuickNote categories={recordStore.categories} defaultCategoryId={recordStore.defaultCategoryId} onDefaultChange={(defaultCategoryId) => setRecordStore((current) => ({ ...current, defaultCategoryId }))} onClose={() => setQuickOpen(false)} onSave={(text, categoryId) => {
      setStore((current) => ({ ...current, quickNotes: [...current.quickNotes, { id: id(), text, createdAt: Date.now() }].slice(-100) }));
      const now = Date.now();
      setRecordStore((current) => ({ ...current, records: [{ id: recordId(), categoryId, body: text, pinned: false, createdAt: now, updatedAt: now }, ...current.records] }));
      setQuickOpen(false); setNotice("快速记录已保存");
    }} />}
    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}
    {deleted && <div className="undo" role="status"><span>已删除“{deleted.task.label}”</span><button onClick={undoDelete}>撤销</button></div>}
  </main>;
}

type AreaActions = {
  addTask: (group: Group, label: string) => boolean;
  toggleTask: (group: Group, id: string) => void;
  togglePriority: (id: string) => void;
  editTask: (group: Group, id: string, label: string) => boolean;
  moveTask: (from: Group, id: string, to: Group, beforeId?: string) => void;
  deleteTask: (group: Group, id: string) => void;
  dragged: { group: Group; id: string } | null;
  setDragged: (value: { group: Group; id: string } | null) => void;
  hideDone: boolean;
  setHideDone: (value: boolean) => void;
};

function TaskArea({ group, tasks, onExpand, expandRef, featured = false, expanded = false, ...actions }: AreaActions & {
  group: Group; tasks: Task[]; onExpand: () => void; expandRef?: (node: HTMLButtonElement | null) => void; featured?: boolean; expanded?: boolean;
}) {
  const shown = useMemo(() => actions.hideDone ? tasks.filter((task) => !task.done) : tasks, [actions.hideDone, tasks]);
  const complete = tasks.filter((task) => task.done).length;
  return <section className={`task-area area-${group} ${featured ? "featured" : ""} ${expanded ? "expanded" : ""}`}
    onDragOver={(event) => event.preventDefault()} onDrop={() => { if (actions.dragged) actions.moveTask(actions.dragged.group, actions.dragged.id, group); actions.setDragged(null); }}>
    <header className="area-header"><div><div><h2>{GROUP_NAME[group]} <em>共 {tasks.length} 项</em></h2>{group === "later" && <p>暂未安排到今日或本周</p>}</div></div>
      {!expanded && <button ref={expandRef} className="icon-button" onClick={onExpand} aria-label={`放大${GROUP_NAME[group]}`} title="放大区域">↗</button>}
    </header>
    <TaskInput group={group} onAdd={actions.addTask} />
    <div className="task-list" aria-label={GROUP_NAME[group]}>
      {shown.map((task) => <TaskRow key={task.id} task={task} group={group} {...actions} />)}
      {!shown.length && <div className="empty"><b>✓</b><span>{actions.hideDone && tasks.length ? "完成项已隐藏" : "这里还没有安排"}</span></div>}
    </div>
    {featured && <footer className="progress"><span>{complete} / {tasks.length} 已完成</span><i><b style={{ width: `${tasks.length ? complete / tasks.length * 100 : 0}%` }} /></i><label><input type="checkbox" checked={actions.hideDone} onChange={(event) => actions.setHideDone(event.target.checked)} /> 隐藏已完成</label></footer>}
  </section>;
}

function TaskInput({ group, onAdd }: { group: Group; onAdd: (group: Group, value: string) => boolean }) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function submit() { if (onAdd(group, value)) { setValue(""); requestAnimationFrame(() => input.current?.focus()); } }
  return <div className="task-input"><button onClick={submit} aria-label={`添加到${GROUP_NAME[group]}`}>＋</button><input ref={input} value={value} maxLength={200} placeholder={`添加${GROUP_NAME[group].replace("安排", "")}事项`}
    onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) submit(); }} /><small>{value.length ? `${value.length}/200` : "↵"}</small></div>;
}

function TaskRow({ task, group, ...actions }: AreaActions & { task: Task; group: Group }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.label);
  const [menuOpen, setMenuOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  useEffect(() => {
    if (!menuOpen) return;
    function close(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [menuOpen]);
  function save() { if (actions.editTask(group, task.id, draft)) setEditing(false); else setDraft(task.label); }
  return <article className={`task-row ${task.done ? "done" : ""} ${task.priority ? "priority" : ""}`} draggable={!editing}
    onDragStart={() => actions.setDragged({ group, id: task.id })} onDragEnd={() => actions.setDragged(null)}
    onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); if (actions.dragged) actions.moveTask(actions.dragged.group, actions.dragged.id, group, task.id); actions.setDragged(null); }}>
    <button className="check" onClick={() => actions.toggleTask(group, task.id)} aria-label={task.done ? `恢复${task.label}` : `完成${task.label}`} aria-pressed={task.done}>✓</button>
    <div className="task-copy">
      {editing ? <input ref={input} className="edit-input" value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)}
        onBlur={save} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) save(); if (event.key === "Escape") { setDraft(task.label); setEditing(false); } }} /> : <div className="task-copy-line"><span onDoubleClick={() => setEditing(true)}>{task.label}</span>{task.priority && <em className="priority-tag">P0</em>}{task.legacy && <em>昨日遗留</em>}</div>}
    </div>
    {group === "today" && !task.done && <button className={`priority-button ${task.priority ? "active" : ""}`} onClick={() => actions.togglePriority(task.id)} aria-label={task.priority ? "取消 P0" : "标记为 P0"} aria-pressed={task.priority}><span aria-hidden /></button>}
    <div className="menu-wrap" ref={menu}><button className="more" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={`操作${task.label}`}>···</button>
      {menuOpen && <div className="task-menu" role="menu">
        <button onClick={() => { setEditing(true); setMenuOpen(false); }}>编辑</button>
        {GROUPS.filter((target) => target !== group).map((target) => <button key={target} onClick={() => { actions.moveTask(group, task.id, target); setMenuOpen(false); }}>移到{GROUP_NAME[target].replace("安排", "")}</button>)}
        <button className="danger" onClick={() => { actions.deleteTask(group, task.id); setMenuOpen(false); }}>删除</button>
      </div>}
    </div><span className="grip" aria-hidden>⠿</span>
  </article>;
}

function Mood({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div id="mood" className="moods" tabIndex={-1}>{["很累", "一般", "平静", "不错", "很好"].map((label, index) => <button key={label} className={`mood-${index} ${value === index ? "active" : ""}`} onClick={() => onChange(index)} aria-label={`心情：${label}`} aria-pressed={value === index}><span className="mood-face" aria-hidden><i /><b /></span></button>)}</div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && box.current) {
        const focusable = [...box.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, textarea")];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${title}放大视图`}><button className="modal-close" onClick={onClose} aria-label="关闭">×</button>{children}</div></div>;
}

function QuickNote({ categories, defaultCategoryId, onDefaultChange, onSave, onClose }: { categories: { id: string; name: string }[]; defaultCategoryId: string; onDefaultChange: (id: string) => void; onSave: (text: string, categoryId: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function close(event: MouseEvent) { if (!(event.target instanceof Node) || !picker.current?.contains(event.target)) setCategoryOpen(false); }
    function closeByKey(event: KeyboardEvent) { if (event.key === "Escape") setCategoryOpen(false); }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeByKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", closeByKey); };
  }, []);
  const categoryName = categories.find((category) => category.id === categoryId)?.name || "选择分类";
  return <Modal title="快速记录" onClose={onClose}><section className="quick-note"><p>QUICK NOTE</p><div className="quick-heading"><h2>快速记录</h2><div className="quick-category"><span>保存到</span><div className="quick-picker" ref={picker}><button type="button" className="quick-picker-trigger" onClick={() => setCategoryOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={categoryOpen}>{categoryName}<i>⌄</i></button>{categoryOpen && <div className="quick-picker-menu" role="listbox">{categories.map((category) => <button key={category.id} className={category.id === categoryId ? "active" : ""} role="option" aria-selected={category.id === categoryId} onClick={() => { setCategoryId(category.id); setCategoryOpen(false); }}><span>{category.name}</span>{category.id === categoryId && <b>✓</b>}</button>)}</div>}</div><label><input type="checkbox" checked={categoryId === defaultCategoryId} onChange={(event) => event.target.checked && onDefaultChange(categoryId)} /> 设为默认</label></div></div><textarea autoFocus value={text} maxLength={30000} onChange={(event) => setText(event.target.value)} placeholder="先记下来，稍后再整理……" /><footer><span>{text.length}/30000</span><button onClick={onClose}>取消</button><button className="primary" disabled={!text.trim()} onClick={() => onSave(text.trim(), categoryId)}>保存记录</button></footer></section></Modal>;
}
