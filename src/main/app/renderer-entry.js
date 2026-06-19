const path = require("node:path");

function loadRendererEntry(windowToLoad, htmlFile, label, options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const getDevServerUrl = typeof options.getDevServerUrl === "function" ? options.getDevServerUrl : () => "";
  const distDir = options.distDir || path.resolve(__dirname, "../../../dist");
  const devServerUrl = getDevServerUrl();

  if (devServerUrl) {
    const url = new URL(htmlFile, devServerUrl).href;
    logStartup(`load-url-${label}`, url);
    windowToLoad.loadURL(url);
    return;
  }

  const filePath = path.join(distDir, htmlFile);
  logStartup(`load-file-${label}`, filePath);
  windowToLoad.loadFile(filePath).catch((error) => {
    logStartup(`load-file-${label}-error`, error?.stack || error?.message || String(error));
  });
}

module.exports = {
  loadRendererEntry
};
