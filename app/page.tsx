"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RecordsView from "./records-view";
import { emptyRecordStore, recordId, type RecordStore } from "./records";
import LinkLibraryView from "./link-library-view";
import ResourceBoardView from "./resource-board-view";
import SidebarCat from "./sidebar-cat";
import TaskCompletionEffect from "./task-completion-effect";
import { emptyInfoStore, type InfoStore } from "./information";
import { addCompletion, cleanCompletionHistory, completionsForDay, completionsForWeek, dayStart, removeCompletion, weekStart, type CompletionRecord } from "./completion-history";
import { createClient } from "@/lib/supabase/client";
import { loadWorkbenchState, saveWorkbenchState } from "@/lib/api-service";
import { calendarDate, getRolloverDecision, isIsoDate, isTaskInPeriod, isTaskVisibleInSchedule, type TaskPeriod } from "@/lib/task-period";
import { CalendarDays, Check, ChevronDown } from "lucide-react";

type Group = "today" | "later";
type Task = {
  id: string;
  label: string;
  done: boolean;
  priority: boolean;
  expectedCompletionDate: string | null;
  isOverdue: boolean;
  createdAt: number;
  completedAt: number | null;
};
type Tasks = Record<Group, Task[]>;
type Store = {
  version: 1;
  savedDate: string;
  tasks: Tasks;
  hideDone: boolean;
  mood: number;
  quickNotes: { id: string; text: string; createdAt: number }[];
  completionHistory: CompletionRecord[];
};
type Deleted = { task: Task; group: Group; index: number };
type PageKey = "schedule" | "records" | "links" | "resources";

function routeState(pathname: string) {
  const [, section, id] = pathname.split("/");
  const page: PageKey = section === "records" || section === "links" || section === "resources" ? section : "schedule";
  return { page, detailId: id || null };
}

const GROUPS: Group[] = ["today", "later"];
const GROUP_NAME: Record<Group, string> = { today: "今日安排", later: "后续安排" };
const initialTasks: Tasks = {
  today: [],
  later: [],
};

function id() {
  return crypto.randomUUID();
}

function makeTask(label: string, patch: Partial<Task> = {}): Task {
  return { id: id(), label, done: false, priority: false, expectedCompletionDate: null, isOverdue: false, createdAt: Date.now(), completedAt: null, ...patch };
}

function localDate() {
  return calendarDate(new Date(), "Asia/Shanghai");
}

function emptyStore(): Store {
  return { version: 1, savedDate: localDate(), tasks: initialTasks, hideDone: false, mood: 2, quickNotes: [], completionHistory: [] };
}

function normalizeTask(value: unknown): Task | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Task>;
  const label = typeof item.label === "string" ? item.label.trim().slice(0, 200) : "";
  if (typeof item.id !== "string" || !label) return null;
  return makeTask(label, {
    id: item.id,
    done: Boolean(item.done),
    priority: Boolean(item.priority),
    expectedCompletionDate: typeof item.expectedCompletionDate === "string" && isIsoDate(item.expectedCompletionDate) ? item.expectedCompletionDate : null,
    isOverdue: Boolean(item.isOverdue),
    createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
    completedAt: typeof item.completedAt === "number" && Number.isFinite(item.completedAt) ? item.completedAt : null,
  });
}

function rolloverTasks(tasks: Tasks): Tasks {
  const result: Tasks = { today: [], later: [] };
  for (const group of GROUPS) {
    for (const task of tasks[group]) {
      const decision = getRolloverDecision({
        area: group,
        isCompleted: task.done,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        expectedCompletionDate: task.expectedCompletionDate,
      });
      result[decision.area].push({ ...task, isOverdue: decision.isOverdue });
    }
  }
  return result;
}

function normalizeStore(value: unknown): Store {
  const fallback = emptyStore();
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<Store> & { tasks?: Partial<Tasks> & { week?: unknown[] } };
  const today = Array.isArray(source.tasks?.today) ? source.tasks.today.map(normalizeTask).filter((task): task is Task => Boolean(task)) : [];
  const laterValues = [
    ...(Array.isArray(source.tasks?.week) ? source.tasks.week : []),
    ...(Array.isArray(source.tasks?.later) ? source.tasks.later : []),
  ];
  const later = laterValues.map(normalizeTask).filter((task): task is Task => Boolean(task));
  return {
    version: 1,
    savedDate: localDate(),
    tasks: rolloverTasks({ today, later }),
    hideDone: Boolean(source.hideDone),
    mood: typeof source.mood === "number" ? source.mood : fallback.mood,
    quickNotes: Array.isArray(source.quickNotes) ? source.quickNotes : [],
    completionHistory: cleanCompletionHistory(source.completionHistory),
  };
}

export default function Home() {
  const [store, setStore] = useState<Store>(emptyStore);
  const [recordStore, setRecordStore] = useState<RecordStore>(emptyRecordStore);
  const [recordStorageError, setRecordStorageError] = useState(false);
  const [infoStore, setInfoStore] = useState<InfoStore>(emptyInfoStore);
  const [infoStorageError, setInfoStorageError] = useState(false);
  const [activePage, setActivePage] = useState<PageKey>("schedule");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");

  const [quickOpen, setQuickOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [celebration, setCelebration] = useState<{ x: number; y: number; runId: number } | null>(null);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [dragged, setDragged] = useState<{ group: Group; id: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudLoaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());


  useEffect(() => {
    function syncRoute() {
      const route = routeState(window.location.pathname);
      setActivePage(route.page);
      setDetailId(route.detailId);
    }
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const cloud = await loadWorkbenchState<Store, RecordStore, InfoStore>();
        setStore(normalizeStore(cloud.schedule));
        setRecordStore(cloud.records);
        setInfoStore(cloud.information);
        cloudLoaded.current = true;
      } catch (error) {
        setRecordStorageError(true);
        setInfoStorageError(true);
        setNotice(error instanceof Error ? error.message : "云端数据加载失败，请刷新重试");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready || !cloudLoaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot = {
      schedule: { ...store, savedDate: localDate() },
      records: recordStore,
      information: infoStore,
    };
    saveTimer.current = setTimeout(() => {
      saveChain.current = saveChain.current
        .catch(() => undefined)
        .then(() => saveWorkbenchState(snapshot))
        .then(() => {
          setRecordStorageError(false);
          setInfoStorageError(false);
        })
        .catch((error) => {
          setRecordStorageError(true);
          setInfoStorageError(true);
          setNotice(error instanceof Error ? error.message : "云端保存失败，请稍后重试");
        });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ready, store, recordStore, infoStore]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(quickOpen || historyOpen));
    return () => document.body.classList.remove("modal-open");
  }, [quickOpen, historyOpen]);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [notice]);

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
    setStore((current) => {
      const task = current.tasks[group].find((item) => item.id === taskId);
      if (!task) return current;
      const completing = !task.done;
      return {
        ...current,
        savedDate: localDate(),
        tasks: { ...current.tasks, [group]: current.tasks[group].map((item) => item.id === taskId ? { ...item, done: completing, completedAt: completing ? Date.now() : null, isOverdue: completing ? false : getRolloverDecision({ area: group, isCompleted: false, createdAt: item.createdAt, expectedCompletionDate: item.expectedCompletionDate }).isOverdue } : item) },
        completionHistory: completing
          ? addCompletion(current.completionHistory, { taskId, label: task.label, completedAt: Date.now(), ...(task.expectedCompletionDate ? { expectedCompletionDate: task.expectedCompletionDate } : {}) })
          : removeCompletion(current.completionHistory, taskId),
      };
    });
  }

  function triggerCelebration(origin: { x: number; y: number }) {
    const halfSize = 130;
    setCelebration({
      x: Math.min(window.innerWidth - halfSize, Math.max(halfSize, origin.x)),
      y: Math.min(window.innerHeight - halfSize, Math.max(halfSize, origin.y)),
      runId: Date.now(),
    });
  }

  const clearCelebration = useCallback((runId: number) => {
    setCelebration((current) => current?.runId === runId ? null : current);
  }, []);

  function togglePriority(group: Group, taskId: string) {
    updateTasks((tasks) => ({ ...tasks, [group]: tasks[group].map((task) => task.id === taskId ? { ...task, priority: !task.priority } : task) }));
  }

  function editTask(group: Group, taskId: string, label: string) {
    const clean = label.trim().slice(0, 200);
    if (!clean) return false;
    setStore((current) => ({ ...current, savedDate: localDate(), tasks: { ...current.tasks, [group]: current.tasks[group].map((task) => task.id === taskId ? { ...task, label: clean } : task) }, completionHistory: current.completionHistory.map((item) => item.taskId === taskId ? { ...item, label: clean } : item) }));
    return true;
  }

  function setExpectedCompletionDate(group: Group, taskId: string, value: string) {
    if (value && !isIsoDate(value)) return;
    setStore((current) => {
      const task = current.tasks[group].find((item) => item.id === taskId);
      if (!task) return current;
      const expectedCompletionDate = value || null;
      let target: Group = group;
      let isOverdue = false;
      if (!task.done) {
        if (group === "today" && expectedCompletionDate && expectedCompletionDate > localDate()) {
          target = "later";
        } else {
          const decision = getRolloverDecision({
            area: group,
            isCompleted: false,
            createdAt: task.createdAt,
            expectedCompletionDate,
          });
          target = decision.area;
          isOverdue = decision.isOverdue;
        }
      }
      const updated = { ...task, expectedCompletionDate, isOverdue };
      const tasks = { ...current.tasks, [group]: current.tasks[group].filter((item) => item.id !== taskId) };
      tasks[target] = target === group
        ? current.tasks[group].map((item) => item.id === taskId ? updated : item)
        : [...tasks[target], updated];
      return {
        ...current,
        savedDate: localDate(),
        tasks,
        completionHistory: current.completionHistory.map((item) => item.taskId === taskId
          ? { ...item, expectedCompletionDate: expectedCompletionDate || undefined }
          : item),
      };
    });
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
      const moved = { ...task, isOverdue: task.done ? false : getRolloverDecision({ area: to, isCompleted: false, createdAt: task.createdAt, expectedCompletionDate: task.expectedCompletionDate }).isOverdue };
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



  const today = new Date();
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(today).replace("星期", " · 星期");
  const actions = { addTask, toggleTask, triggerCelebration, togglePriority, editTask, setExpectedCompletionDate, moveTask, deleteTask, dragged, setDragged, hideDone: store.hideDone, setHideDone: (hideDone: boolean) => setStore((current) => ({ ...current, hideDone })) };

  async function handleLogout() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  function navigate(page: PageKey) {
    const pathname = page === "schedule" ? "/" : `/${page}`;
    window.history.pushState({}, "", pathname);
    setActivePage(page);
    setDetailId(null);
  }

  function setDetail(page: "records" | "resources", id: string | null) {
    window.history.pushState({}, "", id ? `/${page}/${encodeURIComponent(id)}` : `/${page}`);
    setDetailId(id);
  }

  return <main className="workbench" aria-busy={!ready}>
    <aside className="sidebar">
      <div className="brand" style={{ position: "relative" }}>
        <button className="brand-button" onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen}>
          <span>W</span><div><strong>我的工作台</strong><small>PERSONAL OS</small></div>
        </button>
        {accountOpen && <div className="brand-dropdown"><button onClick={handleLogout}>退出登录</button></div>}
      </div>
      <nav aria-label="主导航">
        <button className={activePage === "schedule" ? "active" : ""} onClick={() => navigate("schedule")}><span aria-hidden>📅</span>今日事</button>
        <button className={activePage === "records" ? "active" : ""} onClick={() => navigate("records")}><span aria-hidden>📝</span>随手记</button>
        <button className={activePage === "links" ? "active" : ""} onClick={() => navigate("links")}><span aria-hidden>🔗</span>传送门</button>
        <button className={activePage === "resources" ? "active" : ""} onClick={() => navigate("resources")}><span aria-hidden>📚</span>资料库</button>
        {/* 心情模块暂时隐藏：恢复时重新启用导航入口。 */}
      </nav>
      <SidebarCat />
    </aside>

    {activePage === "schedule" ? <section className="content">
      <div className="page">
        <header className="hero">
          <div className="hero-intro"><p>{dateLabel}</p><h1>{WEEKDAY_SLOGANS[today.getDay()]}</h1></div>
          <div className="hero-tools">
            {/* 心情模块暂时隐藏：保留 Mood 组件与本地数据，便于后续恢复。 */}
            <button className="history-button page-action-button" onClick={() => setHistoryOpen(true)}>完成记录</button>
            <DisplaySettings hideDone={store.hideDone} setHideDone={actions.setHideDone} />
            <button className="quick-button" onClick={() => setQuickOpen(true)}><span className="quick-icon" aria-hidden />快速记录</button>
          </div>
        </header>

        <div className="board">
          <TaskArea group="today" tasks={store.tasks.today} {...actions} featured />
          <TaskArea group="later" tasks={store.tasks.later} {...actions} />
        </div>
      </div>
    </section> : activePage === "records" ? <section className="content"><RecordsView store={recordStore} setStore={setRecordStore} storageError={recordStorageError} onNotice={setNotice} initialSelectedId={detailId} onSelectedChange={(id) => setDetail("records", id)} /></section> : activePage === "links" ? <section className="content"><LinkLibraryView store={infoStore} setStore={setInfoStore} storageError={infoStorageError} onNotice={setNotice} /></section> : <section className="content"><ResourceBoardView store={infoStore} setStore={setInfoStore} storageError={infoStorageError} onNotice={setNotice} initialEditingId={detailId} onEditingChange={(id) => setDetail("resources", id)} /></section>}

    {historyOpen && <Modal title="完成记录" onClose={() => setHistoryOpen(false)}><CompletionHistory history={store.completionHistory} /></Modal>}
    {celebration && <TaskCompletionEffect {...celebration} onComplete={clearCelebration} />}
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

const WEEKDAY_SLOGANS = [
  "敛神蓄气力，前路自可期",
  "蓄力开新局，万事皆顺意",
  "稳住节奏走，好运常相守",
  "熬过小疲惫，惊喜在周围",
  "再坚持一程，好事快登门",
  "认真收尾忙，周末有蜜糖",
  "闲享好时光，喜乐日日长",
];

function formatExpectedDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}/${day}`;
}

function CompletionHistory({ history }: { history: CompletionRecord[] }) {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState(() => Date.now());
  const items = mode === "day" ? completionsForDay(history, anchor) : completionsForWeek(history, anchor);
  const start = mode === "day" ? dayStart(anchor) : weekStart(anchor);
  const startDate = new Date(start);
  const end = mode === "day" ? start : new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6).getTime();
  const formatDate = (timestamp: number) => `${new Date(timestamp).getMonth() + 1}月${new Date(timestamp).getDate()}日`;
  const label = mode === "day" ? formatDate(start) : `${formatDate(start)} — ${formatDate(end)}`;
  const grouped = items.reduce<Record<string, CompletionRecord[]>>((result, item) => {
    const key = String(dayStart(item.completedAt));
    (result[key] ||= []).push(item);
    return result;
  }, {});
  function move(days: number) {
    const next = new Date(anchor);
    next.setDate(next.getDate() + days);
    setAnchor(next.getTime());
  }
  const anchorDate = new Date(anchor);
  const dateValue = `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, "0")}-${String(anchorDate.getDate()).padStart(2, "0")}`;
  function chooseDate(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    if (year && month && day) setAnchor(new Date(year, month - 1, day, 12).getTime());
  }
  return <section className="completion-history">
    <header><div><h2>完成记录</h2><p>只记录真正完成的事项，恢复未完成后会自动移除。</p></div>
      <div className="history-tabs" role="tablist" aria-label="完成记录范围">
        <button role="tab" aria-selected={mode === "day"} className={mode === "day" ? "active" : ""} onClick={() => setMode("day")}>按日查看</button>
        <button role="tab" aria-selected={mode === "week"} className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>按周查看</button>
      </div>
    </header>
    <div className="history-range"><button onClick={() => move(mode === "day" ? -1 : -7)} aria-label="上一时段">←</button><div className="history-date-control"><input type="date" value={dateValue} onChange={(event) => chooseDate(event.target.value)} aria-label="选择完成记录日期" title={label} />{mode === "week" && <span className="history-period-label">{label}</span>}</div><button onClick={() => move(mode === "day" ? 1 : 7)} aria-label="下一时段">→</button></div>
    <p className="history-summary">共完成 <strong>{items.length}</strong> 项</p>
    {items.length ? <div className="history-list">{Object.entries(grouped).map(([date, records]) => <section key={date}>
      {mode === "week" && <h3>{formatDate(Number(date))}</h3>}
      {records.map((item) => <article key={item.taskId}><span aria-hidden>✓</span><div className="history-item-title">{item.label}</div><small>{new Date(item.completedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}{item.expectedCompletionDate ? ` · 原计划 ${formatExpectedDate(item.expectedCompletionDate)}` : ""}</small></article>)}
    </section>)}</div> : <div className="history-empty"><b>✓</b><strong>这个时段还没有完成事项</strong><span>完成事项后会自动出现在这里</span></div>}
  </section>;
}

type AreaActions = {
  addTask: (group: Group, label: string) => boolean;
  toggleTask: (group: Group, id: string) => void;
  triggerCelebration: (origin: { x: number; y: number }) => void;
  togglePriority: (group: Group, id: string) => void;
  editTask: (group: Group, id: string, label: string) => boolean;
  setExpectedCompletionDate: (group: Group, id: string, value: string) => void;
  moveTask: (from: Group, id: string, to: Group, beforeId?: string) => void;
  deleteTask: (group: Group, id: string) => void;
  dragged: { group: Group; id: string } | null;
  setDragged: (value: { group: Group; id: string } | null) => void;
  hideDone: boolean;
  setHideDone: (value: boolean) => void;
};

function TaskArea({ group, tasks, featured = false, ...actions }: AreaActions & {
  group: Group; tasks: Task[]; featured?: boolean;
}) {
  const [period, setPeriod] = useState<TaskPeriod>("all");
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!periodOpen) return;
    function close(event: PointerEvent) {
      if (!periodMenu.current?.contains(event.target as Node)) setPeriodOpen(false);
    }
    function closeWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setPeriodOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [periodOpen]);
  const activeTasks = useMemo(() => tasks.filter((task) => isTaskVisibleInSchedule({
    area: group,
    isCompleted: task.done,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    expectedCompletionDate: task.expectedCompletionDate,
  })), [group, tasks]);
  const periodTasks = useMemo(() => group === "later" ? activeTasks.filter((task) => isTaskInPeriod(task, period)) : activeTasks, [activeTasks, group, period]);
  const shown = useMemo(() => actions.hideDone ? periodTasks.filter((task) => !task.done) : periodTasks, [actions.hideDone, periodTasks]);
  const complete = activeTasks.filter((task) => task.done).length;
  const periodNames: Record<TaskPeriod, string> = { all: "全部", "this-week": "本周", "next-week": "下周", "this-month": "本月" };
  return <section className={`task-area area-${group} ${featured ? "featured" : ""}`}
    onDragOver={(event) => event.preventDefault()} onDrop={() => { if (actions.dragged) actions.moveTask(actions.dragged.group, actions.dragged.id, group); actions.setDragged(null); }}>
    <header className="area-header"><div><div><h2>{GROUP_NAME[group]} <em>共 {activeTasks.length} 项</em></h2>{group === "later" && <p>暂未安排到今日</p>}</div></div>
      <div className="area-header-actions">
        {group === "later" && <div className="task-period-menu-wrap" ref={periodMenu}>
          <button className="history-button task-period-trigger" onClick={() => setPeriodOpen((open) => !open)} aria-haspopup="menu" aria-expanded={periodOpen} aria-label="筛选后续安排"><span>{periodNames[period]}</span><ChevronDown size={13} strokeWidth={1.8} aria-hidden /></button>
          {periodOpen && <div className="task-menu task-period-menu" role="menu">
            {(Object.keys(periodNames) as TaskPeriod[]).map((value) => <button key={value} className={period === value ? "active" : ""} onClick={() => { setPeriod(value); setPeriodOpen(false); }}>{periodNames[value]}{period === value && <Check size={13} aria-hidden />}</button>)}
          </div>}
        </div>}
      </div>
    </header>
    <TaskInput group={group} onAdd={actions.addTask} />
    <div className="task-list" aria-label={GROUP_NAME[group]}>
      {shown.map((task) => <TaskRow key={task.id} task={task} group={group} {...actions} />)}
      {!shown.length && <div className="empty"><b>✓</b><span>{actions.hideDone && activeTasks.length ? "完成项已隐藏" : "这里还没有安排"}</span></div>}
    </div>
    {featured && <footer className="progress"><span>{complete} / {activeTasks.length} 已完成</span><i><b style={{ width: `${activeTasks.length ? complete / activeTasks.length * 100 : 0}%` }} /></i></footer>}
  </section>;
}

function DisplaySettings({ hideDone, setHideDone }: { hideDone: boolean; setHideDone: (value: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [open]);
  return <div className="page-settings-wrap" ref={menu}>
    <button className="history-button page-action-button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
      显示设置<ChevronDown size={13} strokeWidth={1.8} aria-hidden />
    </button>
    {open && <div className="task-menu page-settings-popover" role="menu">
      <strong>显示设置</strong>
      <label><input type="checkbox" checked={hideDone} onChange={(event) => setHideDone(event.target.checked)} />隐藏已完成</label>
    </div>}
  </div>;
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
  const dateInput = useRef<HTMLInputElement>(null);
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
  function openDatePicker() {
    const picker = dateInput.current;
    if (!picker) return;
    picker.showPicker();
  }
  return <article className={`task-row ${task.done ? "done" : ""} ${task.priority ? "priority" : ""}`} draggable={!editing}
    onDragStart={() => actions.setDragged({ group, id: task.id })} onDragEnd={() => actions.setDragged(null)}
    onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); if (actions.dragged) actions.moveTask(actions.dragged.group, actions.dragged.id, group, task.id); actions.setDragged(null); }}>
    <button className="check" onClick={(event) => {
      const rect = event.currentTarget.closest<HTMLElement>(".task-row")?.getBoundingClientRect();
      if (!task.done && rect) actions.triggerCelebration({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      actions.toggleTask(group, task.id);
    }} aria-label={task.done ? `恢复${task.label}` : `完成${task.label}`} aria-pressed={task.done}>✓</button>
    <div className="task-copy">
      {editing ? <input ref={input} className="edit-input" value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)}
        onBlur={save} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) save(); if (event.key === "Escape") { setDraft(task.label); setEditing(false); } }} /> : <div className="task-copy-line">
        <span onDoubleClick={() => setEditing(true)}>{task.label}</span>
        {task.expectedCompletionDate
            ? task.done
              ? <span className="task-date-label">{formatExpectedDate(task.expectedCompletionDate)}</span>
              : <button className="task-date-label task-date-trigger" onClick={openDatePicker} aria-label={`修改${task.label}的预计完成日期`}>{formatExpectedDate(task.expectedCompletionDate)}</button>
            : !task.done && <button className="task-date-icon" onClick={openDatePicker} aria-label={`设置${task.label}的预计完成日期`} title="设置预计完成日期"><CalendarDays size={15} strokeWidth={1.8} aria-hidden /></button>}
        {!task.done && <input ref={dateInput} className="task-date-picker" type="date" value={task.expectedCompletionDate || ""} tabIndex={-1} aria-hidden onChange={(event) => actions.setExpectedCompletionDate(group, task.id, event.target.value)} />}
        {task.priority && <em className="priority-tag">P0</em>}
        {task.isOverdue && !task.done && <em>已逾期</em>}
      </div>}
    </div>
    {!task.done && <button className={`priority-button ${task.priority ? "active" : ""}`} onClick={() => actions.togglePriority(group, task.id)} aria-label={task.priority ? "取消 P0" : "标记为 P0"} aria-pressed={task.priority}><span aria-hidden /></button>}
    <div className="menu-wrap" ref={menu}><button className="more" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={`操作${task.label}`}>···</button>
      {menuOpen && <div className="task-menu" role="menu">
        <button onClick={() => { setEditing(true); setMenuOpen(false); }}>编辑</button>
        {GROUPS.filter((target) => target !== group).map((target) => <button key={target} onClick={() => { actions.moveTask(group, task.id, target); setMenuOpen(false); }}>移到{GROUP_NAME[target].replace("安排", "")}</button>)}
        <button className="danger" onClick={() => { actions.deleteTask(group, task.id); setMenuOpen(false); }}>删除</button>
      </div>}
    </div><span className="grip" aria-hidden>⠿</span>
  </article>;
}

/* 心情模块暂时隐藏，恢复模块时取消此处注释。
function Mood({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div id="mood" className="moods" tabIndex={-1}>{["很累", "一般", "平静", "不错", "很好"].map((label, index) => <button key={label} className={`mood-${index} ${value === index ? "active" : ""}`} onClick={() => onChange(index)} aria-label={`心情：${label}`} aria-pressed={value === index}><span className="mood-face" aria-hidden><i /><b /></span></button>)}</div>;
}
*/

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && box.current) {
        const focusable = [...box.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, select, textarea")];
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
