import type { MouseEvent } from "react";
import { STATUS_LABEL } from "../constants";
import { isResumeBullet } from "../domain";
import type { Keyword } from "../types";

export function BulletContextPanel({ texts, target, onTargetChange }: { texts: string[]; target: number; onTargetChange: (index: number) => void }) {
  const candidates = texts.map((text, index) => ({ text, index })).filter(({ text }) => isResumeBullet(text));
  return <aside className="resume-context-panel"><div><b>工作经历 Bullet</b><span>选择写入位置</span></div>{candidates.map(({ text, index }) => <button key={index} className={target === index ? "active" : ""} onClick={() => onTargetChange(index)}><span>{index + 1}</span><p>{text}</p><small>{target === index ? "当前目标" : "选择此条"}</small></button>)}</aside>;
}

export function KeywordMark({ keyword, selected, onClick, sourceText }: { keyword: Keyword; selected: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void; sourceText?: string }) {
  return <button type="button" data-keyword-id={keyword.id} onClick={onClick} className={`keyword keyword-${keyword.status} ${selected ? "is-selected" : ""}`} title={`${keyword.label} · ${STATUS_LABEL[keyword.status]}`}>{sourceText || keyword.label}</button>;
}

export function DiffText({ before, after, side }: { before: string; after: string; side: "before" | "after" }) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const text = side === "before" ? before : after;
  const changedEnd = text.length - end;
  return <>{text.slice(0, start)}<mark className={side === "before" ? "removed" : "added"}>{text.slice(start, changedEnd)}</mark>{end ? text.slice(changedEnd) : ""}</>;
}
