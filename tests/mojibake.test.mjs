import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN_ROOTS = ["README.md", "src", "index.html", "system.html", "integrations", "scripts"];
const IGNORE_DIRS = new Set(["node_modules", "dist", "release", ".tmp", ".omc", "modularization-backups", ".git"]);
const MOJIBAKE_PATTERN = new RegExp(
  "[\\u9473\\u5A11\\u93C6\\u93BE\\u6D93\\u6924\\u95AB\\u9357\\u7EEF\\u5997\\u9225\\u95BA\\u95B9\\u941C\\u752F\\u6AE4\\u20AC]"
);

function collectFiles(entry, files = []) {
  const fullPath = path.join(ROOT, entry);
  if (!fs.existsSync(fullPath)) {
    return files;
  }

  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    if (IGNORE_DIRS.has(path.basename(fullPath))) {
      return files;
    }

    for (const child of fs.readdirSync(fullPath)) {
      collectFiles(path.join(entry, child), files);
    }
    return files;
  }

  if (/\.(css|html|js|json|md|ps1|ts)$/.test(fullPath)) {
    files.push(fullPath);
  }
  return files;
}

describe("mojibake guard", () => {
  it("keeps source, docs, and integration text free of known mojibake fragments", () => {
    const offenders = SCAN_ROOTS.flatMap((entry) => collectFiles(entry))
      .filter((filePath) => MOJIBAKE_PATTERN.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(ROOT, filePath));

    expect(offenders).toEqual([]);
  });
});
