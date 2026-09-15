export type ProofreadingIssue = {
  id: string;
  lineIndex: number;
  kind: "spelling" | "spacing" | "punctuation" | "repetition" | "placeholder";
  message: string;
  excerpt: string;
  before?: string;
  after?: string;
};

// Deliberately limited to high-confidence mistakes common in English resumes.
// This checker does not make article, grammar, or singular/plural judgments.
const COMMON_MISSPELLINGS: Record<string, string> = {
  acheived: "achieved", adress: "address", analysys: "analysis", buisness: "business",
  colaborated: "collaborated", developement: "development", efficency: "efficiency",
  enviroment: "environment", experiance: "experience", goverment: "government",
  implemenation: "implementation", improvment: "improvement", independant: "independent",
  maintainance: "maintenance", managment: "management", occured: "occurred",
  oportunity: "opportunity", performence: "performance", recieve: "receive",
  responsability: "responsibility", seperate: "separate", succesful: "successful",
  sucessfully: "successfully", teh: "the", untill: "until", wich: "which",
};

function preserveCase(source: string, replacement: string) {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (/^[A-Z]/.test(source)) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function excerpt(text: string, start: number, length: number) {
  const from = Math.max(0, start - 28);
  const to = Math.min(text.length, start + length + 28);
  return `${from ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}

export function proofreadResume(texts: string[]): ProofreadingIssue[] {
  const issues: ProofreadingIssue[] = [];
  const add = (lineIndex: number, kind: ProofreadingIssue["kind"], message: string, text: string, start: number, length: number, before?: string, after?: string) => {
    issues.push({ id: `${lineIndex}-${kind}-${start}-${issues.length}`, lineIndex, kind, message, excerpt: excerpt(text, start, length), before, after });
  };

  texts.forEach((text, lineIndex) => {
    for (const match of text.matchAll(/\b[A-Za-z][A-Za-z'-]*\b/g)) {
      const correction = COMMON_MISSPELLINGS[match[0].toLowerCase()];
      if (correction) add(lineIndex, "spelling", `可能的拼写错误：${match[0]}`, text, match.index, match[0].length, match[0], preserveCase(match[0], correction));
    }
    for (const match of text.matchAll(/\b([A-Za-z][A-Za-z'-]*)\s+\1\b/gi)) {
      add(lineIndex, "repetition", `单词重复：${match[1]}`, text, match.index, match[0].length, match[0], match[1]);
    }
    for (const match of text.matchAll(/[ \t]{2,}/g)) {
      add(lineIndex, "spacing", "发现多余空格", text, match.index, match[0].length, match[0], " ");
    }
    for (const match of text.matchAll(/\s+([,;:.!?])/g)) {
      add(lineIndex, "spacing", `标点“${match[1]}”前有多余空格`, text, match.index, match[0].length, match[0], match[1]);
    }
    for (const match of text.matchAll(/([,;:!?])\1+/g)) {
      add(lineIndex, "punctuation", `标点“${match[1]}”重复`, text, match.index, match[0].length, match[0], match[1]);
    }
    for (const match of text.matchAll(/\b(?:TODO|TBD|FIXME|XXX)\b|\[(?:insert|add|replace)[^\]]*\]/gi)) {
      add(lineIndex, "placeholder", "发现尚未清理的占位文字", text, match.index, match[0].length);
    }
  });

  return issues;
}

export function applyProofreadingFix(text: string, issue: ProofreadingIssue) {
  if (!issue.before || issue.after === undefined) return text;
  const position = text.indexOf(issue.before);
  if (position < 0) return text;
  return text.slice(0, position) + issue.after + text.slice(position + issue.before.length);
}
