import nspell, { type NSpell } from "nspell";

export type ProofreadingIssue = {
  id: string;
  lineIndex: number;
  kind: "spelling" | "spacing" | "punctuation" | "repetition" | "placeholder";
  message: string;
  excerpt: string;
  start: number;
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

// Common resume and technology terms that the general-purpose US dictionary omits.
const RESUME_TERMS = new Set([
  "agile", "backend", "codebase", "cybersecurity", "devops", "ecommerce", "fintech",
  "frontend", "go-to-market", "microservice", "microservices", "onboarding", "roadmap",
  "roadmaps", "saas", "scalable", "scrum", "skillset", "skillsets", "startup", "startups",
]);

let spellChecker: NSpell | undefined;
let dictionaryLoading: Promise<void> | undefined;

export function configureProofreadingDictionary(dictionary: { aff: string | Uint8Array; dic: string | Uint8Array }) {
  spellChecker = nspell(dictionary.aff, dictionary.dic);
}

export function loadProofreadingDictionary() {
  if (spellChecker) return Promise.resolve();
  if (!dictionaryLoading) {
    dictionaryLoading = Promise.all([
      fetch("/dictionaries/en/index.aff").then((response) => {
        if (!response.ok) throw new Error(`无法加载拼写规则（${response.status}）`);
        return response.text();
      }),
      fetch("/dictionaries/en/index.dic").then((response) => {
        if (!response.ok) throw new Error(`无法加载英文词典（${response.status}）`);
        return response.text();
      }),
    ]).then(([aff, dic]) => configureProofreadingDictionary({ aff, dic })).catch((error) => {
      dictionaryLoading = undefined;
      throw error;
    });
  }
  return dictionaryLoading;
}

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

function isContactHeaderLine(text: string, lineIndex: number) {
  if (lineIndex > 7) return false;
  const value = text.trim();
  const digitCount = (value.match(/\d/g) || []).length;
  const nameParts = value.split(/\s+/);
  const likelyName = lineIndex === 0 && nameParts.length >= 2 && nameParts.length <= 5
    && nameParts.every((part) => /^[A-Z][A-Za-z'.-]*$/.test(part));
  return likelyName || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) || digitCount >= 7 || /(?:linkedin|github|https?:\/\/|www\.)/i.test(value);
}

function isKnownCompound(word: string) {
  if (!spellChecker || !word.includes("-")) return false;
  return word.split("-").every((part) => part && spellChecker?.correct(part));
}

export function proofreadResume(texts: string[]): ProofreadingIssue[] {
  const issues: ProofreadingIssue[] = [];
  const add = (lineIndex: number, kind: ProofreadingIssue["kind"], message: string, text: string, start: number, length: number, before?: string, after?: string) => {
    issues.push({ id: `${lineIndex}-${kind}-${start}-${issues.length}`, lineIndex, kind, message, excerpt: excerpt(text, start, length), start, before, after });
  };

  texts.forEach((text, lineIndex) => {
    // Names and contact details often use deliberate spacing for visual alignment.
    // They are excluded from proofreading to avoid irrelevant warnings.
    if (isContactHeaderLine(text, lineIndex)) return;
    for (const match of text.matchAll(/\b[A-Za-z][A-Za-z'-]*\b/g)) {
      const correction = COMMON_MISSPELLINGS[match[0].toLowerCase()];
      if (correction) {
        add(lineIndex, "spelling", `可能的拼写错误：${match[0]}`, text, match.index, match[0].length, match[0], preserveCase(match[0], correction));
        continue;
      }
      if (!spellChecker || match[0].length === 1 || match[0] === match[0].toUpperCase() || /[A-Z].*[A-Z]/.test(match[0])) continue;
      if (RESUME_TERMS.has(match[0].toLowerCase()) || spellChecker.correct(match[0]) || isKnownCompound(match[0])) continue;
      const suggestion = spellChecker.suggest(match[0])[0];
      add(
        lineIndex,
        "spelling",
        `词典中未找到：${match[0]}`,
        text,
        match.index,
        match[0].length,
        suggestion ? match[0] : undefined,
        suggestion ? preserveCase(match[0], suggestion) : undefined,
      );
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
  if (text.slice(issue.start, issue.start + issue.before.length) !== issue.before) return text;
  return text.slice(0, issue.start) + issue.after + text.slice(issue.start + issue.before.length);
}
