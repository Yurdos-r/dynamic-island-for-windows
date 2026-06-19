import { createElement } from "../dom";
import { createClipboardRow } from "../views/clipboard-view";
import type { ViewSyncContext } from "./view-sync-context";

export function syncClipboardSurface(context: ViewSyncContext) {
  const promptLayer = context.app.querySelector<HTMLButtonElement>(".clipboard-prompt-layer");
  const promptText = context.app.querySelector<HTMLElement>(".clipboard-prompt-text");
  const clipboardLayer = context.app.querySelector<HTMLElement>(".clipboard-layer");
  const clipboardList = context.app.querySelector<HTMLElement>(".clipboard-list");
  const clipboardConfirmPanel = context.app.querySelector<HTMLElement>(".clipboard-confirm-panel");
  const clipboardConfirmPreview = context.app.querySelector<HTMLElement>(".clipboard-confirm-preview");
  const clipboardConfirmTime = context.app.querySelector<HTMLElement>(".clipboard-confirm-time");
  const clipboardClearButton = context.app.querySelector<HTMLButtonElement>(".clipboard-clear-button");
  const deleteDialog = context.app.querySelector<HTMLElement>(".clipboard-delete-dialog");
  const deletePreview = context.app.querySelector<HTMLElement>(".clipboard-delete-preview");

  if (
    !promptLayer ||
    !promptText ||
    !clipboardLayer ||
    !clipboardList ||
    !clipboardConfirmPanel ||
    !clipboardConfirmPreview ||
    !clipboardConfirmTime ||
    !clipboardClearButton ||
    !deleteDialog ||
    !deletePreview
  ) {
    return;
  }

  promptText.textContent = context.getClipboardPreviewText();
  promptLayer.hidden = !context.clipboardPromptVisible || context.mode !== "clipboard-prompt";
  clipboardLayer.hidden = context.mode !== "clipboard" && context.app.dataset.returningFromClipboard !== "true";
  const pendingItem = context.getPendingClipboardItem();
  const acceptedItem = context.getAcceptedClipboardItem();
  const acceptedReady = Boolean(acceptedItem && !context.clipboardAccepting);
  const showClipboardConfirmPanel = Boolean(pendingItem || context.clipboardAccepting || acceptedItem) && context.mode === "clipboard";
  const visibleClipboardItems = acceptedItem
    ? context.clipboardSnapshot.items.filter((item) => item.id !== acceptedItem.id && item.text !== acceptedItem.text)
    : context.clipboardSnapshot.items;
  const shouldMoveListWithContractingPanel = context.clipboardAccepting && visibleClipboardItems.length > 0;
  clipboardConfirmPanel.hidden = !showClipboardConfirmPanel;
  clipboardConfirmPreview.textContent = pendingItem?.preview || acceptedItem?.preview || context.clipboardAcceptPreview || "";
  clipboardConfirmTime.textContent = acceptedItem || pendingItem ? context.formatClipboardTime((acceptedItem || pendingItem)?.copiedAt || Date.now()) : "";
  clipboardConfirmPanel.dataset.accepting = context.clipboardAccepting || acceptedReady ? "true" : "false";
  clipboardConfirmPanel.dataset.contracting = context.clipboardAccepting ? "true" : "false";
  clipboardConfirmPanel.dataset.ready = acceptedReady ? "true" : "false";
  if (acceptedReady) {
    clipboardConfirmPanel.dataset.action = "clipboard-copy";
    clipboardConfirmPanel.dataset.clipboardId = acceptedItem?.id || "";
  } else {
    delete clipboardConfirmPanel.dataset.action;
    delete clipboardConfirmPanel.dataset.clipboardId;
  }
  clipboardList.dataset.accepting = context.clipboardAccepting && !shouldMoveListWithContractingPanel ? "true" : "false";
  clipboardList.dataset.contractingBelow = shouldMoveListWithContractingPanel ? "true" : "false";
  clipboardList.hidden =
    (context.clipboardAccepting && !shouldMoveListWithContractingPanel) ||
    (Boolean(pendingItem) && context.mode === "clipboard" && !acceptedReady && !shouldMoveListWithContractingPanel);
  clipboardClearButton.hidden = (Boolean(pendingItem) && context.mode === "clipboard") || context.clipboardAccepting;

  const clipboardListNextKey = [
    acceptedItem ? "with-accepted-row" : "normal",
    visibleClipboardItems.map((item) => `${item.id}:${item.copiedAt}:${item.preview}`).join("|"),
    !visibleClipboardItems.length && !context.clipboardAccepting && !acceptedReady ? "empty" : ""
  ].join("::");

  if (context.clipboardListRenderKey !== clipboardListNextKey) {
    context.clipboardListRenderKey = clipboardListNextKey;
    clipboardList.replaceChildren(
      ...visibleClipboardItems.map((item, index) => createClipboardRow(item, index + (acceptedItem ? 1 : 0), context.formatClipboardTime))
    );

    if (!visibleClipboardItems.length && !context.clipboardAccepting && !acceptedReady) {
      clipboardList.append(
        createElement("div", {
          className: "clipboard-empty",
          text: "No clipboard records"
        })
      );
    }
  }
  if (context.mode !== "clipboard" || (context.clipboardDeleteDialogItemId && !context.getClipboardItemById(context.clipboardDeleteDialogItemId))) {
    context.clipboardDeleteDialogItemId = "";
  }

  const deleteItem = context.getClipboardItemById(context.clipboardDeleteDialogItemId);
  deleteDialog.hidden = !deleteItem || context.mode !== "clipboard";
  deletePreview.textContent = deleteItem?.preview || "";
}
