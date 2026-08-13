const WIDGET_CONTROL_URL = "http://127.0.0.1:17891";
const WIDGET_SCHEME = "workbench-today://show";

async function postWidget(path: "/show" | "/quit" | "/reload", body?: Record<string, string>) {
  const response = await fetch(`${WIDGET_CONTROL_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error("便签服务响应异常");
}

function isWindowsHost() {
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.userAgent;
  return /Win/i.test(platform);
}

function launchWidgetApp() {
  window.location.href = WIDGET_SCHEME;
}

function widgetLaunchHint() {
  return isWindowsHost()
    ? "正在打开桌面便签。若未出现，请先在本机运行 npm run widget:win"
    : "正在打开桌面便签。若未出现，请先在本机运行 npm run widget:mac";
}

export async function notifyDesktopWidgetRefresh() {
  try {
    await postWidget("/reload");
  } catch {
    // 便签未运行时忽略。
  }
}

export async function openDesktopWidget(): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/client");
  const { data } = await createClient().auth.getSession();
  const payload = {
    origin: window.location.origin,
    accessToken: data.session?.access_token ?? "",
    refreshToken: data.session?.refresh_token ?? "",
  };
  try {
    await postWidget("/show", payload);
    return null;
  } catch {
    launchWidgetApp();
    for (const wait of [800, 1500, 2500]) {
      await new Promise((resolve) => window.setTimeout(resolve, wait));
      try {
        await postWidget("/show", payload);
        return null;
      } catch {
        // WebView2 冷启动较慢，继续等待。
      }
    }
    return widgetLaunchHint();
  }
}
