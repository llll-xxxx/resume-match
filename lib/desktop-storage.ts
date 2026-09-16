type DesktopSnapshot = {
  resumes: unknown[];
  projects: unknown[];
  settings: Record<string, unknown>;
};

type DesktopBridge = {
  load: () => Promise<DesktopSnapshot>;
  saveResumes: (resumes: unknown[]) => Promise<void>;
  stageResumes?: (resumes: unknown[]) => void;
  saveProjects: (projects: unknown[]) => Promise<void>;
  stageProjects?: (projects: unknown[]) => void;
  saveSetting: (key: string, value: unknown) => Promise<void>;
  loadApiKeys?: () => Promise<Record<string, string>>;
  saveApiKey?: (provider: string, apiKey: string) => Promise<void>;
  deleteApiKey?: (provider: string) => Promise<void>;
  listExportNames: () => Promise<string[]>;
  recordExportName: (fileName: string) => Promise<void>;
  getStorageInfo: () => Promise<{ dataRoot: string; databasePath: string; defaultExportDirectory: string }>;
  chooseExportDirectory: (currentPath?: string) => Promise<string | null>;
  openPath: (targetPath: string) => Promise<void>;
  exportDocument: (directory: string, fileName: string, bytes: Uint8Array) => Promise<{ fileName: string; outputPath: string }>;
};

declare global {
  interface Window { resumeMatchDesktop?: DesktopBridge }
}

function bridge() {
  return typeof window === "undefined" ? undefined : window.resumeMatchDesktop;
}

export const desktopStorage = {
  isAvailable: () => Boolean(bridge()),
  async load<TResume, TProject>() {
    const api = bridge();
    if (!api) return { resumes: [] as TResume[], projects: [] as TProject[], settings: {} as Record<string, unknown> };
    const snapshot = await api.load();
    return { resumes: snapshot.resumes as TResume[], projects: snapshot.projects as TProject[], settings: snapshot.settings };
  },
  saveResumes: (resumes: unknown[]) => bridge()?.saveResumes(resumes) ?? Promise.resolve(),
  stageResumes: (resumes: unknown[]) => bridge()?.stageResumes?.(resumes),
  saveProjects: (projects: unknown[]) => bridge()?.saveProjects(projects) ?? Promise.resolve(),
  stageProjects: (projects: unknown[]) => bridge()?.stageProjects?.(projects),
  saveSetting: (key: string, value: unknown) => bridge()?.saveSetting(key, value) ?? Promise.resolve(),
  loadApiKeys: (): Promise<Record<string, string>> => bridge()?.loadApiKeys?.() ?? Promise.resolve({}),
  saveApiKey: (provider: string, apiKey: string) => bridge()?.saveApiKey?.(provider, apiKey) ?? Promise.resolve(),
  deleteApiKey: (provider: string) => bridge()?.deleteApiKey?.(provider) ?? Promise.resolve(),
  listExportNames: () => bridge()?.listExportNames() ?? Promise.resolve([]),
  recordExportName: (fileName: string) => bridge()?.recordExportName(fileName) ?? Promise.resolve(),
  getStorageInfo: () => bridge()?.getStorageInfo(),
  chooseExportDirectory: (currentPath?: string) => bridge()?.chooseExportDirectory(currentPath) ?? Promise.resolve(null),
  openPath: (targetPath: string) => bridge()?.openPath(targetPath) ?? Promise.resolve(),
  exportDocument: (directory: string, fileName: string, bytes: Uint8Array) => bridge()?.exportDocument(directory, fileName, bytes),
};
