const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiUsage", {
  getSummary: () => ipcRenderer.invoke("summary:get"),
  connectClaude: () => ipcRenderer.invoke("claude:connect"),
  openDashboard: () => ipcRenderer.invoke("window:dashboard"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  refresh: () => ipcRenderer.invoke("summary:refresh"),
  onSummaryUpdated: (callback) => {
    const listener = (_event, summary) => callback(summary);
    ipcRenderer.on("summary:updated", listener);
    return () => ipcRenderer.removeListener("summary:updated", listener);
  },
});
