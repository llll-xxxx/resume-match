import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyProofreadingFix, configureProofreadingDictionary, proofreadResume } from "../lib/resume-proofreader.ts";

configureProofreadingDictionary({
  aff: readFileSync(new URL("../public/dictionaries/en/index.aff", import.meta.url)),
  dic: readFileSync(new URL("../public/dictionaries/en/index.dic", import.meta.url)),
});

const issues = proofreadResume([
  "Xiang  Li",
  "xiang.li@example.com   |   +1 555 123 4567",
  "Acheived  20% growth through teh teh launch!!",
  "Led teams and managed products",
  "TBD",
]);

assert(issues.some((issue) => issue.kind === "spelling" && issue.after === "Achieved"));
assert(issues.some((issue) => issue.kind === "spacing"));
assert(issues.some((issue) => issue.kind === "repetition"));
assert(issues.some((issue) => issue.kind === "punctuation"));
assert(issues.some((issue) => issue.kind === "placeholder"));
assert(proofreadResume(["Managed cross-functional projcts and improved retention"])
  .some((issue) => issue.kind === "spelling" && issue.before === "projcts" && issue.after === "projects"));
assert.equal(proofreadResume(["Led a team and launched the product across markets"]).length, 0);
assert.equal(issues.some((issue) => issue.lineIndex < 2), false);

const spelling = issues.find((issue) => issue.before === "Acheived")!;
assert.equal(applyProofreadingFix("Acheived 20% growth", spelling), "Achieved 20% growth");

console.log("resume proofreader tests passed");
