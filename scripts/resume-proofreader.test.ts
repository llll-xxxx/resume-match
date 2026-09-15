import assert from "node:assert/strict";
import { applyProofreadingFix, proofreadResume } from "../lib/resume-proofreader.ts";

const issues = proofreadResume([
  "Acheived  20% growth through teh teh launch!!",
  "Led teams and managed products",
  "TBD",
]);

assert(issues.some((issue) => issue.kind === "spelling" && issue.after === "Achieved"));
assert(issues.some((issue) => issue.kind === "spacing"));
assert(issues.some((issue) => issue.kind === "repetition"));
assert(issues.some((issue) => issue.kind === "punctuation"));
assert(issues.some((issue) => issue.kind === "placeholder"));
assert.equal(proofreadResume(["Led a team and launched the product across markets"]).length, 0);

const spelling = issues.find((issue) => issue.before === "Acheived")!;
assert.equal(applyProofreadingFix("Acheived 20% growth", spelling), "Achieved 20% growth");

console.log("resume proofreader tests passed");
