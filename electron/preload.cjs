const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("resumeMatchDesktop", {
  load: () => ipcRenderer.invoke("storage:load"),
  saveResumes: (resumes) => ipcRenderer.invoke("storage:save-resumes", resumes),
  stageResumes: (resumes) => ipcRenderer.send("storage:stage-resumes", resumes),
  saveProjects: (projects) => ipcRenderer.invoke("storage:save-projects", projects),
  stageProjects: (projects) => ipcRenderer.send("storage:stage-projects", projects),
  saveSetting: (key, value) => ipcRenderer.invoke("storage:save-setting", key, value),
  loadApiKeys: () => ipcRenderer.invoke("credentials:load-api-keys"),
  saveApiKey: (provider, apiKey) => ipcRenderer.invoke("credentials:save-api-key", provider, apiKey),
  deleteApiKey: (provider) => ipcRenderer.invoke("credentials:delete-api-key", provider),
  listExportNames: () => ipcRenderer.invoke("storage:list-export-names"),
  recordExportName: (fileName) => ipcRenderer.invoke("storage:record-export-name", fileName),
  getStorageInfo: () => ipcRenderer.invoke("storage:info"),
  chooseExportDirectory: (currentPath) => ipcRenderer.invoke("desktop:choose-export-directory", currentPath),
  openPath: (targetPath) => ipcRenderer.invoke("desktop:open-path", targetPath),
  exportDocument: (directory, fileName, bytes) => ipcRenderer.invoke("desktop:export-document", directory, fileName, bytes),
});
