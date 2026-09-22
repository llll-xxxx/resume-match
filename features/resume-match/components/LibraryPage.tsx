"use client";

import { useState } from "react";
import { ArrowRight, Bookmark, FolderKanban, HardDrive, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectCoverage } from "../domain";
import type { ApplicationProject, ResumeVersion, ViewName } from "../types";

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
};

export function LibraryPage({ view, onNewProject, onOpenProject, onDeleteProject, projects, onUpload, resumes, onUseResume, onRenameResume, onDeleteResume }: Props) {
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
      return <article key={project.id} className="project-card" role="button" tabIndex={0} onClick={() => onOpenProject(project)} onKeyDown={(event) => { if (event.key === "Enter") onOpenProject(project); }}><div><span className="company-logo">{project.companyName.charAt(0) || "J"}</span><span className="card-actions"><span className="project-status review">进行中</span><button aria-label="删除申请项目" onClick={(event) => { event.stopPropagation(); onDeleteProject(project.id); }}><Trash2 />删除</button></span></div><h3>{project.name}</h3><p>{project.jobTitle || project.companyName}</p><div className="coverage-row"><span>关键词覆盖</span><b>{coverage}%</b></div><div className="coverage-bar"><i style={{ width: `${coverage}%` }} /></div><footer><span><HardDrive />本地保存</span><span>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(project.updatedAt))}</span></footer></article>;
    })}</div>}
    {view === "resumes" && <button className="upload-zone" onClick={onUpload}><span><Upload /></span><b>{resumes.length ? "继续上传另一份 Word 简历" : "上传第一份 Word 简历"}</b><p>支持 .docx；每次上传都会新增一个独立基础版本</p></button>}
    {resumes.length > 0 && view === "resumes" && <div className="resume-library">{resumes.map((resume) => <article key={resume.id}><div className="file-icon">DOC</div><div className="resume-card-copy">{editingId === resume.id ? <div className="rename-row"><input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draftName.trim()) { onRenameResume(resume.id, draftName.trim()); setEditingId(""); } if (event.key === "Escape") setEditingId(""); }} /><button onClick={() => { if (draftName.trim()) onRenameResume(resume.id, draftName.trim()); setEditingId(""); }}>保存</button><button onClick={() => setEditingId("")}>取消</button></div> : <div className="resume-name-row"><h3>{resume.name}</h3><button onClick={() => { setEditingId(resume.id); setDraftName(resume.name); }}>重命名</button></div>}<p className="original-file">原文件：{resume.fileName}</p><span>{resume.uploadedAt}</span></div><div className="resume-card-actions"><button onClick={() => onUseResume(resume.id)}>用于新申请 <ArrowRight /></button><button className="danger" onClick={() => onDeleteResume(resume.id)}><Trash2 />删除</button></div></article>)}</div>}
    {((view === "applications" && projects.length === 0) || view === "favorites") && <div className="blank-library"><div className="blank-icon">{view === "applications" ? <FolderKanban /> : <Bookmark />}</div><h2>{view === "applications" ? "还没有申请项目" : "还没有收藏素材"}</h2><p>{view === "applications" ? "上传基础简历并添加真实 JD 后，第一个项目会显示在这里。" : "你在修改简历时收藏的 Bullet 会自动出现在这里。"}</p>{view === "applications" && <Button onClick={onNewProject}><Plus />创建第一个项目</Button>}</div>}
  </section>;
}
