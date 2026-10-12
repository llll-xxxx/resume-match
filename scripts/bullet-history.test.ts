import assert from "node:assert/strict";
import { adaptHistoricalBullets, inferJobFunction, keywordCoverage, normalizeApplicationProject, normalizeCompanyName } from "../features/resume-match/domain.ts";
import { createCurrentLexicon } from "../lib/keyword-matcher.ts";
import type { BulletHistoryEntry, Keyword } from "../features/resume-match/types.ts";

const timestamp = "2026-09-25T00:00:00.000Z";
const historicalText = "Conducted data analysis to identify customer adoption trends and guide product decisions.";
const currentText = "Conducted customer research to identify adoption trends and guide product decisions.";
const history: BulletHistoryEntry[] = [{
  id: "history-1",
  conceptId: "data_analysis",
  conceptLabel: "data analysis",
  keywordLabel: "data analysis",
  text: historicalText,
  origin: "manual",
  sourceText: currentText,
  sourceResumeId: "resume-1",
  sourceIndex: 3,
  createdAt: timestamp,
  updatedAt: timestamp,
  useCount: 2,
}];
const keyword: Keyword = { id: "keyword-1", conceptId: "data_analysis", label: "data analytics", status: "red" };
const resumeTexts = ["NAME", "EXPERIENCE", "Company", currentText];

const [recommendation] = adaptHistoricalBullets(keyword, history, createCurrentLexicon(), resumeTexts, "resume-1");
assert.equal(recommendation.historicalText, historicalText);
assert.equal(recommendation.recommendedText, "Conducted data analytics to identify customer adoption trends and guide product decisions.");
assert.equal(recommendation.targetIndex, 3);
assert.equal(recommendation.replacedTerm, "data analysis");

const otherResume = adaptHistoricalBullets(keyword, history, createCurrentLexicon(), ["Led data programs across the organization."], "resume-2")[0];
assert.equal(otherResume.targetIndex, 0, "source index from another resume must not be reused blindly");

assert.equal(keywordCoverage([]), 0, "a project without extracted keywords should stay at zero");
assert.equal(keywordCoverage([
  { id: "green-1", label: "strategy", status: "green" },
  { id: "ignored-1", label: "finance", status: "ignored" },
]), 100, "ignored keywords must not reduce coverage");
assert.equal(keywordCoverage([
  { id: "ignored-1", label: "finance", status: "ignored" },
]), 100, "a fully reviewed list containing only ignored keywords is complete");
assert.equal(keywordCoverage([
  { id: "green-1", label: "strategy", status: "green" },
  { id: "red-1", label: "pricing", status: "red" },
  { id: "ignored-1", label: "finance", status: "ignored" },
]), 50, "unresolved non-ignored keywords must still reduce coverage");

assert.equal(normalizeCompanyName("Amazon LLC.A51"), "Amazon");
assert.equal(normalizeCompanyName("Amazon Development Center LLC", "https://www.amazon.jobs/en/jobs/123/example"), "Amazon");
assert.equal(inferJobFunction("GTM Strategy Manager"), "GTM");
assert.equal(inferJobFunction("Business Operations Manager"), "BizOps");
assert.equal(inferJobFunction("Corporate Development Associate"), "Corporate Development");
const normalizedDraft = normalizeApplicationProject({
  id: "project-1", name: "Draft", resumeId: "resume-1", jdUrl: "", jdText: "", companyName: "Amazon LLC.A51", jobTitle: "GTM Strategy Manager",
  keywords: [], resumeTexts: [], manualTerms: [], updatedAt: timestamp,
});
assert.equal(normalizedDraft.companyName, "Amazon");
assert.equal(normalizedDraft.jobFunction, "GTM");
assert.equal(normalizedDraft.applicationStage, "editing");
assert.equal(normalizedDraft.applicationResult, "", "editing records must not have an application result");

console.log("bullet history tests passed");
