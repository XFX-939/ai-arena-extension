// popup-members.js — 成员 Tab：参与者列表 + 添加 + ⋯ 菜单 + Tab/并列 切换
(function () {
  const ALL_SERVICES = [
    { id: "claude",   name: "Claude" },
    { id: "gemini",   name: "Gemini" },
    { id: "chatgpt",  name: "GPT" },
    { id: "deepseek", name: "DeepSeek" },
    { id: "doubao",   name: "豆包" },
    { id: "qwen",     name: "千问" },
    { id: "kimi",     name: "Kimi" },
    { id: "yuanbao",  name: "元宝" },
    { id: "grok",     name: "Grok" },
  ];

  const state = { participants: [], layoutMode: "tiled" };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function statusOf(p) {
    if (p.error) return "error";
    if (p.isStreaming || p.responsePreview && !p.response) return "busy";
    if (p.response || p.responsePreview) return "ready";
    return "";
  }

  function render() {
    const root = document.getElementById("rp-panel-members");
    if (!root) return;
    const joined = state.participants || [];
    const joinedIds = new Set(joined.map(p => p.service));
    const remaining = ALL_SERVICES.filter(s => !joinedIds.has(s.id));

    root.innerHTML = `
      <div class="rp-section-title">已加入 (${joined.length}/3)</div>
      ${joined.length ? joined.map(p => `
        <div class="rp-list-item" data-pid="${escapeHtml(p.id)}">
          <span class="rp-status-dot ${statusOf(p)}"></span>
          <span class="name">${escapeHtml(p.name || p.service)}</span>
          <span class="rp-more" data-pid="${escapeHtml(p.id)}" title="操作">⋯</span>
        </div>
      `).join("") : `<div class="rp-empty">尚未添加参与者</div>`}

      <div class="rp-section-title" style="margin-top:10px">添加</div>
      <div class="rp-add-grid">
        ${remaining.map(s => `
          <button class="rp-add-btn" data-service="${s.id}">+ ${escapeHtml(s.name)}</button>
        `).join("")}
      </div>

      <div class="rp-section-title">AI 窗口布局</div>
      <div class="rp-mode-toggle">
        <button class="rp-mode-btn ${state.layoutMode === "tab" ? "active" : ""}" data-mode="tab">Tab</button>
        <button class="rp-mode-btn ${state.layoutMode === "tiled" ? "active" : ""}" data-mode="tiled">并列</button>
      </div>
    `;

    root.querySelectorAll(".rp-add-btn").forEach(b => {
      b.addEventListener("click", () => addParticipant(b.dataset.service));
    });
    root.querySelectorAll(".rp-mode-btn").forEach(b => {
      b.addEventListener("click", () => setWindowMode(b.dataset.mode));
    });
    root.querySelectorAll(".rp-more").forEach(el => {
      el.addEventListener("click", (e) => openActionMenu(e, el.dataset.pid));
    });
  }

  async function refresh() {
    try {
      const r = await new Promise(res => {
        chrome.runtime.sendMessage({ type: "getState" }, resp => res(resp || {}));
      });
      if (Array.isArray(r.participants)) state.participants = r.participants;
    } catch (_) {}
    try {
      const r2 = await new Promise(res => {
        chrome.storage.local.get(["windowMode"], resp => res(resp || {}));
      });
      if (r2.windowMode) state.layoutMode = r2.windowMode;
    } catch (_) {}
    render();
  }

  function addParticipant(service) {
    chrome.runtime.sendMessage({ type: "addParticipant", service }, () => refresh());
  }

  function removeParticipant(pid) {
    chrome.runtime.sendMessage({ type: "removeParticipant", id: pid }, () => refresh());
  }

  function retryInject(pid) {
    chrome.runtime.sendMessage({ type: "retryInject", id: pid }, () => {});
  }

  function reextractOne(pid) {
    chrome.runtime.sendMessage({ type: "chatReextractOne", participantId: pid }, () => {});
  }

  function setWindowMode(mode) {
    state.layoutMode = mode;
    chrome.runtime.sendMessage({ type: "setWindowMode", mode }, () => render());
  }

  function openActionMenu(ev, pid) {
    ev.stopPropagation();
    closeActionMenu();
    const menu = document.createElement("div");
    menu.className = "rp-action-menu";
    menu.innerHTML = `
      <div class="ai" data-act="resend">🔄 重发</div>
      <div class="ai" data-act="reextract">📥 重新提取</div>
      <div class="ai" data-act="remove">🗑 移除</div>
    `;
    document.body.appendChild(menu);
    const rect = ev.target.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + "px";
    const leftCandidate = rect.right - 130;
    menu.style.left = Math.max(8, leftCandidate) + "px";
    menu.querySelectorAll(".ai").forEach(item => {
      item.addEventListener("click", () => {
        const act = item.dataset.act;
        closeActionMenu();
        if (act === "resend") retryInject(pid);
        else if (act === "reextract") reextractOne(pid);
        else if (act === "remove") removeParticipant(pid);
      });
    });
    setTimeout(() => document.addEventListener("click", closeActionMenu, { once: true }), 0);
  }

  function closeActionMenu() {
    document.querySelectorAll(".rp-action-menu").forEach(el => el.remove());
  }

  document.addEventListener("rp:activated", (e) => {
    if (e.detail?.tab === "members") refresh();
  });
  document.addEventListener("state:updated", refresh);

  // 监听 background 推送参与者状态变化（state-machine._broadcastStateUpdate）
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "stateUpdate") {
        if (Array.isArray(msg.participants)) state.participants = msg.participants;
        render();
      }
    });
  } catch (_) {}

  window.ChatMembers = { refresh, render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
})();
