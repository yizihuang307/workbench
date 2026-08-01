export async function POST(request: Request) {
  let content = "";
  try {
    const body = await request.json() as { content?: unknown };
    content = typeof body.content === "string" ? body.content.trim().slice(0, 30000) : "";
  } catch { return Response.json({ error: "请求内容无效" }, { status: 400 }); }
  if (!content) return Response.json({ error: "记录正文不能为空" }, { status: 400 });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return Response.json({ error: "AI 服务尚未配置" }, { status: 503 });
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "deepseek/deepseek-v4-pro",
        reasoning: { exclude: true },
        max_tokens: 4096,
        messages: [
          { role: "system", content: "你是个人记录整理助手。保持事实和原意，不添加原文没有的信息。去除口语重复，按内容自然整理成清晰段落或要点。直接输出整理后的正文，不解释过程。" },
          { role: "user", content },
        ],
      }),
    });
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    if (!response.ok) return Response.json({ error: "AI 服务暂时不可用" }, { status: 502 });
    const result = data.choices?.[0]?.message?.content?.trim();
    if (!result) return Response.json({ error: "AI 未返回整理结果" }, { status: 502 });
    return Response.json({ result });
  } catch { return Response.json({ error: "AI 请求失败，请稍后重试" }, { status: 502 }); }
}
