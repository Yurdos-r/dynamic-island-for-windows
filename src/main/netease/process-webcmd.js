const path = require("node:path");
const {
  fileExists,
  parseNeteaseExecutableFromCommand,
  parseRegistryCommandValue
} = require("./cache-reader");

function createNeteaseProcessRuntime(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const runTextCommand = options.runTextCommand;
  const env = options.env || process.env;
  let executablePath;

  async function readRegistryDefaultValue(keyPath) {
    const result = await runTextCommand("reg.exe", ["query", keyPath, "/ve"]);
    return result.ok ? parseRegistryCommandValue(result.stdout) : "";
  }

  async function getExecutablePath() {
    if (fileExists(executablePath)) {
      return executablePath;
    }

    const registryCommands = [
      await readRegistryDefaultValue("HKCU\\Software\\Classes\\orpheus\\shell\\open\\command"),
      await readRegistryDefaultValue("HKCR\\orpheus\\shell\\open\\command")
    ];
    const registryPath = registryCommands.map(parseNeteaseExecutableFromCommand).find(fileExists);

    const fallbackPaths = [
      registryPath,
      path.join(env.LOCALAPPDATA || "", "Programs", "NetEase", "CloudMusic", "cloudmusic.exe"),
      path.join(env.PROGRAMFILES || "", "NetEase", "CloudMusic", "cloudmusic.exe"),
      path.join(env["PROGRAMFILES(X86)"] || "", "NetEase", "CloudMusic", "cloudmusic.exe")
    ];

    executablePath = fallbackPaths.find(fileExists);
    return executablePath;
  }

  async function runWebCommand(message) {
    const cloudMusicPath = await getExecutablePath();

    if (!cloudMusicPath) {
      return { ok: false, error: "cloudmusic.exe not found" };
    }

    const result = await runTextCommand(cloudMusicPath, [`--webcmd=${JSON.stringify(message)}`]);

    if (!result.ok) {
      logStartup("netease-webcmd-failed", {
        command: message?.cmd,
        executablePath: cloudMusicPath,
        error: result.error,
        stderr: result.stderr
      });
    }

    return {
      ...result,
      executablePath: cloudMusicPath
    };
  }

  async function isRunning() {
    const result = await runTextCommand(
      "tasklist.exe",
      ["/FI", "IMAGENAME eq cloudmusic.exe", "/NH"],
      {
        timeout: 2500,
        maxBuffer: 64 * 1024
      }
    );

    return result.stdout.toLowerCase().includes("cloudmusic.exe");
  }

  return {
    getExecutablePath,
    isRunning,
    runWebCommand
  };
}

module.exports = {
  createNeteaseProcessRuntime
};
