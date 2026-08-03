"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-icon" aria-hidden="true">W</div>
          <h1>邮件已发送</h1>
          <p>
            验证链接已发送至 <strong>{email}</strong>，请点击邮件中的链接完成登录。
          </p>
          <p className="auth-hint">没收到邮件？检查垃圾箱，或稍后重试。</p>
          <button className="auth-button secondary" onClick={() => setSent(false)}>
            重新输入
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleLogin}>
        <div className="auth-icon" aria-hidden="true">W</div>
        <h1>登录我的工作台</h1>
        <p>输入邮箱，我们将发送验证链接完成登录。</p>
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
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-button" type="submit" disabled={loading || !email.trim()}>
          {loading ? "发送中…" : "发送验证链接"}
        </button>
      </form>
    </main>
  );
}