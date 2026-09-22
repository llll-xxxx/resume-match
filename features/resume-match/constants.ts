import type { KeywordStatus, ProviderId } from "./types";

export const PROVIDER_OPTIONS: Array<{
  id: ProviderId;
  label: string;
  shortLabel: string;
  keyUrl: string;
  keyHint: string;
}> = [
  { id: "openai", label: "OpenAI", shortLabel: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", keyHint: "sk-..." },
  { id: "gemini", label: "Google Gemini", shortLabel: "Gemini", keyUrl: "https://aistudio.google.com/app/apikey", keyHint: "AIza... 或 AQ...." },
  { id: "anthropic", label: "Anthropic Claude", shortLabel: "Claude", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "sk-ant-..." },
  { id: "deepseek", label: "DeepSeek", shortLabel: "DeepSeek", keyUrl: "https://platform.deepseek.com/api_keys", keyHint: "输入 DeepSeek API Key" },
  { id: "glm", label: "智谱 GLM", shortLabel: "GLM", keyUrl: "https://open.bigmodel.cn/usercenter/apikeys", keyHint: "输入智谱 API Key" },
  { id: "xai", label: "xAI Grok", shortLabel: "Grok", keyUrl: "https://console.x.ai/", keyHint: "xai-..." },
  { id: "qwen", label: "Qwen（阿里云百炼·美区）", shortLabel: "Qwen", keyUrl: "https://modelstudio.console.alibabacloud.com/", keyHint: "输入百炼美区 API Key" },
  { id: "muse", label: "Meta Muse", shortLabel: "Muse", keyUrl: "https://ai.meta.com/", keyHint: "输入 Meta Model API Key" },
  { id: "custom", label: "OpenAI 兼容服务", shortLabel: "其他兼容", keyUrl: "", keyHint: "输入该服务的 API Key" },
];

export const STATUS_LABEL: Record<KeywordStatus, string> = {
  green: "已覆盖",
  yellow: "建议调整",
  red: "尚未覆盖",
  ignored: "已忽略",
};

export const DEFAULT_DOC_NAME_TEMPLATE = "{projectName}";
