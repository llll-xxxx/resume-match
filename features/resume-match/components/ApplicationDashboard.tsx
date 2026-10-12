"use client";

import { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Clipboard, Download, ExternalLink, FileText, Filter, FilterX, FolderOpen, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { desktopStorage } from "@/lib/desktop-storage";
import { buildApplicationWorkbook } from "../application-xlsx";
import { APPLICATION_RESULT_LABELS, APPLICATION_STAGE_LABELS } from "../constants";
import { projectCoverage } from "../domain";
import type { ApplicationPriority, ApplicationProject, ApplicationResult, ApplicationStage, ResumeVersion } from "../types";

type Props = {
  projects: ApplicationProject[];
  resumes: ResumeVersion[];
  jobFunctions: string[];
  onJobFunctionsChange: (values: string[]) => void;
  onUpdateProject: (id: string, patch: Partial<ApplicationProject>) => void;
  onAddManual: () => void;
  onNewProject: () => void;
  onOpenProject: (project: ApplicationProject) => void;
  onDeleteProject: (id: string) => void;
  onNotice: (message: string) => void;
};

type ColumnKey = "company" | "title" | "function" | "employment" | "location" | "posted" | "deadline" | "priority" | "stage" | "result" | "applied" | "referral" | "resume" | "coverage";
type SortKey = ColumnKey | "created";
type SortState = { key: SortKey; direction: "asc" | "desc" };

const stageOrder: ApplicationStage[] = ["editing", "exported", "applied", "assessment", "interview"];
const employmentTypes = ["", "Internship", "Full-time", "Part-time", "Contract", "Other"];
const priorities: ApplicationPriority[] = ["", "high", "medium", "low"];
const priorityLabels = { "": "—", high: "High", medium: "Medium", low: "Low" } as const;
const columnKeys: ColumnKey[] = ["company", "title", "function", "employment", "location", "posted", "deadline", "priority", "stage", "result", "applied", "referral", "resume", "coverage"];
const blankColumnFilters = () => Object.fromEntries(columnKeys.map((key) => [key, ""])) as Record<ColumnKey, string>;

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function valueFor(project: ApplicationProject, key: ColumnKey, resumeNames: Map<string, string>) {
  const values: Record<ColumnKey, string> = {
    company: project.companyName,
    title: project.jobTitle,
    function: project.jobFunction || "",
    employment: project.employmentType || "",
    location: project.location || "",
    posted: project.datePosted || "",
    deadline: project.deadline || "",
    priority: project.priority ? priorityLabels[project.priority] : "",
    stage: APPLICATION_STAGE_LABELS[project.applicationStage || "editing"],
    result: APPLICATION_RESULT_LABELS[project.applicationResult || ""],
    applied: project.applicationDate || "",
    referral: project.referral || "",
    resume: resumeNames.get(project.resumeId) || "",
    coverage: `${projectCoverage(project)}%`,
  };
  return values[key];
}

function sortValue(project: ApplicationProject, key: SortKey, resumeNames: Map<string, string>) {
  if (key === "created") return project.milestones?.applied || project.applicationDate || project.createdAt || project.updatedAt;
  if (key === "coverage") return projectCoverage(project);
  if (key === "stage") return stageOrder.indexOf(project.applicationStage || "editing");
  return valueFor(project, key, resumeNames).toLocaleLowerCase();
}

function toneFor(kind: "function" | "employment" | "priority" | "stage" | "result", value: string) {
  if (!value) return "muted";
  if (kind === "stage") return { editing: "slate", exported: "violet", applied: "blue", assessment: "amber", interview: "cyan" }[value] || "slate";
  if (kind === "result") return { in_process: "blue", offer: "green", rejected: "red", withdrawn: "slate" }[value] || "muted";
  if (kind === "priority") return { high: "red", medium: "amber", low: "green" }[value] || "muted";
  if (kind === "employment") return { Internship: "violet", "Full-time": "blue", "Part-time": "cyan", Contract: "amber", Other: "slate" }[value] || "muted";
  const normalized = value.toLowerCase();
  if (/pm$|product management/.test(normalized)) return "blue";
  if (/pmm|marketing/.test(normalized)) return "pink";
  if (/strategy|chief of staff|corporate development/.test(normalized)) return "violet";
  if (/ops|operations|program|project/.test(normalized)) return "cyan";
  if (/gtm|sales|bd|partnership/.test(normalized)) return "amber";
  if (/finance|analytics|data/.test(normalized)) return "green";
  return "slate";
}

function ColumnHeader({ label, column, filter, options, sort, onFilter, onSort }: { label: string; column: ColumnKey; filter: string; options: string[]; sort: SortState; onFilter: (value: string) => void; onSort: (direction: "asc" | "desc") => void }) {
  const active = Boolean(filter) || sort.key === column;
  return <div className="column-heading"><span>{label}</span><details className={`column-menu ${active ? "active" : ""}`}><summary aria-label={`筛选或排序${label}`}><Filter /></summary><div className="column-menu-panel"><b>{label}</b><div className="column-sort-actions"><button onClick={() => onSort("asc")}><ArrowUpAZ />升序</button><button onClick={() => onSort("desc")}><ArrowDownAZ />降序</button></div><label>筛选<input value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="输入或选择值" list={`filter-${column}`} /></label><datalist id={`filter-${column}`}>{options.map((value) => <option key={value} value={value} />)}</datalist>{filter && <button className="column-clear" onClick={() => onFilter("")}><RotateCcw />清除此列筛选</button>}</div></details></div>;
}

export function ApplicationDashboard({ projects, resumes, jobFunctions, onJobFunctionsChange, onUpdateProject, onAddManual, onNewProject, onOpenProject, onDeleteProject, onNotice }: Props) {
  const [companyFilter, setCompanyFilter] = useState("");
  const [functionFilter, setFunctionFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<ColumnKey, string>>(blankColumnFilters);
  const [sort, setSort] = useState<SortState>({ key: "created", direction: "asc" });
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const resumeNames = useMemo(() => new Map(resumes.map((resume) => [resume.id, resume.name])), [resumes]);
  const companies = useMemo(() => Array.from(new Set(projects.map((project) => project.companyName).filter(Boolean))).sort(), [projects]);
  const filtersActive = Boolean(companyFilter || functionFilter || stageFilter || resultFilter || locationFilter || query || Object.values(columnFilters).some(Boolean));
  const optionsByColumn = useMemo(() => Object.fromEntries(columnKeys.map((key) => [key, Array.from(new Set(projects.map((project) => valueFor(project, key, resumeNames)).filter(Boolean))).sort()])), [projects, resumeNames]) as Record<ColumnKey, string[]>;
  const visibleProjects = useMemo(() => {
    const search = query.trim().toLowerCase();
    const location = locationFilter.trim().toLowerCase();
    return projects.filter((project) => {
      if (companyFilter && project.companyName !== companyFilter) return false;
      if (functionFilter && project.jobFunction !== functionFilter) return false;
      if (stageFilter && project.applicationStage !== stageFilter) return false;
      if (resultFilter && project.applicationResult !== resultFilter) return false;
      if (location && !project.location?.toLowerCase().includes(location)) return false;
      if (search && ![project.companyName, project.jobTitle, project.referral, project.location].some((value) => value?.toLowerCase().includes(search))) return false;
      return columnKeys.every((key) => !columnFilters[key] || valueFor(project, key, resumeNames).toLowerCase().includes(columnFilters[key].trim().toLowerCase()));
    }).sort((left, right) => {
      const a = sortValue(left, sort.key, resumeNames);
      const b = sortValue(right, sort.key, resumeNames);
      const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
      const tieBreak = (left.createdAt || left.updatedAt || left.id).localeCompare(right.createdAt || right.updatedAt || right.id);
      return sort.direction === "asc" ? comparison || tieBreak : -(comparison || tieBreak);
    });
  }, [columnFilters, companyFilter, functionFilter, locationFilter, projects, query, resultFilter, resumeNames, sort, stageFilter]);

  const funnel = useMemo(() => {
    const reached = (stage: ApplicationStage) => visibleProjects.filter((project) => stageOrder.indexOf(project.applicationStage || "editing") >= stageOrder.indexOf(stage)).length;
    return [{ label: "Applied", value: reached("applied") }, { label: "Assessment", value: reached("assessment") }, { label: "Interview", value: reached("interview") }, { label: "Offer", value: visibleProjects.filter((project) => project.applicationResult === "offer").length }];
  }, [visibleProjects]);

  function setColumnFilter(column: ColumnKey, value: string) { setColumnFilters((current) => ({ ...current, [column]: value })); }
  function clearFilters() { setCompanyFilter(""); setFunctionFilter(""); setStageFilter(""); setResultFilter(""); setLocationFilter(""); setQuery(""); setColumnFilters(blankColumnFilters()); }
  function addFunction() {
    const value = window.prompt("新增岗位方向名称")?.trim();
    if (!value) return "";
    const existing = jobFunctions.find((item) => item.toLowerCase() === value.toLowerCase());
    if (existing) return existing;
    onJobFunctionsChange([...jobFunctions, value]);
    return value;
  }
  async function exportExcel() {
    if (!visibleProjects.length) return onNotice("当前没有可导出的申请记录");
    setExporting(true);
    try {
      const blob = await buildApplicationWorkbook(visibleProjects, resumes);
      const fileName = `ResumeMatch applications ${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (desktopStorage.isAvailable()) {
        const result = await desktopStorage.exportSpreadsheet(fileName, new Uint8Array(await blob.arrayBuffer()));
        if (!result) return;
        onNotice(`已导出 ${result.fileName}`);
      } else { downloadBlob(blob, fileName); onNotice(`已导出 ${fileName}`); }
    } catch (error) { onNotice(error instanceof Error ? `Excel 导出失败：${error.message}` : "Excel 导出失败"); }
    finally { setExporting(false); }
  }
  const header = (label: string, column: ColumnKey) => <ColumnHeader label={label} column={column} filter={columnFilters[column]} options={optionsByColumn[column]} sort={sort} onFilter={(value) => setColumnFilter(column, value)} onSort={(direction) => setSort({ key: column, direction })} />;

  return <div className="application-dashboard">
    <section className="dashboard-actions"><div><span>工作台</span><h1>申请项目</h1><p>管理职位、简历版本和申请进度。</p></div><div><Button variant="outline" onClick={() => void exportExcel()} disabled={exporting || !visibleProjects.length}><Download />{exporting ? "正在导出" : filtersActive ? "导出筛选结果" : "导出 Excel"}</Button><Button variant="outline" onClick={onAddManual}><Plus />手动新增</Button><Button onClick={onNewProject} className="dashboard-import"><Plus />导入职位链接</Button></div></section>
    <section className="funnel-panel"><header><div><b>申请漏斗</b><span>{filtersActive ? "基于当前筛选结果" : "全部申请记录"}</span></div><small>仅从 Applied 开始统计</small></header><div className="funnel-steps">{funnel.map((step, index) => { const previous = funnel[index - 1]?.value; const conversion = previous ? Math.round((step.value / previous) * 100) : index === 0 ? 100 : 0; return <article key={step.label}><span>{step.label}</span><b>{step.value}</b>{index > 0 && <small>{conversion}% from {funnel[index - 1].label}</small>}</article>; })}</div><div className="rejection-summary"><span>Rejected after Applied <b>{visibleProjects.filter((item) => item.applicationStage === "applied" && item.applicationResult === "rejected").length}</b></span><span>after Assessment <b>{visibleProjects.filter((item) => item.applicationStage === "assessment" && item.applicationResult === "rejected").length}</b></span><span>after Interview <b>{visibleProjects.filter((item) => item.applicationStage === "interview" && item.applicationResult === "rejected").length}</b></span></div></section>
    <section className="dashboard-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、职位、Referral…" /><select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="">全部公司</option>{companies.map((value) => <option key={value}>{value}</option>)}</select><select value={functionFilter} onChange={(event) => setFunctionFilter(event.target.value)}><option value="">全部岗位方向</option>{jobFunctions.map((value) => <option key={value}>{value}</option>)}</select><select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">全部阶段</option>{stageOrder.map((value) => <option key={value} value={value}>{APPLICATION_STAGE_LABELS[value]}</option>)}</select><select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}><option value="">全部结果</option>{(["in_process", "offer", "rejected", "withdrawn"] as ApplicationResult[]).map((value) => <option key={value} value={value}>{APPLICATION_RESULT_LABELS[value]}</option>)}</select><input className="location-filter" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} placeholder="城市、州或 Remote" />{filtersActive && <button className="clear-filters" onClick={clearFilters}><FilterX />清除</button>}</section>
    <section className="application-table-panel"><div className="table-toolbar"><span>{visibleProjects.length} 条记录</span><button onClick={() => setSort({ key: "created", direction: "asc" })}><ArrowUpAZ />{sort.key === "created" ? `创建／提交时间 ${sort.direction === "asc" ? "升序" : "降序"}` : "恢复默认排序"}</button></div><div className="application-table-wrap">
      <table className="application-table"><thead><tr><th className="actions-column">操作</th><th>{header("公司", "company")}</th><th>{header("职位名称", "title")}</th><th>{header("岗位方向", "function")}</th><th>{header("用工类型", "employment")}</th><th>{header("地点", "location")}</th><th>{header("发布日期", "posted")}</th><th>{header("截止日期", "deadline")}</th><th>{header("优先级", "priority")}</th><th>{header("申请阶段", "stage")}</th><th>{header("结果", "result")}</th><th>{header("申请日期", "applied")}</th><th>{header("Referral", "referral")}</th><th>{header("简历版本", "resume")}</th><th>{header("覆盖率", "coverage")}</th></tr></thead>
        <tbody>{visibleProjects.map((project) => { const applied = ["applied", "assessment", "interview"].includes(project.applicationStage || "editing"); return <tr key={project.id}>
          <td className="actions-column"><div className="row-actions"><button title="打开该项目的简历" aria-label="打开简历" disabled={!project.resumeId} onClick={() => onOpenProject(project)}><FolderOpen /></button><button className="row-delete" title="删除申请记录" aria-label="删除申请记录" onClick={() => onDeleteProject(project.id)}><Trash2 /></button></div></td>
          <td><input value={project.companyName} onChange={(event) => onUpdateProject(project.id, { companyName: event.target.value })} placeholder="Company" /></td>
          <td><div className="job-title-cell"><input value={project.jobTitle} onChange={(event) => onUpdateProject(project.id, { jobTitle: event.target.value })} placeholder="Job title" />{project.jdUrl && <><a href={project.jdUrl} target="_blank" rel="noreferrer" aria-label="打开职位链接"><ExternalLink /></a><button aria-label="复制职位链接" onClick={() => { void navigator.clipboard.writeText(project.jdUrl); onNotice("已复制职位链接"); }}><Clipboard /></button></>}</div></td>
          <td><select className="pill-select" data-tone={toneFor("function", project.jobFunction || "Other")} value={project.jobFunction || "Other"} onChange={(event) => { const value = event.target.value === "__add__" ? addFunction() : event.target.value; if (value) onUpdateProject(project.id, { jobFunction: value }); }}><option value="">—</option>{jobFunctions.map((value) => <option key={value}>{value}</option>)}<option value="__add__">＋ 添加新选项…</option></select></td>
          <td><select className="pill-select" data-tone={toneFor("employment", project.employmentType || "")} value={project.employmentType || ""} onChange={(event) => onUpdateProject(project.id, { employmentType: event.target.value })}>{employmentTypes.map((value) => <option key={value} value={value}>{value || "—"}</option>)}</select></td>
          <td><input value={project.location || ""} onChange={(event) => onUpdateProject(project.id, { location: event.target.value })} placeholder="City, ST 或 Remote" /></td><td><input type="date" value={project.datePosted || ""} onChange={(event) => onUpdateProject(project.id, { datePosted: event.target.value })} /></td><td><input type="date" value={project.deadline || ""} onChange={(event) => onUpdateProject(project.id, { deadline: event.target.value })} /></td>
          <td><select className="pill-select" data-tone={toneFor("priority", project.priority || "")} value={project.priority || ""} onChange={(event) => onUpdateProject(project.id, { priority: event.target.value as ApplicationPriority })}>{priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select></td>
          <td><select className="pill-select" data-tone={toneFor("stage", project.applicationStage || "editing")} value={project.applicationStage || "editing"} onChange={(event) => onUpdateProject(project.id, { applicationStage: event.target.value as ApplicationStage })}>{stageOrder.map((value) => <option key={value} value={value}>{APPLICATION_STAGE_LABELS[value]}</option>)}</select></td>
          <td><select className="pill-select" data-tone={toneFor("result", project.applicationResult || "")} value={project.applicationResult || ""} disabled={!applied} onChange={(event) => onUpdateProject(project.id, { applicationResult: event.target.value as ApplicationResult })}><option value="">—</option>{(["in_process", "offer", "rejected", "withdrawn"] as ApplicationResult[]).map((value) => <option key={value} value={value}>{APPLICATION_RESULT_LABELS[value]}</option>)}</select></td>
          <td><input type="date" value={project.applicationDate || ""} disabled={!applied} onChange={(event) => onUpdateProject(project.id, { applicationDate: event.target.value })} /></td><td><input value={project.referral || ""} onChange={(event) => onUpdateProject(project.id, { referral: event.target.value })} placeholder="Name" /></td>
          <td><button className="resume-link" disabled={!project.resumeId} onClick={() => onOpenProject(project)}><FileText />{resumeNames.get(project.resumeId) || "未关联"}</button></td><td><button className="coverage-cell" onClick={() => onOpenProject(project)}>{projectCoverage(project)}%</button></td>
        </tr>; })}</tbody></table>
        {!visibleProjects.length && <div className="dashboard-empty"><b>{projects.length ? "没有符合筛选条件的记录" : "还没有申请记录"}</b><p>{projects.length ? "清除部分筛选条件后再试。" : "导入职位链接，或手动新增第一条记录。"}</p></div>}
      </div></section>
  </div>;
}
