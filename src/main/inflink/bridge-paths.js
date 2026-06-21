const path = require("node:path");

const { LEGACY_FILE_BRIDGE_DIR } = require("./bridge-contract");

function normalizeDir(dirPath) {
  return path.resolve(String(dirPath || "").trim());
}

function pushUniqueDir(dirs, dirPath) {
  if (!dirPath) {
    return;
  }

  const normalized = normalizeDir(dirPath);
  const key = process.platform === "win32" ? normalized.toLowerCase() : normalized;
  if (!dirs.some((item) => item.key === key)) {
    dirs.push({ key, path: normalized });
  }
}

function resolvePrimaryFileBridgeDir(options = {}) {
  const env = options.env || process.env;
  const configuredDir = env.DYNAMIC_ISLAND_BRIDGE_DIR;
  if (configuredDir && String(configuredDir).trim()) {
    return normalizeDir(configuredDir);
  }

  const getRuntimeDataPath =
    typeof options.getRuntimeDataPath === "function"
      ? options.getRuntimeDataPath
      : require("../app-paths").getRuntimeDataPath;
  return getRuntimeDataPath("dynamic-island-bridge");
}

function resolveFileBridgeDirs(options = {}) {
  if (Array.isArray(options.fileBridgeDirs) && options.fileBridgeDirs.length) {
    const provided = [];
    options.fileBridgeDirs.forEach((dirPath) => pushUniqueDir(provided, dirPath));
    return provided.map((item) => item.path);
  }

  const dirs = [];
  pushUniqueDir(dirs, resolvePrimaryFileBridgeDir(options));
  if (options.includeLegacy !== false) {
    pushUniqueDir(dirs, LEGACY_FILE_BRIDGE_DIR);
  }
  return dirs.map((item) => item.path);
}

module.exports = {
  resolveFileBridgeDirs,
  resolvePrimaryFileBridgeDir
};

