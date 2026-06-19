const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

// 持久化 UI 偏好（布局 + 系统监控开关）。这些会影响主进程建窗/定位，必须在建窗前
// 同步读到，否则启动会闪一下错误布局——所以放主进程 JSON，而非 renderer localStorage。
// 玻璃风格/强度无主进程需求，仍由 renderer localStorage 保管（见 renderer/main.ts）。

const SETTINGS_FILE_NAME = "ui-settings.json";
const VALID_LAYOUTS = new Set(["classic", "top-center"]);
const DEFAULT_SETTINGS = Object.freeze({
  layout: "classic",
  systemMonitorEnabled: true
});

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE_NAME);
}

// 把任意来源（磁盘 JSON 或 IPC patch）收敛到白名单内的合法值，未知键直接丢弃。
function sanitize(raw) {
  const result = { ...DEFAULT_SETTINGS };

  if (raw && typeof raw === "object") {
    if (VALID_LAYOUTS.has(raw.layout)) {
      result.layout = raw.layout;
    }

    if (typeof raw.systemMonitorEnabled === "boolean") {
      result.systemMonitorEnabled = raw.systemMonitorEnabled;
    }
  }

  return result;
}

function readUiSettings() {
  try {
    const text = fs.readFileSync(getSettingsPath(), "utf8");
    return sanitize(JSON.parse(text));
  } catch {
    // 缺失/损坏/首次启动：回退默认，绝不让设置读取阻塞建窗。
    return { ...DEFAULT_SETTINGS };
  }
}

// 合并写回：先读现有值，叠加 patch 中的合法字段，再整体落盘。返回合并后的最新值。
function writeUiSettings(patch) {
  const merged = sanitize({ ...readUiSettings(), ...patch });

  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(merged, null, 2), "utf8");
  } catch {
    // Best-effort：写失败时本次会话仍按 merged 生效，下次启动回退默认。
  }

  return merged;
}

module.exports = {
  DEFAULT_SETTINGS,
  VALID_LAYOUTS,
  readUiSettings,
  writeUiSettings
};
