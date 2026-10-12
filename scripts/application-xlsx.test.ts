import assert from "node:assert/strict";
import JSZip from "jszip";
import { buildApplicationWorkbook } from "../features/resume-match/application-xlsx.ts";
import type { ApplicationProject, ResumeVersion } from "../features/resume-match/types.ts";

const project: ApplicationProject = {
  id: "project-1",
  name: "Amazon role",
  resumeId: "resume-1",
  jdUrl: "https://www.amazon.jobs/en/jobs/123/example?source=test&campaign=resume",
  jdText: "Job description",
  companyName: "Amazon",
  jobTitle: "GTM Strategy Manager",
  jobFunction: "GTM",
  applicationStage: "applied",
  applicationResult: "in_process",
  applicationDate: "2026-09-25",
  keywords: [{ id: "green", label: "strategy", status: "green" }, { id: "ignored", label: "finance", status: "ignored" }],
  resumeTexts: [],
  manualTerms: [],
  updatedAt: "2026-09-25T00:00:00.000Z",
};
const resumes: ResumeVersion[] = [{ id: "resume-1", name: "PM Resume", fileName: "resume.docx", texts: [], uploadedAt: "2026-09-25" }];
const blob = await buildApplicationWorkbook([project], resumes);
assert.ok(blob.size > 1000);
const archive = await JSZip.loadAsync(await blob.arrayBuffer());
for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/_rels/sheet1.xml.rels"]) assert.ok(archive.file(part), `missing ${part}`);
const sheet = await archive.file("xl/worksheets/sheet1.xml")!.async("string");
const relationships = await archive.file("xl/worksheets/_rels/sheet1.xml.rels")!.async("string");
assert.match(sheet, /GTM Strategy Manager/);
assert.match(sheet, /<v>1<\/v>/, "ignored keywords should still export 100% coverage");
assert.match(relationships, /amazon\.jobs/);
assert.match(relationships, /&amp;/, "query-string URLs must be XML escaped");

console.log("application xlsx tests passed");
