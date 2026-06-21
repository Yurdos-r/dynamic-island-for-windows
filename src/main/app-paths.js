const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const DEV_USER_DATA_PATH = path.resolve(__dirname, "../../.tmp/dynamic-island-user-data");

function ensureDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // Best effort; callers already tolerate logging/settings write failures.
  }
}

function configureAppUserDataPath() {
  if (!app.isPackaged) {
    app.setPath("userData", DEV_USER_DATA_PATH);
  }

  const userDataPath = app.getPath("userData");
  ensureDirectory(userDataPath);
  return userDataPath;
}

function getUserDataPath() {
  return app.getPath("userData");
}

function getRuntimeDataPath(name) {
  const runtimePath = path.join(getUserDataPath(), name);
  ensureDirectory(runtimePath);
  return runtimePath;
}

function getStartupLogPath() {
  return path.join(getUserDataPath(), "island-startup.log");
}

function getNativeHelperPath(fileName) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "src", "main", fileName);
  }

  return path.join(__dirname, fileName);
}

function getAppAssetPath(fileName) {
  return path.resolve(__dirname, "../../assets", fileName);
}

module.exports = {
  configureAppUserDataPath,
  getAppAssetPath,
  getNativeHelperPath,
  getRuntimeDataPath,
  getStartupLogPath,
  getUserDataPath
};
