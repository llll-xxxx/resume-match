import { KEYWORD_CONCEPTS, KEYWORD_LEXICON_VERSION } from "@/lib/keyword-lexicon";

export type KeywordTermSource = "base" | "manual" | "llm";
export type CurrentKeywordTerm = { value: string; source: KeywordTermSource; addedAt?: string };
export type CurrentKeywordConcept = { id: string; label: string; terms: CurrentKeywordTerm[] };
export type CurrentLexicon = { baseVersion: string; revision: number; updatedAt: string; concepts: CurrentKeywordConcept[] };
export type LocalKeywordMatch = { conceptId: string; label: string; evidence: string; source: KeywordTermSource; status: "green" | "yellow" | "red"; resumeMatch?: string; suggestion?: string };

const STOP_WORDS = new Set(["and", "or", "the", "a", "an", "of", "to", "for", "with", "in", "on", "across", "into"]);
const cleanTerm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

function dedupeTerms(terms: CurrentKeywordTerm[]) {
  const seen = new Set<string>();
  return terms.map((term) => ({ ...term, value: cleanTerm(term.value) })).filter((term) => {
    if (!term.value || seen.has(term.value)) return false;
    seen.add(term.value);
    return true;
  });
}

function baseConcepts(): CurrentKeywordConcept[] {
  return KEYWORD_CONCEPTS.map((concept) => ({ id: concept.id, label: concept.label, terms: concept.terms.map((value) => ({ value: cleanTerm(value), source: "base" as const })) }));
}

export function createCurrentLexicon(): CurrentLexicon {
  return { baseVersion: KEYWORD_LEXICON_VERSION, revision: 1, updatedAt: new Date().toISOString(), concepts: baseConcepts() };
}

export function isCurrentLexicon(value: unknown): value is CurrentLexicon {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CurrentLexicon>;
  return typeof candidate.baseVersion === "string" && typeof candidate.revision === "number" && Array.isArray(candidate.concepts);
}

/** Merge a new packaged base version into the persisted full lexicon once. */
export function upgradeCurrentLexicon(stored: CurrentLexicon): CurrentLexicon {
  if (stored.baseVersion === KEYWORD_LEXICON_VERSION) return stored;
  const merged = new Map(stored.concepts.map((concept) => [concept.id, { ...concept, terms: [...concept.terms] }]));
  const nextBase = baseConcepts();
  const nextBaseIds = new Set(nextBase.map((concept) => concept.id));
  for (const [id, concept] of merged) {
    if (nextBaseIds.has(id)) continue;
    const learnedTerms = concept.terms.filter((term) => term.source === "manual");
    if (learnedTerms.length) concept.terms = learnedTerms;
    else merged.delete(id);
  }
  for (const base of nextBase) {
    const existing = merged.get(base.id);
    if (!existing) merged.set(base.id, base);
    else {
      existing.label = base.label;
      existing.terms = dedupeTerms([...base.terms, ...existing.terms.filter((term) => term.source === "manual")]);
    }
  }
  return { baseVersion: KEYWORD_LEXICON_VERSION, revision: stored.revision + 1, updatedAt: new Date().toISOString(), concepts: Array.from(merged.values()) };
}

export function addTermsToCurrentLexicon(current: CurrentLexicon, input: { conceptId?: string | null; label: string; aliases?: readonly string[]; source: "manual" | "llm" }): { lexicon: CurrentLexicon; conceptId: string } {
  const label = input.label.trim().replace(/\s+/g, " ");
  const requestedId = input.conceptId?.trim();
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "keyword";
  const conceptId = requestedId && current.concepts.some((concept) => concept.id === requestedId) ? requestedId : `learned_${slug}`;
  const timestamp = new Date().toISOString();
  const semanticAliases = (input.aliases || []).filter((alias) => !sameSurfaceFamily(alias, label));
  const additions = [label, ...semanticAliases].map((value) => ({ value: cleanTerm(value), source: input.source, addedAt: timestamp } as CurrentKeywordTerm));
  const concepts = current.concepts.map((concept) => concept.id === conceptId ? { ...concept, terms: dedupeTerms([...concept.terms, ...additions]) } : concept);
  if (!concepts.some((concept) => concept.id === conceptId)) concepts.push({ id: conceptId, label, terms: dedupeTerms(additions) });
  return { lexicon: { ...current, revision: current.revision + 1, updatedAt: timestamp, concepts }, conceptId };
}

export function relinkLearnedConcept(current: CurrentLexicon, input: { fromConceptId: string; toConceptId: string; label: string; aliases?: readonly string[] }): CurrentLexicon {
  if (input.fromConceptId === input.toConceptId || !current.concepts.some((concept) => concept.id === input.toConceptId)) return current;
  const linked = addTermsToCurrentLexicon(current, { conceptId: input.toConceptId, label: input.label, aliases: input.aliases, source: "llm" }).lexicon;
  if (!input.fromConceptId.startsWith("learned_")) return linked;
  return { ...linked, revision: linked.revision + 1, updatedAt: new Date().toISOString(), concepts: linked.concepts.filter((concept) => concept.id !== input.fromConceptId) };
}

export function morphologyStem(value: string) {
  let word = value.toLowerCase();
  if (/yses$/.test(word)) word = word.replace(/yses$/, "ysis");
  else if (/ies$/.test(word)) word = word.replace(/ies$/, "y");
  else if (/ied$/.test(word)) word = word.replace(/ied$/, "y");
  word = word.replace(/ically$/, "ic").replace(/ally$/, "al").replace(/ality$/, "al");
  word = word.replace(/(?:ments?|ness)$/i, "").replace(/(?:ation|ition|tion)$/i, "");
  word = word.replace(/(?:ing|ed)$/i, "").replace(/(?:es|s)$/i, "");
  word = word.replace(/al$/i, "");
  if (word.length > 4) word = word.replace(/e$/i, "");
  return word;
}

export function surfacePattern(value: string, global = false) {
  const words = (value.match(/[a-z0-9+#]+/gi) || []).filter((word) => word.length > 1 && !STOP_WORDS.has(word.toLowerCase()));
  if (!words.length) return /$a/g;
  const separator = "[\\s&/,-]+(?:(?:and|or|the|of|to|for|with|in|on|across|into)[\\s&/,-]+)*";
  const exactWords = new Set(["ads", "experimentation", "gaming", "legal", "packaging", "positioning", "segmentation"]);
  const source = `\\b${words.map((word) => {
    if (exactWords.has(word.toLowerCase())) return word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stem = morphologyStem(word);
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return stem.length <= 3 || /\d/.test(stem) ? escaped : `${escaped}[a-z]*`;
  }).join(separator)}\\b`;
  return new RegExp(source, global ? "gi" : "i");
}

export function findSurfaceMatch(text: string, value: string) {
  return text.match(surfacePattern(value))?.[0] || null;
}

export function sameSurfaceFamily(left: string, right: string) {
  const tokens = (value: string) => (value.match(/[a-z0-9+#]+/gi) || [])
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word.toLowerCase()))
    .map(morphologyStem);
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  return leftTokens.length > 0 && leftTokens.length === rightTokens.length && leftTokens.every((token, index) => token === rightTokens[index]);
}

function evidenceFor(text: string, start: number, end: number) {
  const sentenceStart = Math.max(text.lastIndexOf(".", start - 1), text.lastIndexOf("\n", start - 1));
  const candidates = [text.indexOf(".", end), text.indexOf("\n", end)].filter((index) => index >= 0);
  const sentenceEnd = candidates.length ? Math.min(...candidates) + 1 : Math.min(text.length, end + 180);
  return text.slice(sentenceStart + 1, sentenceEnd).trim();
}

export function matchConceptToResume(label: string, concept: CurrentKeywordConcept, resumeLines: readonly string[]): Omit<LocalKeywordMatch, "conceptId" | "label" | "evidence" | "source"> {
  for (const line of resumeLines) {
    const match = findSurfaceMatch(line, label);
    if (match) return { status: "green", resumeMatch: match };
  }
  for (const { value: alias } of concept.terms) {
    if (sameSurfaceFamily(alias, label)) continue;
    for (const line of resumeLines) {
      const match = findSurfaceMatch(line, alias);
      if (match) return { status: "yellow", resumeMatch: match, suggestion: label };
    }
  }
  return { status: "red" };
}

export function scanKnownKeywords(jd: string, resumeLines: readonly string[], lexicon: CurrentLexicon): LocalKeywordMatch[] {
  const candidates = lexicon.concepts.flatMap((concept) => concept.terms.flatMap(({ value, source }) => {
    const match = jd.matchAll(surfacePattern(value, true)).next().value;
    if (!match) return [];
    const evidence = evidenceFor(jd, match.index, match.index + match[0].length);
    return [{ concept, source, sourceText: match[0], start: match.index, end: match.index + match[0].length, evidence }];
  })).sort((left, right) => left.start - right.start || right.sourceText.length - left.sourceText.length);
  const accepted = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const existing = accepted.get(candidate.concept.id);
    if (!existing || candidate.sourceText.length > existing.sourceText.length) accepted.set(candidate.concept.id, candidate);
  }
  return Array.from(accepted.values()).sort((left, right) => left.start - right.start).map(({ concept, source, sourceText, evidence }) => ({ conceptId: concept.id, label: sourceText, evidence, source, ...matchConceptToResume(sourceText, concept, resumeLines) }));
}
