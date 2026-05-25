// AI Arena — 简洁模式（compact mode）v4.8.41
//
// 打开 = AI 回答超过 100 字自动折叠为一行（提取中即折叠），下方显示"展开全文 xxxx 字"
// 关闭 = 原行为（800 字阈值 + 仅完成后折叠）
//
// 状态通过 body[data-compact="on"] 表达；持久化到 chrome.storage.local.compactMode
// applyFoldClass（popup.js）根据该 attribute 切换阈值和触发条件
(function () {
  const STORAGE_KEY = "compactMode";

  function setLabel(on) {
    const btn = document.getElementById("btn-compact-mode");
    if (!btn) return;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("active", !!on);
    btn.title = on
      ? "简洁模式已开 — 点击恢复完整气泡显示"
      : "简洁模式 — 长回答超 100 字自动折叠为一行";
  }

  function apply(on) {
    document.body.setAttribute("data-compact", on ? "on" : "off");
    setLabel(on);
    // 通知 popup.js 重新评估所有已渲染气泡的折叠状态
    try {
      document.dispatchEvent(new CustomEvent("compact:changed", { detail: { on: !!on } }));
    } catch (_) {}
  }

  function toggle() {
    const cur = document.body.getAttribute("data-compact") === "on";
    const next = !cur;
    apply(next);
    try { chrome.storage.local.set({ [STORAGE_KEY]: next }); } catch (_) {}
  }

  function init() {
    // 启动时读 storage 应用
    try {
      chrome.storage.local.get([STORAGE_KEY], d => apply(!!d?.[STORAGE_KEY]));
    } catch (_) {
      apply(false);
    }
    const btn = document.getElementById("btn-compact-mode");
    if (btn) btn.addEventListener("click", toggle);
  }

  // 暴露给 popup.js 用（applyFoldClass 检查当前 compact 状态）
  window.ChatCompactMode = {
    isOn: () => document.body.getAttribute("data-compact") === "on",
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
