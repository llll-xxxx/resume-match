"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { base64ToArrayBuffer } from "../docx";
import type { Keyword, ResumeVersion } from "../types";

type Props = {
  resume?: ResumeVersion;
  sourceTexts: string[];
  currentTexts: string[];
  keywords: Keyword[];
  selected: Keyword;
  renderRevision: number;
  onReupload: () => void;
  onTextChange: (index: number, text: string) => void;
  onEditingComplete: () => void;
  registerLayoutValidator: (validator: ((index: number, text: string) => boolean) | null) => void;
};

function replaceParagraphText(paragraph: HTMLElement, text: string) {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  const nodes: Array<Node & { data: string }> = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Node & { data: string });
  if (!nodes.length) {
    paragraph.appendChild(document.createTextNode(text));
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

export function WordResumePreview({ resume, sourceTexts, currentTexts, keywords, selected, renderRevision, onReupload, onTextChange, onEditingComplete, registerLayoutValidator }: Props) {
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
      paragraph.setAttribute("contenteditable", "plaintext-only");
      paragraph.spellcheck = false;
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

  return <div className="docx-preview-shell">{previewState === "ready" && <div className={`docx-page-status ${pageCount === 1 && overflowCount === 0 ? "ok" : "over"}`}>{overflowCount > 0 ? `${overflowCount} 条内容超过原行数` : pageCount === 1 ? "Word 页面：1 页" : `检测到 ${pageCount} 页，请缩短内容`}</div>}<div ref={styleRef} /><div ref={hostRef} className="docx-preview-host" onKeyDownCapture={(event) => { if (event.key === "Enter") event.preventDefault(); }} onBeforeInputCapture={(event) => { const host = hostRef.current; if (!host) return; editingParagraphRef.current = closestResumeParagraph(window.getSelection()?.anchorNode || event.target as Node, host); }} onInputCapture={(event) => { const host = hostRef.current; if (!host) return; const paragraph = editingParagraphRef.current || closestResumeParagraph(window.getSelection()?.anchorNode || event.target as Node, host); editingParagraphRef.current = null; const index = Number(paragraph?.dataset.resumeIndex); if (!paragraph || !Number.isInteger(index)) return; onTextChange(index, paragraph.textContent || ""); window.requestAnimationFrame(() => { paragraph.classList.toggle("line-over", paragraph.getBoundingClientRect().height > Number(paragraph.dataset.originalHeight) + 1); setOverflowCount(host.querySelectorAll("p.line-over").length || 0); }); }} onBlurCapture={(event) => { const host = hostRef.current; if (!host || !closestResumeParagraph(event.target as Node, host) || event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return; onEditingComplete(); }} /></div>;
}
