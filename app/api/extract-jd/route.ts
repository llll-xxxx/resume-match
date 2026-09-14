import { NextResponse } from "next/server";

type JsonRecord = Record<string, unknown>;
type ExtractedJd = { title: string; company: string; text: string };

const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

class ExtractError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToReadableText(html: string) {
  return decodeEntities(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|section|article|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function findJobPosting(value: unknown): JsonRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as JsonRecord;
  const type = record["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return record;
  for (const child of Object.values(record)) {
    const found = findJobPosting(child);
    if (found) return found;
  }
  return undefined;
}

function readJsonLd(html: string): ExtractedJd | undefined {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const job = findJobPosting(JSON.parse(decodeEntities(match[1]).trim()));
      if (!job) continue;
      const organization = job.hiringOrganization && typeof job.hiringOrganization === "object" ? job.hiringOrganization as JsonRecord : undefined;
      const title = typeof job.title === "string" ? job.title.trim() : "";
      const company = typeof organization?.name === "string" ? organization.name.trim() : "";
      const description = typeof job.description === "string" ? htmlToReadableText(job.description) : "";
      if (description.length >= 120) return { title, company, text: description };
    } catch {
      // A malformed block should not prevent a later valid block from being used.
    }
  }
  return undefined;
}

function fallbackText(html: string) {
  const withoutChrome = html
    .replace(/<(nav|header|footer|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const main = withoutChrome.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? withoutChrome.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? withoutChrome;
  const boilerplate = /^(careers|skip navigation links?|home|jobs|students|how we work|how we hire|your career|work_outline|noogler_hat|handyman|google)$/i;
  const lines = htmlToReadableText(main).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.filter((line, index) => !boilerplate.test(line) && line !== lines[index - 1]).join("\n");
}

function stringField(record: JsonRecord, key: string) {
  return typeof record[key] === "string" ? record[key] as string : "";
}

function readAmazonSearchResult(payload: unknown, jobId: string): ExtractedJd | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const jobs = (payload as JsonRecord).jobs;
  if (!Array.isArray(jobs)) return undefined;
  const rawJob = jobs.find((value) => {
    if (!value || typeof value !== "object") return false;
    const job = value as JsonRecord;
    return stringField(job, "id_icims") === jobId || stringField(job, "job_path").includes(`/jobs/${jobId}/`);
  });
  if (!rawJob || typeof rawJob !== "object") return undefined;
  const job = rawJob as JsonRecord;
  const sections = [
    stringField(job, "description"),
    stringField(job, "basic_qualifications") && `<h2>Basic Qualifications</h2>${stringField(job, "basic_qualifications")}`,
    stringField(job, "preferred_qualifications") && `<h2>Preferred Qualifications</h2>${stringField(job, "preferred_qualifications")}`,
  ].filter(Boolean).map(htmlToReadableText);
  const text = sections.join("\n\n").trim();
  if (text.length < 120) return undefined;
  return {
    title: stringField(job, "title").trim(),
    company: stringField(job, "company_name").trim() || "Amazon",
    text,
  };
}

function readGoogleCareers(html: string): ExtractedJd | undefined {
  const mainText = htmlToReadableText(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "");
  if (/Job not found\./i.test(mainText)) throw new ExtractError("这个 Google 职位已下线或链接已失效", 404);
  const titleHtml = html.match(/<h2\b[^>]*class=["'][^"']*\bp1N2lc\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1]
    ?? html.match(/<title>([\s\S]*?)\s+[—|-]\s+Google Careers<\/title>/i)?.[1]
    ?? "";
  const companyHtml = html.match(/<span\b[^>]*class=["'][^"']*\bRP7SMd\b[^"']*["'][^>]*>[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "Google";
  const start = html.search(/<h3\b[^>]*>\s*Minimum qualifications:?\s*<\/h3>/i);
  const fallbackStart = html.search(/<h3\b[^>]*>\s*About the job\s*<\/h3>/i);
  const contentStart = start >= 0 ? start : fallbackStart;
  if (contentStart < 0) return undefined;
  const privacyStart = html.slice(contentStart).search(/Information collected and processed|Google is proud to be an equal opportunity/i);
  const contentEnd = privacyStart >= 0 ? contentStart + privacyStart : html.length;
  const text = htmlToReadableText(html.slice(contentStart, contentEnd));
  if (text.length < 120) return undefined;
  return {
    title: htmlToReadableText(titleHtml),
    company: htmlToReadableText(companyHtml) || "Google",
    text,
  };
}

function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1" || host === "0.0.0.0") return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  if (!ipv4 || ipv4.some((part) => part > 255)) return false;
  const [a, b] = ipv4;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function validateTarget(value: string) {
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new ExtractError("请输入完整的 http 或 https 链接", 400);
  }
  if (!/^https?:$/.test(target.protocol)) throw new ExtractError("请输入完整的 http 或 https 链接", 400);
  if (target.username || target.password || isBlockedHostname(target.hostname)) throw new ExtractError("不支持读取本地地址或带账号信息的链接", 400);
  return target;
}

async function fetchPublic(url: URL, accept = REQUEST_HEADERS.accept) {
  let current = url;
  for (let redirects = 0; redirects <= 4; redirects++) {
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        headers: { ...REQUEST_HEADERS, accept, referer: `${current.protocol}//${current.host}/` },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && /abort|timeout/i.test(error.message);
      throw new ExtractError(timedOut ? "读取职位网页超时，请重试" : "当前环境无法连接外部职位网站，请检查网络后重试");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new ExtractError("职位网站返回了无效的跳转地址");
      current = validateTarget(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      if (response.status === 404) throw new ExtractError("这个职位已下线或链接已失效", 404);
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        throw new ExtractError(`职位网站限制了自动读取（${response.status}），请稍后重试或粘贴 JD 正文`);
      }
      throw new ExtractError(`职位网站返回 ${response.status}，暂时无法读取`);
    }
    return response;
  }
  throw new ExtractError("职位链接跳转次数过多");
}

async function extractAmazon(target: URL): Promise<ExtractedJd | undefined> {
  const jobId = target.pathname.match(/\/jobs\/(\d+)/i)?.[1];
  if (!jobId) return undefined;
  try {
    const searchUrl = new URL("/en/search.json", target.origin);
    searchUrl.searchParams.set("base_query", jobId);
    searchUrl.searchParams.set("result_limit", "10");
    searchUrl.searchParams.set("offset", "0");
    const response = await fetchPublic(searchUrl, "application/json");
    return readAmazonSearchResult(await response.json(), jobId);
  } catch (error) {
    // Fall back to the HTML detail page when Amazon's search API changes.
    if (error instanceof ExtractError && error.status === 404) throw error;
    return undefined;
  }
}

function canonicalGoogleUrl(target: URL) {
  const clean = new URL(target.origin + target.pathname);
  clean.searchParams.set("hl", "en_US");
  return clean;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) throw new ExtractError("请输入完整的 http 或 https 链接", 400);
    const target = validateTarget(body.url.trim());
    const isAmazon = /(^|\.)amazon\.jobs$/i.test(target.hostname);
    const isGoogle = /(^|\.)google\.com$/i.test(target.hostname) && /\/about\/careers\/applications\/jobs\//i.test(target.pathname);

    if (isAmazon) {
      try {
        const detailResponse = await fetchPublic(target);
        const detailHtml = await detailResponse.text();
        const structured = readJsonLd(detailHtml);
        const heading = htmlToReadableText(detailHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
        const title = heading || structured?.title || "";
        if (structured?.text && title) return NextResponse.json({ ...structured, title, company: structured.company || "Amazon" });
      } catch {
        // Some Amazon regions block the detail page but leave the search API open.
      }
      const result = await extractAmazon(target);
      if (result) return NextResponse.json(result);
    }

    const response = await fetchPublic(isGoogle ? canonicalGoogleUrl(target) : target);
    const contentType = response.headers.get("content-type") || "";
    if (!/html|text/i.test(contentType)) throw new ExtractError("这个链接返回的不是网页正文", 422);
    const html = await response.text();
    const structured = readJsonLd(html);
    const specialized = isGoogle ? readGoogleCareers(html) : undefined;
    const text = specialized?.text || structured?.text || fallbackText(html);
    if (text.length < 120) throw new ExtractError("网页正文太少，可能需要登录或由脚本加载", 422);
    return NextResponse.json({
      text: text.slice(0, 50_000),
      title: specialized?.title || structured?.title || "",
      company: specialized?.company || structured?.company || (isAmazon ? "Amazon" : ""),
    });
  } catch (error) {
    const known = error instanceof ExtractError;
    const message = known ? error.message : "读取网页时发生异常，请重试";
    if (!known) console.error("[extract-jd] Unexpected error:", error);
    return NextResponse.json({ error: message }, { status: known ? error.status : 500 });
  }
}
