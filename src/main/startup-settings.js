const path = require("node:path");
const { app } = require("electron");

function getStartupExecutablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function getStartupArguments() {
  if (app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) {
    return [];
  }

  return [path.resolve(__dirname, "../.."), "--software-rendering"];
}

function getStartupLoginItemOptions() {
  const args = getStartupArguments();
  return {
    path: getStartupExecutablePath(),
    ...(args.length ? { args } : {})
  };
}

function readStartupEnabled() {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return false;
  }

  try {
    return Boolean(app.getLoginItemSettings(getStartupLoginItemOptions()).openAtLogin);
  } catch {
    return false;
  }
}

function applyStartupEnabled(enabled) {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return false;
  }

  try {
    app.setLoginItemSettings({
      ...getStartupLoginItemOptions(),
      openAtLogin: Boolean(enabled)
    });
  } catch {
    return readStartupEnabled();
  }

  return readStartupEnabled();
}

module.exports = {
  applyStartupEnabled,
  readStartupEnabled
};
