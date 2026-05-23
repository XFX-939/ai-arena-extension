// popup-members.js — 成员 Tab：参与者列表 + 添加 + ⋯ 菜单 + Tab/并列 切换
(function () {
  const ALL_SERVICES = [
    { id: "claude",   name: "Claude",   logo: "icons/brands/claude.svg" },
    { id: "gemini",   name: "Gemini",   logo: "icons/brands/gemini.svg" },
    { id: "chatgpt",  name: "GPT",      logo: "icons/brands/openai.svg" },
    { id: "deepseek", name: "DeepSeek", logo: "icons/brands/deepseek.svg" },
    { id: "doubao",   name: "豆包",     logo: "icons/brands/doubao.svg" },
    { id: "qwen",     name: "千问",     logo: "icons/brands/qwen.svg" },
    { id: "kimi",     name: "Kimi",     logo: "icons/brands/kimi.svg" },
    { id: "yuanbao",  name: "元宝",     logo: "icons/brands/yuanbao.svg" },
    { id: "grok",     name: "Grok",     logo: "icons/brands/grok.svg" },
  ];
  const SERVICE_MAP = Object.fromEntries(ALL_SERVICES.map(s => [s.id, s]));

  const state = { participants: [], layoutMode: "tiled" };
  // v4.3.11: 成员状态直接跟主区气泡同步，不依赖 StateMachine 字段更新
  // key=service, value="busy"|"ready"|"error"|"skipped"
  const streamStatus = new Map();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function statusOf(p) {
    // v4.3.11: 优先使用 streamStatus（跟主区气泡同步）
    const s = streamStatus.get(p.service);
    if (s) return s === "skipped" ? "" : s;
    if (p.error) return "error";
    if (p.isStreaming || p.responsePreview && !p.response) return "busy";
    if (p.response || p.responsePreview) return "ready";
    return "";
  }
  function statusTextOf(p) {
    const s = streamStatus.get(p.service);
    if (s === "busy") return "输出中…";
    if (s === "ready") return "已完成";
    if (s === "error") return "失败";
    if (s === "skipped") return "已跳过";
    if (p.error) return "失败";
    if (p.isStreaming || p.responsePreview && !p.response) return "输出中…";
    if (p.response || p.responsePreview) return "已完成";
    return "等待中";
  }

  function render() {
    const root = document.getElementById("rp-panel-members");
    if (!root) return;
    const joined = state.participants || [];
    const joinedIds = new Set(joined.map(p => p.service));
    const remaining = ALL_SERVICES.filter(s => !joinedIds.has(s.id));

    root.innerHTML = `
      <div class="rp-section-title">已加入 <span class="rp-count">${joined.length}/3</span></div>
      ${joined.length ? joined.map(p => {
        const meta = SERVICE_MAP[p.service] || { name: p.service, logo: null };
        return `
        <div class="rp-member-card" data-pid="${escapeHtml(p.id)}">
          ${meta.logo
            ? `<img class="rp-member-logo" src="${meta.logo}" alt="${escapeHtml(meta.name)}">`
            : `<span class="rp-member-logo-fb">${escapeHtml((meta.name || "?")[0])}</span>`}
          <div class="rp-member-info">
            <div class="rp-member-name">${escapeHtml(p.name || meta.name)}</div>
            <div class="rp-member-meta">
              <span class="rp-status-dot ${statusOf(p)}"></span>
              <span class="rp-member-status-txt">${statusTextOf(p)}</span>
            </div>
          </div>
          <span class="rp-more" data-pid="${escapeHtml(p.id)}" title="操作">⋯</span>
        </div>`;
      }).join("") : `<div class="rp-empty">尚未添加参与者<br><span style="opacity:.6">点击下方按钮选择</span></div>`}

      <div class="rp-section-title" style="margin-top:14px">添加</div>
      <div class="rp-add-grid">
        ${remaining.map(s => `
          <button class="rp-add-btn" data-service="${s.id}" title="添加 ${escapeHtml(s.name)}">
            <img class="rp-add-logo" src="${s.logo}" alt="">
            <span>${escapeHtml(s.name)}</span>
          </button>
        `).join("")}
      </div>

      <div class="rp-section-title">AI 窗口布局</div>
      <div class="rp-mode-toggle">
        <button class="rp-mode-btn ${state.layoutMode === "tab" ? "active" : ""}" data-mode="tab" title="所有 AI 同窗口不同标签页">Tab</button>
        <button class="rp-mode-btn ${state.layoutMode === "tiled" ? "active" : ""}" data-mode="tiled" title="每个 AI 独立窗口并列">并列</button>
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
  // v4.3.11: 同时监听 chatStreamUpdate 让成员状态跟主区气泡完全同步
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "stateUpdate") {
        if (Array.isArray(msg.participants)) state.participants = msg.participants;
        render();
        return;
      }
      if (msg?.type === "chatStreamUpdate" && msg.role === "user") {
        // 新一轮 → 清空旧状态，等 AI 端 polling 自动设 busy
        streamStatus.clear();
        render();
        return;
      }
      if (msg?.type === "chatStreamUpdate" && msg.role === "ai" && msg.participantId) {
        const svc = msg.participantId;
        let next = "busy";
        if (msg.skipped) next = "skipped";
        else if (msg.emptyTimeout) next = "error";
        else if (msg.isDone) next = "ready";
        streamStatus.set(svc, next);
        render();
        return;
      }
      if (msg?.type === "chatClear" || msg?.type === "hardReset") {
        streamStatus.clear();
        render();
      }
    });
  } catch (_) {}
  // 用户主动发新一轮 → 之前的 ready/error 应清空标记，等新一轮 streaming 重新设置
  document.addEventListener("roster:changed", () => {
    // 不主动清除（避免抖动），仅在下次 user msg 推来时由 chat-bus 自然变成 busy
  });

  window.ChatMembers = { refresh, render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
})();
