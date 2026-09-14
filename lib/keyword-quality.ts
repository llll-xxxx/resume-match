const GENERIC_LABELS = new Set([
  "ad", "ads", "experience", "experiences", "experiment", "experiments",
  "legally", "ownership", "package", "packages", "platform", "platforms",
  "pmt", "pmts", "position", "positions", "segment", "segments", "business segment", "business segments", "something",
  "software engineer", "software engineers",
]);

const EXCLUDED_CONTEXT_PATTERNS = [
  /equal opportunity employer|does not discriminate|protected (?:veteran )?status/i,
  /workplace accommodation|application and hiring process|recruiting partner/i,
  /base salary|salary range|final compensation|sign-on payments?|restricted stock units?|comprehensive benefits/i,
  /health insurance|dental|vision|401\(k\)|paid time off|parental leave/i,
  /universe of opportunity|career doesn[’']t follow|part of something big|ready to start your adventure/i,
  /world class tools|endless opportunities|what[’']s in it for you/i,
  /examples of organizations where .* may work include/i,
  /customer base .* span across/i,
];

export function isUsefulKeywordCandidate(label: string, evidence = "") {
  const normalized = label.trim().toLowerCase().replace(/[‐‑‒–—]/g, "-").replace(/\s+/g, " ");
  if (!normalized || GENERIC_LABELS.has(normalized)) return false;
  if (EXCLUDED_CONTEXT_PATTERNS.some((pattern) => pattern.test(evidence))) return false;
  if (/^payments?$/.test(normalized) && /salary|compensation|sign-on|stock units?|benefits/i.test(evidence)) return false;
  return true;
}
