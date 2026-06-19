const { app, session } = require("electron");

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http: https:; connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

function getDevServerUrl(argv = process.argv) {
  const rawUrl = argv.find((argument) => argument.startsWith("--dev-server="))?.slice("--dev-server=".length);
  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    const isLoopback = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
    return isLoopback ? url.href : "";
  } catch {
    return "";
  }
}

function installSecurityGuards(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const resolveDevServerUrl = typeof options.getDevServerUrl === "function" ? options.getDevServerUrl : getDevServerUrl;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CONTENT_SECURITY_POLICY]
      }
    });
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      const devServerUrl = resolveDevServerUrl();
      const allowedUrls = new Set([devServerUrl, devServerUrl ? `${devServerUrl.replace(/\/$/, "")}/` : ""]);

      if (!url.startsWith("file://") && !allowedUrls.has(url)) {
        event.preventDefault();
        logStartup("blocked-navigation", url);
      }
    });
  });
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  getDevServerUrl,
  installSecurityGuards
};
