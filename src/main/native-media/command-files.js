const fs = require("node:fs");
const path = require("node:path");

function safeRemoveCommandFiles(commandDir) {
  let files = [];
  try {
    files = fs.readdirSync(commandDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (!/^\d+-\d+\.json$/.test(file)) {
      continue;
    }

    try {
      fs.unlinkSync(path.join(commandDir, file));
    } catch {
      // Best effort cleanup.
    }
  }
}

function createNativeMediaCommandFiles(options = {}) {
  const runtime = options.runtime;
  const commandDir = options.commandDir;
  const commandTimeoutMs = options.commandTimeoutMs;
  const processId = options.processId || process.pid;

  if (!runtime || !commandDir || !Number.isFinite(commandTimeoutMs)) {
    throw new Error("runtime, commandDir, and commandTimeoutMs are required to create native media command files.");
  }

  function ensureCommandDir(cleanup = false) {
    fs.mkdirSync(commandDir, { recursive: true });
    if (cleanup) {
      safeRemoveCommandFiles(commandDir);
    }
    runtime.state.commandDirPrepared = true;
  }

  function sendCommand(action, positionSeconds = 0) {
    const id = runtime.createCommandId();
    const commandPath = path.join(commandDir, `${id}.json`);
    const tempPath = `${commandPath}.${processId}.tmp`;
    const payload = {
      id,
      action,
      positionSeconds: Math.max(0, Math.round(Number(positionSeconds) || 0)),
      createdAt: Date.now()
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        runtime.state.pendingCommands.delete(id);
        resolve({
          ok: false,
          available: false,
          active: false,
          action,
          transport: "native-gsmtc-helper",
          error: "Native media helper did not acknowledge the command."
        });
      }, commandTimeoutMs);

      runtime.registerPendingCommand(id, {
        action,
        resolve,
        timeout
      });

      try {
        if (!runtime.state.commandDirPrepared) {
          ensureCommandDir(false);
        }
        fs.writeFileSync(tempPath, JSON.stringify(payload), "utf8");
        fs.renameSync(tempPath, commandPath);
      } catch (error) {
        runtime.resolvePendingCommand(id, {
          ok: false,
          available: false,
          active: false,
          action,
          transport: "native-gsmtc-helper",
          error: error?.message || String(error)
        });
      }
    });
  }

  return {
    ensureCommandDir,
    sendCommand
  };
}

module.exports = {
  createNativeMediaCommandFiles,
  safeRemoveCommandFiles
};
