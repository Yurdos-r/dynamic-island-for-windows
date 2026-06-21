const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { BRIDGE_TOKEN_HEADER, FILE_BRIDGE_VERSION } = require("./bridge-contract");

function generateBridgeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function isValidBridgeToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{32,256}$/.test(value);
}

function createBridgeTokenPayload(token) {
  return {
    bridge: "dynamic-island-inflink",
    version: FILE_BRIDGE_VERSION,
    bridgeToken: token,
    header: BRIDGE_TOKEN_HEADER,
    updatedAt: Date.now()
  };
}

function readBridgeTokenFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8").trim();
    if (!text) {
      return "";
    }

    if (isValidBridgeToken(text)) {
      return text;
    }

    const payload = JSON.parse(text);
    const token = payload.bridgeToken || payload.token;
    return isValidBridgeToken(token) ? token : "";
  } catch {
    return "";
  }
}

function writeBridgeTokenFile(filePath, token) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(createBridgeTokenPayload(token), null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function writeBridgeTokenFiles(tokenPaths, token, logStartup = (_message, _details) => {}) {
  for (const tokenPath of tokenPaths) {
    try {
      writeBridgeTokenFile(tokenPath, token);
    } catch (error) {
      logStartup("inflink-token-file-error", {
        tokenPath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function createBridgeTokenStore(options = {}) {
  const tokenPaths = Array.isArray(options.tokenPaths) ? options.tokenPaths.filter(Boolean) : [];
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : (_message, _details) => {};
  const primaryTokenPath = tokenPaths[0];
  const existingToken = primaryTokenPath ? readBridgeTokenFile(primaryTokenPath) : "";
  const token = existingToken || generateBridgeToken();

  writeBridgeTokenFiles(tokenPaths, token, logStartup);

  return {
    token,
    tokenPaths,
    writeTokenFiles: () => writeBridgeTokenFiles(tokenPaths, token, logStartup)
  };
}

function timingSafeTokenEqual(left, right) {
  if (!isValidBridgeToken(left) || !isValidBridgeToken(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getRequestBridgeToken(request) {
  const rawHeader = request?.headers?.[BRIDGE_TOKEN_HEADER.toLowerCase()];
  if (Array.isArray(rawHeader)) {
    return String(rawHeader[0] || "");
  }

  return typeof rawHeader === "string" ? rawHeader : "";
}

function hasValidRequestBridgeToken(request, expectedToken) {
  return timingSafeTokenEqual(getRequestBridgeToken(request), expectedToken);
}

function payloadHasValidBridgeToken(payload, expectedToken) {
  return timingSafeTokenEqual(payload?.bridgeToken, expectedToken);
}

module.exports = {
  createBridgeTokenPayload,
  createBridgeTokenStore,
  generateBridgeToken,
  getRequestBridgeToken,
  hasValidRequestBridgeToken,
  isValidBridgeToken,
  payloadHasValidBridgeToken,
  readBridgeTokenFile,
  timingSafeTokenEqual,
  writeBridgeTokenFiles
};
