// popup-rightpanel.js — 右栏 4 Tab 切换调度器
(function () {
  const TABS = ["members", "tasks", "stats", "templates", "settings"];
  let currentTab = "members";

  function activate(name) {
    if (!TABS.includes(name)) return;
    currentTab = name;
    document.querySelectorAll(".rp-tab").forEach(el => {
      el.classList.toggle("active", el.dataset.tab === name);
    });
    document.querySelectorAll(".rp-panel").forEach(el => {
      el.classList.toggle("active", el.dataset.rpPanel === name);
    });
    try { chrome.storage?.local.set({ rpActiveTab: name }); } catch (_) {}
    document.dispatchEvent(new CustomEvent("rp:activated", { detail: { tab: name } }));
  }

  function init() {
    document.querySelectorAll(".rp-tab").forEach(btn => {
      btn.addEventListener("click", () => activate(btn.dataset.tab));
    });
    try {
      chrome.storage?.local.get(["rpActiveTab"], (r) => {
        if (r?.rpActiveTab && TABS.includes(r.rpActiveTab)) activate(r.rpActiveTab);
      });
    } catch (_) {}
  }

  window.ChatRightPanel = {
    activate,
    get current() { return currentTab; },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
