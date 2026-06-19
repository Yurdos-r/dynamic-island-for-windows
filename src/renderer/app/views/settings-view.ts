import { createElement, createIcon } from "../dom";
import {
  GLASS_INTENSITY_OPTIONS,
  GLASS_STYLE_OPTIONS,
  LAYOUT_OPTIONS,
  SETTINGS_NAV_ITEMS
} from "../state";

export function buildSettingsLayer() {
  const settingsLayer = createElement("main", {
    className: "island-layer settings-layer",
    attributes: { "aria-label": "设置" }
  });

  // ——— 设置中心（hub）：标题 + 三个二级页导航 ———
  const settingsHub = createElement("section", {
    className: "settings-hub",
    attributes: { "data-settings-view": "hub", "aria-label": "设置" }
  });
  const hubHeader = createElement("header", { className: "settings-header" });
  hubHeader.append(createElement("div", { className: "settings-title", text: "设置" }));
  const hubNav = createElement("div", {
    className: "settings-nav",
    attributes: { role: "list" }
  });
  SETTINGS_NAV_ITEMS.forEach((item) => {
    const row = createElement("button", {
      className: "settings-nav-item",
      attributes: { type: "button", role: "listitem", "aria-label": item.label },
      dataset: { action: "settings-nav", page: item.page }
    });
    const copy = createElement("span", { className: "settings-nav-copy" });
    copy.append(
      createElement("strong", { text: item.label }),
      createElement("small", { text: item.hint })
    );
    const chevron = createElement("span", {
      className: "settings-nav-chevron",
      attributes: { "aria-hidden": "true" }
    });
    chevron.append(createIcon("chevron-right", ""));
    row.append(copy, chevron);
    hubNav.append(row);
  });
  settingsHub.append(hubHeader, hubNav);

  // 二级页统一的返回标题栏构造器。
  const buildSubHeader = (title: string) => {
    const header = createElement("header", { className: "settings-header settings-sub-header" });
    const back = createElement("button", {
      className: "settings-back",
      attributes: { type: "button", "aria-label": "返回设置" },
      dataset: { action: "settings-back" }
    });
    back.append(createIcon("chevron-left", "返回"));
    header.append(back, createElement("div", { className: "settings-title", text: title }));
    return header;
  };

  // ——— 二级页：外观（玻璃风格 + 强度） ———
  const appearancePage = createElement("section", {
    className: "settings-page settings-page-appearance",
    attributes: { "data-settings-view": "appearance", "aria-label": "外观设置" }
  });
  const settingsOptions = createElement("div", {
    className: "settings-options",
    attributes: { role: "radiogroup", "aria-label": "玻璃风格" }
  });
  GLASS_STYLE_OPTIONS.forEach((option) => {
    const card = createElement("button", {
      className: "settings-option",
      attributes: {
        type: "button",
        role: "radio",
        "aria-checked": "false",
        "aria-label": option.label
      },
      dataset: {
        action: "set-glass",
        glass: option.id
      }
    });
    const preview = createElement("span", {
      className: `settings-option-preview glass-preview-${option.id}`,
      attributes: { "aria-hidden": "true" }
    });
    const copy = createElement("span", { className: "settings-option-copy" });
    copy.append(
      createElement("strong", { text: option.label }),
      createElement("small", { text: option.hint })
    );
    card.append(preview, copy);
    settingsOptions.append(card);
  });

  const intensityRow = createElement("div", {
    className: "settings-intensity",
    attributes: { role: "radiogroup", "aria-label": "玻璃强度" }
  });
  GLASS_INTENSITY_OPTIONS.forEach((option) => {
    intensityRow.append(
      createElement("button", {
        className: "settings-intensity-option",
        text: option.label,
        attributes: {
          type: "button",
          role: "radio",
          "aria-checked": "false",
          "aria-label": `玻璃强度：${option.label}`
        },
        dataset: {
          action: "set-intensity",
          intensity: option.id
        }
      })
    );
  });

  const intensityLabel = createElement("div", {
    className: "settings-section-label",
    text: "强度"
  });
  appearancePage.append(buildSubHeader("外观"), settingsOptions, intensityLabel, intensityRow);

  // ——— 二级页：布局（胶囊呈现方式） ———
  const layoutPage = createElement("section", {
    className: "settings-page settings-page-layout",
    attributes: { "data-settings-view": "layout", "aria-label": "布局设置" }
  });
  const layoutOptions = createElement("div", {
    className: "settings-options settings-options-layout",
    attributes: { role: "radiogroup", "aria-label": "胶囊布局" }
  });
  LAYOUT_OPTIONS.forEach((option) => {
    const card = createElement("button", {
      className: "settings-option",
      attributes: {
        type: "button",
        role: "radio",
        "aria-checked": "false",
        "aria-label": option.label
      },
      dataset: {
        action: "set-layout",
        layout: option.id
      }
    });
    const preview = createElement("span", {
      className: `settings-option-preview layout-preview-${option.id}`,
      attributes: { "aria-hidden": "true" }
    });
    const copy = createElement("span", { className: "settings-option-copy" });
    copy.append(
      createElement("strong", { text: option.label }),
      createElement("small", { text: option.hint })
    );
    card.append(preview, copy);
    layoutOptions.append(card);
  });
  layoutPage.append(buildSubHeader("布局"), layoutOptions);

  // ——— 二级页：系统监控（全局开关） ———
  const monitorPage = createElement("section", {
    className: "settings-page settings-page-monitor",
    attributes: { "data-settings-view": "monitor", "aria-label": "系统监控设置" }
  });
  const monitorToggle = createElement("button", {
    className: "settings-toggle",
    attributes: {
      type: "button",
      role: "switch",
      "aria-checked": "false",
      "aria-label": "系统监控"
    },
    dataset: { action: "toggle-system-monitor" }
  });
  const monitorToggleCopy = createElement("span", { className: "settings-toggle-copy" });
  monitorToggleCopy.append(
    createElement("strong", { text: "系统监控" }),
    createElement("small", { text: "显示 CPU / 内存 / GPU / 磁盘 读数" })
  );
  const monitorToggleTrack = createElement("span", {
    className: "settings-toggle-track",
    attributes: { "aria-hidden": "true" }
  });
  monitorToggleTrack.append(createElement("span", { className: "settings-toggle-thumb" }));
  monitorToggle.append(monitorToggleCopy, monitorToggleTrack);
  const monitorHint = createElement("p", {
    className: "settings-toggle-hint",
    text: "关闭后，经典布局右下角的监控胶囊与顶部居中的系统卡片都会隐藏。"
  });
  monitorPage.append(buildSubHeader("系统监控"), monitorToggle, monitorHint);

  settingsLayer.append(settingsHub, appearancePage, layoutPage, monitorPage);

  // 顶部居中布局下，系统监控以独立卡片态嵌入主胶囊。

  return settingsLayer;
}
