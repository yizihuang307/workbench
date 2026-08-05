import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路径不需要登录
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return updateSession(request).supabaseResponse;
  }

  const { user, supabaseResponse } = await updateSession(request);

  // 未登录 → 跳转登录页
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * 匹配所有请求路径，排除静态资源和 Next.js 内部路径
     */
    "/((?!_next/static|_next/image|favicon.svg|og.png|api/assets).*)",
  ],
};
