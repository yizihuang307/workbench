"use client";

import { useState } from "react";

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (isSignUp) {
      // 注册：通过服务端 API 设置 cookie
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "注册失败");
      } else {
        setSuccess("注册成功！");
        setEmail("");
        setPassword("");
      }
    } else {
      // 登录：通过服务端 API 设置 cookie
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "登录失败");
      } else {
        // 登录成功，cookie 已由服务端设置，做完整页面跳转
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next") || "/";
        window.location.href = next;
      }
    }

    setLoading(false);
  }

  if (success) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-icon" aria-hidden="true">W</div>
          <h1>注册成功</h1>
          <p>{success}</p>
          <button
            className="auth-button secondary"
            onClick={() => {
              setSuccess("");
              setIsSignUp(false);
            }}
          >
            返回登录
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-icon" aria-hidden="true">W</div>
        <h1>{isSignUp ? "注册账号" : "登录我的工作台"}</h1>
        <p>{isSignUp ? "创建账号开始使用" : "输入邮箱和密码登录"}</p>

        <label className="auth-field">
          <span>邮箱地址</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoFocus
            autoComplete="email"
          />
        </label>

        <label className="auth-field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
            required
            minLength={6}
            autoComplete={isSignUp ? "new-password" : "current-password"}
          />
        </label>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button className="auth-button" type="submit" disabled={loading || !email.trim() || !password.trim()}>
          {loading ? "处理中…" : isSignUp ? "注册" : "登录"}
        </button>

        <p className="auth-switch">
          {isSignUp ? "已有账号？" : "没有账号？"}
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
          >
            {isSignUp ? "去登录" : "去注册"}
          </button>
        </p>
      </form>
    </main>
  );
}
