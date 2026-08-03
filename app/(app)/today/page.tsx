"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WEEKDAY_SLOGANS = [
  "敛神蓄气力，前路自可期",
  "蓄力开新局，万事皆顺意",
  "稳住节奏走，好运常相守",
  "熬过小疲惫，惊喜在周围",
  "再坚持一程，好事快登门",
  "认真收尾忙，周末有蜜糖",
  "闲享好时光，喜乐日日长",
];

type Group = "today" | "week" | "later";
const GROUPS: Group[] = ["today", "week", "later"];
const GROUP_NAME: Record<Group, string> = { today: "今日安排", week: "本周安排", later: "后续安排" };

type Task = {
  id: string;
  title: string;
  area: Group;
  is_completed: boolean;
  is_p0: boolean;
  is_legacy: boolean;
  sort_key: string;
  version: number;
  completed_at: string | null;
};

type Deleted = { task: Task; group: Group };

export default function TodayPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [expanded, setExpanded] = useState<Group | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载数据
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      setTasks(json.data ?? []);
    } catch {
      setNotice("加载数据失败");
    } finally {
      setReady(true);
    }
  }, []);

  const loadCompleted = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/completed");
      if (res.ok) {
        const json = await res.json();
        setCompletedTasks(json.data ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [notice]);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  // 按组分类
  const grouped = useMemo(() => {
    const result: Record<Group, Task[]> = { today: [], week: [], later: [] };
    for (const t of tasks) {
      if (t.area && result[t.area]) result[t.area].push(t);
    }
    return result;
  }, [tasks]);

  const groupedCompleted = useMemo(() => {
    const result: Record<Group, Task[]> = { today: [], week: [], later: [] };
    for (const t of completedTasks) {
      if (t.area && result[t.area]) result[t.area].push(t);
    }
    return result;
  }, [completedTasks]);

  // 添加任务
  async function addTask(group: Group, title: string) {
    const clean = title.trim().slice(0, 200);
    if (!clean) return false;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: clean, area: group }),
      });
      if (!res.ok) throw new Error("创建失败");
      const json = await res.json();
      setTasks((prev) => [...prev, json.data as Task]);
      return true;
    } catch {
      setNotice("创建失败");
      return false;
    }
  }

  // 切换完成状态
  async function toggleTask(task: Task) {
    const newCompleted = !task.is_completed;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, is_completed: newCompleted, is_legacy: newCompleted ? false : t.is_legacy }
          : t,
      ),
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: newCompleted, version: task.version }),
      });
      if (!res.ok) {
        setNotice("操作失败，请刷新后重试");
        loadTasks();
      } else {
        const json = await res.json();
        setTasks((prev) => prev.map((t) => (t.id === task.id ? json.data as Task : t)));
      }
    } catch {
      setNotice("网络错误");
    }
  }

  // 切换 P0
  async function togglePriority(task: Task) {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, is_p0: !t.is_p0 } : t)),
    );
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isP0: !task.is_p0, version: task.version }),
      });
    } catch {
      setNotice("操作失败");
    }
  }

  // 编辑任务
  async function editTask(task: Task, title: string) {
    const clean = title.trim().slice(0, 200);
    if (!clean) return false;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: clean, version: task.version }),
      });
      if (!res.ok) throw new Error("编辑失败");
      const json = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === task.id ? json.data as Task : t)));
      return true;
    } catch {
      setNotice("编辑失败");
      return false;
    }
  }

  // 移动任务
  async function moveTask(from: Group, taskId: string, to: Group, beforeId?: string) {
    if (from === to && taskId === beforeId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    // 乐观更新
    setTasks((prev) => {
      const filtered = prev.filter((t) => t.id !== taskId);
      const moved = { ...task, area: to, is_p0: to === "today" ? task.is_p0 : false, is_legacy: false };
      const targetList = filtered.filter((t) => t.area === to);
      const beforeIdx = beforeId ? targetList.findIndex((t) => t.id === beforeId) : -1;
      if (beforeIdx >= 0) targetList.splice(beforeIdx, 0, moved);
      else targetList.push(moved);
      return [...filtered.filter((t) => t.area !== to), ...targetList];
    });
    try {
      await fetch("/api/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "task",
          id: taskId,
          targetGroupId: to,
          beforeId: beforeId ?? undefined,
          version: task.version,
        }),
      });
    } catch {
      setNotice("移动失败");
      loadTasks();
    }
  }

  // 删除任务
  async function deleteTask(group: Group, taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setDeleted({ task, group });
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) {
        const json = await res.json();
        // 5 秒撤销窗口
        if (undoTimer.current) clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setDeleted(null), 5000);
        // 存储删除 token
        (window as unknown as Record<string, unknown>).__lastDeletionToken = json.deletionToken;
      }
    } catch {
      /* ignore */
    }
  }

  // 撤销删除
  async function undoDelete() {
    if (!deleted) return;
    const token = (window as unknown as Record<string, string>).__lastDeletionToken;
    if (token) {
      try {
        await fetch("/api/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: "task", id: deleted.task.id, deletionToken: token }),
        });
      } catch { /* ignore */ }
    }
    setTasks((prev) => [...prev, deleted.task]);
    setDeleted(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  const today = new Date();
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(today).replace("星期", " · 星期");

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-intro">
          <p>{dateLabel}</p>
          <h1>{WEEKDAY_SLOGANS[today.getDay()]}</h1>
        </div>
        <div className="hero-tools">
          <button className="history-button" onClick={() => { loadCompleted(); setHistoryOpen(true); }}>
            完成记录
          </button>
        </div>
      </header>

      <div className="board">
        <TaskArea
          group="today"
          tasks={grouped.today}
          expanded={false}
          featured
          onExpand={() => setExpanded("today")}
          onAdd={addTask}
          onToggle={toggleTask}
          onTogglePriority={togglePriority}
          onEdit={editTask}
          onMove={moveTask}
          onDelete={deleteTask}
          hideDone={hideDone}
          setHideDone={setHideDone}
        />
        <div className="side-areas">
          <TaskArea
            group="week"
            tasks={grouped.week}
            expanded={false}
            onExpand={() => setExpanded("week")}
            onAdd={addTask}
            onToggle={toggleTask}
            onTogglePriority={togglePriority}
            onEdit={editTask}
            onMove={moveTask}
            onDelete={deleteTask}
            hideDone={hideDone}
            setHideDone={setHideDone}
          />
          <TaskArea
            group="later"
            tasks={grouped.later}
            expanded={false}
            onExpand={() => setExpanded("later")}
            onAdd={addTask}
            onToggle={toggleTask}
            onTogglePriority={togglePriority}
            onEdit={editTask}
            onMove={moveTask}
            onDelete={deleteTask}
            hideDone={hideDone}
            setHideDone={setHideDone}
          />
        </div>
      </div>

      {expanded && (
        <Modal title={GROUP_NAME[expanded]} onClose={() => setExpanded(null)}>
          <TaskArea
            group={expanded}
            tasks={grouped[expanded]}
            expanded
            onExpand={() => setExpanded(null)}
            onAdd={addTask}
            onToggle={toggleTask}
            onTogglePriority={togglePriority}
            onEdit={editTask}
            onMove={moveTask}
            onDelete={deleteTask}
            hideDone={hideDone}
            setHideDone={setHideDone}
          />
        </Modal>
      )}

      {historyOpen && (
        <Modal title="完成记录" onClose={() => setHistoryOpen(false)}>
          <CompletionHistory history={completedTasks} />
        </Modal>
      )}

      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="关闭提示">×</button>
        </div>
      )}

      {deleted && (
        <div className="undo" role="status">
          <span>已删除"{deleted.task.title}"</span>
          <button onClick={undoDelete}>撤销</button>
        </div>
      )}
    </div>
  );
}

// ===== TaskArea 组件 =====
function TaskArea({
  group,
  tasks,
  expanded,
  featured = false,
  onExpand,
  onAdd,
  onToggle,
  onTogglePriority,
  onEdit,
  onMove,
  onDelete,
  hideDone,
  setHideDone,
}: {
  group: Group;
  tasks: Task[];
  expanded: boolean;
  featured?: boolean;
  onExpand: () => void;
  onAdd: (group: Group, title: string) => boolean;
  onToggle: (task: Task) => void;
  onTogglePriority: (task: Task) => void;
  onEdit: (task: Task, title: string) => boolean;
  onMove: (from: Group, taskId: string, to: Group, beforeId?: string) => void;
  onDelete: (group: Group, taskId: string) => void;
  hideDone: boolean;
  setHideDone: (v: boolean) => void;
}) {
  const shown = useMemo(() => (hideDone ? tasks.filter((t) => !t.is_completed) : tasks), [hideDone, tasks]);
  const complete = tasks.filter((t) => t.is_completed).length;
  const [dragged, setDragged] = useState<{ group: Group; id: string } | null>(null);

  return (
    <section
      className={`task-area area-${group} ${featured ? "featured" : ""} ${expanded ? "expanded" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        if (dragged) onMove(dragged.group, dragged.id, group);
        setDragged(null);
      }}
    >
      <header className="area-header">
        <div>
          <div>
            <h2>{GROUP_NAME[group]} <em>共 {tasks.length} 项</em></h2>
            {group === "later" && <p>暂未安排到今日或本周</p>}
          </div>
        </div>
        {!expanded && (
          <button className="icon-button" onClick={onExpand} aria-label={`放大${GROUP_NAME[group]}`} title="放大区域">
            ↗
          </button>
        )}
      </header>
      <TaskInput group={group} onAdd={onAdd} />
      <div className="task-list" aria-label={GROUP_NAME[group]}>
        {shown.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            group={group}
            onToggle={onToggle}
            onTogglePriority={onTogglePriority}
            onEdit={onEdit}
            onMove={onMove}
            onDelete={onDelete}
            onDragStart={(g, id) => setDragged({ group: g, id })}
            onDragEnd={() => setDragged(null)}
            dragged={dragged}
          />
        ))}
        {!shown.length && (
          <div className="empty">
            <b>✓</b>
            <span>{hideDone && tasks.length ? "完成项已隐藏" : "这里还没有安排"}</span>
          </div>
        )}
      </div>
      {featured && (
        <footer className="progress">
          <span>{complete} / {tasks.length} 已完成</span>
          <i><b style={{ width: `${tasks.length ? (complete / tasks.length) * 100 : 0}%` }} /></i>
          <label>
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            隐藏已完成
          </label>
        </footer>
      )}
    </section>
  );
}

// ===== TaskInput 组件 =====
function TaskInput({ group, onAdd }: { group: Group; onAdd: (group: Group, title: string) => boolean }) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function submit() {
    if (onAdd(group, value)) setValue("");
    requestAnimationFrame(() => input.current?.focus());
  }
  return (
    <div className="task-input">
      <button onClick={submit} aria-label={`添加到${GROUP_NAME[group]}`}>＋</button>
      <input
        ref={input}
        value={value}
        maxLength={200}
        placeholder={`添加${GROUP_NAME[group].replace("安排", "")}事项`}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(); }}
      />
      <small>{value.length ? `${value.length}/200` : "↵"}</small>
    </div>
  );
}

// ===== TaskRow 组件 =====
function TaskRow({
  task,
  group,
  onToggle,
  onTogglePriority,
  onEdit,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
  dragged,
}: {
  task: Task;
  group: Group;
  onToggle: (task: Task) => void;
  onTogglePriority: (task: Task) => void;
  onEdit: (task: Task, title: string) => boolean;
  onMove: (from: Group, taskId: string, to: Group, beforeId?: string) => void;
  onDelete: (group: Group, taskId: string) => void;
  onDragStart: (group: Group, id: string) => void;
  onDragEnd: () => void;
  dragged: { group: Group; id: string } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  useEffect(() => {
    if (!menuOpen) return;
    function close(e: PointerEvent) {
      if (!menu.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function closeByKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeByKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeByKey);
    };
  }, [menuOpen]);

  function save() {
    if (onEdit(task, draft)) setEditing(false);
    else setDraft(task.title);
  }

  return (
    <article
      className={`task-row ${task.is_completed ? "done" : ""} ${task.is_p0 ? "priority" : ""}`}
      draggable={!editing}
      onDragStart={() => onDragStart(group, task.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation();
        if (dragged) onMove(dragged.group, dragged.id, group, task.id);
        onDragEnd();
      }}
    >
      <button
        className="check"
        onClick={() => onToggle(task)}
        aria-label={task.is_completed ? `恢复${task.title}` : `完成${task.title}`}
        aria-pressed={task.is_completed}
      >
        ✓
      </button>
      <div className="task-copy">
        {editing ? (
          <input
            ref={input}
            className="edit-input"
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
              if (e.key === "Escape") { setDraft(task.title); setEditing(false); }
            }}
          />
        ) : (
          <div className="task-copy-line">
            <span onDoubleClick={() => setEditing(true)}>{task.title}</span>
            {task.is_p0 && <em className="priority-tag">P0</em>}
            {task.is_legacy && <em>昨日遗留</em>}
          </div>
        )}
      </div>
      {group === "today" && !task.is_completed && (
        <button
          className={`priority-button ${task.is_p0 ? "active" : ""}`}
          onClick={() => onTogglePriority(task)}
          aria-label={task.is_p0 ? "取消 P0" : "标记为 P0"}
          aria-pressed={task.is_p0}
        >
          <span aria-hidden />
        </button>
      )}
      <div className="menu-wrap" ref={menu}>
        <button
          className="more"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-label={`操作${task.title}`}
        >
          ···
        </button>
        {menuOpen && (
          <div className="task-menu" role="menu">
            <button onClick={() => { setEditing(true); setMenuOpen(false); }}>编辑</button>
            {GROUPS.filter((g) => g !== group).map((g) => (
              <button key={g} onClick={() => { onMove(group, task.id, g); setMenuOpen(false); }}>
                移到{GROUP_NAME[g].replace("安排", "")}
              </button>
            ))}
            <button className="danger" onClick={() => { onDelete(group, task.id); setMenuOpen(false); }}>删除</button>
          </div>
        )}
      </div>
      <span className="grip" aria-hidden>⠿</span>
    </article>
  );
}

// ===== Modal 组件 =====
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${title}放大视图`}>
        <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
        {children}
      </div>
    </div>
  );
}

// ===== CompletionHistory 组件 =====
function CompletionHistory({ history }: { history: Task[] }) {
  const grouped = useMemo(() => {
    const result: Record<string, Task[]> = {};
    for (const t of history) {
      if (!t.completed_at) continue;
      const date = t.completed_at.slice(0, 10);
      (result[date] ||= []).push(t);
    }
    return result;
  }, [history]);

  const formatDate = (timestamp: string) => {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <section className="completion-history">
      <header>
        <div>
          <h2>完成记录</h2>
          <p>已完成的事项</p>
        </div>
      </header>
      <p className="history-summary">共完成 <strong>{history.length}</strong> 项</p>
      {history.length ? (
        <div className="history-list">
          {Object.entries(grouped).map(([date, records]) => (
            <section key={date}>
              <h3>{formatDate(date)}</h3>
              {records.map((item) => (
                <article key={item.id}>
                  <span aria-hidden>✓</span>
                  <div className="history-item-title">{item.title}</div>
                  <small>
                    {GROUP_NAME[item.area]} ·{" "}
                    {item.completed_at
                      ? new Date(item.completed_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
                      : ""}
                  </small>
                </article>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="history-empty">
          <b>✓</b>
          <strong>还没有完成事项</strong>
          <span>完成事项后会自动出现在这里</span>
        </div>
      )}
    </section>
  );
}