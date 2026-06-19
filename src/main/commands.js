const { execFile } = require("node:child_process");

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function normalizeCommandOptions(options, defaultTimeout, defaultMaxBuffer) {
  if (typeof options === "number") {
    return {
      timeout: options,
      maxBuffer: defaultMaxBuffer
    };
  }

  return {
    timeout: Number.isFinite(options?.timeout) ? options.timeout : defaultTimeout,
    maxBuffer: Number.isFinite(options?.maxBuffer) ? options.maxBuffer : defaultMaxBuffer
  };
}

function runPowerShellJson(script, options) {
  const commandOptions = normalizeCommandOptions(options, 5000, 512 * 1024);

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShell(script)],
      {
        encoding: "utf8",
        timeout: commandOptions.timeout,
        windowsHide: true,
        maxBuffer: commandOptions.maxBuffer
      },
      (_error, stdout) => {
        const output = stdout.trim();

        if (!output) {
          resolve({ available: false, active: false });
          return;
        }

        try {
          resolve(JSON.parse(output));
        } catch {
          resolve({ available: false, active: false });
        }
      }
    );
  });
}

function runTextCommand(file, args, options) {
  const commandOptions = normalizeCommandOptions(options, 2500, 128 * 1024);

  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        encoding: "utf8",
        timeout: commandOptions.timeout,
        windowsHide: true,
        maxBuffer: commandOptions.maxBuffer
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout?.trim() || "",
          stderr: stderr?.trim() || "",
          error: error?.message || ""
        });
      }
    );
  });
}

module.exports = {
  runPowerShellJson,
  runTextCommand
};
