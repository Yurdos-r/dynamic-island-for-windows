const fs = require("node:fs");

const {
  pickLatestNeteaseHistoryTrack,
  pickMatchingTrack,
  pickTrackById
} = require("./track-metadata");

function fileExists(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function getFileModifiedTime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function parseNeteaseExecutableFromCommand(command) {
  const text = String(command || "").trim();
  const quotedMatch = text.match(/^"([^"]*cloudmusic\.exe)"/i);
  const plainMatch = quotedMatch ? undefined : text.match(/^(.+?cloudmusic\.exe)\b/i);

  return quotedMatch?.[1] || plainMatch?.[1]?.trim();
}

function parseRegistryCommandValue(output) {
  const line = String(output || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => /\bREG_(?:SZ|EXPAND_SZ)\b/i.test(item));

  if (!line) {
    return "";
  }

  return line.replace(/^.*?\bREG_(?:SZ|EXPAND_SZ)\b\s+/i, "").trim();
}

function extractJsonObjects(text, marker) {
  const objects = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const start = text.indexOf(marker, searchIndex);
    if (start === -1) {
      break;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === "\"") {
          inString = false;
        }
        continue;
      }

      if (character === "\"") {
        inString = true;
        continue;
      }

      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;

        if (depth === 0) {
          const rawJson = text.slice(start, index + 1);
          try {
            objects.push(JSON.parse(rawJson));
          } catch {
            // SQLite pages can contain partial stale records.
          }
          searchIndex = index + 1;
          break;
        }
      }
    }

    if (searchIndex <= start) {
      searchIndex = start + marker.length;
    }
  }

  return objects;
}

function parseHistoryRows(rows) {
  return rows
    .map((row) => {
      try {
        const item = JSON.parse(row.jsonStr);
        item.playtime = Number(row.playtime ?? item.playtime);
        return item;
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
}

function createNeteaseHistoryReader(options = {}) {
  const sqliteDatabaseSync = options.sqliteDatabaseSync;
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  let sqliteWarningLogged = false;

  function logSqliteError(error) {
    if (!sqliteWarningLogged) {
      sqliteWarningLogged = true;
      logStartup("netease-sqlite-error", error?.message || String(error));
    }
  }

  function queryHistoryRows(webDbPath, limit) {
    if (!sqliteDatabaseSync) {
      return undefined;
    }

    let database;

    try {
      database = new sqliteDatabaseSync(webDbPath, { readOnly: true });
      return database
        .prepare(`select playtime, jsonStr from historyTracks where jsonStr is not null order by playtime desc limit ${limit}`)
        .all();
    } catch (error) {
      logSqliteError(error);
      return undefined;
    } finally {
      try {
        database?.close();
      } catch {
        // Best effort cleanup.
      }
    }
  }

  function readHistoryText(webDbPath) {
    try {
      return fs.readFileSync(webDbPath).toString("utf8");
    } catch {
      return "";
    }
  }

  function pickHistoryTrackFromSqlite(webDbPath) {
    const rows = queryHistoryRows(webDbPath, 20);
    return rows ? pickLatestNeteaseHistoryTrack(parseHistoryRows(rows)) : undefined;
  }

  function pickHistoryTrackFromText(webDbPath) {
    const text = readHistoryText(webDbPath);
    return text ? pickLatestNeteaseHistoryTrack(extractJsonObjects(text, "{\"id\":\"")) : undefined;
  }

  function pickHistoryTrack(webDbPath) {
    return pickHistoryTrackFromSqlite(webDbPath) ?? pickHistoryTrackFromText(webDbPath);
  }

  function pickMatchingHistoryTrackFromSqlite(webDbPath, mediaSnapshot) {
    const rows = queryHistoryRows(webDbPath, 80);
    return rows ? pickMatchingTrack(parseHistoryRows(rows), mediaSnapshot) : undefined;
  }

  function pickMatchingHistoryTrackFromText(webDbPath, mediaSnapshot) {
    const text = readHistoryText(webDbPath);
    return text ? pickMatchingTrack(extractJsonObjects(text, "{\"id\":\""), mediaSnapshot) : undefined;
  }

  function pickMatchingHistoryTrack(webDbPath, mediaSnapshot) {
    return pickMatchingHistoryTrackFromSqlite(webDbPath, mediaSnapshot) ?? pickMatchingHistoryTrackFromText(webDbPath, mediaSnapshot);
  }

  function pickHistoryTrackByIdFromSqlite(webDbPath, wantedId) {
    const rows = queryHistoryRows(webDbPath, 120);
    return rows ? pickTrackById(parseHistoryRows(rows), wantedId) : undefined;
  }

  function pickHistoryTrackByIdFromText(webDbPath, wantedId) {
    const text = readHistoryText(webDbPath);
    return text ? pickTrackById(extractJsonObjects(text, "{\"id\":\""), wantedId) : undefined;
  }

  function pickHistoryTrackById(webDbPath, wantedId) {
    return pickHistoryTrackByIdFromSqlite(webDbPath, wantedId) ?? pickHistoryTrackByIdFromText(webDbPath, wantedId);
  }

  return {
    pickHistoryTrack,
    pickHistoryTrackById,
    pickMatchingHistoryTrack
  };
}

module.exports = {
  createNeteaseHistoryReader,
  fileExists,
  getFileModifiedTime,
  parseNeteaseExecutableFromCommand,
  parseRegistryCommandValue,
  safeReadJson
};
