"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type WidgetTask = {
  id: string;
  title: string;
  is_completed: boolean;
  is_p0: boolean;
  is_overdue: boolean;
  version: number;
};

type ApiResponse<T> = {
  data?: T;
  error?: { message?: string };
};

export default function TodayWidgetPage() {
  const [tasks, setTasks] = useState<WidgetTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("widget-shell");
    document.body.classList.add("widget-shell");
    return () => {
      document.documentElement.classList.remove("widget-shell");
      document.body.classList.remove("widget-shell");
    };
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks?area=today", { cache: "no-store" });
      const body = await response.json() as ApiResponse<WidgetTask[]>;
      if (!response.ok || !body.data) throw new Error(body.error?.message || "加载今日安排失败");
      setTasks(body.data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载今日安排失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
    const refresh = () => { if (document.visibilityState === "visible") void loadTasks(); };
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadTasks(); }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [loadTasks]);

  async function toggleTask(task: WidgetTask) {
    const isCompleted = !task.is_completed;
    setUpdating(task.id);
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, is_completed: isCompleted } : item));
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isCompleted, version: task.version }),
      });
      const body = await response.json() as ApiResponse<WidgetTask>;
      if (!response.ok || !body.data) throw new Error(body.error?.message || "更新失败");
      setTasks((current) => current.map((item) => item.id === task.id ? body.data! : item));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新失败，已重新加载");
      await loadTasks();
    } finally {
      setUpdating(null);
    }
  }

  const completed = useMemo(() => tasks.filter((task) => task.is_completed).length, [tasks]);
  const today = new Date();
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(today);

  return <main className="today-widget">
    <header className="today-widget-header">
      <div>
        <p>{dateLabel}</p>
        <h1>今日安排</h1>
      </div>
      <div className="today-widget-actions">
        <button onClick={() => void loadTasks()} aria-label="刷新今日安排" title="刷新">↻</button>
        <a href="/" target="_blank" rel="noreferrer" aria-label="打开完整工作台" title="打开完整工作台">↗</a>
      </div>
    </header>

    <section className="today-widget-list" aria-label="今日任务">
      {loading && <div className="today-widget-state">正在加载…</div>}
      {!loading && !tasks.length && <div className="today-widget-state"><b>✓</b><span>今天还没有安排</span></div>}
      {tasks.map((task) => <label className={`today-widget-task${task.is_completed ? " done" : ""}`} key={task.id}>
        <input type="checkbox" checked={task.is_completed} disabled={updating === task.id} onChange={() => void toggleTask(task)} />
        <span>{task.title}</span>
        {task.is_p0 && <em>P0</em>}
        {task.is_overdue && !task.is_completed && <small>逾期</small>}
      </label>)}
    </section>

    <footer className="today-widget-footer">
      <span>{completed} / {tasks.length} 已完成</span>
      <i><b style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }} /></i>
    </footer>
    {error && <div className="today-widget-error" role="status">{error}</div>}
  </main>;
}
