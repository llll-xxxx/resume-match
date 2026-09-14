export const PROVIDERS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  anthropic: { label: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  glm: { label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  xai: { label: "xAI Grok", baseUrl: "https://api.x.ai/v1" },
  qwen: { label: "Qwen（阿里云百炼·美区）", baseUrl: "https://dashscope-us.aliyuncs.com/compatible-mode/v1" },
  muse: { label: "Meta Muse", baseUrl: "https://api.meta.ai/v1" },
  custom: { label: "OpenAI 兼容服务", baseUrl: "" },
} as const;

export type ProviderId = keyof typeof PROVIDERS;

export class LLMRequestError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "LLMRequestError";
    this.status = status;
  }
}

export function parseProvider(value: unknown): ProviderId {
  const provider = typeof value === "string" ? value : "";
  if (!(provider in PROVIDERS)) throw new LLMRequestError("请选择支持的模型服务商", 400);
  return provider as ProviderId;
}

export function readApiKey(request: Request) {
  const key = request.headers.get("x-llm-api-key")?.trim() || "";
  if (key.length < 8 || key.length > 512) throw new LLMRequestError("请填写有效的 API Key", 401);
  return key;
}

function resolveBaseUrl(provider: ProviderId, customBaseUrl?: string) {
  if (provider !== "custom") return PROVIDERS[provider].baseUrl;
  let url: URL;
  try {
    url = new URL(customBaseUrl || "");
  } catch {
    throw new LLMRequestError("请填写有效的兼容 API Base URL", 400);
  }
  const hostname = url.hostname.toLowerCase();
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  const privateIpv4 = ipv4 && (ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] === 0 || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || hostname === "localhost" || hostname.endsWith(".local") || hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || privateIpv4) {
    throw new LLMRequestError("兼容服务必须使用公开的 HTTPS 地址，不能指向本机或内网", 400);
  }
  return url.toString().replace(/\/+$/, "");
}

function providerHeaders(provider: ProviderId, apiKey: string): Record<string, string> {
  if (provider === "anthropic") {
    return { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  }
  return { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...(provider === "gemini" ? { "x-goog-api-client": "resumematch-oai/1.0" } : {}) };
}

function safeErrorMessage(payload: unknown, provider: ProviderId, status: number) {
  const root = Array.isArray(payload) ? payload[0] : payload;
  const error = root && typeof root === "object" ? (root as { error?: unknown }).error : null;
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message || "") : "";
  const sanitized = message.replace(/(?:sk-[A-Za-z0-9_-]{5,}|AIza[A-Za-z0-9_-]{5,}|AQ\.[A-Za-z0-9_-]{5,})/g, "***");
  return sanitized || `${PROVIDERS[provider].label} 请求失败（HTTP ${status}）`;
}

export async function providerRequest(provider: ProviderId, path: string, apiKey: string, init: RequestInit = {}, customBaseUrl?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const headers = new Headers(providerHeaders(provider, apiKey));
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const response = await fetch(`${resolveBaseUrl(provider, customBaseUrl)}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) throw new LLMRequestError(safeErrorMessage(data, provider, response.status), response.status);
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof LLMRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new LLMRequestError(`${PROVIDERS[provider].label} 请求超时`, 504);
    const detail = error instanceof Error && error.message ? `：${error.message.replace(/(?:sk-[A-Za-z0-9_-]{5,}|AIza[A-Za-z0-9_-]{5,}|AQ\.[A-Za-z0-9_-]{5,})/g, "***")}` : "";
    throw new LLMRequestError(`无法连接 ${PROVIDERS[provider].label} API${detail}`, 502);
  } finally {
    clearTimeout(timeout);
  }
}

function parseJSON<T>(value: string) {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(normalized) as T;
  } catch {}

  // Some OpenAI-compatible providers still wrap JSON mode output with a short
  // preface or a fenced block. Accept only one complete outer object; all
  // domain-level validation remains the caller's responsibility.
  const objectStart = normalized.indexOf("{");
  const objectEnd = normalized.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(normalized.slice(objectStart, objectEnd + 1)) as T;
    } catch {}
  }
  throw new LLMRequestError("模型返回的内容不是有效 JSON，请重试或更换模型", 502);
}

function chatCompletionText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as { finish_reason?: unknown; message?: { content?: unknown } } | undefined;
  return {
    content: typeof first?.message?.content === "string" ? first.message.content : "",
    finishReason: typeof first?.finish_reason === "string" ? first.finish_reason : "",
  };
}

function openAIResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      const text = part && typeof part === "object" ? (part as { text?: unknown }).text : "";
      if (typeof text === "string" && text.trim()) return text;
    }
  }
  throw new LLMRequestError("模型没有返回可解析的内容", 502);
}

export async function generateJSON<T>({ provider, apiKey, model, system, prompt, schema, schemaName, maxTokens, customBaseUrl, outputInstruction }: {
  provider: ProviderId;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens: number;
  customBaseUrl?: string;
  outputInstruction?: string;
}) {
  if (provider === "openai") {
    const payload = await providerRequest(provider, "/responses", apiKey, {
      method: "POST",
      body: JSON.stringify({ model, store: false, max_output_tokens: maxTokens, instructions: system, input: prompt, text: { format: { type: "json_schema", name: schemaName, strict: true, schema } } }),
    }, customBaseUrl);
    return { result: parseJSON<T>(openAIResponseText(payload)), usage: payload.usage || null };
  }

  if (provider === "anthropic") {
    const payload = await providerRequest(provider, "/messages", apiKey, {
      method: "POST",
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
        tools: [{ name: "submit_json", description: "提交严格符合要求的 JSON 结果", input_schema: schema }],
        tool_choice: { type: "tool", name: "submit_json" },
      }),
    }, customBaseUrl);
    const content = Array.isArray(payload.content) ? payload.content : [];
    const toolUse = content.find((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "tool_use" && (item as { name?: unknown }).name === "submit_json") as { input?: unknown } | undefined;
    if (!toolUse?.input || typeof toolUse.input !== "object") throw new LLMRequestError("Claude 没有返回结构化结果", 502);
    return { result: toolUse.input as T, usage: payload.usage || null };
  }

  const useJsonSchema = provider === "xai";
  const responseFormat = useJsonSchema
    ? { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } }
    : { type: "json_object" };
  const attempts = provider === "deepseek" ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const attemptMaxTokens = provider === "deepseek" && attempt > 0 ? Math.min(Math.max(maxTokens * 2, 16_000), 64_000) : maxTokens;
    const payload = await providerRequest(provider, "/chat/completions", apiKey, {
      method: "POST",
      body: JSON.stringify({
        model,
        max_tokens: attemptMaxTokens,
        messages: [
          { role: "system", content: `${system}\n${outputInstruction || ""}\n必须只输出一个完整 JSON 对象，不要输出 Markdown、解释或前后缀。${attempt ? "上一次输出为空、被截断或格式错误；这次请压缩文字并确保所有括号完整闭合。" : ""}` },
          { role: "user", content: prompt },
        ],
        response_format: responseFormat,
        ...(provider === "deepseek" ? { thinking: { type: "disabled" } } : {}),
      }),
    }, customBaseUrl);
    const { content, finishReason } = chatCompletionText(payload);
    if (finishReason === "length") {
      lastError = new LLMRequestError("模型输出超过长度限制，结果未生成完整；系统已尝试扩大输出空间", 502);
      continue;
    }
    if (!content.trim()) {
      lastError = new LLMRequestError("模型返回了空内容；系统已自动重试", 502);
      continue;
    }
    try {
      return { result: parseJSON<T>(content), usage: payload.usage || null };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new LLMRequestError("模型没有返回可解析的内容", 502);
}

export function errorResponse(error: unknown) {
  const status = error instanceof LLMRequestError ? error.status : 500;
  const message = error instanceof Error ? error.message : "模型服务暂时不可用";
  return Response.json({ error: message }, { status });
}
