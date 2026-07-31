"use client";

import { useMemo, useState } from "react";

type Task = {
  id: number;
  label: string;
  note?: string;
  done?: boolean;
  legacy?: boolean;
};

const themes = [
  { id: "warm", number: "01", name: "温和极简", detail: "安静、耐看" },
  { id: "journal", number: "02", name: "暖调手账", detail: "松弛、有温度" },
  { id: "calm", number: "03", name: "精密温和", detail: "清晰、易落地" },
] as const;

const seedTasks: Record<string, Task[]> = {
  today: [
    { id: 1, label: "整理周会要点", note: "10:00", done: true },
    { id: 2, label: "确认新版工作台的信息架构", legacy: true },
    { id: 3, label: "回复设计评审意见", note: "今天 17:00" },
    { id: 4, label: "准备明天的访谈提纲" },
  ],
  week: [
    { id: 5, label: "完成首页低保真原型", note: "周四" },
    { id: 6, label: "梳理用户反馈清单", note: "周五" },
  ],
  later: [
    { id: 7, label: "整理个人常用工具入口" },
    { id: 8, label: "补充会议纪要模板" },
  ],
};

function TinyIcon({ children }: { children: React.ReactNode }) {
  return <span className="tiny-icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [theme, setTheme] = useState<(typeof themes)[number]["id"]>("warm");
  const [tasks, setTasks] = useState(seedTasks);
  const [draft, setDraft] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [mood, setMood] = useState(3);

  const currentTheme = themes.find((item) => item.id === theme)!;
  const todayTasks = useMemo(
    () => hideDone ? tasks.today.filter((task) => !task.done) : tasks.today,
    [hideDone, tasks],
  );

  function toggleTask(group: string, id: number) {
    setTasks((current) => ({
      ...current,
      [group]: current[group].map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    }));
  }

  function addTask() {
    const label = draft.trim();
    if (!label) return;
    setTasks((current) => ({
      ...current,
      today: [...current.today, { id: Date.now(), label }],
    }));
    setDraft("");
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">我</div>
          <div>
            <p className="brand-title">我的工作台</p>
            <p className="brand-subtitle">今天也慢慢来</p>
          </div>
          <button className="icon-button edit-button" aria-label="编辑工作台名称">⌁</button>
        </div>

        <nav className="nav-list" aria-label="主要导航">
          <button className="nav-item active"><TinyIcon>⌁</TinyIcon><span>安排</span></button>
          <button className="nav-item"><TinyIcon>▤</TinyIcon><span>记录</span></button>
          <button className="nav-item"><TinyIcon>◇</TinyIcon><span>信息</span></button>
          <button className="nav-item"><TinyIcon>☺</TinyIcon><span>心情</span></button>
        </nav>

        <div className="sidebar-spacer" />
        <section className="style-switcher" aria-label="视觉方向">
          <p className="switcher-label">视觉方向</p>
          {themes.map((item) => (
            <button
              key={item.id}
              className={`style-option ${theme === item.id ? "selected" : ""}`}
              onClick={() => setTheme(item.id)}
            >
              <span className="style-number">{item.number}</span>
              <span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </span>
              <span className="style-dot" />
            </button>
          ))}
        </section>
        <button className="settings"><TinyIcon>⚙</TinyIcon><span>设置</span></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand">我的工作台</div>
          <div className="theme-caption">
            <span>{currentTheme.number}</span>
            {currentTheme.name}
          </div>
          <div className="top-actions">
            <button className="quick-note"><span>＋</span> 快速记录</button>
            <button className="avatar" aria-label="个人账户">菠</button>
          </div>
        </header>

        <div className="content-wrap">
          <div className="greeting">
            <div>
              <p className="eyebrow">7月31日 · 星期五</p>
              <h1>早上好，菠菜 <span className="wave">〰</span></h1>
              <p className="greeting-copy">今天有 <strong>{tasks.today.filter((item) => !item.done).length} 件</strong>安排，先从最重要的一件开始。</p>
            </div>
            <div className="mood-quick">
              <span>此刻感觉怎么样？</span>
              <div className="mood-row">
                {["☹", "◔", "•‿•", "◡̈", "✦"].map((face, index) => (
                  <button
                    key={face}
                    className={mood === index ? "chosen" : ""}
                    onClick={() => setMood(index)}
                    aria-label={`心情等级 ${index + 1}`}
                  >
                    {face}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <section className="today-card">
              <div className="section-head">
                <div>
                  <div className="title-line">
                    <span className="accent-dot" />
                    <h2>今日安排</h2>
                    <span className="count">{tasks.today.length}</span>
                  </div>
                  <p>把注意力留给今天</p>
                </div>
                <label className="hide-toggle">
                  <input type="checkbox" checked={hideDone} onChange={(event) => setHideDone(event.target.checked)} />
                  隐藏已完成
                </label>
              </div>

              <div className="add-row">
                <button onClick={addTask} aria-label="添加任务">＋</button>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addTask()}
                  placeholder="添加一项今天要做的事…"
                />
                <span>↵</span>
              </div>

              <div className="task-list">
                {todayTasks.map((task) => (
                  <label className={`task-row ${task.done ? "completed" : ""}`} key={task.id}>
                    <input type="checkbox" checked={Boolean(task.done)} onChange={() => toggleTask("today", task.id)} />
                    <span className="checkbox-ui">✓</span>
                    <span className="task-copy">
                      <span className="task-label">{task.label}</span>
                      {task.legacy && <span className="legacy-tag">昨日遗留</span>}
                    </span>
                    {task.note && <span className="task-note">{task.note}</span>}
                    <button className="drag-handle" aria-label="拖动任务" onClick={(event) => event.preventDefault()}>⠿</button>
                  </label>
                ))}
              </div>

              <footer className="today-footer">
                <span>{tasks.today.filter((item) => item.done).length} / {tasks.today.length} 已完成</span>
                <div className="progress-track"><span style={{ width: `${(tasks.today.filter((item) => item.done).length / tasks.today.length) * 100}%` }} /></div>
              </footer>
            </section>

            <div className="side-stack">
              <TaskMiniCard
                title="本周安排"
                subtitle="接下来几天"
                tasks={tasks.week}
                onToggle={(id) => toggleTask("week", id)}
                tone="week"
              />
              <TaskMiniCard
                title="后续安排"
                subtitle="不着急，先放在这里"
                tasks={tasks.later}
                onToggle={(id) => toggleTask("later", id)}
                tone="later"
              />
              <section className="note-card">
                <div>
                  <span className="note-icon">✎</span>
                  <div><h3>记录一闪而过的想法</h3><p>随手记 · 会议纪要</p></div>
                </div>
                <button>去记录 <span>→</span></button>
              </section>
            </div>
          </div>
        </div>

        <div className="mobile-themes">
          {themes.map((item) => (
            <button key={item.id} className={theme === item.id ? "selected" : ""} onClick={() => setTheme(item.id)}>
              {item.number} {item.name}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function TaskMiniCard({
  title,
  subtitle,
  tasks,
  onToggle,
  tone,
}: {
  title: string;
  subtitle: string;
  tasks: Task[];
  onToggle: (id: number) => void;
  tone: "week" | "later";
}) {
  return (
    <section className={`mini-card ${tone}`}>
      <div className="mini-head">
        <div>
          <h2>{title} <span>{tasks.length}</span></h2>
          <p>{subtitle}</p>
        </div>
        <button aria-label={`添加${title}`}>＋</button>
      </div>
      <div className="mini-tasks">
        {tasks.map((task) => (
          <label className={task.done ? "completed" : ""} key={task.id}>
            <input type="checkbox" checked={Boolean(task.done)} onChange={() => onToggle(task.id)} />
            <span className="mini-check">✓</span>
            <span>{task.label}</span>
            {task.note && <small>{task.note}</small>}
          </label>
        ))}
      </div>
      <button className="view-all">查看全部 <span>→</span></button>
    </section>
  );
}
