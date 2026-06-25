/** Webview 启动入口（由 settingsPanel 内联 settingsCore.js + 本文件） */
createSettingsUI({
  vscode: acquireVsCodeApi(),
  document: document,
  window: window,
});
