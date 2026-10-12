import type { ApplicationProject, ResumeVersion } from "./types.ts";
import { APPLICATION_RESULT_LABELS, APPLICATION_STAGE_LABELS } from "./constants.ts";
import { projectCoverage } from "./domain.ts";

function xml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let value = index + 1;
  let output = "";
  while (value) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

export async function buildApplicationWorkbook(projects: ApplicationProject[], resumes: ResumeVersion[]) {
  const { default: JSZip } = await import("jszip");
  const resumeNames = new Map(resumes.map((resume) => [resume.id, resume.name]));
  const headers = [
    "Company", "Job title", "Job function", "Employment type", "Location", "Date posted", "Deadline",
    "Priority", "Application stage", "Result", "Application date", "Referral", "Resume", "Keyword coverage",
  ];
  const values = projects.map((project) => [
    project.companyName,
    project.jobTitle,
    project.jobFunction || "",
    project.employmentType || "",
    project.location || "",
    project.datePosted || "",
    project.deadline || "",
    project.priority ? project.priority[0].toUpperCase() + project.priority.slice(1) : "",
    APPLICATION_STAGE_LABELS[project.applicationStage || "editing"],
    APPLICATION_RESULT_LABELS[project.applicationResult || ""],
    project.applicationDate || "",
    project.referral || "",
    resumeNames.get(project.resumeId) || "",
    projectCoverage(project) / 100,
  ]);
  const allRows = [headers, ...values];
  const rowXml = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      if (rowIndex > 0 && columnIndex === 13) return `<c r="${reference}" s="2"><v>${Number(value) || 0}</v></c>`;
      return `<c r="${reference}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const hyperlinks: string[] = [];
  const hyperlinkRels: string[] = [];
  projects.forEach((project, index) => {
    if (!/^https?:\/\//i.test(project.jdUrl)) return;
    const relationshipId = `rId${hyperlinkRels.length + 1}`;
    hyperlinks.push(`<hyperlink ref="B${index + 2}" r:id="${relationshipId}"/>`);
    hyperlinkRels.push(`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(project.jdUrl)}" TargetMode="External"/>`);
  });
  const lastRow = Math.max(1, allRows.length);
  const widths = [20, 42, 24, 18, 25, 14, 14, 12, 19, 16, 16, 20, 24, 19];
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:N${lastRow}"/>${hyperlinks.length ? `<hyperlinks>${hyperlinks.join("")}</hyperlinks>` : ""}</worksheet>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2948AA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml", sheet);
  if (hyperlinkRels.length) zip.file("xl/worksheets/_rels/sheet1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hyperlinkRels.join("")}</Relationships>`);
  const now = new Date().toISOString();
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Application tracker</dc:title><dc:creator>ResumeMatch</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ResumeMatch</Application></Properties>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
