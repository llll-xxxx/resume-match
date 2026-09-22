import { matchConceptToResume, sameSurfaceFamily, surfacePattern, type CurrentLexicon, type LocalKeywordMatch } from "@/lib/keyword-matcher";
import type { ApplicationProject, Keyword } from "./types";

export function localDateStamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

export function projectCoverage(project: ApplicationProject) {
  if (!project.keywords.length) return 0;
  return Math.round((project.keywords.filter((keyword) => keyword.status === "green").length / project.keywords.length) * 100);
}

export function normalizeStoredKeywords(keywords: Keyword[], lexicon: CurrentLexicon, manualTerms: string[] = []) {
  const seen = new Set<string>();
  return keywords.flatMap((keyword) => {
    const manuallySelected = keyword.source === "manual" || manualTerms.some((term) => sameSurfaceFamily(term, keyword.label));
    const concept = lexicon.concepts.find((candidate) => candidate.id === keyword.conceptId);
    const knownTerm = concept?.terms.some((term) => sameSurfaceFamily(term.value, keyword.label));
    if (!manuallySelected && !knownTerm) return [];
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

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim() || "resume";
}

export function renderFileNameTemplate(template: string, values: { projectName: string; company: string; jobTitle: string; date: string }) {
  return safeFileName(template.replace(/\{projectName\}/g, values.projectName).replace(/\{company\}/g, values.company).replace(/\{jobTitle\}/g, values.jobTitle).replace(/\{date\}/g, values.date));
}

export function findConceptBySurface(value: string, lexicon: CurrentLexicon) {
  return lexicon.concepts.find((concept) => concept.terms.some((term) => sameSurfaceFamily(value, term.value)));
}

export function unresolvedManualTerms(terms: string[], lexicon: CurrentLexicon) {
  return terms.filter((term, index) => !findConceptBySurface(term, lexicon) && terms.findIndex((candidate) => candidate.toLowerCase() === term.toLowerCase()) === index);
}

export function contextForTerm(jd: string, term: string) {
  const match = surfacePattern(term).exec(jd);
  if (!match?.index && match?.index !== 0) return term;
  const start = match.index;
  const end = start + match[0].length;
  const left = Math.max(jd.lastIndexOf(".", start - 1), jd.lastIndexOf("\n", start - 1));
  const rightCandidates = [jd.indexOf(".", end), jd.indexOf("\n", end)].filter((index) => index >= 0);
  const right = rightCandidates.length ? Math.min(...rightCandidates) + 1 : Math.min(jd.length, end + 320);
  return jd.slice(left + 1, right).trim();
}

export function synonymSearchConcepts(input: string, lexicon: CurrentLexicon) {
  const values = input.split(/[,，]/).map((value) => value.trim()).filter(Boolean);
  const matches = values.flatMap((value) => {
    const concept = findConceptBySurface(value, lexicon);
    return concept ? [{ value, concept }] : [];
  });
  return { values, matches, conceptIds: Array.from(new Set(matches.map(({ concept }) => concept.id))) };
}

export function keywordFromLocalMatch(match: LocalKeywordMatch, index: number): Keyword {
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

export function rematchKeywordsLocally(items: Keyword[], lines: string[], lexicon: CurrentLexicon) {
  return items.map((item) => {
    if (item.status === "ignored" || item.userApproved) return item;
    const concept = lexicon.concepts.find((candidate) => candidate.id === item.conceptId)
      || { id: item.conceptId || item.id, label: item.label, terms: [item.label, ...(item.aliases || [])].map((value) => ({ value, source: "llm" as const })) };
    const match = matchConceptToResume(item.label, concept, lines);
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

export function isResumeBullet(text: string) {
  const value = text.trim();
  if (value.length < 45 || value.length > 520) return false;
  if (/@|https?:\/\/|linkedin\.com|\+?\d[\d\s().-]{7,}\d/i.test(value)) return false;
  if (/^(education|experience|professional experience|work experience|skills|additional information|leadership|projects?|summary|profile|honors?|certifications?)\s*:?[\s|]*$/i.test(value)) return false;
  if (/^[A-Z][A-Z &,/.-]{2,50}$/.test(value)) return false;
  if (/\b(university|business school|bachelor(?:'s)?|master(?:'s)?|mba|gpa|double major|graduat(?:ed|ion)|coursework)\b/i.test(value)) return false;
  const actionOrOutcome = /\b(led|owned|built|launched|developed|defined|drove|managed|created|designed|analyzed|delivered|increased|reduced|improved|grew|generated|secured|partnered|collaborated|conducted|established|implemented|optimized|translated|identified|advised|supported|spearheaded|negotiated|achieved)\b/i;
  return actionOrOutcome.test(value) || /[%$]\s?\d|\d+%|\b\d+x\b/i.test(value);
}

export function relevantResumeLines(texts: string[], keyword: string) {
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
