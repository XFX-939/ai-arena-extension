// popup-logo-style.js — 卡牌 logo 风格切换（classic / anime）
// 暴露 window.ArenaLogoStyle 给 popup-members + popup.js 共用
(function () {
  const STORAGE_KEY = "logoStyle";
  const DEFAULT = "classic";
  const STYLES = {
    classic: { dir: "icons/heroes",        name: "经典英雄", desc: "Q 版热血英雄·首发版" },
    anime:   { dir: "icons/heroes-anime",  name: "二次元少女", desc: "Q 版美少女·人气番剧风" },
  };
  const IDS = ["claude","gemini","chatgpt","deepseek","doubao","qwen","kimi","yuanbao","grok","huawei"];

  let current = DEFAULT;

  function heroPath(id) {
    const dir = (STYLES[current] || STYLES[DEFAULT]).dir;
    return `${dir}/${id}.webp`;
  }

  // 预览图 — 设置 tab 风格 cards 里展示 1 张代表图（用 claude）
  function previewPath(style) {
    const meta = STYLES[style] || STYLES[DEFAULT];
    return `${meta.dir}/claude.webp`;
  }

  function setCurrent(style, persist = true) {
    if (!STYLES[style]) style = DEFAULT;
    if (current === style) return;
    current = style;
    if (persist) {
      try { chrome.storage.local.set({ [STORAGE_KEY]: style }); } catch (_) {}
    }
    document.dispatchEvent(new CustomEvent("logo-style-changed", { detail: { style } }));
  }

  async function init() {
    try {
      const r = await new Promise(res => chrome.storage.local.get([STORAGE_KEY], resp => res(resp || {})));
      if (r[STORAGE_KEY] && STYLES[r[STORAGE_KEY]]) current = r[STORAGE_KEY];
    } catch (_) {}
    document.dispatchEvent(new CustomEvent("logo-style-changed", { detail: { style: current, initial: true } }));
  }

  // 跨上下文同步（设置改了，主对话端也要重渲染）
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[STORAGE_KEY]) {
        const next = changes[STORAGE_KEY].newValue;
        if (next && STYLES[next] && next !== current) {
          current = next;
          document.dispatchEvent(new CustomEvent("logo-style-changed", { detail: { style: next } }));
        }
      }
    });
  } catch (_) {}

  window.ArenaLogoStyle = {
    get current() { return current; },
    setCurrent,
    heroPath,
    previewPath,
    listStyles() { return Object.entries(STYLES).map(([k, v]) => ({ id: k, ...v })); },
    IDS,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
