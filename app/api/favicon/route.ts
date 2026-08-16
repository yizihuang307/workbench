const CACHE_MAX_AGE = 30 * 24 * 60 * 60; // 30 天

function unsafeHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  if (!ipv4) return false;
  return ipv4.some((part) => part > 255) || ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] === 0 || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168);
}

/**
 * 服务端 favicon 代理：
 * 1. 绕过国内对 Google favicon 服务的访问限制
 * 2. 多源回退（Google → DuckDuckGo → 站点直接获取）
 * 3. 长缓存头让浏览器持久缓存
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");
  if (!domain) return new Response("Missing domain", { status: 400 });

  let hostname: string;
  try {
    hostname = new URL(`https://${domain}`).hostname;
  } catch {
    return new Response("Invalid domain", { status: 400 });
  }
  if (unsafeHost(hostname)) return new Response("Unsafe domain", { status: 400 });

  const sources = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
    `https://${hostname}/favicon.ico`,
  ];

  for (const source of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(source, {
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 PersonalWorkbench/1.0" },
      });
      clearTimeout(timer);

      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      // 只接受图片类型
      if (!contentType.startsWith("image/") && !contentType.includes("octet-stream") && response.status !== 200) continue;

      const body = await response.arrayBuffer();
      if (body.byteLength === 0) continue;

      const finalContentType = contentType.startsWith("image/") ? contentType : "image/x-icon";
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": finalContentType,
          "cache-control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, immutable`,
          "access-control-allow-origin": "*",
        },
      });
    } catch {
      // 当前源失败，尝试下一个
    }
  }

  // 所有源都失败，返回 404（前端会显示首字母兜底）
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": `public, max-age=${60 * 5}` }, // 失败时只缓存 5 分钟
  });
}
