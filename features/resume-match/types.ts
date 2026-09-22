export type KeywordStatus = "green" | "yellow" | "red" | "ignored";

export type RewriteSuggestion = {
  title: string;
  text: string;
  target: string;
  targetIndex: number;
  originalChars?: number;
  newChars?: number;
  maxChars?: number;
};

export type RewriteApiData = {
  suggestions?: Array<Omit<RewriteSuggestion, "target">>;
  needsMoreEvidence?: boolean;
  question?: string | null;
  error?: string;
};

export type RewriteCandidate = {
  text: string;
  index: number;
  originalChars?: number;
  maxChars?: number;
};

export type ConceptReviewItem = {
  term: string;
  suggestedConceptId: string | null;
  selectedConceptId: string | null;
  matchedTerm: string | null;
  reason: string;
  mode: "default" | "new" | "search";
  searchText: string;
};

export type YellowEdit = {
  targetIndex: number;
  phraseBefore: string;
  phraseAfter: string;
  beforeText: string;
  afterText: string;
  guidance: string;
  originalChars: number;
  newChars: number;
  maxChars: number;
};

export type Keyword = {
  id: string;
  conceptId?: string;
  label: string;
  status: KeywordStatus;
  previousStatus?: Exclude<KeywordStatus, "ignored">;
  resumeMatch?: string;
  suggestion?: string;
  guidance?: string;
  category?: "hard_skill" | "domain_knowledge" | "work_method" | "responsibility" | "collaboration" | "soft_skill";
  evidence?: string;
  importance?: "must" | "important" | "supporting";
  yellowEdit?: YellowEdit;
  rewrites?: RewriteSuggestion[];
  needsMoreEvidence?: boolean;
  question?: string;
  rewriteRetryUsed?: boolean;
  aliases?: string[];
  userApproved?: boolean;
  source?: "base" | "manual" | "llm";
};

export type ResumeVersion = {
  id: string;
  name: string;
  fileName: string;
  texts: string[];
  uploadedAt: string;
  docxBase64?: string;
};

export type ApplicationProject = {
  id: string;
  name: string;
  resumeId: string;
  jdUrl: string;
  jdText: string;
  companyName: string;
  jobTitle: string;
  keywords: Keyword[];
  resumeTexts: string[];
  manualTerms: string[];
  updatedAt: string;
};

export type ViewName = "applications" | "resumes" | "favorites" | "workspace";
export type SettingsSection = "models" | "export" | "storage";
export type ProviderId = "openai" | "gemini" | "anthropic" | "deepseek" | "glm" | "xai" | "qwen" | "muse" | "custom";

export type WebModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};
