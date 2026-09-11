"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Bookmark, BookmarkCheck, Check, ChevronDown, CircleHelp, Cloud,
  Download, FileText, FolderKanban, History, Link2, MoreHorizontal, Plus,
  RefreshCw, Search, Settings, Sparkles, WandSparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type KeywordStatus = "green" | "yellow" | "red" | "ignored";
type Keyword = { id: string; label: string; status: KeywordStatus; resumeMatch?: string; suggestion?: string };
type WebModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown }, options?: { signal?: AbortSignal }) => void | Promise<void> };

const initialKeywords: Keyword[] = [
  { id: "strategy", label: "go-to-market strategy", status: "green", resumeMatch: "go-to-market strategy" },
  { id: "intel", label: "market intelligence", status: "yellow", resumeMatch: "market research", suggestion: "market intelligence" },
  { id: "insights", label: "consumer insights", status: "green", resumeMatch: "consumer insights" },
  { id: "xfn", label: "cross-functional", status: "yellow", resumeMatch: "Partnered across", suggestion: "Partnered cross-functionally across" },
  { id: "sql", label: "SQL", status: "red" },
  { id: "testing", label: "A/B testing", status: "red" },
  { id: "story", label: "executive storytelling", status: "green", resumeMatch: "executive-ready narratives" },
];

const resumeBullets = [
  { id: "b1", text: "Led go-to-market strategy for a new B2B product, translating market research and consumer insights into a three-year growth roadmap.", limit: 2 },
  { id: "b2", text: "Partnered across product, sales, and design teams to prioritize six launches, increasing qualified pipeline by 28%.", limit: 2 },
  { id: "b3", text: "Built executive-ready narratives from customer and competitive data, securing leadership approval for a $4M investment.", limit: 2 },
];

const redSuggestions: Record<string, { title: string; text: string; target: string }[]> = {
  sql: [
    { title: "补入分析方法", text: "Analyzed customer and competitive data in SQL, building executive-ready narratives that secured leadership approval for a $4M investment.", target: "第三条经历" },
    { title: "补入市场研究", text: "Led go-to-market strategy for a new B2B product, using SQL-based market intelligence and consumer insights to shape a three-year growth roadmap.", target: "第一条经历" },
    { title: "作为独立能力补充", text: "Used SQL to segment customer behavior and identify the highest-potential growth opportunities across three priority markets.", target: "新增一条经历" },
  ],
  testing: [
    { title: "补入产品发布", text: "Partnered cross-functionally to prioritize six launches and run A/B testing on positioning, increasing qualified pipeline by 28%.", target: "第二条经历" },
    { title: "补入市场策略", text: "Validated go-to-market strategy through A/B testing of messaging and customer segments, informing a three-year growth roadmap.", target: "第一条经历" },
    { title: "作为独立能力补充", text: "Designed A/B tests across landing pages and lifecycle campaigns, improving conversion by 17% while preserving lead quality.", target: "新增一条经历" },
  ],
};

const statusLabel: Record<KeywordStatus, string> = { green: "已覆盖", yellow: "建议调整", red: "尚未覆盖", ignored: "已忽略" };

function KeywordMark({ keyword, onClick }: { keyword: Keyword; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`keyword keyword-${keyword.status}`} title={`${keyword.label} · ${statusLabel[keyword.status]}`}>{keyword.label}</button>;
}

export default function Home() {
  const [keywords, setKeywords] = useState(initialKeywords);
  const [selectedId, setSelectedId] = useState("intel");
  const [redDialogOpen, setRedDialogOpen] = useState(false);
  const [resumeTexts, setResumeTexts] = useState(() => resumeBullets.map((b) => b.text));
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [manualTerms, setManualTerms] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("resume-match-favorites");
    if (saved) setFavoriteIds(JSON.parse(saved));
  }, []);

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

  const selected = keywords.find((item) => item.id === selectedId) ?? keywords[0];
  const counts = useMemo(() => ({
    green: keywords.filter((k) => k.status === "green").length,
    yellow: keywords.filter((k) => k.status === "yellow").length,
    red: keywords.filter((k) => k.status === "red").length,
    ignored: keywords.filter((k) => k.status === "ignored").length,
  }), [keywords]);
  const score = Math.round((counts.green / keywords.length) * 100);

  function chooseKeyword(keyword: Keyword) {
    setSelectedId(keyword.id);
    if (keyword.status === "red") setRedDialogOpen(true);
  }
  function updateStatus(id: string, status: KeywordStatus) {
    setKeywords((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  }
  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }
  function applyYellow() {
    if (!selected.resumeMatch || !selected.suggestion) return;
    setResumeTexts((texts) => texts.map((text) => text.replace(selected.resumeMatch!, selected.suggestion!)));
    updateStatus(selected.id, "green");
    showNotice(`已替换为 “${selected.suggestion}”`);
  }
  function applyRed(option: { text: string; target: string }) {
    const targetIndex = option.target.includes("第一") ? 0 : option.target.includes("第二") ? 1 : 2;
    setResumeTexts((texts) => texts.map((text, index) => index === targetIndex ? option.text : text));
    updateStatus(selected.id, "green");
    setRedDialogOpen(false);
    showNotice(`已补入 “${selected.label}”，本地匹配已更新`);
  }
  function toggleFavorite(id: string) {
    const next = favoriteIds.includes(id) ? favoriteIds.filter((item) => item !== id) : [...favoriteIds, id];
    setFavoriteIds(next);
    window.localStorage.setItem("resume-match-favorites", JSON.stringify(next));
    showNotice(next.includes(id) ? "已保存到素材收藏" : "已从素材收藏移除");
  }
  function addManualTerm() {
    const text = window.getSelection()?.toString().trim();
    if (!text) return showNotice("请先在左侧 JD 中划选词语");
    if (!manualTerms.includes(text)) setManualTerms((terms) => [...terms, text]);
    showNotice(`已加入待匹配：${text}`);
    window.getSelection()?.removeAllRanges();
  }
  function rescan() {
    setScanBusy(true);
    window.setTimeout(() => { setScanBusy(false); showNotice("深度扫描完成，匹配结果已更新"); }, 1100);
  }
  function exportResume() {
    const html = `<html><head><meta charset="utf-8"></head><body style="font-family:Arial"><h1>ALEX MORGAN</h1><h2>STRATEGY & PRODUCT MARKETING</h2><h3>EXPERIENCE</h3><p><b>Northstar Labs — Senior Strategy Associate</b></p><ul>${resumeTexts.map((text) => `<li>${text}</li>`).join("")}</ul></body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "Alex_Morgan_TikTok_Strategy_Intern.doc";
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice("Word 文档已导出");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">R</span><span>ResumeMatch</span></div>
        <div className="project-title"><button className="icon-btn" aria-label="返回项目列表"><ArrowLeft /></button><div><div className="title-row"><strong>20260910_TikTok_Strategy Intern</strong><span className="saved"><Cloud /> 已保存</span></div><span className="subtle">基于 Strategy Master · 8 分钟前更新</span></div></div>
        <div className="top-actions">
          <Select defaultValue="gpt"><SelectTrigger className="model-select"><Sparkles /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gpt">GPT-5</SelectItem><SelectItem value="gemini">Gemini 2.5</SelectItem><SelectItem value="local">本地轻量匹配</SelectItem></SelectContent></Select>
          <Button variant="outline" onClick={rescan} disabled={scanBusy}><RefreshCw className={scanBusy ? "animate-spin" : ""} />{scanBusy ? "扫描中" : "深度扫描"}</Button>
          <Button className="export-btn" onClick={exportResume}><Download />导出 Word</Button>
        </div>
      </header>

      <div className="body-grid">
        <aside className="sidebar">
          <nav><button className="nav-item active"><FolderKanban />申请项目<span className="nav-count">4</span></button><button className="nav-item" onClick={() => fileRef.current?.click()}><FileText />基础简历<span className="nav-count">3</span></button><button className="nav-item"><Bookmark />素材收藏<span className="nav-count">12</span></button></nav>
          <div className="sidebar-label">最近申请</div>
          <button className="application active"><span className="company-logo tiktok">T</span><span><b>TikTok</b><small>Strategy Intern</small></span><span className="progress-ring">{score}</span></button>
          <button className="application"><span className="company-logo stripe">S</span><span><b>Stripe</b><small>Product Marketing</small></span></button>
          <button className="application"><span className="company-logo airbnb">A</span><span><b>Airbnb</b><small>Strategy &amp; Ops</small></span></button>
          <button className="new-project"><Plus />新建申请项目</button>
          <div className="sidebar-bottom"><button className="nav-item"><CircleHelp />使用帮助</button><button className="nav-item"><Settings />设置</button><div className="user-card"><span className="avatar">AM</span><span><b>Alex Morgan</b><small>个人工作区</small></span><MoreHorizontal /></div></div>
        </aside>

        <section className="workspace">
          <div className="workspace-toolbar">
            <div className="source-group"><span className="company-logo tiktok small">T</span><div><b>TikTok · Strategy Intern</b><span><Link2 /> careers.tiktok.com/position/739...</span></div><button className="icon-btn"><MoreHorizontal /></button></div>
            <div className="match-overview"><div><span className="score">{score}%</span><span>关键词覆盖</span></div><div className="status-stat green"><i />{counts.green} 已覆盖</div><div className="status-stat yellow"><i />{counts.yellow} 待调整</div><div className="status-stat red"><i />{counts.red} 缺失</div></div>
          </div>

          <div className="split-view">
            <section className="jd-pane">
              <div className="pane-header"><div><b>职位描述</b><span>阅读视图</span></div><div className="pane-actions"><button onClick={addManualTerm}><Plus />标记选中文本</button><button aria-label="搜索"><Search /></button><button aria-label="更多"><MoreHorizontal /></button></div></div>
              <div className="jd-scroll"><article className="jd-document">
                <div className="jd-brand"><span className="company-logo tiktok large">T</span><div><h1>Strategy Intern</h1><p>TikTok · Los Angeles, CA · Internship</p></div></div>
                <div className="jd-meta"><span>Early Careers</span><span>On-site</span><span>Summer 2027</span></div>
                <h2>About the team</h2><p>The Global Business Solutions team helps brands create meaningful connections with their audiences. We combine creativity, technology, and <KeywordMark keyword={keywords[2]} onClick={() => chooseKeyword(keywords[2])} /> to unlock sustainable growth.</p>
                <h2>Responsibilities</h2><ul>
                  <li>Support <KeywordMark keyword={keywords[0]} onClick={() => chooseKeyword(keywords[0])} /> development for new advertiser solutions and priority verticals.</li>
                  <li>Synthesize research, customer behavior, and competitor activity into actionable <KeywordMark keyword={keywords[1]} onClick={() => chooseKeyword(keywords[1])} />.</li>
                  <li>Work <KeywordMark keyword={keywords[3]} onClick={() => chooseKeyword(keywords[3])} /> with Product, Sales, Data Science, and Marketing partners.</li>
                  <li>Use <KeywordMark keyword={keywords[4]} onClick={() => chooseKeyword(keywords[4])} /> to analyze large datasets, evaluate opportunities, and track performance.</li>
                  <li>Design and interpret <KeywordMark keyword={keywords[5]} onClick={() => chooseKeyword(keywords[5])} /> to improve product positioning and campaign outcomes.</li>
                  <li>Turn complex findings into clear <KeywordMark keyword={keywords[6]} onClick={() => chooseKeyword(keywords[6])} /> for senior leaders.</li>
                </ul>
                <h2>Qualifications</h2><ul><li>Currently pursuing a Bachelor&apos;s or Master&apos;s degree in business, economics, analytics, or a related field.</li><li>Structured problem solving and strong written and verbal communication.</li><li>Comfort working in a fast-moving, global environment with limited direction.</li></ul>
                {manualTerms.length > 0 && <div className="manual-terms"><b>待匹配的手动关键词</b>{manualTerms.map((term) => <span key={term}>{term}<button onClick={() => setManualTerms((items) => items.filter((item) => item !== term))}><X /></button></span>)}</div>}
              </article></div>
              <div className="legend"><span><i className="green" />已覆盖</span><span><i className="yellow" />相近表达</span><span><i className="red" />未覆盖</span><span><i className="ignored" />已忽略</span><em>点击关键词，查看对应内容</em></div>
            </section>

            <section className="resume-pane">
              <div className="pane-header resume-head"><div><b>Strategy Master</b><span>自动保存副本 · 原始简历不会被修改</span></div><div className="pane-actions"><button aria-label="历史记录"><History /></button><button><ChevronDown />100%</button><button aria-label="更多"><MoreHorizontal /></button></div></div>
              <div className="word-ruler"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span></div>
              <div className="resume-scroll"><article className="resume-page" aria-label="可编辑简历">
                <header className="resume-title"><h1>ALEX MORGAN</h1><p>STRATEGY &amp; PRODUCT MARKETING</p><div>Los Angeles, CA &nbsp;•&nbsp; alex.morgan@email.com &nbsp;•&nbsp; linkedin.com/in/alexmorgan</div></header>
                <section><h2>EXPERIENCE</h2><div className="role-row"><b>Northstar Labs</b><b>Los Angeles, CA</b></div><div className="role-row"><i>Senior Strategy Associate</i><i>Aug 2024 – Present</i></div>
                  <ul className="resume-bullets">{resumeBullets.map((bullet, index) => {
                    const related = (selected.id === "strategy" || selected.id === "intel" || selected.id === "insights") ? index === 0 : selected.id === "xfn" || selected.id === "testing" ? index === 1 : index === 2;
                    const chars = resumeTexts[index].length;
                    return <li key={bullet.id} className={related ? `resume-match ${selected.status}` : ""}><div contentEditable suppressContentEditableWarning onBlur={(event) => setResumeTexts((texts) => texts.map((text, i) => i === index ? event.currentTarget.textContent || "" : text))}>{resumeTexts[index]}</div><span className={chars > 155 ? "line-budget over" : "line-budget"}>{Math.min(2, Math.ceil(chars / 78))}/{bullet.limit} 行</span><button className="favorite" onClick={() => toggleFavorite(bullet.id)} aria-label="收藏这条经历">{favoriteIds.includes(bullet.id) ? <BookmarkCheck /> : <Bookmark />}</button></li>;
                  })}</ul>
                </section>
                <section><h2>EDUCATION</h2><div className="role-row"><b>University of California, Los Angeles</b><b>Los Angeles, CA</b></div><div className="role-row"><i>B.A. Economics, Minor in Data Science</i><i>Jun 2024</i></div></section>
                <section><h2>SKILLS</h2><p><b>Analytics:</b> Excel, Tableau, customer segmentation, survey design &nbsp; | &nbsp; <b>Languages:</b> English, Mandarin</p></section>
              </article></div>

              {selected.status === "yellow" && <aside className="suggestion-card"><div className="suggestion-top"><span className="ai-icon"><WandSparkles /></span><div><b>措辞建议</b><span>意思相近，改成 JD 的用词可提高精确匹配</span></div><button onClick={() => updateStatus(selected.id, "ignored")}><X /></button></div><div className="change-preview"><span>{selected.resumeMatch}</span><span className="arrow">→</span><strong>{selected.suggestion}</strong></div><div className="suggestion-actions"><Button variant="ghost" onClick={() => updateStatus(selected.id, "ignored")}>忽略</Button><Button onClick={applyYellow}><Check />应用修改</Button></div></aside>}
              {selected.status === "green" && <aside className="matched-card"><span><Check /></span><div><b>已覆盖：{selected.label}</b><p>右侧高亮内容与 JD 要求一致，无需修改。</p></div><button onClick={() => updateStatus(selected.id, "ignored")}>忽略此项</button></aside>}
            </section>
          </div>
        </section>
      </div>

      {notice && <div className="toast"><Check />{notice}</div>}
      <Dialog open={redDialogOpen} onOpenChange={setRedDialogOpen}><DialogContent className="gap-0 overflow-hidden border-0 p-0 sm:max-w-[720px]"><DialogHeader className="border-b px-6 py-5"><div className="dialog-kicker"><span className="red-dot" />尚未覆盖</div><DialogTitle>怎样补入 “{selected.label}”</DialogTitle><DialogDescription>以下写法只改动现有信息结构。采用前请确认它准确反映你的真实经历。</DialogDescription></DialogHeader><div className="option-list">{(redSuggestions[selected.id] || redSuggestions.sql).map((option, index) => <button key={option.title} className="rewrite-option" onClick={() => applyRed(option)}><span className="option-number">{index + 1}</span><span className="option-copy"><span><b>{option.title}</b><em>{option.target}</em></span><p>{option.text}</p><small>{option.text.length > 155 ? "可能超过 2 行" : "预计保持 2 行"}</small></span><span className="apply-label">采用</span></button>)}</div><div className="dialog-alternatives"><span>这些都不合适？</span><button>指定一条经历</button><button>补充真实素材</button><button>我自己写</button></div><div className="dialog-footer"><button onClick={() => { updateStatus(selected.id, "ignored"); setRedDialogOpen(false); }}>忽略这个关键词</button><span><CircleHelp />AI 不会替你编造经历</span></div></DialogContent></Dialog>
      <input ref={fileRef} type="file" accept=".doc,.docx" className="hidden" onChange={() => showNotice("已添加一个基础简历版本")} />
    </main>
  );
}
