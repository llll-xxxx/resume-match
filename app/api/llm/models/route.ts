import { errorResponse, parseProvider, providerRequest, readApiKey, type ProviderId } from "@/lib/llm";

export const runtime = "edge";

const blockedParts = ["audio", "realtime", "transcribe", "tts", "embedding", "moderation", "image", "dall-e", "whisper", "search", "computer-use", "deep-research", "ocr", "vision"];

const preferredModels: Partial<Record<ProviderId, string[]>> = {
  gemini: ["gemini-flash-latest", "gemini-pro-latest", "gemini-3.6-flash", "gemini-3.5-flash"],
  qwen: ["qwen3.8-flash", "qwen3.8-max", "qwen-plus", "qwen-turbo"],
  muse: ["muse-spark-1.3", "muse-spark-1.2", "muse-spark-1.1"],
};

function isTextModel(provider: ProviderId, id: string) {
  const name = id.toLowerCase().replace(/^models\//, "");
  if (blockedParts.some((part) => name.includes(part))) return false;
  if (provider === "openai") return /^(gpt-|o[134](?:-|$))/i.test(name) && !name.includes("codex");
  if (provider === "gemini") return /^(gemini|gemma)/i.test(name);
  if (provider === "anthropic") return /^claude-/i.test(name);
  if (provider === "deepseek") return /^deepseek-/i.test(name);
  if (provider === "glm") return /^glm-/i.test(name);
  if (provider === "qwen") return /^qwen/i.test(name);
  if (provider === "muse") return /^muse-/i.test(name);
  if (provider === "custom") return true;
  return /^grok-/i.test(name);
}

export async function POST(request: Request) {
  try {
    const apiKey = readApiKey(request);
    const body = await request.json().catch(() => ({})) as { provider?: unknown; customBaseUrl?: unknown };
    const provider = parseProvider(body.provider);
    const customBaseUrl = typeof body.customBaseUrl === "string" ? body.customBaseUrl.trim() : "";
    const payload = await providerRequest(provider, "/models", apiKey, { method: "GET" }, customBaseUrl);
    const data = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
    const models = data
      .map((item) => item && typeof item === "object" ? String((item as { id?: unknown; name?: unknown }).id || (item as { name?: unknown }).name || "").replace(/^models\//, "") : "")
      .filter((id) => id && isTextModel(provider, id))
      .sort((a, b) => {
        const preferred = preferredModels[provider] || [];
        const aRank = preferred.indexOf(a);
        const bRank = preferred.indexOf(b);
        if (aRank >= 0 || bRank >= 0) return (aRank < 0 ? Number.MAX_SAFE_INTEGER : aRank) - (bRank < 0 ? Number.MAX_SAFE_INTEGER : bRank);
        return a.localeCompare(b);
      });
    if (!models.length) return Response.json({ error: "这个 API Key 下没有找到可用的文本模型，你也可以手动填写模型 ID" }, { status: 422 });
    return Response.json({ models, recommendedModel: (preferredModels[provider] || []).find((model) => models.includes(model)) || models[0] });
  } catch (error) {
    return errorResponse(error);
  }
}
