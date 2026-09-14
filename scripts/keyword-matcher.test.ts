import assert from "node:assert/strict";
import {
  addTermsToCurrentLexicon,
  createCurrentLexicon,
  isCurrentLexicon,
  sameSurfaceFamily,
  scanKnownKeywords,
  upgradeCurrentLexicon,
} from "../lib/keyword-matcher";
import { loadCurrentLexicon, saveCurrentLexicon } from "../lib/keyword-store";
import { isUsefulKeywordCandidate } from "../lib/keyword-quality";

const base = createCurrentLexicon();

const crossFunctional = scanKnownKeywords(
  "You will work cross-functionally with engineering and marketing.",
  ["Led cross-functional communication across product and engineering."],
  base,
).find((keyword) => keyword.conceptId === "cross_functional");
assert.equal(crossFunctional?.status, "green");

const marketIntelligence = scanKnownKeywords(
  "Turn market intelligence into product recommendations.",
  ["Delivered market insights that shaped the product roadmap."],
  base,
).find((keyword) => keyword.conceptId === "market_insights");
assert.equal(marketIntelligence?.status, "yellow");
assert.match(marketIntelligence?.resumeMatch || "", /market insights/i);

const pluralMatch = scanKnownKeywords(
  "Track market trends and competitive dynamics.",
  ["Analyzed a market trend across three customer segments."],
  base,
).find((keyword) => keyword.conceptId === "market_trends");
assert.equal(pluralMatch?.status, "green");

const executiveAudience = scanKnownKeywords(
  "Present recommendations to senior leadership.",
  ["Presented product strategy to C-suite executives."],
  base,
).find((keyword) => keyword.conceptId === "senior_leadership");
assert.equal(executiveAudience?.status, "yellow");

const redMatch = scanKnownKeywords(
  "Own pricing and packaging for enterprise products.",
  ["Led customer research and product discovery."],
  base,
).find((keyword) => keyword.conceptId === "pricing");
assert.equal(redMatch?.status, "red");

const learned = addTermsToCurrentLexicon(base, {
  conceptId: "market_insights",
  label: "market study",
  source: "llm",
}).lexicon;
const learnedMatch = scanKnownKeywords(
  "Lead an annual market study for senior leadership.",
  ["Produced market intelligence for strategic planning."],
  learned,
).find((keyword) => keyword.conceptId === "market_insights");
assert.equal(learnedMatch?.status, "yellow");
assert.ok(learned.concepts.find((concept) => concept.id === "market_insights")?.terms.some((term) => term.value === "market study" && term.source === "llm"));

const withoutMechanicalAlias = addTermsToCurrentLexicon(learned, {
  conceptId: "market_insights",
  label: "market study",
  aliases: ["market studies"],
  source: "llm",
}).lexicon;
assert.equal(withoutMechanicalAlias.concepts.find((concept) => concept.id === "market_insights")?.terms.some((term) => term.value === "market studies"), false);

const upgraded = upgradeCurrentLexicon({ ...withoutMechanicalAlias, baseVersion: "1.0.0", concepts: [...withoutMechanicalAlias.concepts, { id: "removed_base_concept", label: "removed", terms: [{ value: "removed", source: "base" }] }] });
assert.equal(upgraded.concepts.some((concept) => concept.id === "removed_base_concept"), false);

assert.equal(isCurrentLexicon(JSON.parse(JSON.stringify(learned))), true);
assert.equal(sameSurfaceFamily("product requirement", "product requirements"), true);
assert.equal(sameSurfaceFamily("prioritize", "prioritize features"), false);
assert.equal(sameSurfaceFamily("product management", "technical product management"), false);
assert.equal(sameSurfaceFamily("software", "software as a service"), false);

const amazonNoise = scanKnownKeywords(
  `You are part of something big. You'll work with world class tools, global platforms, and experiment and launch solutions.
PMTs are the end-to-end owners of our software offerings. PMTs are set on a path to become leaders of business segments.
Key job responsibilities
Developing and executing scalable business plans and product requirements. Maintaining customer-focus. Managing milestones and overall roadmap.
Examples of organizations where PMTs may work include Game Services and Supply Chain Technologies.
Preferred Qualifications
A background in product management, solution design, machine learning applications, and software services is preferred.
Amazon is an equal opportunity employer and does not discriminate on the basis of legally protected status.
The base salary range for this position is listed below. Your Amazon package will include sign-on payments and restricted stock units.`,
  ["Defined product requirements and roadmap for machine learning products."],
  createCurrentLexicon(),
);
const amazonLabels = amazonNoise.map((keyword) => keyword.label.toLowerCase());
for (const noise of ["something", "platforms", "experiment", "pmts", "segments", "game", "supply chain", "legally", "position", "package", "payments", "ad"]) {
  assert.equal(amazonLabels.includes(noise), false, `should exclude ${noise}`);
}
assert.ok(amazonLabels.includes("product requirements"));
assert.ok(amazonLabels.includes("machine learning"));

for (const noise of [
  "software offerings", "hardware", "technical services", "technical organizations",
  "business owner", "dive deep into the technology", "technology-driven products",
  "business stakeholders", "software services", "define, build, launch and grow",
  "representing and advocating for critical customers", "machine learning applications",
]) {
  assert.equal(isUsefulKeywordCandidate(noise), false, `should reject noisy keyword ${noise}`);
}

const polluted = addTermsToCurrentLexicon(base, { label: "software offerings", source: "llm" }).lexicon;
const cleaned = upgradeCurrentLexicon({ ...polluted, baseVersion: "1.2.0" });
assert.equal(cleaned.concepts.some((concept) => concept.terms.some((term) => term.source === "llm")), false);

const manuallyChosen = addTermsToCurrentLexicon(base, { label: "hardware", source: "manual" }).lexicon;
const upgradedManual = upgradeCurrentLexicon({ ...manuallyChosen, baseVersion: "1.3.0" });
assert.ok(upgradedManual.concepts.some((concept) => concept.terms.some((term) => term.value === "hardware" && term.source === "manual")));
const manualMatch = scanKnownKeywords(
  "Hardware experience is preferred.",
  ["Built hardware prototypes for customer testing."],
  upgradedManual,
).find((keyword) => keyword.label.toLowerCase() === "hardware");
assert.equal(manualMatch?.status, "green");
assert.equal(manualMatch?.source, "manual");

const memory = new Map<string, string>();
const storage = { getItem: (key: string) => memory.get(key) || null, setItem: (key: string, value: string) => { memory.set(key, value); } };
saveCurrentLexicon(storage, learned);
assert.equal(loadCurrentLexicon(storage).revision, learned.revision);
console.log("keyword matcher tests passed");
