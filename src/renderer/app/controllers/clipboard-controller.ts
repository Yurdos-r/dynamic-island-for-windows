import type { ClipboardItem, ClipboardSnapshot } from "../state";

function normalizeClipboardItem(item: ClipboardItem) {
  return {
    id: typeof item.id === "string" ? item.id : `${item.copiedAt || Date.now()}-${item.text.slice(0, 12)}`,
    text: item.text,
    preview: typeof item.preview === "string" && item.preview ? item.preview : item.text.replace(/\s+/g, " ").trim().slice(0, 160),
    copiedAt: Number(item.copiedAt || Date.now())
  };
}

export function normalizeClipboardSnapshot(snapshot: ClipboardSnapshot | undefined): ClipboardSnapshot {
  const items = Array.isArray(snapshot?.items)
    ? snapshot.items
        .filter((item) => typeof item?.text === "string" && item.text.trim())
        .map(normalizeClipboardItem)
    : [];
  const pending =
    typeof snapshot?.pending?.text === "string" && snapshot.pending.text.trim()
      ? normalizeClipboardItem(snapshot.pending)
      : undefined;

  const activeItem = items[0];
  return {
    active: Boolean(pending || activeItem),
    text: typeof snapshot?.text === "string" ? snapshot.text : pending?.text || activeItem?.text || "",
    preview: typeof snapshot?.preview === "string" ? snapshot.preview : pending?.preview || activeItem?.preview || "",
    pending,
    items,
    updatedAt: Number(snapshot?.updatedAt || Date.now())
  };
}

export function formatClipboardTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
