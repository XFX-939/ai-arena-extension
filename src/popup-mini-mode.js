// AI Arena — 群聊简洁模式（Mini Bar）v4.8.15 F30
// 点击 "⇲ 折叠到顶" → body[data-mode="mini"] + 通知 background 把 popup window resize 到一行
// 再点（文字变 "⇱ 展开"）→ 恢复原 bounds + data-mode="full"
//
// 设计细节：
// - body[data-mode] 切换 CSS，隐藏不需要的 DOM 但不 unmount（DOM 持续接收 chatStreamUpdate）
// - bounds 由 chat-bus.js 双套记忆：popupBoundsFull / popupBoundsMini
// - mode 持久化到 chrome.storage.local.popupMode，popup 启动时读取应用
(function () {
  const STORAGE_KEY = "popupMode";

  function setLabel(mode) {
    const btn = document.getElementById("btn-mini-mode");
    if (!btn) return;
    btn.textContent = mode === "mini" ? "⇱ 展开" : "⇲ 折叠到顶";
    btn.title = mode === "mini" ? "展开恢复完整窗口" : "折叠到顶部一行";
  }

  function applyMode(mode) {
    const m = mode === "mini" ? "mini" : "full";
    document.body.setAttribute("data-mode", m);
    setLabel(m);
  }

  function toggleMode() {
    const cur = document.body.getAttribute("data-mode") === "mini" ? "mini" : "full";
    const next = cur === "mini" ? "full" : "mini";
    applyMode(next);
    chrome.storage.local.set({ [STORAGE_KEY]: next }).catch(() => {});
    chrome.runtime.sendMessage({ type: "miniModeToggle", mode: next }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[mini-mode] toggle msg fail:", chrome.runtime.lastError?.message);
      }
    });
  }

  function init() {
    // 启动时从 storage 读取上次状态，应用
    chrome.storage.local.get([STORAGE_KEY]).then(d => {
      applyMode(d[STORAGE_KEY] || "full");
    }).catch(() => applyMode("full"));

    const btn = document.getElementById("btn-mini-mode");
    if (btn) btn.addEventListener("click", toggleMode);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
