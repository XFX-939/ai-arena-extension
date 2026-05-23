# Popup 右栏 4 Tab 合并 Phase 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 让 popup 群聊窗口承载 sidepanel 当前所有能力（参与者管理 / 任务控制台 / 统计 / 主题 / 状态日志），sidepanel 保留共存。

**Architecture:** popup 升级为三栏（左对话目录 220px 已有 / 中聊天主区 / 右 4 Tab 抽屉 260px 新增）。右栏 4 Tab：成员 / 任务 / 统计 / 设置。任务 Tab 内容随底部 task-picker 动态切换。所有数据从 background StateMachine 拉取，popup ↔ background 单一同步链路。

**Tech Stack:** Chrome MV3 / vanilla JS / CSS Grid / chrome.runtime.sendMessage

**Spec:** `docs/superpowers/specs/2026-05-23-ai-arena-merge-sidepanel-to-popup-design.md`

---

## 文件结构

**新增**：
- `src/popup-rightpanel.js` — Tab 切换调度器（管理 4 Tab 激活态、与 task-picker 联动）
- `src/popup-members.js` — 成员 Tab（参与者列表 + 9 AI 添加 + ⋯ 菜单 + Tab/并列 切换）
- `src/popup-tasks.js` — 任务 Tab（context-sensitive：随 task-picker 显示 4 种子面板）
- `src/popup-stats.js` — 统计 Tab（本次/累计/模型 3 sub-tab）
- `src/popup-settings.js` — 设置 Tab（6 主题 + 状态日志 + 快捷键）
- `src/popup-themes.css` — 主题样式（迁移自 sidepanel-themes.css，适配 popup 选择器）

**修改**：
- `src/popup.html` — 加右栏 4 Tab DOM + 顶部 header 三图标
- `src/popup.css` — 三栏 grid 布局 + 4 Tab 样式 + 顶部 header 样式
- `src/popup.js` — 引入新 modules + 初始化右栏 + 同步事件
- `src/background.js` — 补 message handlers（如缺）；popup window 默认尺寸 1100×720
- `src/manifest.json` — 版本号 4.0.15 → 4.1.0
- `src/sidepanel.html` — 顶部版本号同步
- `tests/e2e/smoke.mjs` — 加右栏 4 Tab 用例
- `tests/e2e/stress.mjs` — 加任务 Tab 与 task-picker 联动用例

---

## Task 1：基建 — popup.html 加右栏 4 Tab DOM 骨架

**Files:**
- Modify: `src/popup.html`

- [ ] **Step 1：在 `<div class="chat-app">` 内 `<div class="chat-main">` 闭合之后追加右栏 DOM**

```html
<aside class="chat-rightpanel" id="chat-rightpanel">
  <div class="rp-tabs">
    <button class="rp-tab active" data-tab="members"><span class="em">👥</span><span>成员</span></button>
    <button class="rp-tab" data-tab="tasks"><span class="em">⚙️</span><span>任务</span></button>
    <button class="rp-tab" data-tab="stats"><span class="em">📊</span><span>统计</span></button>
    <button class="rp-tab" data-tab="settings"><span class="em">🔧</span><span>设置</span></button>
  </div>
  <div class="rp-panel active" data-rp-panel="members" id="rp-panel-members"></div>
  <div class="rp-panel" data-rp-panel="tasks" id="rp-panel-tasks"></div>
  <div class="rp-panel" data-rp-panel="stats" id="rp-panel-stats"></div>
  <div class="rp-panel" data-rp-panel="settings" id="rp-panel-settings"></div>
</aside>
```

- [ ] **Step 2：在 `<header class="chat-header">` 的 `.chat-actions` 内补三图标（如缺）**

确认顶部 header 已有 `<button id="btn-clear">🗑</button>` 和 `<button id="btn-settings">⚙️</button>`，再补一个主题按钮：

```html
<button class="btn-icon" id="btn-theme" title="切换主题">🎨</button>
```

放在 btn-clear 前面。

- [ ] **Step 3：在 body 底部添加新 script 引用**

```html
<script src="popup-rightpanel.js"></script>
<script src="popup-members.js"></script>
<script src="popup-tasks.js"></script>
<script src="popup-stats.js"></script>
<script src="popup-settings.js"></script>
```

放在已有 `<script src="popup-history.js">` 之后、`<script src="popup.js">` 之前。

- [ ] **Step 4：版本号 v4.0.15-beta → v4.1.0-beta**

```html
<span class="chat-version">v4.1.0-beta</span>
```

---

## Task 2：popup.css 三栏布局 + 4 Tab 样式 + 顶部 header 样式

**Files:**
- Modify: `src/popup.css`
- Create: `src/popup-themes.css`

- [ ] **Step 1：修改 `.chat-app` grid 从两栏改三栏**

定位现有 `.chat-app { display: grid; ... }` 规则，把 `grid-template-columns` 改为：

```css
.chat-app {
  display: grid;
  grid-template-columns: var(--sb-w, 220px) 1fr 260px;
  height: 100vh;
}
```

- [ ] **Step 2：右栏样式**

在文件末尾追加：

```css
.chat-rightpanel {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--rp-border, #d2d2d7);
  background: var(--rp-bg, #fafafa);
  min-width: 0;
}
.rp-tabs {
  display: flex;
  border-bottom: 1px solid var(--rp-border, #d2d2d7);
}
.rp-tab {
  flex: 1; padding: 8px 4px; text-align: center;
  background: transparent; border: 0; cursor: pointer;
  font-size: 11px; color: var(--rp-ink-soft, #6e6e73);
  border-bottom: 2px solid transparent; line-height: 1.3;
}
.rp-tab .em { display: block; font-size: 14px; margin-bottom: 2px; }
.rp-tab.active {
  color: var(--rp-accent, #0071e3);
  border-bottom-color: var(--rp-accent, #0071e3);
  background: var(--rp-card, #fff);
  font-weight: 700;
}
.rp-panel {
  display: none; flex: 1; overflow: auto; padding: 12px;
  font-size: 12px; color: var(--rp-ink, #1d1d1f);
}
.rp-panel.active { display: block; }
.rp-section-title {
  font-size: 10px; color: var(--rp-ink-soft, #6e6e73);
  text-transform: uppercase; letter-spacing: 0.05em;
  margin: 0 0 6px;
}
.rp-list-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; margin-bottom: 4px;
  background: var(--rp-card, #fff);
  border: 1px solid var(--rp-border, #d2d2d7);
  border-radius: 6px;
}
.rp-status-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #aeaeb2;
  flex-shrink: 0;
}
.rp-status-dot.ready { background: #34c759; }
.rp-status-dot.busy { background: #ff9f0a; }
.rp-status-dot.error { background: #ff3b30; }
.rp-list-item .name { flex: 1; }
.rp-more { color: var(--rp-ink-soft, #6e6e73); cursor: pointer; padding: 2px 6px; }
.rp-add-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 10px;
}
.rp-add-btn {
  background: var(--rp-card, #fff);
  border: 1px solid var(--rp-border, #d2d2d7);
  border-radius: 6px;
  padding: 5px;
  font-size: 11px;
  cursor: pointer;
  color: var(--rp-ink, #1d1d1f);
}
.rp-add-btn:hover { border-color: var(--rp-accent, #0071e3); }
.rp-mode-toggle {
  display: flex; border: 1px solid var(--rp-border, #d2d2d7);
  border-radius: 6px; overflow: hidden;
}
.rp-mode-btn {
  flex: 1; padding: 5px; text-align: center;
  background: transparent; border: 0; cursor: pointer;
  font-size: 11px; color: var(--rp-ink-soft, #6e6e73);
}
.rp-mode-btn.active { background: var(--rp-accent, #0071e3); color: #fff; font-weight: 600; }
.rp-btn {
  width: 100%; background: var(--rp-card, #fff);
  border: 1px solid var(--rp-border, #d2d2d7);
  border-radius: 6px; padding: 6px;
  font-size: 11px; cursor: pointer; color: var(--rp-ink, #1d1d1f);
  margin-bottom: 4px;
}
.rp-btn.primary { background: var(--rp-accent, #0071e3); color: #fff; border-color: var(--rp-accent, #0071e3); font-weight: 600; }
.rp-btn.danger-soft { border-color: #ff3b30; color: #ff3b30; }
.rp-btn:hover { border-color: var(--rp-accent, #0071e3); }
.rp-textarea {
  width: 100%; padding: 6px;
  border: 1px solid var(--rp-border, #d2d2d7);
  border-radius: 4px; font-size: 11px;
  color: var(--rp-ink, #1d1d1f); background: var(--rp-card, #fff);
  font-family: inherit; resize: vertical; min-height: 40px;
}
.rp-select {
  width: 100%; padding: 4px 6px;
  border: 1px solid var(--rp-border, #d2d2d7);
  border-radius: 4px; font-size: 11px;
  color: var(--rp-ink, #1d1d1f); background: var(--rp-card, #fff);
  margin-bottom: 4px;
}
.rp-checkbox-row {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 0; font-size: 11px;
  color: var(--rp-ink, #1d1d1f);
  margin-bottom: 4px;
}
.rp-stat-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px;
}
.rp-stat-cell {
  background: var(--rp-card, #fff);
  border: 1px solid var(--rp-border, #d2d2d7);
  border-radius: 6px; padding: 8px; text-align: center;
}
.rp-stat-val { font-size: 18px; font-weight: 700; color: var(--rp-accent, #0071e3); letter-spacing: -0.02em; }
.rp-stat-lbl { font-size: 9px; color: var(--rp-ink-soft, #6e6e73); margin-top: 2px; }
.rp-substat-tabs { display: flex; gap: 3px; margin-bottom: 8px; }
.rp-substat-tab {
  flex: 1; padding: 4px 2px; text-align: center;
  background: var(--rp-card, #fff);
  border: 1px solid var(--rp-border, #d2d2d7);
  border-radius: 4px; font-size: 10px; cursor: pointer;
  color: var(--rp-ink-soft, #6e6e73);
}
.rp-substat-tab.active { background: var(--rp-accent, #0071e3); color: #fff; border-color: var(--rp-accent, #0071e3); font-weight: 600; }
.rp-theme-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin-bottom: 10px;
}
.rp-theme-item {
  background: var(--rp-card, #fff);
  border: 1px solid var(--rp-border, #d2d2d7);
  border-radius: 5px; padding: 5px;
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; cursor: pointer;
  color: var(--rp-ink, #1d1d1f);
}
.rp-theme-item.active { border-color: var(--rp-accent, #0071e3); background: rgba(0,113,227,0.06); }
.rp-theme-swatch { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
.rp-log-box {
  background: #1d1d1f; color: #f5f5f7;
  border-radius: 5px; padding: 8px;
  font-family: "SF Mono", "Consolas", monospace;
  font-size: 10px; line-height: 1.5;
  max-height: 220px; overflow: auto;
  margin-bottom: 10px;
}
.rp-log-line { padding: 1px 0; }
.rp-log-line .t { color: #0a84ff; }
.rp-log-line .ok { color: #34c759; }
.rp-log-line .warn { color: #ff9f0a; }
.rp-log-line .err { color: #ff3b30; }
.rp-kbd-list { font-size: 11px; line-height: 1.8; }
.rp-kbd { background: var(--rp-card, #fff); border: 1px solid var(--rp-border, #d2d2d7); border-radius: 3px; padding: 1px 5px; font-size: 10px; font-family: "SF Mono", "Consolas", monospace; }
.rp-empty {
  text-align: center; color: var(--rp-ink-soft, #6e6e73);
  font-size: 11px; padding: 20px 10px;
}

/* hover menu for ⋯ */
.rp-action-menu {
  position: absolute; background: #1d1d1f; color: #fff;
  border-radius: 6px; padding: 4px 0; font-size: 11px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 1000;
  min-width: 130px;
}
.rp-action-menu .ai { padding: 6px 12px; cursor: pointer; }
.rp-action-menu .ai:hover { background: rgba(255,255,255,0.1); }

@media (prefers-color-scheme: dark) {
  .chat-rightpanel { background: #2c2c2e; }
  :root {
    --rp-bg: #2c2c2e; --rp-card: #1d1d1f; --rp-ink: #f5f5f7;
    --rp-ink-soft: #aeaeb2; --rp-border: #38383a; --rp-accent: #0a84ff;
  }
}
```

- [ ] **Step 3：创建 src/popup-themes.css**

```css
/* 6 套主题色变量；激活通过 body[data-theme="X"] 选择 */
body[data-theme="C"] {
  --rp-accent: #5eead4; /* Aurora Glass */
}
body[data-theme="A"] {
  --rp-accent: #4f8cff; /* Dark Command */
  --rp-bg: #1a1a2e; --rp-card: #16213e;
  --rp-ink: #e6f1ff; --rp-ink-soft: #8892b0; --rp-border: #2d3a5f;
}
body[data-theme="B"] {
  --rp-accent: #b85c38; /* Warm Editorial */
}
body[data-theme="D"] {
  --rp-accent: #ff2d95; /* Neon */
}
body[data-theme="E"] {
  --rp-accent: #1a1a2e; /* Minimal Light */
}
body[data-theme="F"] {
  --rp-accent: #ff8c42; /* Sunset */
}
```

并在 popup.html `<head>` 内追加 `<link rel="stylesheet" href="popup-themes.css">`（在 popup.css 后）。

---

## Task 3：popup-rightpanel.js Tab 切换调度器

**Files:**
- Create: `src/popup-rightpanel.js`

- [ ] **Step 1：写完整代码**

```javascript
// popup-rightpanel.js
// 右栏 4 Tab 切换调度器。监听 .rp-tab 点击切换 .rp-panel 显隐；
// 暴露 ChatRightPanel.activate(name) / .render() 让其他模块调用。
(function () {
  const TABS = ["members", "tasks", "stats", "settings"];
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
    chrome.storage?.local.get(["rpActiveTab"], (r) => {
      if (r?.rpActiveTab && TABS.includes(r.rpActiveTab)) activate(r.rpActiveTab);
    });
  }

  window.ChatRightPanel = { activate, get current() { return currentTab; } };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
```

---

## Task 4：popup-members.js 成员 Tab

**Files:**
- Create: `src/popup-members.js`

- [ ] **Step 1：写完整代码**

```javascript
// popup-members.js
// 成员 Tab：拉 background.getState 拿参与者列表，渲染卡片
// + 添加按钮 2×3 网格 + Tab/并列 模式切换。
(function () {
  const ALL_SERVICES = [
    { id: "claude", name: "Claude" },
    { id: "gemini", name: "Gemini" },
    { id: "chatgpt", name: "GPT" },
    { id: "deepseek", name: "DeepSeek" },
    { id: "doubao", name: "豆包" },
    { id: "qwen", name: "千问" },
    { id: "kimi", name: "Kimi" },
    { id: "yuanbao", name: "元宝" },
    { id: "grok", name: "Grok" },
  ];

  let state = { participants: [], layoutMode: "tiled" };

  function statusOf(p) {
    if (p.error) return "error";
    if (p.isStreaming) return "busy";
    if (p.response) return "ready";
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
      ${joined.map(p => `
        <div class="rp-list-item" data-pid="${p.id}">
          <span class="rp-status-dot ${statusOf(p)}"></span>
          <span class="name">${escapeHtml(p.name || p.service)}</span>
          <span class="rp-more" data-pid="${p.id}">⋯</span>
        </div>
      `).join("") || `<div class="rp-empty">尚未添加参与者</div>`}

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
      b.addEventListener("click", () => setLayoutMode(b.dataset.mode));
    });
    root.querySelectorAll(".rp-more").forEach(el => {
      el.addEventListener("click", (e) => openActionMenu(e, el.dataset.pid));
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  async function refresh() {
    try {
      const r = await chrome.runtime.sendMessage({ type: "getState" });
      if (r && r.participants) {
        state.participants = r.participants;
        state.layoutMode = r.layoutMode || "tiled";
        render();
      }
    } catch (_) { /* sw 可能未就绪 */ }
  }

  async function addParticipant(service) {
    try {
      await chrome.runtime.sendMessage({ type: "addParticipant", service });
      await refresh();
    } catch (e) { console.warn("addParticipant fail", e); }
  }

  async function removeParticipant(pid) {
    try {
      await chrome.runtime.sendMessage({ type: "removeParticipant", participantId: pid });
      await refresh();
    } catch (e) { console.warn("removeParticipant fail", e); }
  }

  async function resendOne(pid) {
    try { await chrome.runtime.sendMessage({ type: "resendOne", participantId: pid }); } catch (_) {}
  }

  async function reextractOne(pid) {
    try { await chrome.runtime.sendMessage({ type: "reextractOne", participantId: pid }); } catch (_) {}
  }

  async function setLayoutMode(mode) {
    try {
      await chrome.runtime.sendMessage({ type: "setLayoutMode", mode });
      state.layoutMode = mode;
      render();
    } catch (_) {}
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
    menu.style.left = (rect.right - 130) + "px";
    menu.querySelectorAll(".ai").forEach(item => {
      item.addEventListener("click", () => {
        const act = item.dataset.act;
        closeActionMenu();
        if (act === "resend") resendOne(pid);
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

  window.ChatMembers = { refresh, render };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
})();
```

---

## Task 5：popup-tasks.js 任务 Tab（context-sensitive）

**Files:**
- Create: `src/popup-tasks.js`

- [ ] **Step 1：写完整代码**

```javascript
// popup-tasks.js
// 任务 Tab 内容随底部 task-picker 切换。
// 监听 document.dispatchEvent("task:changed", { detail: { task, style, kind } })
// 由 popup-task-menu.js 触发。
(function () {
  let currentTask = "ask";
  let currentStyle = "free";
  let currentKind = null;
  let judgesList = [];

  function render() {
    const root = document.getElementById("rp-panel-tasks");
    if (!root) return;
    if (currentTask === "ask") {
      root.innerHTML = `<div class="rp-empty">在底部输入框直接输入消息<br>Ctrl+Enter 发送给全部</div>`;
      return;
    }
    if (currentTask === "debate") {
      root.innerHTML = renderDebate();
      bindDebate(root);
      return;
    }
    if (currentTask === "summary") {
      root.innerHTML = renderSummary();
      bindSummary(root);
      return;
    }
    if (currentTask === "ppt") {
      root.innerHTML = renderPpt();
      bindPpt(root);
      return;
    }
    root.innerHTML = `<div class="rp-empty">未识别任务</div>`;
  }

  function renderDebate() {
    return `
      <div class="rp-section-title">辩论控制台</div>
      <div class="rp-mode-toggle" style="margin-bottom:8px">
        <button class="rp-mode-btn ${currentStyle === "free" ? "active" : ""}" data-style="free">⚔️ 自由</button>
        <button class="rp-mode-btn ${currentStyle === "collab" ? "active" : ""}" data-style="collab">🤝 群策</button>
      </div>
      <details style="margin-bottom:6px">
        <summary style="cursor:pointer;font-size:11px;color:var(--rp-ink-soft, #6e6e73)">引导注入</summary>
        <textarea class="rp-textarea" id="rp-guidance" placeholder="如：聚焦性能问题"></textarea>
      </details>
      <label class="rp-checkbox-row">
        <input type="checkbox" id="rp-concise"> 简洁模式
      </label>
      <button class="rp-btn primary" id="rp-btn-debate">⚔️ 开始辩论</button>
      <button class="rp-btn" id="rp-btn-debate-retry">🔄 强制重试</button>
    `;
  }

  function bindDebate(root) {
    root.querySelectorAll(".rp-mode-btn[data-style]").forEach(b => {
      b.addEventListener("click", () => {
        currentStyle = b.dataset.style;
        render();
      });
    });
    root.querySelector("#rp-btn-debate")?.addEventListener("click", async () => {
      const guidance = root.querySelector("#rp-guidance")?.value || "";
      const concise = root.querySelector("#rp-concise")?.checked || false;
      try {
        await chrome.runtime.sendMessage({
          type: "startDebate", style: currentStyle, guidance, concise
        });
      } catch (e) { console.warn("startDebate fail", e); }
    });
    root.querySelector("#rp-btn-debate-retry")?.addEventListener("click", async () => {
      try {
        await chrome.runtime.sendMessage({ type: "debateRetry" });
      } catch (_) {}
    });
  }

  function renderSummary() {
    return `
      <div class="rp-section-title">裁判总结</div>
      <select class="rp-select" id="rp-judge">
        <option value="">选择裁判…</option>
        ${judgesList.map(j => `<option value="${j.id}">${j.name}</option>`).join("")}
      </select>
      <button class="rp-btn primary" id="rp-btn-summary">📋 输出总结</button>
      <button class="rp-btn" id="rp-btn-export">📤 导出</button>
      <button class="rp-btn danger-soft" id="rp-btn-reset">⚡ 重置</button>
    `;
  }

  function bindSummary(root) {
    root.querySelector("#rp-btn-summary")?.addEventListener("click", async () => {
      const judge = root.querySelector("#rp-judge")?.value;
      if (!judge) return;
      try {
        await chrome.runtime.sendMessage({ type: "outputSummary", judge });
      } catch (_) {}
    });
    root.querySelector("#rp-btn-export")?.addEventListener("click", async () => {
      try { await chrome.runtime.sendMessage({ type: "exportDebate" }); } catch (_) {}
    });
    root.querySelector("#rp-btn-reset")?.addEventListener("click", async () => {
      if (!confirm("确认重置当前辩论上下文？")) return;
      try { await chrome.runtime.sendMessage({ type: "hardReset" }); } catch (_) {}
    });
  }

  function renderPpt() {
    return `
      <div class="rp-section-title">PPT 工坊</div>
      <button class="rp-btn" id="rp-btn-ppt-copy">📝 文案生成</button>
      <button class="rp-btn" id="rp-btn-ppt-image">🎨 图片生成 ▾</button>
      <button class="rp-btn" id="rp-btn-ppt-pptx">📊 PPT 生成</button>
      <textarea class="rp-textarea" id="rp-ppt-prompt" placeholder="生成的 prompt 会显示在这里…" style="min-height:80px"></textarea>
      <button class="rp-btn primary" id="rp-btn-ppt-start">开始生成</button>
    `;
  }

  function bindPpt(root) {
    const sendKind = async (kind) => {
      try {
        const r = await chrome.runtime.sendMessage({ type: "pptPrompt", kind });
        if (r?.prompt) {
          const ta = root.querySelector("#rp-ppt-prompt");
          if (ta) ta.value = r.prompt;
        }
      } catch (_) {}
    };
    root.querySelector("#rp-btn-ppt-copy")?.addEventListener("click", () => sendKind("copy"));
    root.querySelector("#rp-btn-ppt-image")?.addEventListener("click", () => sendKind("image"));
    root.querySelector("#rp-btn-ppt-pptx")?.addEventListener("click", () => sendKind("pptx"));
    root.querySelector("#rp-btn-ppt-start")?.addEventListener("click", async () => {
      const prompt = root.querySelector("#rp-ppt-prompt")?.value || "";
      if (!prompt) return;
      try { await chrome.runtime.sendMessage({ type: "pptStart", prompt }); } catch (_) {}
    });
  }

  async function refreshJudges() {
    try {
      const r = await chrome.runtime.sendMessage({ type: "getState" });
      judgesList = (r?.participants || []).map(p => ({ id: p.id, name: p.name || p.service }));
    } catch (_) {}
  }

  document.addEventListener("task:changed", (e) => {
    currentTask = e.detail?.task || "ask";
    currentStyle = e.detail?.style || currentStyle;
    currentKind = e.detail?.kind || null;
    if (currentTask === "summary") refreshJudges().then(render);
    else render();
    if (window.ChatRightPanel?.current !== "tasks") {
      window.ChatRightPanel?.activate("tasks");
    }
  });
  document.addEventListener("rp:activated", (e) => {
    if (e.detail?.tab === "tasks") render();
  });

  window.ChatTasks = { render };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
```

---

## Task 6：popup-stats.js 统计 Tab

**Files:**
- Create: `src/popup-stats.js`

- [ ] **Step 1：写完整代码**

```javascript
// popup-stats.js
// 统计 Tab：本次 / 累计 / 模型 三 sub-tab。
(function () {
  let activeSub = "session";
  let cache = { session: null, lifetime: null, models: null };

  async function refresh() {
    try {
      const r = await chrome.runtime.sendMessage({ type: "getStats" });
      if (r?.ok) {
        cache.session = r.session || {};
        cache.lifetime = r.lifetime || {};
        cache.models = r.models || [];
      }
    } catch (_) {}
    render();
  }

  function render() {
    const root = document.getElementById("rp-panel-stats");
    if (!root) return;
    root.innerHTML = `
      <div class="rp-substat-tabs">
        <div class="rp-substat-tab ${activeSub === "session" ? "active" : ""}" data-sub="session">本次</div>
        <div class="rp-substat-tab ${activeSub === "lifetime" ? "active" : ""}" data-sub="lifetime">累计</div>
        <div class="rp-substat-tab ${activeSub === "models" ? "active" : ""}" data-sub="models">模型</div>
      </div>
      ${renderSubBody()}
    `;
    root.querySelectorAll(".rp-substat-tab").forEach(b => {
      b.addEventListener("click", () => {
        activeSub = b.dataset.sub;
        render();
      });
    });
  }

  function renderSubBody() {
    if (activeSub === "models") {
      const list = cache.models || [];
      if (!list.length) return `<div class="rp-empty">暂无模型统计数据</div>`;
      return list.map(m => `
        <div class="rp-list-item">
          <span class="name">${escapeHtml(m.name || m.id)}</span>
          <span style="color:var(--rp-ink-soft, #6e6e73)">${m.count || 0} 次</span>
        </div>
      `).join("");
    }
    const data = cache[activeSub] || {};
    return `
      <div class="rp-stat-grid">
        <div class="rp-stat-cell">
          <div class="rp-stat-val">${data.conversations || 0}</div>
          <div class="rp-stat-lbl">对话</div>
        </div>
        <div class="rp-stat-cell">
          <div class="rp-stat-val">${data.debates || 0}</div>
          <div class="rp-stat-lbl">辩论轮</div>
        </div>
        <div class="rp-stat-cell" style="grid-column:span 2">
          <div class="rp-stat-val">${formatNum(data.tokens || 0)}</div>
          <div class="rp-stat-lbl">Token</div>
        </div>
      </div>
    `;
  }

  function formatNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  document.addEventListener("rp:activated", (e) => {
    if (e.detail?.tab === "stats") refresh();
  });

  window.ChatStats = { refresh, render };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
})();
```

---

## Task 7：popup-settings.js 设置 Tab

**Files:**
- Create: `src/popup-settings.js`

- [ ] **Step 1：写完整代码**

```javascript
// popup-settings.js
// 设置 Tab：6 主题选择 + 状态日志 + 快捷键。
(function () {
  const THEMES = [
    { id: "C", name: "Aurora",  gradient: "linear-gradient(135deg,#5eead4,#a78bfa)" },
    { id: "A", name: "Dark",    gradient: "linear-gradient(135deg,#4f8cff,#6ee7ff)" },
    { id: "B", name: "Warm",    gradient: "linear-gradient(135deg,#b85c38,#e6d7c8)" },
    { id: "D", name: "Neon",    gradient: "linear-gradient(135deg,#ff2d95,#00f0ff)" },
    { id: "E", name: "Light",   gradient: "linear-gradient(135deg,#1a1a2e,#fff)" },
    { id: "F", name: "Sunset",  gradient: "linear-gradient(135deg,#ff8c42,#e84393)" },
  ];
  let currentTheme = "C";
  let logs = [];

  async function refresh() {
    try {
      const r = await chrome.runtime.sendMessage({ type: "getState" });
      currentTheme = r?.theme || currentTheme;
    } catch (_) {}
    try {
      const lg = await chrome.runtime.sendMessage({ type: "getLog" });
      if (Array.isArray(lg?.lines)) logs = lg.lines.slice(-50);
    } catch (_) {}
    render();
  }

  function render() {
    const root = document.getElementById("rp-panel-settings");
    if (!root) return;
    root.innerHTML = `
      <div class="rp-section-title">主题</div>
      <div class="rp-theme-grid">
        ${THEMES.map(t => `
          <div class="rp-theme-item ${t.id === currentTheme ? "active" : ""}" data-theme="${t.id}">
            <span class="rp-theme-swatch" style="background:${t.gradient}"></span>
            <span>${t.name}${t.id === currentTheme ? " ✓" : ""}</span>
          </div>
        `).join("")}
      </div>

      <div class="rp-section-title">状态日志</div>
      <div class="rp-log-box" id="rp-log-box">
        ${logs.length ? logs.map(renderLogLine).join("") : '<div class="rp-log-line">暂无日志</div>'}
      </div>

      <div class="rp-section-title">快捷键</div>
      <div class="rp-kbd-list">
        <div><span class="rp-kbd">Ctrl+Enter</span> 发送</div>
        <div><span class="rp-kbd">Ctrl+Shift+D</span> 辩论</div>
        <div><span class="rp-kbd">@</span> 单发</div>
        <div><span class="rp-kbd">@all</span> 全发</div>
      </div>
    `;

    root.querySelectorAll(".rp-theme-item").forEach(el => {
      el.addEventListener("click", () => setTheme(el.dataset.theme));
    });
  }

  function renderLogLine(line) {
    const ts = line.ts ? new Date(line.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
    const level = line.level || "info";
    const cls = level === "warn" ? "warn" : level === "error" ? "err" : level === "ok" ? "ok" : "";
    return `<div class="rp-log-line"><span class="t">${ts}</span> <span class="${cls}">${escapeHtml(line.text || "")}</span></div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  async function setTheme(id) {
    currentTheme = id;
    document.body.setAttribute("data-theme", id);
    try { await chrome.runtime.sendMessage({ type: "setTheme", theme: id }); } catch (_) {}
    render();
  }

  document.addEventListener("rp:activated", (e) => {
    if (e.detail?.tab === "settings") refresh();
  });

  // 监听 background 推送的日志增量
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "logAppend" && msg.line) {
      logs.push(msg.line);
      if (logs.length > 100) logs = logs.slice(-100);
      const box = document.getElementById("rp-log-box");
      if (box && window.ChatRightPanel?.current === "settings") {
        box.insertAdjacentHTML("beforeend", renderLogLine(msg.line));
        box.scrollTop = box.scrollHeight;
      }
    }
  });

  window.ChatSettings = { refresh, render, setTheme };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // 启动时把当前 theme 加到 body
      chrome.storage?.local.get(["theme"], (r) => {
        if (r?.theme) {
          currentTheme = r.theme;
          document.body.setAttribute("data-theme", r.theme);
        } else {
          document.body.setAttribute("data-theme", currentTheme);
        }
        refresh();
      });
    });
  } else {
    refresh();
  }
})();
```

---

## Task 8：background.js — 补缺的 message handlers

**Files:**
- Modify: `src/background.js`

需先检查现状（grep onMessage listeners），找出已存在的 handler。如下表所示，popup 模块新依赖的 message type 必须存在或新增：

| Message Type | 来源模块 | 状态 |
|---|---|---|
| `getState` | members/tasks | 已存在（stress.mjs C1 验证） |
| `addParticipant` | members | 应存在 |
| `removeParticipant` | members | 应存在 |
| `resendOne` | members | 应存在 |
| `reextractOne` | members | 已存在（summary 提到 chat-bus.reextractOne） |
| `setLayoutMode` | members | 需检查 |
| `startDebate` | tasks | 应存在 |
| `debateRetry` | tasks | 需检查 |
| `outputSummary` | tasks | 需检查 |
| `exportDebate` | tasks | 需检查 |
| `hardReset` | tasks | 需检查 |
| `pptPrompt` | tasks | 需检查 |
| `pptStart` | tasks | 需检查 |
| `getStats` | stats | 可能需新增 |
| `getLog` | settings | 可能需新增 |
| `setTheme` | settings | 可能需新增 |
| `logAppend` (push) | settings 监听 | 需新增广播 |

- [ ] **Step 1：阅读 background.js 找 `chrome.runtime.onMessage.addListener` 主分发器**
- [ ] **Step 2：对照上表逐个补缺的 handler**

对于"未确认是否存在"的 handler：用 grep 确认。若不存在，按以下模板补：

```javascript
if (msg.type === "getStats") {
  sendResponse({
    ok: true,
    session: StateMachine.stats || { conversations: 0, debates: 0, tokens: 0 },
    lifetime: StateMachine.lifetimeStats || { conversations: 0, debates: 0, tokens: 0 },
    models: StateMachine.modelStats || [],
  });
  return false;
}
if (msg.type === "getLog") {
  sendResponse({ ok: true, lines: (StateMachine.logBuffer || []).slice(-100) });
  return false;
}
if (msg.type === "setTheme") {
  chrome.storage.local.set({ theme: msg.theme }, () => sendResponse({ ok: true }));
  return true;
}
if (msg.type === "setLayoutMode") {
  StateMachine.layoutMode = msg.mode;
  chrome.storage.local.set({ layoutMode: msg.mode }, () => sendResponse({ ok: true }));
  return true;
}
```

- [ ] **Step 3：在 background 任何 log() 函数尾部加广播**

定位现有的 log/appendLog 函数（应该把日志推到 StateMachine.logBuffer），在 push 完之后加：

```javascript
chrome.runtime.sendMessage({ type: "logAppend", line }).catch(() => {});
```

- [ ] **Step 4：popup window 默认尺寸**

如已有打开 popup 的代码（如 sidepanel.html 的 btn-open-chat），定位 chrome.windows.create 调用，把 `width: 900, height: 700` 改为 `width: 1100, height: 720`。

---

## Task 9：popup.js — 引入新模块协调 + 顶部 header 三图标

**Files:**
- Modify: `src/popup.js`

- [ ] **Step 1：绑定 #btn-theme 点击循环切主题**

```javascript
const btnTheme = document.getElementById("btn-theme");
if (btnTheme) {
  btnTheme.addEventListener("click", () => {
    const THEMES = ["C", "A", "B", "D", "E", "F"];
    const cur = document.body.getAttribute("data-theme") || "C";
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    document.body.setAttribute("data-theme", next);
    chrome.runtime.sendMessage({ type: "setTheme", theme: next }).catch(() => {});
    window.ChatSettings?.refresh?.();
  });
}
```

- [ ] **Step 2：绑定 #btn-settings 跳到设置 Tab**

```javascript
document.getElementById("btn-settings")?.addEventListener("click", () => {
  window.ChatRightPanel?.activate("settings");
});
```

- [ ] **Step 3：在 popup-task-menu.js 选择任务后 dispatch task:changed**

定位现有 popup-task-menu.js 中 `data-task="..."` 点击 handler。在选择完成赋值后追加：

```javascript
document.dispatchEvent(new CustomEvent("task:changed", {
  detail: { task, style, kind }
}));
```

如果当前 task-menu 直接调 sendMessage 触发动作，把动作部分挪到 ChatTasks 模块的"开始 X"按钮上（让任务 Tab 成为执行入口），picker 仅切换上下文。

---

## Task 10：版本号 v4.0.15 → v4.1.0 同步刷新

**Files:**
- Modify: `src/manifest.json`、`src/popup.html`、`src/sidepanel.html`

- [ ] **Step 1：manifest.json**

```json
"version": "4.1.0",
"version_name": "4.1.0-beta",
```

- [ ] **Step 2：popup.html `<span class="chat-version">v4.1.0-beta</span>`**（Task 1 已做，确认下）

- [ ] **Step 3：sidepanel.html 两处**

`<span class="version">v4.1.0-beta</span>` 和 footer `AI Arena v4.1.0-beta`

---

## Task 11：E2E 测试加用例

**Files:**
- Modify: `tests/e2e/smoke.mjs`
- Modify: `tests/e2e/stress.mjs`

- [ ] **Step 1：smoke.mjs — 加 4 Tab 用例**

在已有 popup 加载断言之后追加：

```javascript
console.log("\n=== F. 右栏 4 Tab ===");
const rpTabs = await popup.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll(".rp-tab"));
  return tabs.map(t => ({ name: t.dataset.tab, text: t.innerText.trim() }));
});
check("F1: 4 Tab DOM 存在", rpTabs.length === 4, JSON.stringify(rpTabs));
check("F2: Tab 名称 members/tasks/stats/settings",
  rpTabs.map(t => t.name).join(",") === "members,tasks,stats,settings",
  JSON.stringify(rpTabs.map(t => t.name)));

// 点击切到 stats
await popup.click('.rp-tab[data-tab="stats"]');
await popup.waitForTimeout(200);
const activePanel = await popup.evaluate(() => {
  const a = document.querySelector(".rp-panel.active");
  return a?.dataset.rpPanel;
});
check("F3: 点击切 Tab 后 panel 激活", activePanel === "stats", activePanel);

// API 暴露
const apis = await popup.evaluate(() => ({
  rp: typeof window.ChatRightPanel === "object",
  m: typeof window.ChatMembers === "object",
  t: typeof window.ChatTasks === "object",
  s: typeof window.ChatStats === "object",
  set: typeof window.ChatSettings === "object",
}));
check("F4: ChatRightPanel API",  apis.rp);
check("F5: ChatMembers API",     apis.m);
check("F6: ChatTasks API",       apis.t);
check("F7: ChatStats API",       apis.s);
check("F8: ChatSettings API",    apis.set);
```

- [ ] **Step 2：stress.mjs — 任务 Tab context-sensitive**

在测试组 C 后加：

```javascript
console.log("\n=== F. 任务 Tab context-sensitive ===");
// 模拟 task:changed → debate
await popup.evaluate(() => {
  document.dispatchEvent(new CustomEvent("task:changed", { detail: { task: "debate", style: "free" } }));
});
await popup.waitForTimeout(150);
const debateHtml = await popup.$eval("#rp-panel-tasks", el => el.innerHTML);
check("F1: 任务 Tab 切到 debate 后含'开始辩论'按钮",
  debateHtml.includes("开始辩论"), debateHtml.slice(0, 100));

await popup.evaluate(() => {
  document.dispatchEvent(new CustomEvent("task:changed", { detail: { task: "ppt" } }));
});
await popup.waitForTimeout(150);
const pptHtml = await popup.$eval("#rp-panel-tasks", el => el.innerHTML);
check("F2: 任务 Tab 切到 ppt 后含'PPT 工坊'区块",
  pptHtml.includes("PPT 工坊"), pptHtml.slice(0, 100));

await popup.evaluate(() => {
  document.dispatchEvent(new CustomEvent("task:changed", { detail: { task: "ask" } }));
});
await popup.waitForTimeout(150);
const askHtml = await popup.$eval("#rp-panel-tasks", el => el.innerHTML);
check("F3: 任务 Tab 切到 ask 显示提示",
  askHtml.includes("Ctrl+Enter"), askHtml.slice(0, 100));
```

- [ ] **Step 3：stress.mjs — 版本号 expectedVersion 改为 4.1.0-beta**

```javascript
const expectedVersion = "4.1.0-beta";
```

---

## Task 12：Hook marker + commit

由于 commit ≥3 文件触发 refactor-guard，需要在 commit 之前创建 marker。

- [ ] **Step 1：跑全部测试**

```powershell
cd C:\Users\lintian\AI_debate\ai-arena-extension
node --test src/test/popup-markdown.test.mjs
node tests/e2e/smoke.mjs
node tests/e2e/stress.mjs
```

期望：全部 PASS。

- [ ] **Step 2：写 refactor-verified marker**

```powershell
$marker = Join-Path $env:TEMP ".refactor-verified"
'{ "ts": ' + [int][double]::Parse((Get-Date -UFormat %s)) + ' }' | Out-File -FilePath $marker -Encoding utf8
```

- [ ] **Step 3：写 e2e-tested marker**

```powershell
$marker2 = Join-Path $env:TEMP ".e2e-tested"
'{ "ts": ' + [int][double]::Parse((Get-Date -UFormat %s)) + ' }' | Out-File -FilePath $marker2 -Encoding utf8
```

- [ ] **Step 4：commit**

```bash
git add src/popup.html src/popup.css src/popup-themes.css src/popup-rightpanel.js \
        src/popup-members.js src/popup-tasks.js src/popup-stats.js src/popup-settings.js \
        src/popup.js src/background.js src/manifest.json src/sidepanel.html \
        tests/e2e/smoke.mjs tests/e2e/stress.mjs \
        docs/superpowers/specs/2026-05-23-ai-arena-merge-sidepanel-to-popup-design.md \
        docs/superpowers/plans/2026-05-23-popup-rightpanel-phase1.md
git commit -m "feat(popup): 右栏 4 Tab 抽屉 - sidepanel 能力全部合并 (v4.1.0-beta Phase 1)"
```

---

## 验收

- popup 单开（不必开 sidepanel）能完成：添加 AI / 提问 / 自由辩论 / 群策 / 总结导出 / 切主题 / 看统计
- 4 Tab 切换流畅、状态持久（重开 popup 仍在上次 Tab）
- 任务 Tab 随 task-picker 自动切换内容
- sidepanel 继续可用（共存期保险）
- 全部 E2E PASS
- 版本号 4 处一致 v4.1.0-beta
