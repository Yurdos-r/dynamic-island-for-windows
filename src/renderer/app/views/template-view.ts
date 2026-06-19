import { createIcons } from "lucide";
import { buildSystemCapsule, buildSystemCard, renderSystemIcons } from "../../system-view";
import { createElement, createIcon } from "../dom";
import { lucideIcons } from "../icons";
import { ISLAND_STATE_NAMES, type TrackState } from "../state";
import { appendMediaControls } from "./media-view";
import { buildSettingsLayer } from "./settings-view";

interface RenderIslandTemplateContext {
  app: HTMLElement;
  track: TrackState;
  progressSeconds: number;
  progressPercent(): string;
  formatTime(seconds: number): string;
  resetLyricsDataKey(): void;
  renderLyricsList(): void;
}
export function renderIslandTemplate(context: RenderIslandTemplateContext) {
  const { app, track, progressSeconds, progressPercent, formatTime } = context;
  app.replaceChildren();

  const shell = createElement("section", {
    className: "island-shell",
    attributes: { "aria-label": "灵动岛" }
  });

  const albumArt = createElement("div", {
    className: "shared-album-art",
    attributes: { "aria-hidden": "true" }
  });
  albumArt.append(createIcon("music-2", "音乐"));

  const trackCopy = createElement("div", {
    className: "shared-track-copy",
    attributes: { "aria-hidden": "true" }
  });
  trackCopy.append(
    createElement("strong", {
      className: "shared-track-title",
      text: track.title,
      dataset: { field: "track-title" }
    }),
    createElement("span", {
      className: "shared-track-artist",
      text: track.artist,
      dataset: { field: "track-artist" }
    })
  );

  const idleLayer = createElement("button", {
    className: "island-layer idle-layer",
    attributes: {
      type: "button",
      "aria-label": `打开${ISLAND_STATE_NAMES.island}`
    },
    dataset: { action: "open-quick" }
  });

  const hoverLayer = createElement("div", {
    className: "island-layer hover-layer",
    attributes: { "aria-label": `音乐${ISLAND_STATE_NAMES.island}` }
  });
  const compactButton = createElement("button", {
    className: "media-compact",
    attributes: {
      type: "button",
      "aria-label": `打开音乐${ISLAND_STATE_NAMES.card}`
    },
    dataset: { action: "expand" }
  });
  const quickControls = createElement("div", {
    className: "quick-media-controls",
    attributes: { "aria-label": "小岛媒体控制" }
  });
  appendMediaControls(quickControls, "compact");
  hoverLayer.append(compactButton, quickControls);

  const privacyStrip = createElement("button", {
    className: "island-layer privacy-strip",
    attributes: {
      type: "button",
      "aria-live": "polite",
      "aria-expanded": "false",
      "aria-label": `权限监控${ISLAND_STATE_NAMES.capsule}`
    },
    dataset: { action: "privacy-toggle" }
  });

  const clipboardPromptLayer = createElement("div", {
    className: "island-layer clipboard-prompt-layer",
    attributes: {
      role: "button",
      tabindex: "0",
      "aria-label": "进入剪贴板"
    },
    dataset: { action: "clipboard-open-card" }
  });
  const clipboardPromptCopy = createElement("span", { className: "clipboard-prompt-copy" });
  clipboardPromptCopy.append(
    createElement("strong", { className: "clipboard-prompt-text", text: "" }),
    createElement("small", { className: "clipboard-prompt-question", text: "进入剪贴板？" })
  );
  clipboardPromptLayer.append(
    createElement("span", {
      className: "clipboard-prompt-icon",
      attributes: { "aria-hidden": "true" }
    }),
    clipboardPromptCopy,
    createElement("button", {
      className: "clipboard-prompt-action",
      text: "是",
      attributes: {
        type: "button"
      },
      dataset: { action: "clipboard-accept" }
    })
  );

  const clipboardLayer = createElement("main", {
    className: "island-layer clipboard-layer",
    attributes: { "aria-label": "剪贴板" }
  });
  const clipboardHeader = createElement("header", { className: "clipboard-header" });
  const clipboardHeaderCopy = createElement("div", { className: "clipboard-header-copy" });
  clipboardHeaderCopy.append(
    createElement("div", { className: "clipboard-title", text: "剪贴板" }),
    createElement("div", { className: "clipboard-subtitle", text: "最近复制" })
  );
  clipboardHeader.append(
    clipboardHeaderCopy,
    createElement("button", {
      className: "clipboard-clear-button",
      text: "清理",
      attributes: {
        type: "button",
        "aria-label": "一键清理剪贴板历史"
      },
      dataset: { action: "clipboard-clear" }
    })
  );
  const clipboardList = createElement("div", {
    className: "clipboard-list",
    attributes: { role: "list" }
  });
  const clipboardConfirmPanel = createElement("section", {
    className: "clipboard-confirm-panel",
    attributes: { "aria-label": "确认加入剪贴板" }
  });
  clipboardConfirmPanel.append(
    createElement("span", {
      className: "clipboard-confirm-icon clipboard-row-icon",
      attributes: { "aria-hidden": "true" }
    }),
    createElement("span", { className: "clipboard-confirm-kicker", text: "是否加入剪贴板" }),
    createElement("strong", { className: "clipboard-confirm-preview", text: "" }),
    createElement("small", { className: "clipboard-confirm-time", text: "" }),
    createElement("div", { className: "clipboard-confirm-actions" })
  );
  const clipboardConfirmActions = clipboardConfirmPanel.querySelector<HTMLElement>(".clipboard-confirm-actions");
  clipboardConfirmActions?.append(
    createElement("button", {
      className: "clipboard-confirm-no",
      text: "否",
      attributes: { type: "button" },
      dataset: { action: "clipboard-reject" }
    }),
    createElement("button", {
      className: "clipboard-confirm-yes",
      text: "是",
      attributes: { type: "button" },
      dataset: { action: "clipboard-accept" }
    })
  );
  const clipboardDeleteDialog = createElement("div", {
    className: "clipboard-delete-dialog",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "删除剪贴板记录"
    }
  });
  const clipboardDeletePanel = createElement("div", { className: "clipboard-delete-panel" });
  clipboardDeletePanel.append(
    createElement("strong", { className: "clipboard-delete-title", text: "删除这条记录？" }),
    createElement("span", { className: "clipboard-delete-preview", text: "" }),
    createElement("div", { className: "clipboard-delete-actions" })
  );
  const clipboardDeleteActions = clipboardDeletePanel.querySelector<HTMLElement>(".clipboard-delete-actions");
  clipboardDeleteActions?.append(
    createElement("button", {
      className: "clipboard-delete-cancel",
      text: "取消",
      attributes: { type: "button" },
      dataset: { action: "clipboard-delete-cancel" }
    }),
    createElement("button", {
      className: "clipboard-delete-confirm",
      text: "删除",
      attributes: { type: "button" },
      dataset: { action: "clipboard-delete-confirm" }
    })
  );
  clipboardDeleteDialog.append(clipboardDeletePanel);
  clipboardLayer.append(clipboardHeader, clipboardConfirmPanel, clipboardList, clipboardDeleteDialog);

  const expandedLayer = createElement("main", {
    className: "island-layer expanded-layer",
    attributes: { "aria-label": `音乐${ISLAND_STATE_NAMES.card}` }
  });
  const mediaPanel = createElement("section", {
    className: "media-panel",
    attributes: { "aria-label": "当前播放" }
  });
  const mediaCopy = createElement("div", { className: "media-copy" });
  const progressTrack = createElement("div", {
    className: "progress-track",
    attributes: {
      role: "slider",
      tabindex: "0",
      "aria-label": "播放进度",
      "aria-valuemin": "0",
      "aria-valuemax": track.durationSeconds.toString(),
      "aria-valuenow": progressSeconds.toString()
    }
  });
  const progressFill = createElement("span", { dataset: { field: "progress-fill" } });
  progressFill.style.width = progressPercent();
  progressTrack.append(progressFill);

  const timeRow = createElement("div", { className: "media-time-row" });
  timeRow.append(
    createElement("span", { text: formatTime(progressSeconds), dataset: { field: "elapsed-time" } }),
    createElement("span", { text: formatTime(track.durationSeconds), dataset: { field: "duration-time" } })
  );
  mediaCopy.append(progressTrack, timeRow);

  const expandedControls = createElement("div", {
    className: "expanded-media-controls",
    attributes: { "aria-label": "卡片媒体控制" }
  });
  appendMediaControls(expandedControls, "expanded");
  mediaPanel.append(mediaCopy, expandedControls);

  const lyricsPanel = createElement("section", {
    className: "lyrics-panel",
    attributes: { "aria-label": "歌词" }
  });
  const lyricsList = createElement("div", { className: "lyrics-list" });
  lyricsList.append(createElement("div", { className: "lyrics-list-inner" }));
  lyricsPanel.append(lyricsList);
  expandedLayer.append(mediaPanel, lyricsPanel);

  const settingsLayer = buildSettingsLayer();

  const systemCardLayer = buildSystemCard();
  systemCardLayer.classList.add("island-layer");
  // 静息态（无音乐/权限/剪贴板）时，胶囊常驻系统紧凑读数，点击展开到系统卡。
  const systemCapsuleLayer = buildSystemCapsule();
  systemCapsuleLayer.dataset.action = "open-system";

  const cardPager = createElement("div", {
    className: "card-pager",
    attributes: { "aria-hidden": "true" }
  });

  shell.append(
    albumArt,
    trackCopy,
    idleLayer,
    hoverLayer,
    privacyStrip,
    clipboardPromptLayer,
    clipboardLayer,
    expandedLayer,
    settingsLayer,
    systemCapsuleLayer,
    systemCardLayer,
    cardPager
  );
  app.append(shell);

  context.resetLyricsDataKey();
  context.renderLyricsList();
  createIcons({ icons: lucideIcons });
  renderSystemIcons(app);
}
