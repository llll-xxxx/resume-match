"use client";

import { useState } from "react";
import { ArrowRight, Bookmark, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApplicationProject, BulletHistoryEntry, ResumeVersion, ViewName } from "../types";
import { ApplicationDashboard } from "./ApplicationDashboard";

type Props = {
  view: Exclude<ViewName, "workspace">;
  onNewProject: () => void;
  onOpenProject: (project: ApplicationProject) => void;
  onDeleteProject: (id: string) => void;
  projects: ApplicationProject[];
  onUpload: () => void;
  resumes: ResumeVersion[];
  onUseResume: (id: string) => void;
  onRenameResume: (id: string, name: string) => void;
  onDeleteResume: (id: string) => void;
  bulletHistory: BulletHistoryEntry[];
  onDeleteBulletHistory: (id: string) => void;
  jobFunctions: string[];
  onJobFunctionsChange: (values: string[]) => void;
  onUpdateProject: (id: string, patch: Partial<ApplicationProject>) => void;
  onAddManualProject: () => void;
  onNotice: (message: string) => void;
};

const originLabels = { base: "基础简历", manual: "手动修改", llm: "采用 AI 后修改", synonym: "近义词适配" } as const;

export function LibraryPage({ view, onNewProject, onOpenProject, onDeleteProject, projects, onUpload, resumes, onUseResume, onRenameResume, onDeleteResume, bulletHistory, onDeleteBulletHistory, jobFunctions, onJobFunctionsChange, onUpdateProject, onAddManualProject, onNotice }: Props) {
  const [editingId, setEditingId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const content = {
    applications: { eyebrow: "工作台", title: "申请项目", description: "每个职位会保存为独立项目。" },
    resumes: { eyebrow: "资料库", title: "基础简历", description: "上传的原始版本只读保存，项目修改不会覆盖它。" },
    favorites: { eyebrow: "资料库", title: "Bullet 素材库", description: "按关键词概念整理基础简历和采用过的历史版本。" },
  }[view];
  const query = historySearch.trim().toLowerCase();
  const visibleHistory = bulletHistory.filter((entry) => !query || [entry.conceptLabel, entry.keywordLabel, entry.text, entry.companyName, entry.jobTitle].some((value) => value?.toLowerCase().includes(query)));
  const historyGroups = Array.from(visibleHistory.reduce((groups, entry) => {
    const group = groups.get(entry.conceptId) || { conceptId: entry.conceptId, label: entry.conceptLabel || entry.keywordLabel, entries: [] as BulletHistoryEntry[] };
    group.entries.push(entry);
    groups.set(entry.conceptId, group);
    return groups;
  }, new Map<string, { conceptId: string; label: string; entries: BulletHistoryEntry[] }>()).values());

  if (view === "applications") return <ApplicationDashboard projects={projects} resumes={resumes} jobFunctions={jobFunctions} onJobFunctionsChange={onJobFunctionsChange} onUpdateProject={onUpdateProject} onAddManual={onAddManualProject} onNewProject={onNewProject} onOpenProject={onOpenProject} onDeleteProject={onDeleteProject} onNotice={onNotice} />;

  return <section className="library-page">
    <header className="library-header"><div><span>{content.eyebrow}</span><h1>{content.title}</h1><p>{content.description}</p></div>{view === "resumes" ? <Button onClick={onUpload}><Upload />上传 Word 简历</Button> : null}</header>
    {view === "resumes" && <button className="upload-zone" onClick={onUpload}><span><Upload /></span><b>{resumes.length ? "继续上传另一份 Word 简历" : "上传第一份 Word 简历"}</b><p>支持 .docx；每次上传都会新增一个独立基础版本</p></button>}
    {resumes.length > 0 && view === "resumes" && <div className="resume-library">{resumes.map((resume) => <article key={resume.id}><div className="file-icon">DOC</div><div className="resume-card-copy">{editingId === resume.id ? <div className="rename-row"><input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draftName.trim()) { onRenameResume(resume.id, draftName.trim()); setEditingId(""); } if (event.key === "Escape") setEditingId(""); }} /><button onClick={() => { if (draftName.trim()) onRenameResume(resume.id, draftName.trim()); setEditingId(""); }}>保存</button><button onClick={() => setEditingId("")}>取消</button></div> : <div className="resume-name-row"><h3>{resume.name}</h3><button onClick={() => { setEditingId(resume.id); setDraftName(resume.name); }}>重命名</button></div>}<p className="original-file">原文件：{resume.fileName}</p><span>{resume.uploadedAt}</span></div><div className="resume-card-actions"><button onClick={() => onUseResume(resume.id)}>用于新申请 <ArrowRight /></button><button className="danger" onClick={() => onDeleteResume(resume.id)}><Trash2 />删除</button></div></article>)}</div>}
    {view === "favorites" && bulletHistory.length > 0 && <><label className="history-search"><Search /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="搜索关键词、Bullet 或职位" /></label><div className="history-groups">{historyGroups.map((group) => <section className="history-group" key={group.conceptId}><header><div><span>关键词概念</span><h2>{group.label}</h2></div><b>{group.entries.length} 个版本</b></header><div className="favorite-grid">{group.entries.map((entry) => <article key={entry.id}><div><span>{originLabels[entry.origin]}</span><button aria-label="删除历史记录" onClick={() => onDeleteBulletHistory(entry.id)}><Trash2 />删除</button></div><p>{entry.text}</p><footer><span>记录关键词：{entry.keywordLabel}</span><span>{entry.jobTitle || entry.companyName ? `${entry.jobTitle || ""}${entry.jobTitle && entry.companyName ? " · " : ""}${entry.companyName || ""}` : "本地记录"}</span><span>采用 {entry.useCount} 次</span></footer></article>)}</div></section>)}</div>{visibleHistory.length === 0 && <div className="blank-library compact"><div className="blank-icon"><Search /></div><h2>没有匹配的历史记录</h2><p>换一个关键词或 Bullet 片段试试。</p></div>}</>}
    {view === "favorites" && bulletHistory.length === 0 && <div className="blank-library"><div className="blank-icon"><Bookmark /></div><h2>还没有 Bullet 历史记录</h2><p>基础简历中已覆盖关键词的 Bullet，以及你采用的修改，会自动出现在这里。</p></div>}
  </section>;
}
