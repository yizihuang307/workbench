const MAX_HTML_BYTES = 512_000;

function unsafeHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  if (!ipv4) return false;
  return ipv4.some((part) => part > 255) || ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] === 0 || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168);
}

async function fetchPublicPage(initialUrl: URL, signal: AbortSignal) {
  let current = initialUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!/^https?:$/.test(current.protocol) || unsafeHost(current.hostname)) throw new Error("unsafe-url");
    const response = await fetch(current, { redirect: "manual", signal, headers: { "user-agent": "Mozilla/5.0 PersonalWorkbenchMetadata/1.0", accept: "text/html,application/xhtml+xml" } });
    if (response.status < 300 || response.status >= 400) return { response, finalUrl: current };
    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new Error("redirect-failed");
    current = new URL(location, current);
  }
  throw new Error("redirect-failed");
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]?.trim() || "";
}

function decode(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== "string") return Response.json({ error: "网址格式错误" }, { status: 400 });
    const url = new URL(body.url);
    if (!/^https?:$/.test(url.protocol) || unsafeHost(url.hostname)) return Response.json({ error: "不支持访问该地址" }, { status: 400 });
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 7000);
    const { response, finalUrl } = await fetchPublicPage(url, controller.signal);
    if (!response.ok) return Response.json({ error: "网站信息读取失败" }, { status: 502 });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return Response.json({ error: "该地址不是网页" }, { status: 415 });
    const reader = response.body?.getReader();
    let html = "", bytes = 0;
    if (reader) while (bytes < MAX_HTML_BYTES) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; html += new TextDecoder().decode(chunk.value, { stream: true }); }
    const titles = [...html.matchAll(/<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:site_name|og:title|application-name)["'][^>]*>/gi)].map((match) => attribute(match[0], "content")).filter(Boolean);
    const title = decode(titles[0] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url.hostname.replace(/^www\./, ""));
    const icons = [...html.matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/gi)].map((match) => attribute(match[0], "href")).filter(Boolean);
    const icon = new URL(icons[0] || "/favicon.ico", finalUrl).toString();
    return Response.json({ title: title.slice(0, 200), icon, finalUrl: finalUrl.toString() });
  } catch (error) {
    return Response.json({ error: error instanceof DOMException && error.name === "AbortError" ? "网站响应超时" : "网站信息读取失败" }, { status: 502 });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
