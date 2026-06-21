// Win32 acrylic "blur-behind" for transparent, shaped windows.
//
// Electron's setBackgroundMaterial('acrylic') blurs the whole window rect and
// requires transparent:false, which would fill our 540x360 stage with a frosted
// slab and kill the floating-pill look. Instead we call the undocumented-but-
// stable user32!SetWindowCompositionAttribute with ACCENT_ENABLE_ACRYLICBLURBEHIND.
// It blurs the desktop behind the *existing* transparent window and honours the
// SetWindowRgn region the app already sets via win.setShape(), so the blur shows
// only behind the pill. No compiler needed (koffi ships prebuilt). win32-only;
// every entry point is a guarded no-op elsewhere.

// ACCENT_STATE values for the undocumented ACCENT_POLICY struct.
const ACCENT_DISABLED = 0;
const ACCENT_ENABLE_ACRYLICBLURBEHIND = 4;

// WINDOWCOMPOSITIONATTRIB: WCA_ACCENT_POLICY.
const WCA_ACCENT_POLICY = 19;

let koffi;
let lib;
let setWindowCompositionAttribute;
let AccentPolicy;
let WindowCompositionAttributeData;
let loadFailed = false;

function ensureLoaded() {
  if (lib || loadFailed) {
    return Boolean(lib);
  }

  if (process.platform !== "win32") {
    loadFailed = true;
    return false;
  }

  try {
    koffi = require("koffi");

    // struct ACCENT_POLICY { DWORD AccentState; DWORD AccentFlags;
    //                        DWORD GradientColor; DWORD AnimationId; }
    AccentPolicy = koffi.struct("ACCENT_POLICY", {
      AccentState: "uint32",
      AccentFlags: "uint32",
      GradientColor: "uint32",
      AnimationId: "uint32"
    });

    // struct WINDOWCOMPOSITIONATTRIBDATA { DWORD Attrib; PVOID pvData; SIZE_T cbData; }
    WindowCompositionAttributeData = koffi.struct("WINDOWCOMPOSITIONATTRIBDATA", {
      Attrib: "uint32",
      pvData: "void *",
      cbData: "size_t"
    });

    lib = koffi.load("user32.dll");
    setWindowCompositionAttribute = lib.func(
      "__stdcall",
      "SetWindowCompositionAttribute",
      "int",
      ["void *", koffi.pointer(WindowCompositionAttributeData)]
    );
    return true;
  } catch {
    loadFailed = true;
    lib = undefined;
    return false;
  }
}

// GradientColor is 0xAABBGGRR (note: ABGR, not ARGB). A low-alpha dark tint
// keeps the acrylic legible over bright wallpaper without hiding the blur.
// 0x33 alpha over near-black (#0a0e16 -> BGR 160e0a).
const DEFAULT_TINT = 0x33160e0a;

// getNativeWindowHandle() returns a buffer that *contains* the HWND value, not a
// pointer to be dereferenced. Read the pointer-sized integer out of it and pass
// that as the void* HWND. (Passing the buffer itself gives koffi an HWND* — one
// level of indirection too many — and the call fails with ERROR_INVALID_HANDLE.)
function readHwnd(handle) {
  if (!handle || typeof handle.length !== "number") {
    return undefined;
  }
  if (handle.length >= 8) {
    return koffi.as(handle.readBigUInt64LE(0), "void *");
  }
  if (handle.length >= 4) {
    return koffi.as(BigInt(handle.readUInt32LE(0)), "void *");
  }
  return undefined;
}

// Marshal ACCENT_POLICY by hand into a 16-byte buffer. koffi.as(obj, struct) is
// for pointer casts, not value marshaling, and produced ERROR_INVALID_HANDLE here.
function encodeAccentPolicy({ accentState, accentFlags, gradientColor, animationId }) {
  const buffer = Buffer.alloc(16);
  buffer.writeUInt32LE(accentState >>> 0, 0);
  buffer.writeUInt32LE(accentFlags >>> 0, 4);
  buffer.writeUInt32LE(gradientColor >>> 0, 8);
  buffer.writeUInt32LE(animationId >>> 0, 12);
  return buffer;
}

function applyToHwnd(handle, { enabled = true, tint = DEFAULT_TINT } = {}) {
  if (!ensureLoaded()) {
    return false;
  }

  const hwnd = readHwnd(handle);
  if (!hwnd) {
    return false;
  }

  try {
    const accentBuffer = encodeAccentPolicy({
      accentState: enabled ? ACCENT_ENABLE_ACRYLICBLURBEHIND : ACCENT_DISABLED,
      // 0x2 = draw GradientColor tint behind the blur (ACCENT_FLAG_GRADIENT).
      accentFlags: enabled ? 0x2 : 0x0,
      gradientColor: tint,
      animationId: 0
    });

    const data = {
      Attrib: WCA_ACCENT_POLICY,
      pvData: accentBuffer,
      cbData: accentBuffer.length
    };

    return setWindowCompositionAttribute(hwnd, data) !== 0;
  } catch {
    return false;
  }
}

function enableAcrylic(win, options) {
  if (!win || win.isDestroyed?.() || typeof win.getNativeWindowHandle !== "function") {
    return false;
  }

  return applyToHwnd(win.getNativeWindowHandle(), { ...options, enabled: true });
}

function disableAcrylic(win) {
  if (!win || win.isDestroyed?.() || typeof win.getNativeWindowHandle !== "function") {
    return false;
  }

  return applyToHwnd(win.getNativeWindowHandle(), { enabled: false });
}

module.exports = {
  disableAcrylic,
  enableAcrylic,
  isSupported: () => ensureLoaded()
};
