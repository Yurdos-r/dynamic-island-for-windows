const fs = require("node:fs");

const { FILE_BRIDGE_DIR } = require("./bridge-contract");

function ensureFileBridgeDir() {
  fs.mkdirSync(FILE_BRIDGE_DIR, { recursive: true });
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function writeJsonFile(filePath, payload) {
  ensureFileBridgeDir();
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload), "utf8");
  fs.renameSync(tempPath, filePath);
}

module.exports = {
  ensureFileBridgeDir,
  readJsonFile,
  writeJsonFile
};
