import { ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResumeVersion } from "../types";

type Props = {
  resumes: ResumeVersion[];
  activeResumeId: string;
  onSelectResume: (id: string) => void;
  jdUrl: string;
  setJdUrl: (value: string) => void;
  jdText: string;
  setJdText: (value: string) => void;
  onUpload: () => void;
  onCreate: () => void;
  loading: boolean;
};

export function ProjectSetup({ resumes, activeResumeId, onSelectResume, jdUrl, setJdUrl, jdText, setJdText, onUpload, onCreate, loading }: Props) {
  return <section className="project-setup"><div className="setup-card"><span className="setup-kicker">新建申请项目</span><h1>用真实简历匹配真实 JD</h1><p>先选择基础简历，再粘贴职位链接。若网站限制自动读取，可以把 JD 正文粘贴到备用文本框。</p><div className="setup-step resume-choice-step"><span>1</span><div><b>基础简历</b><div className="resume-choice-controls"><label><small>选择已有简历</small>{resumes.length ? <select value={activeResumeId} onChange={(event) => onSelectResume(event.target.value)}>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name} · {resume.fileName}</option>)}</select> : <p>尚未上传 Word 简历</p>}</label><span className="choice-divider">或</span><div className="upload-new-option"><small>使用另一份简历</small><Button variant="outline" onClick={onUpload}><Upload />上传新简历</Button></div></div></div></div><div className="setup-step vertical"><span>2</span><div><b>职位描述</b><input value={jdUrl} onChange={(event) => setJdUrl(event.target.value)} placeholder="粘贴职位官网链接，例如 https://company.com/jobs/..." /><textarea value={jdText} onChange={(event) => setJdText(event.target.value)} placeholder="可选：如果网页无法读取，请把 JD 正文粘贴到这里" /></div></div><Button className="setup-submit" onClick={onCreate} disabled={loading || !activeResumeId || (!jdUrl.trim() && !jdText.trim())}>{loading ? "正在读取并建立项目…" : "读取 JD 并开始匹配"}<ArrowRight /></Button></div></section>;
}
