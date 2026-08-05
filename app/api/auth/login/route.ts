import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "邮箱和密码不能为空" }, { status: 400 });
  }

  // 收集要设置的 cookie
  const cookiesToSet: Array<{ name: string; value: string; options: any }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(setCookies) {
          cookiesToSet.push(...setCookies);
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (!data.session) {
    return NextResponse.json({ error: "登录失败" }, { status: 500 });
  }

  // 创建响应并手动设置 Set-Cookie header
  const response = NextResponse.json({ success: true });
  cookiesToSet.forEach(({ name, value, options }) => {
    const cookieParts = [`${name}=${encodeURIComponent(value)}`];
    if (options.maxAge !== undefined) cookieParts.push(`Max-Age=${options.maxAge}`);
    if (options.path) cookieParts.push(`Path=${options.path}`);
    if (options.httpOnly) cookieParts.push("HttpOnly");
    if (options.secure) cookieParts.push("Secure");
    if (options.sameSite) cookieParts.push(`SameSite=${options.sameSite}`);
    response.headers.append("Set-Cookie", cookieParts.join("; "));
  });

  return response;
}