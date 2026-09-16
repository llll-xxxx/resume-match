import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function json(value) {
  return JSON.stringify(value ?? null);
}

function parse(value, fallback) {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function safeSegment(value) {
  const normalized = String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!normalized) throw new Error("无效的数据标识");
  return normalized;
}

function withTransaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createLocalDatabase(dataRoot) {
  const databaseDir = path.join(dataRoot, "database");
  const filesDir = path.join(dataRoot, "files");
  mkdirSync(databaseDir, { recursive: true });
  mkdirSync(filesDir, { recursive: true });

  const databasePath = path.join(databaseDir, "resume-match.sqlite3");
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const migration = db.prepare("SELECT version FROM schema_migrations WHERE version = ?");
  if (!migration.get(1)) {
    withTransaction(db, () => {
      db.exec(`
        CREATE TABLE resumes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          file_name TEXT NOT NULL,
          texts_json TEXT NOT NULL,
          uploaded_at TEXT NOT NULL,
          docx_path TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE applications (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          resume_id TEXT NOT NULL,
          jd_url TEXT NOT NULL DEFAULT '',
          jd_text TEXT NOT NULL DEFAULT '',
          company_name TEXT NOT NULL DEFAULT '',
          job_title TEXT NOT NULL DEFAULT '',
          keywords_json TEXT NOT NULL,
          resume_texts_json TEXT NOT NULL,
          manual_terms_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_applications_updated_at ON applications(updated_at DESC);
        CREATE INDEX idx_applications_resume_id ON applications(resume_id);
        CREATE TABLE app_settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE export_history (
          file_name TEXT PRIMARY KEY,
          exported_at TEXT NOT NULL
        );
      `);
      db.prepare("INSERT INTO schema_migrations(version, description, applied_at) VALUES (?, ?, ?)")
        .run(1, "initial local storage", new Date().toISOString());
    });
  }
  db.exec("PRAGMA optimize");

  const resumeSelect = db.prepare("SELECT * FROM resumes ORDER BY created_at ASC");
  const applicationSelect = db.prepare("SELECT * FROM applications ORDER BY updated_at DESC");
  const settingSelect = db.prepare("SELECT key, value_json FROM app_settings");

  function load() {
    const resumes = resumeSelect.all().map((row) => {
      let docxBase64;
      if (row.docx_path) {
        try { docxBase64 = readFileSync(path.join(dataRoot, row.docx_path)).toString("base64"); } catch { /* File can be re-uploaded. */ }
      }
      return {
        id: row.id,
        name: row.name,
        fileName: row.file_name,
        texts: parse(row.texts_json, []),
        uploadedAt: row.uploaded_at,
        ...(docxBase64 ? { docxBase64 } : {}),
      };
    });
    const projects = applicationSelect.all().map((row) => ({
      id: row.id,
      name: row.name,
      resumeId: row.resume_id,
      jdUrl: row.jd_url,
      jdText: row.jd_text,
      companyName: row.company_name,
      jobTitle: row.job_title,
      keywords: parse(row.keywords_json, []),
      resumeTexts: parse(row.resume_texts_json, []),
      manualTerms: parse(row.manual_terms_json, []),
      updatedAt: row.updated_at,
    }));
    const settings = Object.fromEntries(settingSelect.all().map((row) => [row.key, parse(row.value_json, null)]));
    return { resumes, projects, settings };
  }

  function saveResumes(resumes) {
    if (!Array.isArray(resumes)) throw new Error("简历数据格式无效");
    const now = new Date().toISOString();
    const existingIds = new Set(db.prepare("SELECT id FROM resumes").all().map((row) => row.id));
    const incomingIds = new Set();
    const upsert = db.prepare(`
      INSERT INTO resumes(id, name, file_name, texts_json, uploaded_at, docx_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, file_name=excluded.file_name, texts_json=excluded.texts_json,
        uploaded_at=excluded.uploaded_at, docx_path=excluded.docx_path, updated_at=excluded.updated_at
    `);
    const prepared = resumes.map((resume) => {
      const id = safeSegment(resume.id);
      incomingIds.add(id);
      const relativePath = resume.docxBase64 ? path.join("files", "resumes", id, "original.docx") : null;
      if (relativePath) {
        const absolutePath = path.join(dataRoot, relativePath);
        mkdirSync(path.dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, Buffer.from(resume.docxBase64, "base64"));
      }
      return { resume, id, relativePath };
    });
    withTransaction(db, () => {
      for (const { resume, id, relativePath } of prepared) {
        upsert.run(id, String(resume.name || ""), String(resume.fileName || ""), json(resume.texts || []), String(resume.uploadedAt || ""), relativePath, now, now);
      }
      const removeRow = db.prepare("DELETE FROM resumes WHERE id = ?");
      for (const id of existingIds) if (!incomingIds.has(id)) removeRow.run(id);
    });
    for (const id of existingIds) {
      if (!incomingIds.has(id)) rmSync(path.join(filesDir, "resumes", safeSegment(id)), { recursive: true, force: true });
    }
  }

  function saveProjects(projects) {
    if (!Array.isArray(projects)) throw new Error("项目数据格式无效");
    const incomingIds = new Set();
    const upsert = db.prepare(`
      INSERT INTO applications(id, name, resume_id, jd_url, jd_text, company_name, job_title, keywords_json, resume_texts_json, manual_terms_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, resume_id=excluded.resume_id, jd_url=excluded.jd_url, jd_text=excluded.jd_text,
        company_name=excluded.company_name, job_title=excluded.job_title, keywords_json=excluded.keywords_json,
        resume_texts_json=excluded.resume_texts_json, manual_terms_json=excluded.manual_terms_json, updated_at=excluded.updated_at
    `);
    withTransaction(db, () => {
      for (const project of projects) {
        const id = safeSegment(project.id);
        incomingIds.add(id);
        upsert.run(id, String(project.name || ""), String(project.resumeId || ""), String(project.jdUrl || ""), String(project.jdText || ""), String(project.companyName || ""), String(project.jobTitle || ""), json(project.keywords || []), json(project.resumeTexts || []), json(project.manualTerms || []), String(project.updatedAt || new Date().toISOString()));
      }
      const removeRow = db.prepare("DELETE FROM applications WHERE id = ?");
      for (const row of db.prepare("SELECT id FROM applications").all()) if (!incomingIds.has(row.id)) removeRow.run(row.id);
    });
  }

  function saveSetting(key, value) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(key)) throw new Error("设置名称无效");
    db.prepare(`
      INSERT INTO app_settings(key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
    `).run(key, json(value), new Date().toISOString());
  }

  function listExportNames() {
    return db.prepare("SELECT file_name FROM export_history ORDER BY exported_at DESC LIMIT 200").all().map((row) => row.file_name);
  }

  function recordExportName(fileName) {
    db.prepare("INSERT OR REPLACE INTO export_history(file_name, exported_at) VALUES (?, ?)").run(String(fileName), new Date().toISOString());
  }

  return {
    databasePath,
    dataRoot,
    load,
    saveResumes,
    saveProjects,
    saveSetting,
    listExportNames,
    recordExportName,
    close: () => db.close(),
  };
}
