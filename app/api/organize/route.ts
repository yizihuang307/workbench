export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "AI 服务尚未配置" }, { status: 503 });
  let content = "";
  try {
    const body = await request.json() as { content?: unknown };
    content = typeof body.content === "string" ? body.content.trim().slice(0, 30000) : "";
  } catch { return Response.json({ error: "请求内容无效" }, { status: 400 }); }
  if (!content) return Response.json({ error: "记录正文不能为空" }, { status: 400 });
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        reasoning: { effort: "low" },
        input: [
          { role: "developer", content: "你是个人记录整理助手。保持事实和原意，不添加原文没有的信息。去除口语重复，按内容自然整理成清晰段落或要点。直接输出整理后的正文，不解释过程。" },
          { role: "user", content },
        ],
      }),
    });
    const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
    if (!response.ok) return Response.json({ error: data.error?.message || "AI 服务暂时不可用" }, { status: 502 });
    const result = data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!result) return Response.json({ error: "AI 未返回整理结果" }, { status: 502 });
    return Response.json({ result });
  } catch { return Response.json({ error: "AI 请求失败，请稍后重试" }, { status: 502 }); }
}
