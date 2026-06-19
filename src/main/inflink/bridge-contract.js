const path = require("node:path");

const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = 32147;
const BRIDGE_PATH = "/dynamic-island-bridge";
const FILE_BRIDGE_DIR = "C:\\betterncm\\dynamic-island-bridge";
const FILE_SNAPSHOT_PATH = path.join(FILE_BRIDGE_DIR, "snapshot.json");
const FILE_COMMAND_PATH = path.join(FILE_BRIDGE_DIR, "command.json");
const FILE_RESULT_PATH = path.join(FILE_BRIDGE_DIR, "result.json");
const COMMAND_TIMEOUT_MS = 2200;
const SNAPSHOT_MAX_AGE_MS = 3500;
const FILE_RESULT_POLL_INTERVAL_MS = 120;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_LYRIC_LINES = 120;

module.exports = {
  BRIDGE_HOST,
  BRIDGE_PORT,
  BRIDGE_PATH,
  FILE_BRIDGE_DIR,
  FILE_SNAPSHOT_PATH,
  FILE_COMMAND_PATH,
  FILE_RESULT_PATH,
  COMMAND_TIMEOUT_MS,
  SNAPSHOT_MAX_AGE_MS,
  FILE_RESULT_POLL_INTERVAL_MS,
  MAX_BODY_BYTES,
  MAX_LYRIC_LINES
};
