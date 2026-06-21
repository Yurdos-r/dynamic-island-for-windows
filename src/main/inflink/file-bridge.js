const fs = require("node:fs");
const path = require("node:path");

function ensureFileBridgeDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureFileBridgeDirs(dirPaths) {
  for (const dirPath of dirPaths) {
    ensureFileBridgeDir(dirPath);
  }
}

function getFileBridgePath(dirPath, fileName) {
  return path.join(dirPath, fileName);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function writeJsonFile(filePath, payload) {
  ensureFileBridgeDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload), "utf8");
  fs.renameSync(tempPath, filePath);
}

function writeJsonFileToDirs(dirPaths, fileName, payload) {
  for (const dirPath of dirPaths) {
    writeJsonFile(getFileBridgePath(dirPath, fileName), payload);
  }
}

module.exports = {
  ensureFileBridgeDir,
  ensureFileBridgeDirs,
  getFileBridgePath,
  readJsonFile,
  writeJsonFile,
  writeJsonFileToDirs
};
