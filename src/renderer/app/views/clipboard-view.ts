import { createElement } from "../dom";
import type { ClipboardItem } from "../state";

export function createClipboardRow(
  item: ClipboardItem,
  index: number,
  formatClipboardTime: (timestamp: number) => string
) {
  const row = createElement("button", {
    className: "clipboard-row",
    attributes: {
      type: "button",
      "aria-label": `复制第 ${index + 1} 条剪贴板内容`
    },
    dataset: {
      action: "clipboard-copy",
      clipboardId: item.id
    }
  });
  const copy = createElement("span", { className: "clipboard-row-copy" });
  copy.append(
    createElement("strong", { text: item.preview || item.text }),
    createElement("small", { text: formatClipboardTime(item.copiedAt) })
  );
  row.append(
    createElement("span", {
      className: "clipboard-row-icon",
      attributes: { "aria-hidden": "true" }
    }),
    copy
  );
  return row;
}
