"use client";

import { type MouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bookmark, Check,
  CircleHelp, Cloud, Copy, Download, FileText, FolderKanban,
  KeyRound, LayoutGrid, Link2, LoaderCircle, Pencil, Plus, RefreshCw, Settings,
  Redo2, Trash2, Undo2, Upload, WandSparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addTermsToCurrentLexicon, createCurrentLexicon,
  matchConceptToResume, sameSurfaceFamily, scanKnownKeywords, surfacePattern,
  type CurrentLexicon, type LocalKeywordMatch,
} from "@/lib/keyword-matcher";
import { loadCurrentLexicon, saveCurrentLexicon } from "@/lib/keyword-store";
import { isUsefulKeywordCandidate } from "@/lib/keyword-quality";

type KeywordStatus = "green" | "yellow" | "red" | "ignored";
type RewriteSuggestion = { title: string; text: string; target: string; targetIndex: number; rationale?: string; originalChars?: number; newChars?: number; maxChars?: number };
type YellowEdit = { targetIndex: number; phraseBefore: string; phraseAfter: string; beforeText: string; afterText: string; guidance: string; originalChars: number; newChars: number; maxChars: number };
type Keyword = {
  id: string;
  conceptId?: string;
  label: string;
  status: KeywordStatus;
  previousStatus?: Exclude<KeywordStatus, "ignored">;
  resumeMatch?: string;
  suggestion?: string;
  guidance?: string;
  category?: "hard_skill" | "domain_knowledge" | "work_method" | "responsibility" | "collaboration" | "soft_skill";
  evidence?: string;
  importance?: "must" | "important" | "supporting";
  yellowEdit?: YellowEdit;
  rewrites?: RewriteSuggestion[];
  needsMoreEvidence?: boolean;
  question?: string;
  aliases?: string[];
  userApproved?: boolean;
  source?: "base" | "manual" | "llm";
};
type ResumeVersion = { id: string; name: string; fileName: string; texts: string[]; uploadedAt: string; docxBase64?: string };
type ApplicationProject = {
  id: string;
  name: string;
  resumeId: string;
  jdUrl: string;
  jdText: string;
  companyName: string;
  jobTitle: string;
  keywords: Keyword[];
  resumeTexts: string[];
  manualTerms: string[];
  updatedAt: string;
};
type ViewName = "applications" | "resumes" | "favorites" | "workspace";
type ProviderId = "openai" | "gemini" | "anthropic" | "deepseek" | "glm" | "xai" | "qwen" | "muse" | "custom";
type WebModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown }, options?: { signal?: AbortSignal }) => void | Promise<void> };

const initialKeywords: Keyword[] = [];
const resumeBullets: { id: string; text: string; limit: number }[] = [];
const providerOptions: Array<{ id: ProviderId; label: string; shortLabel: string; keyUrl: string; keyHint: string }> = [
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

const statusLabel: Record<KeywordStatus, string> = { green: "已覆盖", yellow: "建议调整", red: "尚未覆盖", ignored: "已忽略" };

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function replaceTextInWordXml(xml: string, replacements: { before: string; after: string }[]) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) throw new Error("Word 文档结构无法解析");
  const paragraphs = Array.from(documentXml.getElementsByTagName("w:p"));

  for (const { before, after } of replacements) {
    const needle = before.trim();
    if (!needle || before === after) continue;
    const paragraph = paragraphs.find((item) => Array.from(item.getElementsByTagName("w:t")).map((node) => node.textContent || "").join("").includes(needle));
    if (!paragraph) continue;
    const textNodes = Array.from(paragraph.getElementsByTagName("w:t"));
    const paragraphText = textNodes.map((node) => node.textContent || "").join("");
    const start = paragraphText.indexOf(needle);
    const end = start + needle.length;
    let offset = 0;
    let inserted = false;

    for (const textNode of textNodes) {
      const value = textNode.textContent || "";
      const nodeStart = offset;
      const nodeEnd = offset + value.length;
      offset = nodeEnd;
      if (nodeEnd <= start || nodeStart >= end) continue;
      const left = start >= nodeStart && start < nodeEnd ? value.slice(0, start - nodeStart) : "";
      const right = end > nodeStart && end <= nodeEnd ? value.slice(end - nodeStart) : "";
      if (!inserted) {
        textNode.textContent = `${left}${after}${right}`;
        inserted = true;
      } else {
        textNode.textContent = right;
      }
    }
  }

  return new XMLSerializer().serializeToString(documentXml);
}

function localDateStamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function projectCoverage(project: ApplicationProject) {
  if (!project.keywords.length) return 0;
  return Math.round((project.keywords.filter((keyword) => keyword.status === "green").length / project.keywords.length) * 100);
}

function normalizeStoredKeywords(keywords: Keyword[]) {
  const seen = new Set<string>();
  return keywords.flatMap((keyword) => {
    if (!isUsefulKeywordCandidate(keyword.label, keyword.evidence || "")) return [];
    if (/\b(bachelor(?:'s)?|master(?:'s)?|degree|university|college|mba|phd|years? of experience|minimum qualifications?|preferred qualifications?)\b/i.test(keyword.label)) return [];
    const expanded = /product strateg(?:y|ies).*(?:senior leadership|senior leaders)/i.test(keyword.label)
      ? [{ ...keyword, label: "product strategy" }, { ...keyword, id: `${keyword.id}-leadership`, label: "presenting to senior leadership" }]
      : [keyword];
    return expanded.flatMap((candidate) => {
      let label = candidate.label.trim().replace(/\s+/g, " ");
      if (/\bregulator(?:y|ies)?\b/i.test(label)) label = "regulatory";
      else if (/\b(insights? into (?:the )?market|market insights?)\b/i.test(label)) label = "market insights";
      else if (/\bcross[- ]function(?:al|ally)?\b/i.test(label)) label = "cross-functional";
      const key = label.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
      if (!key || seen.has(key)) return [];
      seen.add(key);
      const normalized = { ...candidate, label };
      if (normalized.status === "yellow" && (!normalized.resumeMatch || !normalized.suggestion || !normalized.yellowEdit || !/^[\x20-\x7E]+$/.test(normalized.suggestion))) {
        return [{ ...normalized, status: "red" as const, resumeMatch: undefined, suggestion: undefined, rewrites: normalized.rewrites || [], needsMoreEvidence: !normalized.rewrites?.length }];
      }
      return [normalized];
    });
  });
}

function keywordFromLocalMatch(match: LocalKeywordMatch, index: number): Keyword {
  return {
    id: `local-${match.conceptId}-${index}`,
    conceptId: match.conceptId,
    label: match.label,
    status: match.status,
    resumeMatch: match.resumeMatch,
    suggestion: match.suggestion,
    evidence: match.evidence,
    importance: "important",
    category: "responsibility",
    source: match.source,
    rewrites: [],
    needsMoreEvidence: match.status === "red",
  };
}

function rematchKeywordsLocally(items: Keyword[], lines: string[], lexicon: CurrentLexicon) {
  const concepts = lexicon.concepts;
  return items.map((item) => {
    if (item.status === "ignored" || item.userApproved) return item;
    const concept = concepts.find((candidate) => candidate.id === item.conceptId)
      || { id: item.conceptId || item.id, label: item.label, terms: [item.label, ...(item.aliases || [])].map((value) => ({ value, source: "llm" as const })) };
    const match = matchConceptToResume(item.label, concept, lines);
    // A yellow item remains a deliberate editing decision until the user applies it.
    if (item.status === "yellow") return { ...item, resumeMatch: match.resumeMatch || item.resumeMatch };
    return {
      ...item,
      status: match.status,
      resumeMatch: match.resumeMatch,
      suggestion: match.status === "yellow" ? match.suggestion : undefined,
      needsMoreEvidence: match.status === "red" ? item.needsMoreEvidence : false,
    };
  });
}

function isResumeBullet(text: string) {
  const value = text.trim();
  if (value.length < 45 || value.length > 520) return false;
  if (/@|https?:\/\/|linkedin\.com|\+?\d[\d\s().-]{7,}\d/i.test(value)) return false;
  if (/^(education|experience|professional experience|work experience|skills|additional information|leadership|projects?|summary|profile|honors?|certifications?)\s*:?[\s|]*$/i.test(value)) return false;
  if (/^[A-Z][A-Z &,/.-]{2,50}$/.test(value)) return false;
  if (/\b(university|business school|bachelor(?:'s)?|master(?:'s)?|mba|gpa|double major|graduat(?:ed|ion)|coursework)\b/i.test(value)) return false;
  const actionOrOutcome = /\b(led|owned|built|launched|developed|defined|drove|managed|created|designed|analyzed|delivered|increased|reduced|improved|grew|generated|secured|partnered|collaborated|conducted|established|implemented|optimized|translated|identified|advised|supported|spearheaded|negotiated|achieved)\b/i;
  return actionOrOutcome.test(value) || /[%$]\s?\d|\d+%|\b\d+x\b/i.test(value);
}

function relevantResumeLines(texts: string[], keyword: string) {
  const keywordTerms = keyword.toLowerCase().split(/[^a-z0-9+#./-]+/).filter((term) => term.length > 2 && !["and", "the", "with", "for", "from", "that", "this"].includes(term));
  return texts
    .map((text, index) => {
      const lower = text.toLowerCase();
      let relevance = keywordTerms.reduce((score, term) => score + (lower.includes(term) ? 8 : 0), 0);
      if (/\b(product|strategy|stakeholder|cross-functional|customer|market|analysis|data|roadmap|launch|growth|operations|research|requirements)\b/i.test(text)) relevance += 3;
      if (/[%$]\s?\d|\d+%|\b\d+x\b/i.test(text)) relevance += 2;
      if (/^(led|owned|built|launched|developed|defined|drove|managed|created|designed|analyzed|delivered|increased|reduced|improved|partnered|conducted|implemented|optimized|translated|identified|advised|supported)\b/i.test(text.trim().replace(/^[•●▪‣-]\s*/, ""))) relevance += 2;
      return { text, index, relevance };
    })
    .filter((candidate) => isResumeBullet(candidate.text))
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .slice(0, 3);
}

function replaceParagraphText(paragraph: HTMLElement, text: string) {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  if (!nodes.length) {
    paragraph.append(document.createTextNode(text));
    return;
  }
  const original = nodes.map((textNode) => textNode.data).join("");
  if (original === text) return;
  let start = 0;
  while (start < original.length && start < text.length && original[start] === text[start]) start++;
  let suffixLength = 0;
  while (suffixLength < original.length - start && suffixLength < text.length - start && original[original.length - 1 - suffixLength] === text[text.length - 1 - suffixLength]) suffixLength++;
  const end = original.length - suffixLength;
  const replacement = text.slice(start, text.length - suffixLength);
  let offset = 0;
  if (start === end) {
    for (const textNode of nodes) {
      const nodeEnd = offset + textNode.data.length;
      if (start >= offset && start <= nodeEnd) {
        const localOffset = start - offset;
        textNode.data = `${textNode.data.slice(0, localOffset)}${replacement}${textNode.data.slice(localOffset)}`;
        return;
      }
      offset = nodeEnd;
    }
  }
  offset = 0;
  let inserted = false;
  nodes.forEach((textNode) => {
    const value = textNode.data;
    const nodeStart = offset;
    const nodeEnd = offset + value.length;
    offset = nodeEnd;
    if (nodeEnd <= start || nodeStart >= end) return;
    const left = start >= nodeStart && start < nodeEnd ? value.slice(0, start - nodeStart) : "";
    const right = end > nodeStart && end <= nodeEnd ? value.slice(end - nodeStart) : "";
    textNode.data = inserted ? right : `${left}${replacement}${right}`;
    inserted = true;
  });
  if (!inserted) nodes[nodes.length - 1].data += replacement;
}

function closestResumeParagraph(node: Node | null, host: HTMLElement) {
  const element = node instanceof Element ? node : node?.parentElement;
  const paragraph = element?.closest<HTMLElement>("p[data-resume-index]") || null;
  return paragraph && host.contains(paragraph) ? paragraph : null;
}

function WordResumePreview({ resume, sourceTexts, currentTexts, keywords, selected, renderRevision, onReupload, onTextChange, registerLayoutValidator }: { resume?: ResumeVersion; sourceTexts: string[]; currentTexts: string[]; keywords: Keyword[]; selected: Keyword; renderRevision: number; onReupload: () => void; onTextChange: (index: number, text: string) => void; registerLayoutValidator: (validator: ((index: number, text: string) => boolean) | null) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const editingParagraphRef = useRef<HTMLElement | null>(null);
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "error">(resume?.docxBase64 ? "loading" : "error");
  const [pageCount, setPageCount] = useState(0);
  const [overflowCount, setOverflowCount] = useState(0);

  useEffect(() => {
    registerLayoutValidator((index, text) => {
      const paragraph = hostRef.current?.querySelector<HTMLElement>(`p[data-resume-index="${index}"]`);
      if (!paragraph) return text.length <= (currentTexts[index]?.length || text.length);
      const clone = paragraph.cloneNode(true) as HTMLElement;
      replaceParagraphText(clone, text);
      clone.removeAttribute("data-resume-index");
      clone.classList.remove("line-over");
      Object.assign(clone.style, { position: "absolute", visibility: "hidden", pointerEvents: "none", left: "0", top: "0", width: `${paragraph.getBoundingClientRect().width}px`, height: "auto" });
      paragraph.parentElement?.appendChild(clone);
      const fits = clone.getBoundingClientRect().height <= Number(paragraph.dataset.originalHeight || paragraph.getBoundingClientRect().height) + 1;
      clone.remove();
      return fits;
    });
    return () => registerLayoutValidator(null);
  }, [currentTexts, previewState, registerLayoutValidator]);

  useEffect(() => {
    const styleId = "resume-custom-highlight-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = "::highlight(resume-green){background-color:#bdebd9;color:inherit}::highlight(resume-yellow){background-color:#ffe7a0;color:inherit}::highlight(resume-ignored){background-color:#e2e5e9;color:#616b79}::highlight(resume-selected){text-decoration:underline 2px #315dd8;text-underline-offset:3px}";
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!resume?.docxBase64 || !hostRef.current || !styleRef.current) return;
    const host = hostRef.current;
    const styles = styleRef.current;
    let cancelled = false;
    setPreviewState("loading");
    host.replaceChildren();
    styles.replaceChildren();
    void import("docx-preview").then(async ({ renderAsync }) => {
      await renderAsync(base64ToArrayBuffer(resume.docxBase64!), host, styles, {
        inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false,
        breakPages: true, renderHeaders: true, renderFooters: true, useBase64URL: true,
      });
      if (cancelled) return;
      host.querySelectorAll<HTMLElement>("section.docx").forEach((page) => { page.contentEditable = "true"; page.spellcheck = false; });
      setPageCount(host.querySelectorAll("section.docx").length);
      setPreviewState("ready");
    }).catch(() => { if (!cancelled) setPreviewState("error"); });
    return () => { cancelled = true; };
  }, [renderRevision, resume?.docxBase64]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !resume?.docxBase64) return;
    const highlightNames = ["resume-green", "resume-yellow", "resume-ignored", "resume-selected"];
    const registry = (CSS as unknown as { highlights?: { delete: (name: string) => void; set: (name: string, value: unknown) => void } }).highlights;
    highlightNames.forEach((name) => registry?.delete(name));
    sourceTexts.forEach((source, index) => {
      const replacement = currentTexts[index];
      if (!replacement) return;
      const tagged = host.querySelector<HTMLElement>(`p[data-resume-index="${index}"]`);
      const paragraph = tagged || Array.from(host.querySelectorAll<HTMLElement>("p")).find((node) => (node.textContent || "").trim() === source.trim());
      if (!paragraph) return;
      paragraph.dataset.resumeIndex = String(index);
      if (!paragraph.dataset.originalHeight) paragraph.dataset.originalHeight = String(paragraph.getBoundingClientRect().height);
      if ((paragraph.textContent || "").trim() !== replacement.trim()) replaceParagraphText(paragraph, replacement);
    });
    const ranges: Record<"green" | "yellow" | "ignored" | "selected", Range[]> = { green: [], yellow: [], ignored: [], selected: [] };
    const paragraphs = Array.from(host.querySelectorAll<HTMLElement>("p"));
    const createRange = (paragraph: HTMLElement, term: string) => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) nodes.push(node as Text);
      const value = nodes.map((item) => item.nodeValue || "").join("");
      const start = value.toLowerCase().indexOf(term.toLowerCase());
      if (start < 0) return null;
      const end = start + term.length;
      let offset = 0;
      let startNode: Text | null = null;
      let endNode: Text | null = null;
      let startOffset = 0;
      let endOffset = 0;
      for (const textNode of nodes) {
        const length = (textNode.nodeValue || "").length;
        if (!startNode && start >= offset && start <= offset + length) { startNode = textNode; startOffset = start - offset; }
        if (endNode === null && end >= offset && end <= offset + length) { endNode = textNode; endOffset = end - offset; break; }
        offset += length;
      }
      if (!startNode || !endNode) return null;
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    };
    keywords.forEach((keyword) => {
      if (!keyword.resumeMatch || keyword.status === "red") return;
      const paragraph = paragraphs.find((item) => (item.textContent || "").toLowerCase().includes(keyword.resumeMatch!.toLowerCase()));
      if (!paragraph) return;
      const range = createRange(paragraph, keyword.resumeMatch);
      if (!range) return;
      ranges[keyword.status === "ignored" ? "ignored" : keyword.status].push(range);
      if (keyword.id === selected.id) ranges.selected.push(range.cloneRange());
    });
    const HighlightCtor = (window as unknown as { Highlight?: new (...items: Range[]) => unknown }).Highlight;
    if (registry && HighlightCtor) {
      (["green", "yellow", "ignored", "selected"] as const).forEach((status) => {
        if (ranges[status].length) registry.set(`resume-${status}`, new HighlightCtor(...ranges[status]));
      });
    }
    const frame = window.requestAnimationFrame(() => {
      host.querySelectorAll<HTMLElement>("p[data-original-height]").forEach((paragraph) => paragraph.classList.toggle("line-over", paragraph.getBoundingClientRect().height > Number(paragraph.dataset.originalHeight) + 1));
      setOverflowCount(host.querySelectorAll("p.line-over").length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentTexts, keywords, previewState, resume?.docxBase64, selected.id, sourceTexts]);

  if (!resume?.docxBase64 || previewState === "error") return <div className="legacy-preview-shell"><div className="resume-migration-notice"><FileText /><span><b>当前版本只保存了文本</b><small>先显示可编辑内容；重新上传原文件可恢复完整 Word 排版。</small></span><button onClick={onReupload}>重新上传原文件</button></div><article className="legacy-resume-page" contentEditable suppressContentEditableWarning onInputCapture={(event) => { const paragraph = closestResumeParagraph(window.getSelection()?.anchorNode || event.target as Node, event.currentTarget); const index = Number(paragraph?.dataset.resumeIndex); if (paragraph && Number.isInteger(index)) onTextChange(index, paragraph.textContent || ""); }}>{currentTexts.map((text, index) => {
    const matches = keywords.filter((item) => item.resumeMatch && item.status !== "red" && text.toLowerCase().includes(item.resumeMatch.toLowerCase())).sort((a, b) => (b.resumeMatch?.length || 0) - (a.resumeMatch?.length || 0));
    if (!matches.length) return <p key={index} data-resume-index={index} className={/^([A-Z][A-Z &,-]{3,}|EDUCATION|EXPERIENCE|ADDITIONAL INFORMATION)$/.test(text) ? "legacy-heading" : /^[•●]/.test(text) ? "legacy-bullet" : ""}>{text}</p>;
    const pattern = new RegExp(`(${matches.map((item) => item.resumeMatch!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return <p key={index} data-resume-index={index}>{text.split(pattern).map((part, partIndex) => {
      const match = matches.find((item) => item.resumeMatch?.toLowerCase() === part.toLowerCase());
      return match ? <mark key={partIndex} className={`resume-keyword-highlight ${match.status} ${match.id === selected.id ? "selected" : ""}`}>{part}</mark> : <span key={partIndex}>{part}</span>;
    })}</p>;
  })}</article></div>;
  return <div className="docx-preview-shell">{previewState === "ready" && <div className={`docx-page-status ${pageCount === 1 && overflowCount === 0 ? "ok" : "over"}`}>{overflowCount > 0 ? `${overflowCount} 条内容超过原行数` : pageCount === 1 ? "Word 页面：1 页" : `检测到 ${pageCount} 页，请缩短内容`}</div>}<div ref={styleRef} /><div ref={hostRef} className="docx-preview-host" onBeforeInputCapture={(event) => { const host = hostRef.current; if (!host) return; editingParagraphRef.current = closestResumeParagraph(window.getSelection()?.anchorNode || event.target as Node, host); }} onInputCapture={(event) => { const host = hostRef.current; if (!host) return; const paragraph = editingParagraphRef.current || closestResumeParagraph(window.getSelection()?.anchorNode || event.target as Node, host); editingParagraphRef.current = null; const index = Number(paragraph?.dataset.resumeIndex); if (!paragraph || !Number.isInteger(index)) return; onTextChange(index, paragraph.textContent || ""); window.requestAnimationFrame(() => { paragraph.classList.toggle("line-over", paragraph.getBoundingClientRect().height > Number(paragraph.dataset.originalHeight) + 1); setOverflowCount(host.querySelectorAll("p.line-over").length || 0); }); }} /></div>;
}

function BulletContextPanel({ texts, target, onTargetChange }: { texts: string[]; target: number; onTargetChange: (index: number) => void }) {
  const candidates = texts.map((text, index) => ({ text, index })).filter(({ text }) => isResumeBullet(text));
  return <aside className="resume-context-panel"><div><b>工作经历 Bullet</b><span>选择写入位置</span></div>{candidates.map(({ text, index }) => <button key={index} className={target === index ? "active" : ""} onClick={() => onTargetChange(index)}><span>{index + 1}</span><p>{text}</p><small>{target === index ? "当前目标" : "选择此条"}</small></button>)}</aside>;
}

function PlacementToggle({ placement, original, onChange }: { placement: "augment" | "replace"; original: string; onChange: (placement: "augment" | "replace", draft: string) => void }) {
  return <div className="placement-toggle"><span>写入方式</span><button className={placement === "augment" ? "active" : ""} onClick={() => onChange("augment", "")}>补充原有内容</button><button className={placement === "replace" ? "active" : ""} onClick={() => onChange("replace", original)}>替换整条 Bullet</button></div>;
}

function KeywordMark({ keyword, selected, onClick, sourceText }: { keyword: Keyword; selected: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void; sourceText?: string }) {
  const sourceLabel = keyword.source === "base" ? "基础词表" : keyword.source === "manual" ? "手动添加" : keyword.source === "llm" ? "AI 补充" : "来源待更新";
  return <button type="button" data-keyword-id={keyword.id} onClick={onClick} className={`keyword keyword-${keyword.status} ${selected ? "is-selected" : ""}`} title={`${keyword.label} · ${statusLabel[keyword.status]} · ${sourceLabel}`}>{sourceText || keyword.label}</button>;
}

function keywordSourcePattern(label: string) {
  return surfacePattern(label, true);
}

function DiffText({ before, after, side }: { before: string; after: string; side: "before" | "after" }) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const text = side === "before" ? before : after;
  const changedEnd = text.length - end;
  return <>{text.slice(0, start)}<mark className={side === "before" ? "removed" : "added"}>{text.slice(start, changedEnd)}</mark>{end ? text.slice(changedEnd) : ""}</>;
}

function LibraryPage({ view, onNewProject, onOpenProject, onDeleteProject, projects, onUpload, resumes, onUseResume, onRenameResume, onDeleteResume }: { view: Exclude<ViewName, "workspace">; onNewProject: () => void; onOpenProject: (project: ApplicationProject) => void; onDeleteProject: (id: string) => void; projects: ApplicationProject[]; onUpload: () => void; resumes: ResumeVersion[]; onUseResume: (id: string) => void; onRenameResume: (id: string, name: string) => void; onDeleteResume: (id: string) => void }) {
  const [editingId, setEditingId] = useState("");
  const [draftName, setDraftName] = useState("");
  const content = {
    applications: { eyebrow: "工作台", title: "申请项目", description: "每个职位会保存为独立项目。" },
    resumes: { eyebrow: "资料库", title: "基础简历", description: "上传的原始版本只读保存，项目修改不会覆盖它。" },
    favorites: { eyebrow: "资料库", title: "素材收藏", description: "采用过的高质量经历可以保存在这里。" },
  }[view];
  return <section className="library-page">
    <header className="library-header"><div><span>{content.eyebrow}</span><h1>{content.title}</h1><p>{content.description}</p></div>{view === "applications" ? <Button onClick={onNewProject}><Plus />新建申请项目</Button> : view === "resumes" ? <Button onClick={onUpload}><Upload />上传 Word 简历</Button> : null}</header>
    {view === "applications" && projects.length > 0 && <div className="project-grid">{projects.map((project) => {
      const coverage = projectCoverage(project);
      return <article key={project.id} className="project-card" role="button" tabIndex={0} onClick={() => onOpenProject(project)} onKeyDown={(event) => { if (event.key === "Enter") onOpenProject(project); }}><div><span className="company-logo">{project.companyName.charAt(0) || "J"}</span><span className="card-actions"><span className="project-status review">进行中</span><button aria-label="删除申请项目" onClick={(event) => { event.stopPropagation(); onDeleteProject(project.id); }}><Trash2 />删除</button></span></div><h3>{project.name}</h3><p>{project.jobTitle || project.companyName}</p><div className="coverage-row"><span>关键词覆盖</span><b>{coverage}%</b></div><div className="coverage-bar"><i style={{ width: `${coverage}%` }} /></div><footer><span><Cloud />本地保存</span><span>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(project.updatedAt))}</span></footer></article>;
    })}</div>}
    {view === "resumes" && <button className="upload-zone" onClick={onUpload}><span><Upload /></span><b>{resumes.length ? "继续上传另一份 Word 简历" : "上传第一份 Word 简历"}</b><p>支持 .docx；每次上传都会新增一个独立基础版本</p></button>}
    {resumes.length > 0 && view === "resumes" && <div className="resume-library">{resumes.map((resume) => <article key={resume.id}><div className="file-icon">DOC</div><div className="resume-card-copy">{editingId === resume.id ? <div className="rename-row"><input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draftName.trim()) { onRenameResume(resume.id, draftName.trim()); setEditingId(""); } if (event.key === "Escape") setEditingId(""); }} /><button onClick={() => { if (draftName.trim()) onRenameResume(resume.id, draftName.trim()); setEditingId(""); }}>保存</button><button onClick={() => setEditingId("")}>取消</button></div> : <div className="resume-name-row"><h3>{resume.name}</h3><button onClick={() => { setEditingId(resume.id); setDraftName(resume.name); }}>重命名</button></div>}<p className="original-file">原文件：{resume.fileName}</p><span>{resume.uploadedAt}</span></div><div className="resume-card-actions"><button onClick={() => onUseResume(resume.id)}>用于新申请 <ArrowRight /></button><button className="danger" onClick={() => onDeleteResume(resume.id)}><Trash2 />删除</button></div></article>)}</div>}
    {((view === "applications" && projects.length === 0) || view === "favorites") && <div className="blank-library"><div className="blank-icon">{view === "applications" ? <FolderKanban /> : <Bookmark />}</div><h2>{view === "applications" ? "还没有申请项目" : "还没有收藏素材"}</h2><p>{view === "applications" ? "上传基础简历并添加真实 JD 后，第一个项目会显示在这里。" : "你在修改简历时收藏的 Bullet 会自动出现在这里。"}</p>{view === "applications" && <Button onClick={onNewProject}><Plus />创建第一个项目</Button>}</div>}
  </section>;
}

function ProjectSetup({ resumes, activeResumeId, onSelectResume, jdUrl, setJdUrl, jdText, setJdText, onUpload, onCreate, loading }: { resumes: ResumeVersion[]; activeResumeId: string; onSelectResume: (id: string) => void; jdUrl: string; setJdUrl: (value: string) => void; jdText: string; setJdText: (value: string) => void; onUpload: () => void; onCreate: () => void; loading: boolean }) {
  return <section className="project-setup"><div className="setup-card"><span className="setup-kicker">新建申请项目</span><h1>用真实简历匹配真实 JD</h1><p>先选择基础简历，再粘贴职位链接。若网站限制自动读取，可以把 JD 正文粘贴到备用文本框。</p><div className="setup-step resume-choice-step"><span>1</span><div><b>基础简历</b><div className="resume-choice-controls"><label><small>选择已有简历</small>{resumes.length ? <select value={activeResumeId} onChange={(event) => onSelectResume(event.target.value)}>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name} · {resume.fileName}</option>)}</select> : <p>尚未上传 Word 简历</p>}</label><span className="choice-divider">或</span><div className="upload-new-option"><small>使用另一份简历</small><Button variant="outline" onClick={onUpload}><Upload />上传新简历</Button></div></div></div></div><div className="setup-step vertical"><span>2</span><div><b>职位描述</b><input value={jdUrl} onChange={(event) => setJdUrl(event.target.value)} placeholder="粘贴职位官网链接，例如 https://company.com/jobs/..." /><textarea value={jdText} onChange={(event) => setJdText(event.target.value)} placeholder="可选：如果网页无法读取，请把 JD 正文粘贴到这里" /></div></div><Button className="setup-submit" onClick={onCreate} disabled={loading || !activeResumeId || (!jdUrl.trim() && !jdText.trim())}>{loading ? "正在读取并建立项目…" : "读取 JD 并开始匹配"}<ArrowRight /></Button></div></section>;
}

export default function Home() {
  const [view, setView] = useState<ViewName>("applications");
  const [keywords, setKeywords] = useState(initialKeywords);
  const [selectedId, setSelectedId] = useState("");
  const [keywordReviewStarted, setKeywordReviewStarted] = useState(false);
  const [keywordCardOpen, setKeywordCardOpen] = useState(false);
  const [redDialogOpen, setRedDialogOpen] = useState(false);
  const [resumeTexts, setResumeTexts] = useState(() => resumeBullets.map((b) => b.text));
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [manualTerms, setManualTerms] = useState<string[]>([]);
  const [currentLexicon, setCurrentLexicon] = useState<CurrentLexicon>(() => createCurrentLexicon());
  const [lexiconStoreReady, setLexiconStoreReady] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ left: 520, top: 210 });
  const [redMode, setRedMode] = useState<"choices" | "manual">("choices");
  const [redTarget, setRedTarget] = useState(0);
  const [manualDraft, setManualDraft] = useState("");
  const [generatedSuggestions, setGeneratedSuggestions] = useState<RewriteSuggestion[] | null>(null);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewriteQuestion, setRewriteQuestion] = useState("");
  const [redPlacement, setRedPlacement] = useState<"augment" | "replace">("augment");
  const [finalCheckBusy, setFinalCheckBusy] = useState(false);
  const [finalCheckPassed, setFinalCheckPassed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const layoutValidatorRef = useRef<((index: number, text: string) => boolean) | null>(null);
  const undoStackRef = useRef<Array<{ texts: string[]; keywords: Keyword[] }>>([]);
  const redoStackRef = useRef<Array<{ texts: string[]; keywords: Keyword[] }>>([]);
  const lastManualEditRef = useRef(0);
  const [resumeRenderRevision, setResumeRenderRevision] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [activeResumeId, setActiveResumeId] = useState("");
  const [resumeStoreReady, setResumeStoreReady] = useState(false);
  const [projects, setProjects] = useState<ApplicationProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectStoreReady, setProjectStoreReady] = useState(false);
  const [jdUrl, setJdUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [projectReady, setProjectReady] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<ProviderId>("openai");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [aiConnecting, setAiConnecting] = useState(false);
  const [aiConnected, setAiConnected] = useState(false);
  const [connectedProviders, setConnectedProviders] = useState<ProviderId[]>([]);
  const activeResume = resumes.find((resume) => resume.id === activeResumeId);
  const resumeName = activeResume?.name || "";
  const activeProviderInfo = providerOptions.find((item) => item.id === aiProvider) || providerOptions[0];
  const registerLayoutValidator = useCallback((validator: ((index: number, text: string) => boolean) | null) => { layoutValidatorRef.current = validator; }, []);

  useEffect(() => {
    // Browser persistence is loaded once after hydration.
    const saved = window.localStorage.getItem("resume-match-favorites-v2");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setFavoriteIds(JSON.parse(saved));
    const savedResumes = window.localStorage.getItem("resume-match-base-resumes-v1");
    if (savedResumes) {
      const parsed = JSON.parse(savedResumes) as ResumeVersion[];
      setResumes(parsed);
      if (parsed[0]) {
        setActiveResumeId(parsed[0].id);
        setResumeTexts([...parsed[0].texts]);
      }
    }
    const savedProjects = window.localStorage.getItem("resume-match-projects-v1");
    if (savedProjects) {
      const parsed = JSON.parse(savedProjects) as ApplicationProject[];
      if (Array.isArray(parsed)) setProjects(parsed.map((project) => ({ ...project, keywords: normalizeStoredKeywords(project.keywords || []) })));
    }
    setCurrentLexicon(loadCurrentLexicon(window.localStorage));
    const savedProvider = (window.localStorage.getItem("resume-match-ai-provider-v1") || "openai") as ProviderId;
    const normalizedProvider = providerOptions.some((item) => item.id === savedProvider) ? savedProvider : "openai";
    const sessionKey = window.sessionStorage.getItem(`resume-match-ai-key-${normalizedProvider}-v1`) || window.sessionStorage.getItem("resume-match-openai-key-v1") || "";
    const savedModel = window.localStorage.getItem(`resume-match-ai-model-${normalizedProvider}-v1`) || window.localStorage.getItem("resume-match-openai-model-v1") || "";
    const connected = providerOptions.filter((item) => window.sessionStorage.getItem(`resume-match-ai-key-${item.id}-v1`) && window.localStorage.getItem(`resume-match-ai-model-${item.id}-v1`)).map((item) => item.id);
    if (sessionKey && savedModel && !connected.includes(normalizedProvider)) connected.push(normalizedProvider);
    setAiProvider(normalizedProvider);
    setCustomBaseUrl(window.localStorage.getItem("resume-match-ai-custom-base-url-v1") || "");
    setApiKey(sessionKey);
    setAiModel(savedModel);
    setAiConnected(Boolean(sessionKey && savedModel));
    setConnectedProviders(connected);
    setResumeStoreReady(true);
    setProjectStoreReady(true);
    setLexiconStoreReady(true);
  }, []);

  useEffect(() => {
    if (!resumeStoreReady) return;
    try {
      window.localStorage.setItem("resume-match-base-resumes-v1", JSON.stringify(resumes));
    } catch {
      showNotice("浏览器存储空间不足；这份简历本次仍可使用，但请勿关闭页面");
    }
  }, [resumes, resumeStoreReady]);

  useEffect(() => {
    if (!projectStoreReady) return;
    try {
      window.localStorage.setItem("resume-match-projects-v1", JSON.stringify(projects));
    } catch {
      showNotice("浏览器存储空间不足；项目本次仍可使用，但请勿关闭页面");
    }
  }, [projectStoreReady, projects]);

  useEffect(() => {
    if (!lexiconStoreReady) return;
    saveCurrentLexicon(window.localStorage, currentLexicon);
  }, [currentLexicon, lexiconStoreReady]);

  useEffect(() => {
    if (!projectStoreReady || !projectReady || !activeProjectId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the active editor into the persisted project list
    setProjects((items) => items.map((project) => project.id === activeProjectId ? {
      ...project,
      name: projectName,
      resumeId: activeResumeId,
      jdUrl,
      jdText,
      companyName,
      jobTitle,
      keywords,
      resumeTexts,
      manualTerms,
      updatedAt: new Date().toISOString(),
    } : project));
  }, [activeProjectId, activeResumeId, companyName, jdText, jdUrl, jobTitle, keywords, manualTerms, projectName, projectReady, projectStoreReady, resumeTexts]);

  useEffect(() => {
    if (!projectReady) return;
    // Local matching is cheap enough to follow editing without another model call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeywords((items) => {
      const next = rematchKeywordsLocally(items, resumeTexts, currentLexicon);
      const changed = next.some((item, index) => item.status !== items[index]?.status || item.resumeMatch !== items[index]?.resumeMatch || item.suggestion !== items[index]?.suggestion);
      return changed ? next : items;
    });
  }, [currentLexicon, projectReady, resumeTexts]);

  useEffect(() => {
    if (!projectStoreReady || !projectReady || activeProjectId || !projectName) return;
    const migratedId = `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- assign an id once when migrating an older in-progress project
    setActiveProjectId(migratedId);
    setProjects((items) => [{
      id: migratedId,
      name: projectName,
      resumeId: activeResumeId,
      jdUrl,
      jdText,
      companyName,
      jobTitle,
      keywords,
      resumeTexts,
      manualTerms,
      updatedAt: new Date().toISOString(),
    }, ...items]);
  }, [activeProjectId, activeResumeId, companyName, jdText, jdUrl, jobTitle, keywords, manualTerms, projectName, projectReady, projectStoreReady, resumeTexts]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: "read_keyword_match_summary",
        title: "读取关键词匹配概况",
        description: "读取当前简历与职位描述的关键词匹配状态，不修改任何内容。",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({ keywords: keywords.map(({ id, label, status }) => ({ id, label, status })) }),
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: "ignore_resume_keyword",
        title: "忽略简历关键词",
        description: "按关键词 ID 将当前匹配项标记为已忽略。",
        inputSchema: { type: "object", properties: { keywordId: { type: "string" } }, required: ["keywordId"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input) => {
          const keywordId = typeof input === "object" && input && "keywordId" in input ? String((input as { keywordId: unknown }).keywordId) : "";
          if (!keywords.some((item) => item.id === keywordId)) throw new Error("未知的关键词 ID");
          setKeywords((items) => items.map((item) => item.id === keywordId ? { ...item, status: "ignored" } : item));
          return { keywordId, status: "ignored" };
        },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [keywords]);

  const selected = keywords.find((item) => item.id === selectedId) ?? keywords[0] ?? { id: "", label: "", status: "green" as const };
  const currentSuggestions = generatedSuggestions ?? [];
  const counts = useMemo(() => ({
    green: keywords.filter((k) => k.status === "green").length,
    yellow: keywords.filter((k) => k.status === "yellow").length,
    red: keywords.filter((k) => k.status === "red").length,
    ignored: keywords.filter((k) => k.status === "ignored").length,
  }), [keywords]);
  const score = keywords.length ? Math.round((counts.green / keywords.length) * 100) : 0;
  const selectedIndex = keywords.findIndex((item) => item.id === selected.id);
  const unresolvedElsewhere = keywords.some((item, index) => index !== selectedIndex && (item.status === "yellow" || item.status === "red"));
  const nextActionLabel = !keywordReviewStarted ? "查看第一个关键词" : selected.status === "red" ? "处理当前缺失项" : selectedIndex === keywords.length - 1 ? unresolvedElsewhere ? "查看未处理项" : "开始最终检查" : selected.status === "yellow" ? "应用并继续" : "下一个关键词";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && event.key === "Enter" && !redDialogOpen) {
        event.preventDefault();
        advanceToNext();
        return;
      }
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const insideResume = Boolean(target?.closest(".docx-preview-host, .legacy-resume-page"));
      const formField = Boolean(target?.closest("input, textarea, select"));
      if (!commandKey || !projectReady || redDialogOpen || (formField && !insideResume)) return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoChange();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redoChange();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  function chooseKeyword(keyword: Keyword, event: MouseEvent<HTMLButtonElement>) {
    setKeywordReviewStarted(true);
    setKeywordCardOpen(keyword.status !== "red");
    setSelectedId(keyword.id);
    setPopupPosition({ left: Math.min(event.clientX + 14, window.innerWidth - 360), top: Math.min(event.clientY + 16, window.innerHeight - 190) });
    if (keyword.status === "red") {
      loadRewriteSuggestions(keyword);
    }
  }
  function updateStatus(id: string, status: KeywordStatus) {
    setKeywords((items) => items.map((item) => item.id === id ? { ...item, status, ...(status === "ignored" ? { previousStatus: item.status === "ignored" ? item.previousStatus : item.status } : {}) } : item));
  }
  function restoreKeyword() {
    setKeywords((items) => items.map((item) => item.id === selected.id ? { ...item, status: item.previousStatus || "yellow", previousStatus: undefined } : item));
    showNotice(`已重新考虑 “${selected.label}”`);
  }
  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }
  function requireAI() {
    if (apiKey && aiModel) return true;
    setAiSettingsOpen(true);
    showNotice("请先在 AI 设置中连接一个模型服务商并选择模型");
    return false;
  }
  function switchProvider(provider: ProviderId) {
    const key = window.sessionStorage.getItem(`resume-match-ai-key-${provider}-v1`) || "";
    const model = window.localStorage.getItem(`resume-match-ai-model-${provider}-v1`) || "";
    setAiProvider(provider);
    setApiKey(key);
    setAiModel(model);
    setAvailableModels([]);
    setAiConnected(Boolean(key && model));
    window.localStorage.setItem("resume-match-ai-provider-v1", provider);
  }
  async function connectAI() {
    if (!apiKey.trim()) return showNotice(`请先填写 ${providerOptions.find((item) => item.id === aiProvider)?.shortLabel} API Key`);
    setAiConnecting(true);
    try {
      const response = await fetch("/api/llm/models", { method: "POST", headers: { "content-type": "application/json", "x-llm-api-key": apiKey.trim() }, body: JSON.stringify({ provider: aiProvider, customBaseUrl }) });
      const data = await response.json() as { models?: string[]; recommendedModel?: string; error?: string };
      if (!response.ok || !data.models?.length) throw new Error(data.error || "没有读取到可用模型");
      const unavailableGeminiDefault = aiProvider === "gemini" && /^gemini-2\.5-(?:flash|flash-lite|pro)$/.test(aiModel);
      const nextModel = aiModel && data.models.includes(aiModel) && !unavailableGeminiDefault ? aiModel : data.recommendedModel || data.models[0];
      setAvailableModels(data.models);
      setAiModel(nextModel);
      setAiConnected(true);
      setConnectedProviders((items) => items.includes(aiProvider) ? items : [...items, aiProvider]);
      window.sessionStorage.setItem(`resume-match-ai-key-${aiProvider}-v1`, apiKey.trim());
      window.localStorage.setItem(`resume-match-ai-model-${aiProvider}-v1`, nextModel);
      window.localStorage.setItem("resume-match-ai-provider-v1", aiProvider);
      showNotice(`${providerOptions.find((item) => item.id === aiProvider)?.shortLabel} 已连接，当前模型：${nextModel}`);
    } catch (error) {
      setAiConnected(false);
      showNotice(error instanceof Error ? error.message : "模型服务连接失败");
    } finally {
      setAiConnecting(false);
    }
  }
  function clearAIKey() {
    window.sessionStorage.removeItem(`resume-match-ai-key-${aiProvider}-v1`);
    setApiKey("");
    setAvailableModels([]);
    setAiConnected(false);
    setConnectedProviders((items) => items.filter((item) => item !== aiProvider));
    showNotice(`已清除 ${providerOptions.find((item) => item.id === aiProvider)?.shortLabel} 的 API Key`);
  }
  async function analyzeKeywordsWithAI(content: string, focusTerms: string[] = [], lockedKeywords: string[] = [], lines: string[] = resumeTexts, knownKeywords: Array<{ label: string; conceptId?: string }> = []) {
    if (!requireAI()) throw new Error("请先配置 AI");
    const response = await fetch("/api/llm/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-llm-api-key": apiKey },
      body: JSON.stringify({
        provider: aiProvider, customBaseUrl, model: aiModel, jd: content, resumeLines: lines, focusTerms, lockedKeywords, knownKeywords,
        conceptCatalog: currentLexicon.concepts.map((concept) => ({ id: concept.id, label: concept.label, terms: concept.terms.map((term) => term.value) })),
      }),
    });
    const data = await response.json() as { keywords?: Array<Omit<Keyword, "id" | "previousStatus" | "resumeMatch" | "suggestion" | "yellowEdit" | "rewrites"> & { conceptLabel?: string; aliases?: string[]; resumeMatch?: string | null; suggestion?: string | null; yellowEdit?: YellowEdit | null; rewrites?: Array<{ targetIndex: number; title: string; text: string; rationale: string; originalChars?: number; newChars?: number; maxChars?: number }> }>; error?: string };
    if (!response.ok || !data.keywords?.length) throw new Error(data.error || "模型没有返回关键词结果");
    return data.keywords.map((item, index): Keyword => ({
      id: `ai-${Date.now()}-${index}`,
      conceptId: item.conceptId,
      label: item.label,
      status: item.status,
      resumeMatch: item.resumeMatch || undefined,
      suggestion: item.suggestion || undefined,
      guidance: item.guidance || undefined,
      category: item.category,
      yellowEdit: item.yellowEdit || undefined,
      evidence: item.evidence,
      importance: item.importance,
      rewrites: (item.rewrites || []).map((rewrite) => ({ ...rewrite, target: `第${rewrite.targetIndex + 1}条经历` })),
      needsMoreEvidence: item.needsMoreEvidence,
      question: item.question || undefined,
      aliases: item.aliases || [],
    }));
  }
  async function requestRewrite(keyword: Keyword, candidates: Array<{ text: string; index: number }>, material = "", placement: "augment" | "replace" = "augment") {
    if (!requireAI()) return;
    setRewriteBusy(true);
    setRewriteQuestion("");
    setGeneratedSuggestions(null);
    try {
      const response = await fetch("/api/llm/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json", "x-llm-api-key": apiKey },
        body: JSON.stringify({ provider: aiProvider, customBaseUrl, model: aiModel, keyword: keyword.label, jd: jdText, candidates, material, placement }),
      });
      const data = await response.json() as { suggestions?: Array<{ targetIndex: number; title: string; text: string; rationale: string; originalChars?: number; newChars?: number; maxChars?: number }>; needsMoreEvidence?: boolean; question?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "模型改写失败");
      const suggestions = (data.suggestions || []).map((item) => ({ ...item, target: `第${item.targetIndex + 1}条经历` }));
      setGeneratedSuggestions(suggestions);
      setKeywords((items) => items.map((item) => item.id === keyword.id ? { ...item, rewrites: suggestions, needsMoreEvidence: Boolean(data.needsMoreEvidence) || suggestions.length === 0, question: data.question || undefined } : item));
      setRewriteQuestion(data.question || (data.needsMoreEvidence ? "现有简历没有足够证据支持这项要求，请补充一段真实经历。" : ""));
      setRedMode("choices");
      if (suggestions.length) showNotice(`模型已生成 ${suggestions.length} 条针对性建议`);
    } catch (error) {
      setGeneratedSuggestions([]);
      setRewriteQuestion(error instanceof Error ? error.message : "模型改写失败，请稍后重试");
      showNotice(error instanceof Error ? error.message : "模型改写失败，请稍后重试");
    } finally {
      setRewriteBusy(false);
    }
  }
  function loadRewriteSuggestions(keyword: Keyword) {
    const candidates = relevantResumeLines(resumeTexts, keyword.label).map(({ text, index }) => ({ text, index }));
    setRedTarget(candidates[0]?.index ?? 0);
    setGeneratedSuggestions(keyword.rewrites || []);
    setRewriteQuestion(keyword.question || (!keyword.rewrites ? "这个项目还没有预生成改写方案，请点击“深度扫描”更新分析。" : keyword.needsMoreEvidence ? "现有简历没有足够证据支持这项要求，请补充真实素材。" : ""));
    setRedMode("choices");
    setRedDialogOpen(true);
    if (candidates.length && !keyword.rewrites?.length) {
      void requestRewrite(keyword, candidates);
    }
    if (!candidates.length && !keyword.rewrites?.length) {
      setGeneratedSuggestions([]);
      setRewriteQuestion("没有找到适合改写的工作经历 Bullet。请先选择一条经历，或补充真实素材。");
    }
  }
  async function handleResumeUpload(file?: File) {
    if (!file) return;
    try {
      const mammoth = await import("mammoth");
      const buffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      const lines = result.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const texts = lines.length ? lines : [result.value.trim()];
      const id = `resume-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const version: ResumeVersion = { id, name: file.name.replace(/\.docx?$/i, ""), fileName: file.name, texts, docxBase64: arrayBufferToBase64(buffer), uploadedAt: new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date()) };
      setResumes((items) => [...items, version]);
      setActiveResumeId(id);
      setResumeTexts(texts);
      showNotice(`已新增基础简历“${version.name}”`);
    } catch {
      showNotice("暂时无法读取这份文件，请使用 .docx 格式");
    }
  }
  function selectResume(id: string) {
    const resume = resumes.find((item) => item.id === id);
    if (!resume) return;
    setActiveResumeId(id);
    setResumeTexts([...resume.texts]);
    setProjectReady(false);
  }
  function startNewProject(resumeId = activeResumeId) {
    clearEditHistory();
    const resume = resumes.find((item) => item.id === resumeId) ?? resumes[0];
    const nextResumeId = resume?.id || "";
    setActiveProjectId("");
    setProjectReady(false);
    setActiveResumeId(nextResumeId);
    setResumeTexts(resume ? [...resume.texts] : []);
    setJdUrl("");
    setJdText("");
    setCompanyName("");
    setJobTitle("");
    setProjectName("");
    setProjectNameDraft("");
    setKeywords([]);
    setSelectedId("");
    setKeywordReviewStarted(false);
    setKeywordCardOpen(false);
    setManualTerms([]);
    setGeneratedSuggestions(null);
    setRedDialogOpen(false);
    setFinalCheckPassed(false);
    setView("workspace");
  }
  function openProject(project: ApplicationProject) {
    clearEditHistory();
    setActiveProjectId(project.id);
    setActiveResumeId(project.resumeId);
    setResumeTexts([...project.resumeTexts]);
    setJdUrl(project.jdUrl);
    setJdText(project.jdText);
    setCompanyName(project.companyName);
    setJobTitle(project.jobTitle);
    setProjectName(project.name);
    setProjectNameDraft(project.name);
    const normalizedKeywords = normalizeStoredKeywords(project.keywords).map((keyword) => ({ ...keyword }));
    setKeywords(normalizedKeywords);
    setSelectedId(normalizedKeywords[0]?.id || "");
    setKeywordReviewStarted(false);
    setKeywordCardOpen(false);
    setManualTerms([...project.manualTerms]);
    setGeneratedSuggestions(null);
    setRedDialogOpen(false);
    setFinalCheckPassed(false);
    setProjectReady(true);
    setView("workspace");
  }
  function useResume(id: string) {
    startNewProject(id);
  }
  function renameResume(id: string, name: string) {
    setResumes((items) => items.map((item) => item.id === id ? { ...item, name } : item));
    showNotice("基础简历名称已更新");
  }
  function removeKeyword(id: string) {
    setKeywords((items) => items.filter((item) => item.id !== id));
    setKeywordCardOpen(false);
    setRedDialogOpen(false);
    showNotice("已移除该词；职位描述中不再高亮");
  }
  function approveKeyword(id: string) {
    setKeywords((items) => items.map((item) => item.id === id ? { ...item, status: "green", suggestion: undefined, yellowEdit: undefined, userApproved: true } : item));
    setKeywordCardOpen(false);
    setRedDialogOpen(false);
    showNotice("已按你的判断标记为无需调整");
  }
  function deleteProject(id: string) {
    const project = projects.find((item) => item.id === id);
    if (!project || !window.confirm(`确定删除申请项目“${project.name}”吗？此操作无法撤销。`)) return;
    setProjects((items) => items.filter((item) => item.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId("");
      setProjectReady(false);
      setView("applications");
    }
    showNotice("申请项目已删除");
  }
  function deleteResume(id: string) {
    const resume = resumes.find((item) => item.id === id);
    if (!resume) return;
    const usedBy = projects.filter((project) => project.resumeId === id);
    if (usedBy.length) return showNotice(`请先删除使用这份简历的 ${usedBy.length} 个申请项目`);
    if (!window.confirm(`确定删除基础简历“${resume.name}”吗？此操作无法撤销。`)) return;
    const remaining = resumes.filter((item) => item.id !== id);
    setResumes(remaining);
    if (activeResumeId === id) {
      setActiveResumeId(remaining[0]?.id || "");
      setResumeTexts(remaining[0] ? [...remaining[0].texts] : []);
    }
    showNotice("基础简历已删除");
  }
  function rememberUndo() {
    undoStackRef.current.push({ texts: [...resumeTexts], keywords: keywords.map((item) => ({ ...item })) });
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }
  function clearEditHistory() {
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastManualEditRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
  }
  function undoChange() {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;
    redoStackRef.current.push({ texts: [...resumeTexts], keywords: keywords.map((item) => ({ ...item })) });
    setResumeTexts(snapshot.texts);
    setKeywords(snapshot.keywords);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
    lastManualEditRef.current = 0;
    showNotice("已撤销");
  }
  function redoChange() {
    const snapshot = redoStackRef.current.pop();
    if (!snapshot) return;
    undoStackRef.current.push({ texts: [...resumeTexts], keywords: keywords.map((item) => ({ ...item })) });
    setResumeTexts(snapshot.texts);
    setKeywords(snapshot.keywords);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    lastManualEditRef.current = 0;
    showNotice("已重做");
  }
  function handleResumeTextChange(index: number, text: string) {
    const now = Date.now();
    if (now - lastManualEditRef.current > 750) rememberUndo();
    lastManualEditRef.current = now;
    setResumeTexts((items) => items.map((item, itemIndex) => itemIndex === index ? text : item));
  }
  function fitsOriginalLayout(index: number, text: string) {
    const fits = layoutValidatorRef.current?.(index, text) ?? text.length <= (resumeTexts[index]?.length || text.length);
    if (!fits) showNotice("这条修改会增加 Word 实际行数，已取消应用；请先压缩措辞");
    return fits;
  }
  async function runInitialKeywordScan(content: string, lines: string[]) {
    const localMatches = scanKnownKeywords(content, lines, currentLexicon);
    const localKeywords = localMatches.map(keywordFromLocalMatch);
    const aiKeywords = await analyzeKeywordsWithAI(content, [], [], lines, localKeywords.map((keyword) => ({ label: keyword.label, conceptId: keyword.conceptId })));
    const usedAiIds = new Set<string>();
    const combined = localKeywords.map((localKeyword) => {
      let effectiveKeyword = localKeyword;
      const aiKeyword = aiKeywords.find((candidate) => {
        if (usedAiIds.has(candidate.id)) return false;
        return sameSurfaceFamily(localKeyword.label, candidate.label);
      });
      if (aiKeyword) {
        usedAiIds.add(aiKeyword.id);
        if (aiKeyword.conceptId && aiKeyword.conceptId !== localKeyword.conceptId) effectiveKeyword = { ...localKeyword, conceptId: aiKeyword.conceptId };
      }
      if (!aiKeyword || effectiveKeyword.status !== "red") return effectiveKeyword;
      return {
        ...effectiveKeyword,
        rewrites: aiKeyword.rewrites,
        needsMoreEvidence: aiKeyword.needsMoreEvidence,
        question: aiKeyword.question,
        category: aiKeyword.category,
        importance: aiKeyword.importance,
      };
    });

    for (const aiKeyword of aiKeywords.filter((candidate) => !usedAiIds.has(candidate.id))) {
      const learnedConcept = currentLexicon.concepts.find((concept) => concept.id === aiKeyword.conceptId) || { id: `session_${aiKeyword.id}`, label: aiKeyword.label, terms: [{ value: aiKeyword.label, source: "llm" as const }] };
      const localMatch = matchConceptToResume(aiKeyword.label, learnedConcept, lines);
      combined.push({
        ...aiKeyword,
        id: `ai-result-${learnedConcept.id}-${combined.length}`,
        conceptId: learnedConcept.id,
        source: "llm",
        status: localMatch.status,
        resumeMatch: localMatch.resumeMatch,
        suggestion: localMatch.suggestion,
        aliases: aiKeyword.aliases || [],
        rewrites: localMatch.status === "red" ? aiKeyword.rewrites : [],
        needsMoreEvidence: localMatch.status === "red" ? aiKeyword.needsMoreEvidence : false,
      });
    }
    return normalizeStoredKeywords(combined);
  }
  async function createProject() {
    if (!requireAI()) return;
    setProjectLoading(true);
    try {
      let content = jdText.trim();
      let extractedTitle = "";
      let extractedCompany = "";
      if (!content && jdUrl.trim()) {
        const response = await fetch("/api/extract-jd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: jdUrl.trim() }) });
        const data = await response.json() as { text?: string; title?: string; company?: string; error?: string };
        if (!response.ok || !data.text) throw new Error(data.error || "无法读取网页");
        content = data.text;
        extractedTitle = data.title?.trim() || "";
        extractedCompany = data.company?.trim() || "";
        setJdText(content);
      }
      if (!extractedTitle) extractedTitle = content.split(/\n+/).find((line) => line.trim().length > 4)?.trim().slice(0, 90) || "New Role";
      if (!extractedCompany && jdUrl.trim()) extractedCompany = new URL(jdUrl.trim()).hostname.replace(/^www\./, "").split(".")[0].replace(/^./, (letter) => letter.toUpperCase());
      if (!extractedCompany) extractedCompany = "Company";
      const generatedName = `${localDateStamp()}_${extractedCompany}_${extractedTitle}`;
      setCompanyName(extractedCompany);
      setJobTitle(extractedTitle);
      setProjectName(generatedName);
      setProjectNameDraft(generatedName);
      const nextKeywords = await runInitialKeywordScan(content, resumeTexts);
      setKeywords(nextKeywords);
      setSelectedId(nextKeywords[0]?.id || "");
      setKeywordReviewStarted(false);
      setKeywordCardOpen(false);
      const projectId = `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const project: ApplicationProject = {
        id: projectId,
        name: generatedName,
        resumeId: activeResumeId,
        jdUrl: jdUrl.trim(),
        jdText: content,
        companyName: extractedCompany,
        jobTitle: extractedTitle,
        keywords: nextKeywords,
        resumeTexts: [...resumeTexts],
        manualTerms: [],
        updatedAt: new Date().toISOString(),
      };
      setProjects((items) => [project, ...items]);
      setActiveProjectId(projectId);
      setProjectReady(true);
      showNotice(`已使用 ${activeProviderInfo.shortLabel} · ${aiModel} 完成关键词匹配`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "建立项目失败，请稍后重试");
    } finally {
      setProjectLoading(false);
    }
  }
  function applyYellow() {
    if (!selected.resumeMatch || !selected.suggestion) return;
    const targetIndex = selected.yellowEdit?.targetIndex ?? resumeTexts.findIndex((text) => text.includes(selected.resumeMatch!));
    const afterText = selected.yellowEdit?.afterText ?? resumeTexts[targetIndex]?.replace(selected.resumeMatch, selected.suggestion);
    if (targetIndex < 0 || !afterText || !fitsOriginalLayout(targetIndex, afterText)) return;
    rememberUndo();
    setResumeTexts((texts) => texts.map((text, index) => {
      if (selected.yellowEdit && index === selected.yellowEdit.targetIndex && text.trim() === selected.yellowEdit.beforeText.trim()) return selected.yellowEdit.afterText;
      return text.replace(selected.resumeMatch!, selected.suggestion!);
    }));
    setKeywords((items) => items.map((item) => item.id === selected.id ? { ...item, status: "green", resumeMatch: selected.suggestion, suggestion: undefined } : item));
    showNotice(`已应用长度受控的英文修改：${selected.yellowEdit?.newChars ?? selected.suggestion.length} 个字符`);
  }
  function applyRed(option: RewriteSuggestion) {
    if (!fitsOriginalLayout(option.targetIndex, option.text)) return;
    rememberUndo();
    setResumeTexts((texts) => texts.map((text, index) => index === option.targetIndex ? option.text : text));
    setKeywords((items) => items.map((item) => item.id === selected.id ? { ...item, status: "green", resumeMatch: selected.label } : item));
    setRedDialogOpen(false);
    showNotice(`已补入 “${selected.label}”，本地匹配已更新`);
  }
  function applyUserDraft(text: string) {
    if (!text.trim()) return showNotice("请先填写真实经历");
    const original = resumeTexts[redTarget].replace(/\.$/, "");
    const finalText = redPlacement === "augment" ? `${original}; ${text.trim().charAt(0).toLowerCase()}${text.trim().slice(1)}` : text.trim();
    if (!fitsOriginalLayout(redTarget, finalText)) return;
    rememberUndo();
    setResumeTexts((texts) => texts.map((item, index) => index === redTarget ? finalText : item));
    setKeywords((items) => items.map((item) => item.id === selected.id ? { ...item, status: finalText.toLowerCase().includes(selected.label.toLowerCase()) ? "green" : "yellow", resumeMatch: selected.label } : item));
    setRedDialogOpen(false);
    showNotice("已写入指定经历，并完成本地匹配");
  }
  function advanceToNext() {
    if (finalCheckBusy || finalCheckPassed) return;
    if (!keywordReviewStarted) {
      setKeywordReviewStarted(true);
      if (selected.status === "red") loadRewriteSuggestions(selected);
      else setKeywordCardOpen(true);
      return;
    }
    if (selected.status === "red") {
      loadRewriteSuggestions(selected);
      return;
    }
    if (selected.status === "yellow") applyYellow();
    const currentIndex = keywords.findIndex((item) => item.id === selected.id);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= keywords.length) {
      const unresolvedIndex = keywords.findIndex((item, index) => index !== currentIndex && (item.status === "yellow" || item.status === "red"));
      if (unresolvedIndex < 0) return runFinalCheck();
      nextIndex = unresolvedIndex;
      showNotice("已回到尚未处理的关键词");
    }
    const next = keywords[nextIndex];
    setSelectedId(next.id);
    setKeywordCardOpen(next.status !== "red");
    window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(`[data-keyword-id="${next.id}"]`);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      const rect = element?.getBoundingClientRect();
      if (rect) setPopupPosition({ left: Math.min(rect.right + 12, window.innerWidth - 360), top: Math.min(rect.bottom + 10, window.innerHeight - 190) });
    }, 0);
    if (next.status === "red") {
      loadRewriteSuggestions(next);
    }
  }
  function renderJdText(text: string) {
    if (!keywords.length) return text;
    const candidates = keywords.flatMap((keyword) => Array.from(text.matchAll(keywordSourcePattern(keyword.label))).map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      sourceText: match[0],
      keyword,
    }))).sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const matches = candidates.reduce<typeof candidates>((accepted, candidate) => {
      if (accepted.some((item) => candidate.start < item.end && candidate.end > item.start)) return accepted;
      accepted.push(candidate);
      return accepted;
    }, []).sort((a, b) => a.start - b.start);
    if (!matches.length) return text;
    const result: ReactNode[] = [];
    let offset = 0;
    matches.forEach((match, index) => {
      if (match.start > offset) result.push(<span key={`text-${index}`}>{text.slice(offset, match.start)}</span>);
      result.push(<KeywordMark key={`${match.keyword.id}-${match.start}`} keyword={match.keyword} sourceText={match.sourceText} selected={selectedId === match.keyword.id} onClick={(event) => chooseKeyword(match.keyword, event)} />);
      offset = match.end;
    });
    if (offset < text.length) result.push(<span key="text-end">{text.slice(offset)}</span>);
    return result;
  }
  function runFinalCheck() {
    setFinalCheckBusy(true);
    window.setTimeout(() => { setFinalCheckBusy(false); setFinalCheckPassed(true); showNotice("最终检查通过"); }, 1200);
  }
  function addManualTerm() {
    const text = window.getSelection()?.toString().trim();
    if (!text) return showNotice("请先在左侧 JD 中划选词语");
    const existingConcept = currentLexicon.concepts.find((concept) => concept.terms.some(({ value }) => sameSurfaceFamily(text, value)));
    const addition = existingConcept ? null : addTermsToCurrentLexicon(currentLexicon, { label: text, source: "manual" });
    const nextLexicon = addition?.lexicon || currentLexicon;
    const concept = existingConcept || nextLexicon.concepts.find((candidate) => candidate.id === addition?.conceptId)!;
    if (addition) setCurrentLexicon(nextLexicon);
    const match = matchConceptToResume(text, concept, resumeTexts);
    setKeywords((items) => items.some((item) => item.conceptId === concept.id || item.label.toLowerCase() === text.toLowerCase()) ? items : [...items, keywordFromLocalMatch({ conceptId: concept.id, label: text, evidence: text, ...match }, items.length)]);
    if (!manualTerms.includes(text)) setManualTerms((terms) => [...terms, text]);
    showNotice(existingConcept ? `已加入项目：${text}` : `已加入项目并写入当前词库：${text}`);
    window.getSelection()?.removeAllRanges();
  }
  function rescan() {
    setScanBusy(true);
    const nextKeywords = rematchKeywordsLocally(keywords, resumeTexts, currentLexicon);
    setKeywords(nextKeywords);
    setSelectedId(nextKeywords[0]?.id || "");
    setKeywordReviewStarted(false);
    setKeywordCardOpen(false);
    setRedDialogOpen(false);
    setManualTerms([]);
    setFinalCheckPassed(false);
    setScanBusy(false);
    showNotice(`已在本地重新匹配 ${nextKeywords.length} 个固定关键词，未调用模型`);
  }
  function resetResumeAndRescan() {
    if (!activeResume) return;
    if (!window.confirm("确定恢复到基础简历的原始内容，并重新匹配当前固定关键词吗？当前项目中的简历修改将被清除。")) return;
    setScanBusy(true);
    const originalTexts = [...activeResume.texts];
    const nextKeywords = rematchKeywordsLocally(keywords, originalTexts, currentLexicon);
    rememberUndo();
    setResumeTexts(originalTexts);
    setResumeRenderRevision((revision) => revision + 1);
    setKeywords(nextKeywords);
    setSelectedId(nextKeywords[0]?.id || "");
    setKeywordCardOpen(false);
    setRedDialogOpen(false);
    setFinalCheckPassed(false);
    setScanBusy(false);
    showNotice("已恢复原始简历，并在本地按首次关键词重新匹配");
  }
  async function exportResume() {
    if (!activeResume?.docxBase64) {
      showNotice("请先重新上传原始 .docx，才能保留 Word 排版导出");
      return;
    }
    try {
      const { default: JSZip } = await import("jszip");
      const archive = await JSZip.loadAsync(base64ToArrayBuffer(activeResume.docxBase64));
      const documentPart = archive.file("word/document.xml");
      if (!documentPart) throw new Error("缺少 Word 正文");
      const sourceXml = await documentPart.async("string");
      const replacements = activeResume.texts.map((before, index) => ({ before, after: resumeTexts[index] || before }));
      archive.file("word/document.xml", replaceTextInWordXml(sourceXml, replacements));
      const blob = await archive.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${resumeName || "resume"}_matched.docx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showNotice("已基于原始文件导出 .docx，页面与样式继续沿用原模板");
    } catch (error) {
      showNotice(error instanceof Error ? `导出失败：${error.message}` : "导出失败，请稍后重试");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("applications")}><span className="brand-mark">R</span><span>ResumeMatch</span></button>
        <div className="project-title">{view === "workspace" ? <><button className="icon-btn" aria-label="返回项目列表" onClick={() => setView("applications")}><ArrowLeft /></button><div><div className="title-row">{editingProjectName ? <span className="project-name-editor"><input autoFocus value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && projectNameDraft.trim()) { setProjectName(projectNameDraft.trim()); setEditingProjectName(false); } if (event.key === "Escape") setEditingProjectName(false); }} /><button onClick={() => { if (projectNameDraft.trim()) setProjectName(projectNameDraft.trim()); setEditingProjectName(false); }}>保存</button></span> : <><strong>{projectReady ? projectName : "新建申请项目"}</strong>{projectReady && <button className="rename-project" aria-label="重命名项目" onClick={() => { setProjectNameDraft(projectName); setEditingProjectName(true); }}><Pencil /></button>}</>}{projectReady && <span className="saved"><Cloud /> 已保存</span>}</div><span className="subtle">{resumeName ? `基于简历版本：${resumeName}` : "请先上传基础简历"}</span></div></> : <><LayoutGrid /><div><div className="title-row"><strong>{view === "applications" ? "申请项目" : view === "resumes" ? "基础简历" : "素材收藏"}</strong></div><span className="subtle">个人工作区</span></div></>}</div>
        <div className="top-actions"><Button variant="outline" className={`ai-settings-trigger ${aiConnected ? "connected" : ""}`} onClick={() => setAiSettingsOpen(true)}><Settings />{aiConnected ? `${activeProviderInfo.shortLabel} · ${aiModel}` : "AI 设置"}</Button>{view === "workspace" && projectReady && <>
          <Button variant="outline" className="delete-project-button" onClick={() => deleteProject(activeProjectId)}><Trash2 />删除项目</Button>
          <Button variant="outline" onClick={rescan} disabled={scanBusy}><RefreshCw className={scanBusy ? "animate-spin" : ""} />{scanBusy ? "匹配中" : "重新匹配"}</Button>
          <Button className="export-btn" onClick={exportResume}><Download />导出 Word</Button>
        </>}</div>
      </header>

      <div className="body-grid">
        <aside className="sidebar">
          <nav><button className={`nav-item ${view === "applications" || view === "workspace" ? "active" : ""}`} onClick={() => setView("applications")}><FolderKanban />申请项目<span className="nav-count">{projects.length}</span></button><button className={`nav-item ${view === "resumes" ? "active" : ""}`} onClick={() => setView("resumes")}><FileText />基础简历<span className="nav-count">{resumes.length}</span></button><button className={`nav-item ${view === "favorites" ? "active" : ""}`} onClick={() => setView("favorites")}><Bookmark />素材收藏<span className="nav-count">{favoriteIds.length}</span></button></nav>
          {projects.length > 0 && <><div className="sidebar-label">最近申请</div>{projects.slice(0, 5).map((project) => <button key={project.id} className={`application ${view === "workspace" && activeProjectId === project.id ? "active" : ""}`} onClick={() => openProject(project)}><span className="company-logo">{project.companyName.charAt(0) || "J"}</span><span><b title={project.name}>{project.name}</b><small>{project.jobTitle}</small></span><span className="progress-ring">{projectCoverage(project)}</span></button>)}</>}
          <button className="new-project" onClick={() => startNewProject()}><Plus />新建申请项目</button>
          <div className="sidebar-bottom"><div className="user-card"><span className="avatar">我</span><span><b>个人工作区</b><small>本地使用</small></span></div></div>
        </aside>

        {view === "workspace" ? !projectReady ? <ProjectSetup resumes={resumes} activeResumeId={activeResumeId} onSelectResume={selectResume} jdUrl={jdUrl} setJdUrl={setJdUrl} jdText={jdText} setJdText={setJdText} onUpload={() => fileRef.current?.click()} onCreate={createProject} loading={projectLoading} /> : <section className="workspace">
          <div className="workspace-toolbar">
            <div className="source-group"><span className="company-logo small">{companyName.charAt(0) || "J"}</span><div><b>{jobTitle || "职位描述"}</b><span className="source-link-row"><Link2 /><span className="source-url" title={jdUrl}>{jdUrl || "手动粘贴的 JD 正文"}</span>{jdUrl && <button className="copy-link" aria-label="复制职位链接" onClick={async () => { await navigator.clipboard.writeText(jdUrl); setLinkCopied(true); window.setTimeout(() => setLinkCopied(false), 1600); }}>{linkCopied ? <Check /> : <Copy />}</button>}</span></div></div>
            <div className="match-overview"><div><span className="score">{score}%</span><span>关键词覆盖</span></div><div className="status-stat green"><i />{counts.green} 已覆盖</div><div className="status-stat yellow"><i />{counts.yellow} 待调整</div><div className="status-stat red"><i />{counts.red} 缺失</div></div>
          </div>

          <div className="split-view">
            <section className="jd-pane">
              <div className="pane-header"><div><b>职位描述</b><span>阅读视图</span></div><div className="pane-actions"><button onMouseDown={(event) => event.preventDefault()} onClick={addManualTerm}><Plus />标记选中文本</button></div></div>
              <div className="jd-scroll"><article className="jd-document">
                <div className="jd-brand"><span className="company-logo large">{companyName.charAt(0) || "J"}</span><div><h1>{jobTitle || "职位描述"}</h1>{companyName && <p>{companyName}</p>}</div></div>
                <div className="real-jd-text">{jdText.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{renderJdText(paragraph)}</p>)}</div>
                {manualTerms.length > 0 && <div className="manual-terms"><b>待匹配的手动关键词</b>{manualTerms.map((term) => <span key={term}>{term}<button onClick={() => setManualTerms((items) => items.filter((item) => item !== term))}><X /></button></span>)}</div>}
                {keywords.length > 0 && <div className="manual-results"><b>当前关键词</b><p>点击可查看或处理匹配结果</p><div>{keywords.map((keyword) => <KeywordMark key={keyword.id} keyword={keyword} selected={selectedId === keyword.id} onClick={(event) => chooseKeyword(keyword, event)} />)}</div></div>}
              </article></div>
              <div className="legend"><span><i className="green" />已覆盖</span><span><i className="yellow" />相近表达</span><span><i className="red" />未覆盖</span><span><i className="ignored" />已忽略</span><button className={`next-keyword ${selected.status}`} onClick={advanceToNext} disabled={finalCheckBusy}>{finalCheckBusy ? "正在检查…" : nextActionLabel}<kbd>Ctrl ↵</kbd><ArrowRight /></button></div>
            </section>

            <section className="resume-pane">
              <div className="pane-header resume-head"><div><b>{resumeName}</b><span>Word 原始版式预览 · 自动保存副本 · 原文件不会被修改</span></div><div className="resume-editor-actions"><button className="editor-history-button" title="撤销（Ctrl+Z）" aria-label="撤销" onClick={undoChange} disabled={!canUndo}><Undo2 /></button><button className="editor-history-button" title="重做（Ctrl+Shift+Z 或 Ctrl+Y）" aria-label="重做" onClick={redoChange} disabled={!canRedo}><Redo2 /></button><button className="restore-resume-button" onClick={resetResumeAndRescan} disabled={scanBusy}><RefreshCw className={scanBusy ? "animate-spin" : ""} />恢复原始简历</button></div></div>
              <div className="resume-scroll"><WordResumePreview resume={activeResume} sourceTexts={activeResume?.texts || []} currentTexts={resumeTexts} keywords={keywords} selected={selected} renderRevision={resumeRenderRevision} onReupload={() => fileRef.current?.click()} registerLayoutValidator={registerLayoutValidator} onTextChange={handleResumeTextChange} /></div>

              {keywordCardOpen && selected.status === "yellow" && <aside className="suggestion-card floating-suggestion" style={{ left: popupPosition.left, top: popupPosition.top }}><div className="suggestion-top"><span className="ai-icon"><WandSparkles /></span><div><b>可直接替换</b><span>应用前会按 Word 实际行宽检查</span></div><button onClick={() => setKeywordCardOpen(false)}><X /></button></div><div className="change-preview"><span>{selected.resumeMatch}</span><span className="arrow">→</span><strong>{selected.suggestion}</strong></div>{selected.guidance && <p className="rewrite-guidance">修改指南：{selected.guidance}</p>}<div className="suggestion-actions keyword-decisions"><Button variant="ghost" onClick={() => removeKeyword(selected.id)}>不是关键词</Button><Button variant="ghost" onClick={() => updateStatus(selected.id, "ignored")}>暂时忽略</Button><Button variant="ghost" onClick={() => approveKeyword(selected.id)}>无需调整</Button><Button onClick={applyYellow}><Check />应用替换</Button></div></aside>}
              {keywordCardOpen && selected.status === "green" && <aside className="keyword-state-card matched-card floating-suggestion" style={{ left: popupPosition.left, top: popupPosition.top }}><span><Check /></span><div><b>已覆盖：{selected.label}</b><p>同一词根的词性、单复数和时态变化按覆盖处理；近义词仍列为黄色。</p></div><div className="state-card-actions"><button className="state-card-action" onClick={() => removeKeyword(selected.id)}>不是关键词</button><button className="state-card-action" onClick={() => updateStatus(selected.id, "ignored")}>暂时忽略</button></div></aside>}
              {keywordCardOpen && selected.status === "ignored" && <aside className="keyword-state-card ignored-card floating-suggestion" style={{ left: popupPosition.left, top: popupPosition.top }}><span className="ignored-icon">—</span><div><b>已忽略：{selected.label}</b><p>这项目前不会计入修改清单。</p></div><button className="state-card-action" onClick={restoreKeyword}>重新考虑</button></aside>}
            </section>
          </div>
        </section> : <LibraryPage view={view} onNewProject={() => startNewProject()} onOpenProject={openProject} onDeleteProject={deleteProject} projects={projects} onUpload={() => fileRef.current?.click()} resumes={resumes} onUseResume={useResume} onRenameResume={renameResume} onDeleteResume={deleteResume} />}
      </div>

      <Dialog open={aiSettingsOpen} onOpenChange={setAiSettingsOpen}>
        <DialogContent className="ai-settings-dialog sm:max-w-[640px]">
          <DialogHeader><div className="ai-settings-icon"><KeyRound /></div><DialogTitle>模型服务设置</DialogTitle><DialogDescription>分别添加各家 API Key，并选择当前用于关键词分析和简历改写的模型。</DialogDescription></DialogHeader>
          <div className="provider-tabs" role="tablist" aria-label="模型服务商">{providerOptions.map((provider) => <button key={provider.id} role="tab" aria-selected={aiProvider === provider.id} className={aiProvider === provider.id ? "active" : ""} onClick={() => switchProvider(provider.id)}><span>{provider.shortLabel}</span>{connectedProviders.includes(provider.id) && <i title="已配置" />}</button>)}</div>
          <div className="ai-settings-form">
            <div className="provider-heading"><div><b>{activeProviderInfo.label}</b><span>密钥和模型只用于当前选中的服务商</span></div><span className={`provider-badge ${aiConnected ? "ok" : ""}`}>{aiConnected ? "已连接" : "未连接"}</span></div>
            {aiProvider === "custom" && <label><span>API Base URL</span><input type="url" value={customBaseUrl} onChange={(event) => { setCustomBaseUrl(event.target.value); setAiConnected(false); window.localStorage.setItem("resume-match-ai-custom-base-url-v1", event.target.value); }} placeholder="https://provider.example.com/v1" /><small>仅支持公开的 HTTPS 地址，并按 OpenAI Chat Completions 格式调用；本机和内网地址会被拒绝。</small></label>}
            <label><span>{activeProviderInfo.shortLabel} API Key</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setAiConnected(false); setConnectedProviders((items) => items.filter((item) => item !== aiProvider)); }} placeholder={activeProviderInfo.keyHint} /><small>{activeProviderInfo.keyUrl ? <>还没有密钥？前往 <a href={activeProviderInfo.keyUrl} target="_blank" rel="noreferrer">{activeProviderInfo.label} 控制台</a> 创建。各家的 API 账户和费用相互独立。</> : "请使用兼容服务商发放的 API Key。"}</small></label>
            <div className="ai-key-actions"><Button onClick={() => void connectAI()} disabled={aiConnecting || !apiKey.trim() || (aiProvider === "custom" && !customBaseUrl.trim())}>{aiConnecting ? <LoaderCircle className="animate-spin" /> : <KeyRound />}{aiConnecting ? "正在连接…" : "验证密钥并读取模型"}</Button>{apiKey && <Button variant="outline" onClick={clearAIKey}>清除这家密钥</Button>}</div>
            <label><span>模型 ID</span><input list="available-ai-models" value={aiModel} onChange={(event) => { setAiModel(event.target.value); setAiConnected(connectedProviders.includes(aiProvider) && Boolean(apiKey && event.target.value)); window.localStorage.setItem(`resume-match-ai-model-${aiProvider}-v1`, event.target.value); }} placeholder={availableModels.length ? "选择或输入模型 ID" : "验证密钥后读取，也可手动填写"} /><datalist id="available-ai-models">{availableModels.map((model) => <option key={model} value={model} />)}</datalist><small>{availableModels.length ? `已读取 ${availableModels.length} 个可用文本模型，可以直接输入筛选。` : "模型列表来自当前服务商；若服务商不提供列表接口，可以手动填写官方模型 ID。"}</small></label>
            <div className={`ai-connection-state ${aiConnected ? "ok" : ""}`}><i />{aiConnected ? `当前使用：${activeProviderInfo.shortLabel} · ${aiModel}` : `尚未完成 ${activeProviderInfo.shortLabel} 配置`}</div>
            <p className="ai-privacy-note">API Key 仅保存在当前浏览器会话中。调用时，职位描述、简历文本和你补充的素材会发送给当前选中的服务商；应用不会把密钥写入项目，也不会在调用失败时改用本地模板。</p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={finalCheckPassed} onOpenChange={setFinalCheckPassed}><DialogContent className="completion-dialog sm:max-w-[480px]"><div className="completion-icon"><Check /></div><DialogHeader><DialogTitle>最终检查通过</DialogTitle><DialogDescription>所有关键词都已处理，简历可以进入导出阶段。</DialogDescription></DialogHeader><div className="completion-summary"><span>关键词覆盖率 <b>{score}%</b></span><span>已忽略 <b>{counts.ignored}</b></span><span>待处理 <b>0</b></span></div><div className="completion-actions"><Button variant="outline" onClick={() => setFinalCheckPassed(false)}>返回检查</Button><Button onClick={exportResume}><Download />确认完成并导出</Button></div></DialogContent></Dialog>
      {notice && <div className="toast"><Check />{notice}</div>}
      <Dialog open={redDialogOpen} onOpenChange={setRedDialogOpen}><DialogContent className="red-dialog gap-0 overflow-hidden border-0 p-0 sm:max-w-[1040px]"><DialogHeader className="border-b px-6 py-5"><div className="dialog-kicker"><span className="red-dot" />尚未覆盖</div><DialogTitle>怎样补入 “{selected.label}”</DialogTitle><DialogDescription>每个方案都会标出改动位置。采用前请确认内容准确反映你的真实经历。</DialogDescription></DialogHeader>
        {redMode === "choices" && <div className="option-list">{rewriteBusy ? <div className="rewrite-loading"><LoaderCircle className="animate-spin" /><b>模型正在核对经历和关键词</b><p>只有现有内容能支持的事实才会进入改写建议。</p></div> : currentSuggestions.length === 0 ? <div className="no-rewrite-candidates"><b>当前没有可安全采用的改写建议</b><p>{rewriteQuestion || "系统已排除姓名、联系方式、教育背景和栏目标题。你可以补充真实素材或自己编辑。"}</p></div> : currentSuggestions.map((option, index) => {
          const before = resumeTexts[option.targetIndex] || "";
          return <button key={`${option.title}-${index}`} className="rewrite-option" onClick={() => applyRed(option)}><span className="option-number">{index + 1}</span><span className="option-copy"><span><b>{option.title}</b><em>{option.target}</em></span><div className="diff-row before"><label>修改前</label><p><DiffText before={before} after={option.text} side="before" /></p></div><div className="diff-arrow">↓</div><div className="diff-row after"><label>修改后</label><p><DiffText before={before} after={option.text} side="after" /></p></div>{option.rationale && <small className="rewrite-rationale">{option.rationale}</small>}<small>{option.originalChars && option.maxChars ? `长度：${option.originalChars} → ${option.newChars ?? option.text.length} 字符，上限 ${option.maxChars}` : "采用后会按 Word 实际行数再次检查"}</small></span><span className="apply-label">采用</span></button>;
        })}</div>}
        {redMode !== "choices" && <div className="red-workbench"><BulletContextPanel texts={resumeTexts} target={redTarget} onTargetChange={setRedTarget} /><div className="alternative-panel">
          {redMode === "manual" && <><button className="back-link" onClick={() => setRedMode("choices")}><ArrowLeft />返回推荐方案</button><h3>选择经历并调整</h3><p>可以写中文素材让模型生成，也可以直接写英文。模型会紧贴左侧经历，并允许有限、合理的工作方式推断。</p><PlacementToggle placement={redPlacement} original={resumeTexts[redTarget]} onChange={(placement, draft) => { setRedPlacement(placement); setManualDraft(draft); }} /><textarea value={manualDraft} onChange={(event) => setManualDraft(event.target.value)} placeholder={`补充真实素材，或直接写包含 ${selected.label} 的英文内容…`} /><div className="panel-actions"><span>{manualDraft.length} 字符</span><Button variant="outline" onClick={() => { const source = resumeTexts[redTarget]; if (source) void requestRewrite(selected, [{ text: source, index: redTarget }], manualDraft.trim(), redPlacement); }} disabled={rewriteBusy}><WandSparkles />生成推荐</Button><Button onClick={() => applyUserDraft(manualDraft)}><Check />直接写入</Button></div></>}
        </div></div>}
        <div className="dialog-alternatives"><span>推荐不合适？</span><button onClick={() => { setRedTarget(relevantResumeLines(resumeTexts, selected.label)[0]?.index ?? 0); setRedPlacement("augment"); setManualDraft(""); setRedMode("manual"); }}><FileText />选择经历并调整</button></div><div className="dialog-footer keyword-footer-actions"><button onClick={() => removeKeyword(selected.id)}>这不是关键词</button><button onClick={() => { updateStatus(selected.id, "ignored"); setRedDialogOpen(false); }}>暂时忽略</button><button onClick={() => approveKeyword(selected.id)}>无需调整，标为绿色</button><span><CircleHelp />推断不会新增数字或成果</span></div></DialogContent></Dialog>
      <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={(event) => void handleResumeUpload(event.target.files?.[0])} />
    </main>
  );
}
