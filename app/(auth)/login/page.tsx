"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const result = isSignUp
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (isSignUp && !result.data.session) {
      setError("注册成功，请先在邮箱中确认账号后再登录");
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-icon" aria-hidden="true">W</div>
        <h1>{isSignUp ? "注册账号" : "登录我的工作台"}</h1>
        <p>{isSignUp ? "创建账号开始使用" : "使用邮箱和密码登录"}</p>
        <label className="auth-field">
          <span>邮箱地址</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
        </label>
        <label className="auth-field">
          <span>密码</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={isSignUp ? "new-password" : "current-password"} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? "处理中…" : isSignUp ? "注册" : "登录"}
        </button>
        <button className="auth-button secondary" type="button" onClick={() => { setIsSignUp(!isSignUp); setError(""); }}>
          {isSignUp ? "已有账号，去登录" : "注册新账号"}
        </button>
      </form>
    </main>
  );
}
