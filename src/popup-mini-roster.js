// popup-mini-roster.js — v4.8.30
// mini 模式下在 picker 和输入框之间横排参与者头像 + 状态色，点击切 skipped
// 状态来自 chrome.runtime stateUpdate + chatStreamUpdate
(function () {
  const $bar = document.getElementById("mini-roster");
  if (!$bar) return;

  let participants = [];                  // [{id, service, name, skipped}]
  const streamStatus = new Map();         // service → "busy"|"ready"|"error"|"skipped"
  let miniSkipped = new Set();            // service ids — 用户在 mini 下点击置灰的 AI
  const STORAGE_KEY = "miniSkippedServices";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function statusOf(p) {
    if (miniSkipped.has(p.service)) return "skipped";
    const s = streamStatus.get(p.service);
    if (p.skipped) return "skipped";
    if (s) return s;
    if (p.error) return "error";
    if (p.isStreaming) return "busy";
    if (p.response || p.responsePreview) return "ready";
    return "idle";
  }
  function statusLabel(st) {
    return ({ busy:"提取中", ready:"已完成", error:"失败", skipped:"已跳过", idle:"等待中" })[st] || "等待中";
  }

  function render() {
    if (!participants.length) {
      $bar.innerHTML = "";
      $bar.classList.add("empty");
      return;
    }
    $bar.classList.remove("empty");
    $bar.innerHTML = participants.map(p => {
      const st = statusOf(p);
      const heroSrc = window.ArenaLogoStyle?.heroPath(p.service) || `icons/brands/${p.service}.svg`;
      return `
        <button class="mini-ai ${st === 'skipped' ? 'skipped' : ''} status-${st}"
                data-pid="${escapeHtml(p.id)}"
                data-service="${escapeHtml(p.service)}"
                title="${escapeHtml(p.name)} · ${statusLabel(st)} · 点击 ${st === 'skipped' ? '取消跳过' : '跳过本轮'}">
          <img class="mini-ai-logo" src="${heroSrc}" alt="${escapeHtml(p.name)}">
          <span class="mini-ai-dot ${st}"></span>
        </button>`;
    }).join("");

    $bar.querySelectorAll(".mini-ai").forEach(btn => {
      btn.addEventListener("click", () => {
        const svc = btn.dataset.service;
        if (miniSkipped.has(svc)) miniSkipped.delete(svc);
        else miniSkipped.add(svc);
        try {
          chrome.storage.local.set({ [STORAGE_KEY]: [...miniSkipped] });
          chrome.runtime.sendMessage({ type: "setMiniSkip", services: [...miniSkipped] }, () => void chrome.runtime.lastError);
        } catch (_) {}
        render();
      });
    });
  }

  async function refresh() {
    try {
      const r = await new Promise(res => chrome.runtime.sendMessage({ type: "getState" }, resp => res(resp || {})));
      if (Array.isArray(r.participants)) participants = r.participants;
    } catch (_) {}
    try {
      const r2 = await new Promise(res => chrome.storage.local.get([STORAGE_KEY], resp => res(resp || {})));
      if (Array.isArray(r2[STORAGE_KEY])) miniSkipped = new Set(r2[STORAGE_KEY]);
    } catch (_) {}
    render();
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "stateUpdate" && Array.isArray(msg.participants)) {
        participants = msg.participants;
        render();
        return;
      }
      if (msg?.type === "chatStreamUpdate" && msg.role === "user") {
        streamStatus.clear();
        render();
        return;
      }
      if (msg?.type === "chatStreamUpdate" && msg.role === "ai" && msg.participantId) {
        let next = "busy";
        if (msg.skipped) next = "skipped";
        else if (msg.emptyTimeout) next = "error";
        else if (msg.isDone) next = "ready";
        streamStatus.set(msg.participantId, next);
        render();
        return;
      }
      if (msg?.type === "chatClear" || msg?.type === "hardReset") {
        streamStatus.clear();
        render();
      }
    });
  } catch (_) {}

  document.addEventListener("logo-style-changed", () => render());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
})();
