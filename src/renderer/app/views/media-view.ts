import { createElement, createIcon } from "../dom";

function appendPlayPauseIcons(button: HTMLButtonElement, label = "播放或暂停") {
  const pauseIcon = createElement("span", { className: "pause-icon" });
  const playIcon = createElement("span", { className: "play-icon" });

  pauseIcon.append(createIcon("pause", label));
  playIcon.append(createIcon("play", label));
  button.append(pauseIcon, playIcon);
}

function createMediaControlButton(action: string, iconName: string, label: string, size: "compact" | "expanded", primary = false) {
  const compactClass = size === "compact" ? " compact" : "";
  const primaryClass = primary ? " primary" : "";
  const button = createElement("button", {
    className: `media-control-button${compactClass}${primaryClass}`,
    attributes: {
      type: "button",
      "aria-label": label
    },
    dataset: {
      action
    }
  });

  if (primary) {
    button.classList.add("play-toggle");
    appendPlayPauseIcons(button);
  } else {
    button.append(createIcon(iconName, label));
  }

  return button;
}

export function appendMediaControls(parent: HTMLElement, size: "compact" | "expanded") {
  parent.append(
    createMediaControlButton("previous-track", "skip-back", "上一首", size),
    createMediaControlButton("toggle-play", "play", "暂停", size, true),
    createMediaControlButton("next-track", "skip-forward", "下一首", size),
    createMediaControlButton("favorite-track", "heart", "收藏当前歌曲", size)
  );
}
