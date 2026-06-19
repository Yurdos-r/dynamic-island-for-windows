import { createElement } from "../dom";
import type { ViewSyncContext } from "./view-sync-context";

export function renderLyricsListView(context: ViewSyncContext) {
  const lyricsList = context.app.querySelector<HTMLElement>(".lyrics-list");
  if (!lyricsList) {
    return;
  }

  let lyricsInner = lyricsList.querySelector<HTMLElement>(".lyrics-list-inner");
  if (!lyricsInner) {
    lyricsInner = createElement("div", { className: "lyrics-list-inner" });
    lyricsList.replaceChildren(lyricsInner);
  }

  const displayedLyrics = context.getDisplayedLyrics();
  const renderKey = displayedLyrics
    .map((line) => [line.timeMs, line.text, line.translation || ""].join("|"))
    .join("~");

  if (renderKey !== context.lastLyricsDataKey) {
    context.lastLyricsDataKey = renderKey;
    lyricsInner.replaceChildren(
      ...displayedLyrics.map((line, index) => {
        const lyricLine = createElement("div", {
          className: "lyric-line",
          attributes: {
            role: "listitem"
          },
          dataset: {
            lyricIndex: index.toString()
          }
        });
        const textWrap = createElement("strong");
        textWrap.append(createElement("span", { className: "lyric-text", text: line.text }));

        if (line.translation) {
          textWrap.append(createElement("small", { text: line.translation }));
        }

        lyricLine.append(textWrap);
        return lyricLine;
      })
    );
  }

  syncLyricsState(context);
}

function queueLyricsCentering(context: ViewSyncContext) {
  if (context.lyricsCenterFrame) {
    window.cancelAnimationFrame(context.lyricsCenterFrame);
  }

  context.lyricsCenterFrame = window.requestAnimationFrame(() => {
    context.lyricsCenterFrame = 0;
    centerActiveLyric(context);
  });
}

function centerActiveLyric(context: ViewSyncContext) {
  const lyricsList = context.app.querySelector<HTMLElement>(".lyrics-list");
  const lyricsInner = lyricsList?.querySelector<HTMLElement>(".lyrics-list-inner");
  if (!lyricsList || !lyricsInner) {
    return;
  }

  const activeIndex = context.lyrics.length ? context.getActiveLyricIndex() : 0;
  const activeLine = lyricsInner.querySelector<HTMLElement>(`.lyric-line[data-lyric-index="${activeIndex}"]`);
  if (!activeLine) {
    lyricsInner.style.setProperty("--lyrics-shift", "0px");
    return;
  }

  const listCenter = lyricsList.clientHeight / 2;
  const activeCenter = activeLine.offsetTop + activeLine.offsetHeight / 2;
  lyricsInner.style.setProperty("--lyrics-shift", `${(listCenter - activeCenter).toFixed(2)}px`);
}

function syncLyricsState(context: ViewSyncContext) {
  const lyricsInner = context.app.querySelector<HTMLElement>(".lyrics-list-inner");
  if (!lyricsInner) {
    return;
  }

  const activeIndex = context.lyrics.length ? context.getActiveLyricIndex() : 0;
  lyricsInner.querySelectorAll<HTMLElement>(".lyric-line").forEach((line, index) => {
    const isActive = index === activeIndex;
    const distance = Math.abs(index - activeIndex);
    const depth = Math.min(distance, 5);
    const scale = Math.max(0.78, 1.08 - depth * 0.055);
    const opacity = isActive ? 1 : Math.max(0.16, 0.78 - depth * 0.13);
    const blur = isActive ? 0 : Math.min(4.8, 0.85 + depth * 0.68);

    line.classList.toggle("active", isActive);
    line.dataset.active = isActive ? "true" : "false";
    line.dataset.distance = depth.toString();
    line.style.setProperty("--lyric-scale", scale.toFixed(3));
    line.style.setProperty("--lyric-opacity", opacity.toFixed(3));
    line.style.setProperty("--lyric-blur", `${blur.toFixed(2)}px`);

    if (isActive) {
      line.setAttribute("aria-current", "true");
    } else {
      line.removeAttribute("aria-current");
    }
  });

  queueLyricsCentering(context);
}
