const fs = require("node:fs");

const DEFAULT_MAX_BYTES = 1024 * 1024;

function serializeDetails(details) {
  if (details === undefined) {
    return "";
  }

  if (typeof details === "string") {
    return ` ${details}`;
  }

  try {
    return ` ${JSON.stringify(details)}`;
  } catch {
    return ` ${String(details)}`;
  }
}

function createStartupLogger(logPath, options = {}) {
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_MAX_BYTES;
  let writtenBytes = 0;

  function writeLine(line, reset = false) {
    try {
      if (reset || writtenBytes > maxBytes) {
        fs.writeFileSync(logPath, line, "utf8");
        writtenBytes = Buffer.byteLength(line);
        return;
      }

      fs.appendFileSync(logPath, line, "utf8");
      writtenBytes += Buffer.byteLength(line);
    } catch {
      // Logging is diagnostic only; it must never keep the island from opening.
    }
  }

  function logStartup(message, details) {
    writeLine(`[${new Date().toISOString()}] ${message}${serializeDetails(details)}\n`);
  }

  function installGlobalErrorHandlers() {
    process.on("uncaughtException", (error) => {
      logStartup("uncaughtException", error?.stack || error?.message || String(error));
    });

    process.on("unhandledRejection", (error) => {
      logStartup("unhandledRejection", error?.stack || error?.message || String(error));
    });
  }

  writeLine(`[${new Date().toISOString()}] startup\n`, true);

  return {
    logStartup,
    installGlobalErrorHandlers
  };
}

module.exports = {
  createStartupLogger
};
