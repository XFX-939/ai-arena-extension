# AI Arena WeChat Group Chat View — Phase 2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: 把 sidepanel 的"同时提问 / 辩论 / PPT 工坊 / 总结 / 设置"功能全部搬进 popup 底部工具栏抽屉（5 个图标），sidepanel 减肥为"参与者管理 + 统计 + 日志 + 🪟 打开群聊"。完成后 popup 是单一控制中心。

**Architecture**: popup 底部新增工具栏（5 个图标 + 当前 active 高亮），点图标向上滑出抽屉面板（max-height 60vh），覆盖消息列下半部分但保留输入框。抽屉里的业务调 `chrome.runtime.sendMessage` 复用 background.js 现有 handler（`broadcast` / `debateRound` / `summary` / `sendPromptToService` / `exportSession` / `hardReset` 等）。状态同步通过 background 的 `stateUpdate` 推送 + popup 启动时 `getState` 查询。sidepanel 删除 ~400 行 task panel 相关代码。

**Tech Stack**: Vanilla JS + chrome.runtime.sendMessage IPC + 复用 Phase 1 已建的 popup-markdown.js + Phase 1 已建的 chat-bus.js polling。

**Spec**: `docs/superpowers/specs/2026-05-22-ai-arena-wechat-view-design.md`
**Phase 1 baseline**: tag `v4.0.0-alpha` (commit `982742f`)

---

## 文件结构总览

### 新建
- `src/popup-toolbar.js` — 工具栏 + 抽屉切换状态机
- `src/popup-debate-panel.js` — 辩论抽屉面板逻辑
- `src/popup-ppt-panel.js` — PPT 工坊抽屉面板逻辑
- `src/popup-settings-panel.js` — 设置抽屉面板逻辑
- `src/test/popup-toolbar.test.mjs` — 抽屉状态机单测

### 修改
- `src/popup.html` — 加 5 图标工具栏 + 5 个抽屉面板 div + 引入新 js 文件
- `src/popup.css` — 工具栏 + 抽屉滑入滑出动画 + 各面板内部样式
- `src/popup.js` — 启动时拉 background state + 监听 stateUpdate 事件
- `src/sidepanel.html` — 删除 task-tabs + 3 个 task-panel（约 90 行）
- `src/sidepanel.js` — 删除 task tab 切换 + debate/ppt 相关事件绑定（约 300 行）
- `src/sidepanel.css` — 删除 task-* / debate-* / ppt-* CSS 规则（约 200 行）
- `src/manifest.json` — bump 4.0.0 → 4.0.0-beta（实际就是保留 4.0.0；tag 区分）

---

## 关键设计：抽屉形态

```
┌─────────────────────────────────┐
│ 🪟 AI Arena 群聊  v4.0.0  🗑 ⚙ │  ← header
├─────────────────────────────────┤
│ [user msg]                      │
│           [Claude bubble]       │
│           [Gemini bubble]       │  ← 消息列（被抽屉覆盖下半部分）
│           [GPT bubble]          │
│ ┌─────────────────────────────┐ │  ← 抽屉滑出（max-height: 60vh）
│ │  ⚔️ 辩论                     │ │
│ │  [自由 / 群策] [简洁 ☐]      │ │
│ │  [开始辩论 🔄]               │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 💬 ⚔️ 📋 📊 ⚙️                  │  ← 工具栏（5 图标）
│ [输入框…]                  [↑]  │
└─────────────────────────────────┘
```

**状态机**：
- `activeDrawer`: null | 'ask' | 'debate' | 'summary' | 'ppt' | 'settings'
- 点图标 A 当 activeDrawer === A → 关闭（设 null）
- 点图标 A 当 activeDrawer !== A → 切到 A（带过渡动画）
- 抽屉外点击空白消息列 → 关闭

---

## Task P2-T1: popup 工具栏 + 抽屉框架

**Files:**
- Create: `src/popup-toolbar.js`
- Modify: `src/popup.html` (input-bar 区域上方插工具栏 + 抽屉容器)
- Modify: `src/popup.css` (工具栏 + 抽屉样式)

- [ ] **Step T1.1**: 改 `src/popup.html` —— `<footer class="chat-input-bar">` **之前**插入：

```html
<div class="chat-drawer" id="chat-drawer" hidden>
  <div class="drawer-panel" data-panel="ask" hidden></div>
  <div class="drawer-panel" data-panel="debate" hidden></div>
  <div class="drawer-panel" data-panel="summary" hidden></div>
  <div class="drawer-panel" data-panel="ppt" hidden></div>
  <div class="drawer-panel" data-panel="settings" hidden></div>
</div>
<div class="chat-toolbar">
  <button class="toolbar-btn" data-drawer="ask" title="同时提问扩展">💬</button>
  <button class="toolbar-btn" data-drawer="debate" title="辩论">⚔️</button>
  <button class="toolbar-btn" data-drawer="summary" title="总结/导出/重置">📋</button>
  <button class="toolbar-btn" data-drawer="ppt" title="PPT 工坊">📊</button>
  <button class="toolbar-btn" data-drawer="settings" title="设置">⚙️</button>
</div>
```

并在 body 末尾的 `<script src="popup.js">` **之前**追加：

```html
<script src="popup-toolbar.js"></script>
<script src="popup-debate-panel.js"></script>
<script src="popup-ppt-panel.js"></script>
<script src="popup-settings-panel.js"></script>
```

- [ ] **Step T1.2**: 改 `src/popup.css` —— 文件末尾追加：

```css
.chat-toolbar {
  display: flex;
  gap: 4px;
  padding: 6px 16px;
  background: var(--card);
  border-top: 1px solid var(--border);
}
.toolbar-btn {
  flex: 1;
  background: transparent;
  border: none;
  padding: 8px;
  font-size: 18px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--ink);
  transition: background 0.15s;
}
.toolbar-btn:hover { background: var(--bg); }
.toolbar-btn.active { background: var(--accent); color: #fff; }
.chat-drawer {
  background: var(--card);
  border-top: 1px solid var(--border);
  max-height: 60vh;
  overflow-y: auto;
  animation: drawerSlideUp 0.18s ease-out;
}
@keyframes drawerSlideUp {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.drawer-panel {
  padding: 16px 20px;
}
.drawer-panel h3 {
  font-size: 14px;
  margin-bottom: 10px;
  color: var(--ink-soft);
}
```

- [ ] **Step T1.3**: 新建 `src/popup-toolbar.js`:

```javascript
// AI Arena — popup 工具栏 + 抽屉状态机
(function () {
  const $drawer = document.getElementById("chat-drawer");
  const $toolbar = document.querySelector(".chat-toolbar");
  if (!$drawer || !$toolbar) return;

  let activeDrawer = null;

  function openDrawer(name) {
    document.querySelectorAll(".drawer-panel").forEach(el => {
      el.hidden = el.dataset.panel !== name;
    });
    $drawer.hidden = false;
    activeDrawer = name;
    document.querySelectorAll(".toolbar-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.drawer === name);
    });
    document.dispatchEvent(new CustomEvent("drawer:opened", { detail: { name } }));
  }

  function closeDrawer() {
    $drawer.hidden = true;
    activeDrawer = null;
    document.querySelectorAll(".toolbar-btn").forEach(btn => btn.classList.remove("active"));
    document.dispatchEvent(new CustomEvent("drawer:closed"));
  }

  function toggleDrawer(name) {
    if (activeDrawer === name) closeDrawer();
    else openDrawer(name);
  }

  $toolbar.addEventListener("click", (e) => {
    const btn = e.target.closest(".toolbar-btn");
    if (!btn) return;
    toggleDrawer(btn.dataset.drawer);
  });

  // 点击消息列空白处关闭抽屉
  document.getElementById("chat-messages")?.addEventListener("click", (e) => {
    if (e.target.id === "chat-messages" && activeDrawer) closeDrawer();
  });

  // 暴露 API
  window.ChatDrawer = { open: openDrawer, close: closeDrawer, current: () => activeDrawer };
})();
```

- [ ] **Step T1.4**: Sanity check + commit

```bash
npm test
git add src/popup.html src/popup.css src/popup-toolbar.js
git commit -m "feat(popup): add toolbar + drawer state machine"
```

- [ ] **Step T1.5**: 手动验证（subagent 跳过，留 controller）

---

## Task P2-T2: 辩论抽屉面板

**Files:**
- Modify: `src/popup.html` (填充 `<div class="drawer-panel" data-panel="debate">`)
- Modify: `src/popup.css` (debate 面板专用样式)
- Create: `src/popup-debate-panel.js`

- [ ] **Step T2.1**: 改 `src/popup.html` —— 把 `<div class="drawer-panel" data-panel="debate" hidden></div>` 替换为：

```html
<div class="drawer-panel" data-panel="debate" hidden>
  <h3>⚔️ 辩论</h3>
  <div class="debate-step-strip">
    <div class="debate-step"><span>1</span> 初始回答</div>
    <div class="debate-step"><span>2</span> 开始辩论</div>
    <div class="debate-step"><span>3</span> 裁判总结</div>
  </div>
  <div class="debate-mode-toggle">
    <button class="mode-btn active" data-mode="free">⚔️ 自由辩论</button>
    <button class="mode-btn" data-mode="collab">🤝 群策群力</button>
  </div>
  <details class="custom-details">
    <summary class="custom-summary">引导注入（可选）</summary>
    <textarea id="dr-guidance-input" class="custom-textarea"
              placeholder="引导辩论方向，如：请重点讨论性能问题"></textarea>
  </details>
  <label class="concise-toggle">
    <input type="checkbox" id="dr-concise-mode"> <span>简洁模式（每个 AI ≤ 1000 字）</span>
  </label>
  <div class="task-action-row">
    <button class="btn btn-debate" id="dr-btn-debate">开始辩论</button>
    <button class="btn btn-secondary icon-only" id="dr-btn-debate-retry" title="强制重试">🔄</button>
  </div>
</div>
```

注：ID 前缀 `dr-` 避免与 sidepanel.js 现有的 `#btn-debate` / `#concise-mode` / `#guidance-input` 冲突（Phase 2 sidepanel 删完之后冲突自然消失，但 Phase 2 期间两边并存）。

- [ ] **Step T2.2**: 改 `src/popup.css` —— 文件末尾追加（从 sidepanel.css 拷贝相关规则并改前缀，约 60 行）：

```css
.debate-step-strip { display: flex; gap: 4px; margin-bottom: 10px; }
.debate-step { flex: 1; padding: 6px; background: var(--bg); border-radius: 4px; text-align: center; font-size: 11px; color: var(--ink-soft); }
.debate-step span { display: inline-block; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 600; margin-right: 3px; }
.debate-mode-toggle { display: flex; gap: 6px; margin-bottom: 10px; }
.mode-btn { flex: 1; padding: 8px; border: 1px solid var(--border); background: var(--card); border-radius: 6px; cursor: pointer; color: var(--ink); }
.mode-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.custom-details { margin-bottom: 10px; }
.custom-summary { cursor: pointer; padding: 6px 0; font-size: 12px; color: var(--ink-soft); }
.custom-textarea { width: 100%; min-height: 60px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; resize: vertical; color: var(--ink); font-family: inherit; }
.concise-toggle { display: flex; gap: 6px; align-items: center; margin-bottom: 12px; font-size: 13px; cursor: pointer; }
.task-action-row { display: flex; gap: 8px; }
.btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
.btn-debate { flex: 1; background: var(--accent); color: #fff; font-weight: 600; }
.btn-secondary { background: var(--bg); color: var(--ink); border: 1px solid var(--border); }
.icon-only { padding: 8px 10px; }
```

- [ ] **Step T2.3**: 新建 `src/popup-debate-panel.js`:

```javascript
// AI Arena — popup 辩论抽屉
(function () {
  let mode = "free";
  const $btnDebate = document.getElementById("dr-btn-debate");
  const $btnRetry = document.getElementById("dr-btn-debate-retry");
  const $guidance = document.getElementById("dr-guidance-input");
  const $concise = document.getElementById("dr-concise-mode");

  document.querySelectorAll('.drawer-panel[data-panel="debate"] .mode-btn').forEach(btn => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      document.querySelectorAll('.drawer-panel[data-panel="debate"] .mode-btn').forEach(b =>
        b.classList.toggle("active", b === btn)
      );
    });
  });

  function startDebate(force = false) {
    const guidance = $guidance?.value?.trim() || "";
    const concise = $concise?.checked || false;
    $btnDebate.disabled = true;
    $btnDebate.textContent = "辩论中…";
    chrome.runtime.sendMessage({
      type: "debateRound",
      style: mode,
      guidance,
      concise,
      force,
    }, (resp) => {
      $btnDebate.disabled = false;
      $btnDebate.textContent = "开始辩论";
      if (chrome.runtime.lastError || !resp?.ok) {
        console.warn("debate failed:", chrome.runtime.lastError || resp?.error);
        alert(`辩论失败: ${resp?.error || chrome.runtime.lastError?.message || "未知错误"}`);
      }
    });
  }

  $btnDebate?.addEventListener("click", () => startDebate(false));
  $btnRetry?.addEventListener("click", () => startDebate(true));
})();
```

- [ ] **Step T2.4**: commit

```bash
git add src/popup.html src/popup.css src/popup-debate-panel.js
git commit -m "feat(popup): add debate drawer panel"
```

---

## Task P2-T3: 总结抽屉面板

**Files:**
- Modify: `src/popup.html` (填充 `data-panel="summary"`)
- Modify: `src/popup.js` (加 summary 面板事件绑定 — 不单独建文件，逻辑简单)

- [ ] **Step T3.1**: 改 `src/popup.html` —— 把 `<div class="drawer-panel" data-panel="summary" hidden></div>` 替换为：

```html
<div class="drawer-panel" data-panel="summary" hidden>
  <h3>📋 总结 / 导出 / 重置</h3>
  <div class="summary-row">
    <select id="sm-judge-select" class="select-input">
      <option value="">选择裁判 AI...</option>
    </select>
    <button class="btn btn-primary" id="sm-btn-summary">输出总结</button>
  </div>
  <div class="summary-tools">
    <button class="btn btn-secondary" id="sm-btn-export">📤 导出 Markdown</button>
    <button class="btn btn-secondary danger-soft" id="sm-btn-hard-reset">⚡ 重置所有状态</button>
  </div>
</div>
```

- [ ] **Step T3.2**: 改 `src/popup.css` 末尾追加：

```css
.summary-row { display: flex; gap: 6px; margin-bottom: 10px; }
.select-input { flex: 1; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); color: var(--ink); }
.btn-primary { background: var(--accent); color: #fff; }
.summary-tools { display: flex; gap: 6px; }
.summary-tools .btn { flex: 1; }
.danger-soft { color: #ff3b30; border-color: rgba(255,59,48,0.3); }
.danger-soft:hover { background: rgba(255,59,48,0.1); }
```

- [ ] **Step T3.3**: 改 `src/popup.js` —— 在 IIFE 内部末尾（`chrome.runtime.sendMessage({ type: "chatRestoreLog" }, ...)` 之前）追加：

```javascript
  // ── 总结抽屉 ──
  function refreshJudgeOptions() {
    chrome.runtime.sendMessage({ type: "getState" }, (state) => {
      if (!state?.participants) return;
      const $sel = document.getElementById("sm-judge-select");
      if (!$sel) return;
      const cur = $sel.value;
      $sel.innerHTML = '<option value="">选择裁判 AI...</option>' +
        state.participants.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
      if (cur) $sel.value = cur;
    });
  }
  document.addEventListener("drawer:opened", (e) => {
    if (e.detail.name === "summary") refreshJudgeOptions();
  });

  document.getElementById("sm-btn-summary")?.addEventListener("click", () => {
    const judgeId = document.getElementById("sm-judge-select").value;
    if (!judgeId) { alert("请先选择裁判 AI"); return; }
    chrome.runtime.sendMessage({ type: "summary", judgeId }, (resp) => {
      if (!resp?.ok) alert(`总结失败: ${resp?.error || "未知错误"}`);
    });
  });
  document.getElementById("sm-btn-export")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "exportSession" }, (resp) => {
      if (!resp?.markdown) { alert("无内容可导出"); return; }
      const blob = new Blob([resp.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ai-arena-${Date.now()}.md`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });
  document.getElementById("sm-btn-hard-reset")?.addEventListener("click", () => {
    if (!confirm("重置所有参与者、辩论历史、群聊？此操作不可恢复。")) return;
    chrome.runtime.sendMessage({ type: "hardReset" }, () => {
      $messages.innerHTML = "";
      $messages.appendChild($empty);
      $empty.style.display = "";
      bubbleByKey.clear();
    });
  });
```

> 注：`hardReset` handler 必须在 background.js 存在。如果不存在，subagent 应 BLOCKED 报告 + controller 决定如何补。

- [ ] **Step T3.4**: 验证 background.js 有 `case "hardReset":` 和 `case "exportSession":` 和 `case "summary":` 三个 handler。

```bash
grep -n "case \"exportSession\"\|case \"summary\"\|case \"hardReset\"" src/background.js
```

如果 `hardReset` 不在，subagent 先在 background.js 加 handler（调 StateMachine.hardReset 或类似）。如果不确定怎么 reset，BLOCKED 报告等指示。

- [ ] **Step T3.5**: commit

```bash
git add src/popup.html src/popup.css src/popup.js
git commit -m "feat(popup): add summary/export/reset drawer panel"
```

---

## Task P2-T4: PPT 工坊抽屉面板

**Files:**
- Modify: `src/popup.html` (填充 `data-panel="ppt"`)
- Modify: `src/popup.css`
- Create: `src/popup-ppt-panel.js`

- [ ] **Step T4.1**: 改 `src/popup.html` —— 把 `<div class="drawer-panel" data-panel="ppt" hidden></div>` 替换为完整 PPT 面板。**直接复用 sidepanel.html 第 121-147 行的 PPT 工坊 HTML**，但所有 ID 加 `pp-` 前缀（避免与 sidepanel 现有 ID 冲突）：

```html
<div class="drawer-panel" data-panel="ppt" hidden>
  <h3>📊 PPT 工坊</h3>
  <div class="ppt-action-row">
    <button class="btn btn-secondary" id="pp-btn-copy" type="button">文案生成</button>
    <div class="ppt-template-wrap">
      <button class="btn btn-secondary ppt-menu-trigger" id="pp-btn-image-menu" type="button">图片生成 ▾</button>
      <div class="ppt-template-menu" id="pp-template-menu">
        <button type="button" class="ppt-template-item" data-template="intro"><span class="ppt-template-name">技术介绍</span><span class="ppt-template-desc">核心原理</span></button>
        <button type="button" class="ppt-template-item" data-template="topic"><span class="ppt-template-name">技术专题</span><span class="ppt-template-desc">总分结构</span></button>
        <button type="button" class="ppt-template-item" data-template="compare"><span class="ppt-template-name">技术对比</span><span class="ppt-template-desc">As-Is / To-Be</span></button>
        <button type="button" class="ppt-template-item" data-template="insight"><span class="ppt-template-name">技术洞察</span><span class="ppt-template-desc">新技术科普</span></button>
        <button type="button" class="ppt-template-item" data-template="landscape"><span class="ppt-template-name">技术全景</span><span class="ppt-template-desc">领域沙盘</span></button>
      </div>
    </div>
    <button class="btn btn-secondary" id="pp-btn-pptx" type="button">PPT 生成</button>
  </div>
  <textarea id="pp-prompt-box" class="ppt-prompt-box"
            placeholder="先点&quot;文案生成&quot;整理本次 AI 讨论；再点&quot;图片生成&quot;选模板；最后点&quot;PPT 生成&quot;。"></textarea>
  <div class="ppt-generate-row">
    <button class="btn btn-primary" id="pp-btn-start" type="button">开始生成</button>
  </div>
  <div class="ppt-hint">默认发送给 ChatGPT。请先添加 GPT 参与者并打开 chatgpt.com 标签页。</div>
</div>
```

> 注：v1 简化掉了"保存 prompt"按钮，等用户验证基本流程后再决定要不要补。如有反馈再加。

- [ ] **Step T4.2**: 改 `src/popup.css` 末尾追加 PPT 样式（从 sidepanel.css 抓 .ppt-* 规则，约 80 行）。subagent 应该读 sidepanel.css 找 `.ppt-` 开头的规则并 copy。

> Hint: `grep -n "\.ppt-" src/sidepanel.css` 列出所有相关行号。

- [ ] **Step T4.3**: 新建 `src/popup-ppt-panel.js`:

```javascript
// AI Arena — popup PPT 工坊抽屉
(function () {
  const $copy = document.getElementById("pp-btn-copy");
  const $imageMenu = document.getElementById("pp-btn-image-menu");
  const $templateMenu = document.getElementById("pp-template-menu");
  const $pptx = document.getElementById("pp-btn-pptx");
  const $promptBox = document.getElementById("pp-prompt-box");
  const $start = document.getElementById("pp-btn-start");

  let currentPrompt = "";

  $copy?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "buildPptPrompt", kind: "copy" }, (resp) => {
      if (resp?.prompt) { currentPrompt = resp.prompt; $promptBox.value = currentPrompt; }
      else alert(`生成文案 prompt 失败: ${resp?.error || "?"}`);
    });
  });

  $imageMenu?.addEventListener("click", () => {
    $templateMenu.classList.toggle("open");
  });

  $templateMenu?.querySelectorAll(".ppt-template-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const tpl = btn.dataset.template;
      $templateMenu.classList.remove("open");
      chrome.runtime.sendMessage({ type: "buildPptPrompt", kind: "image", template: tpl }, (resp) => {
        if (resp?.prompt) { currentPrompt = resp.prompt; $promptBox.value = currentPrompt; }
        else alert(`生成图片 prompt 失败: ${resp?.error || "?"}`);
      });
    });
  });

  $pptx?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "buildPptPrompt", kind: "pptx" }, (resp) => {
      if (resp?.prompt) { currentPrompt = resp.prompt; $promptBox.value = currentPrompt; }
      else alert(`生成 PPT prompt 失败: ${resp?.error || "?"}`);
    });
  });

  $start?.addEventListener("click", () => {
    const text = $promptBox.value.trim() || currentPrompt;
    if (!text) { alert("先用上面三个按钮生成 prompt"); return; }
    chrome.runtime.sendMessage({ type: "sendPromptToService", service: "chatgpt", text }, (resp) => {
      if (!resp?.ok) alert(`发送到 ChatGPT 失败: ${resp?.error || "?"}`);
    });
  });
})();
```

> 注：`buildPptPrompt` handler 名是猜测。subagent 先 grep `src/background.js` 看实际 handler 名（可能是 `pptCopyPrompt` / `pptImagePrompt` / `pptxPrompt` 或别的）。若名字不一致，按 background.js 实际为准。若 background.js 没这些 handler 但 sidepanel.js 直接构造 prompt → subagent 把 sidepanel.js 的 prompt 构造逻辑搬来 popup-ppt-panel.js 里（不依赖 background）。

- [ ] **Step T4.4**: commit

```bash
git add src/popup.html src/popup.css src/popup-ppt-panel.js
git commit -m "feat(popup): add PPT workshop drawer panel"
```

---

## Task P2-T5: 同时提问 + 设置抽屉面板

**Files:**
- Modify: `src/popup.html` (填充 `data-panel="ask"` 和 `data-panel="settings"`)
- Modify: `src/popup.css`
- Create: `src/popup-settings-panel.js`

- [ ] **Step T5.1**: `data-panel="ask"` 填充：

```html
<div class="drawer-panel" data-panel="ask" hidden>
  <h3>💬 同时提问扩展</h3>
  <p class="hint-text">基础广播用底部输入框（无需打开抽屉）。这里是扩展功能：</p>
  <label class="btn btn-secondary file-upload-label">
    📎 上传文件（图片或文档）
    <input type="file" id="ask-file-input" multiple hidden>
  </label>
  <div class="image-previews" id="ask-image-previews"></div>
</div>
```

- [ ] **Step T5.2**: `data-panel="settings"` 填充：

```html
<div class="drawer-panel" data-panel="settings" hidden>
  <h3>⚙️ 设置</h3>
  <div class="settings-section">
    <div class="settings-label">窗口排列</div>
    <div class="mode-toggle">
      <button class="mode-btn" data-window-mode="tab">Tab 模式</button>
      <button class="mode-btn active" data-window-mode="tiled">并列模式（推荐）</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-label">主题</div>
    <select id="st-theme-select" class="select-input">
      <option value="C">Aurora Glass</option>
      <option value="A">Dark Command</option>
      <option value="B">Warm Editorial</option>
      <option value="D">Neon Cyberpunk</option>
      <option value="E">Minimal Light</option>
      <option value="F">Gradient Sunset</option>
    </select>
  </div>
  <div class="settings-section">
    <button class="btn btn-secondary danger-soft" id="st-btn-clear-chat">🗑 清空当前群聊</button>
  </div>
  <div class="settings-version">AI Arena v4.0.0-beta</div>
</div>
```

- [ ] **Step T5.3**: CSS 末尾追加：

```css
.hint-text { font-size: 12px; color: var(--ink-soft); margin-bottom: 10px; }
.file-upload-label { display: inline-block; cursor: pointer; }
.image-previews { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.settings-section { margin-bottom: 14px; }
.settings-label { font-size: 12px; color: var(--ink-soft); margin-bottom: 6px; }
.mode-toggle { display: flex; gap: 4px; }
.mode-toggle .mode-btn { flex: 1; padding: 6px; font-size: 12px; }
.settings-version { text-align: center; color: var(--ink-soft); font-size: 11px; margin-top: 16px; }
```

- [ ] **Step T5.4**: 新建 `src/popup-settings-panel.js`:

```javascript
// AI Arena — popup 设置抽屉
(function () {
  // 窗口模式切换
  document.querySelectorAll('.drawer-panel[data-panel="settings"] [data-window-mode]').forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.windowMode;
      document.querySelectorAll('.drawer-panel[data-panel="settings"] [data-window-mode]').forEach(b =>
        b.classList.toggle("active", b === btn)
      );
      chrome.runtime.sendMessage({ type: "setWindowMode", mode });
    });
  });

  // 主题切换
  document.getElementById("st-theme-select")?.addEventListener("change", (e) => {
    chrome.storage.local.set({ theme: e.target.value });
    // 注：popup 本身不应用 theme（保持微信风格），只是同步到 sidepanel
    chrome.runtime.sendMessage({ type: "setTheme", theme: e.target.value });
  });

  // 清空群聊（复用 popup.js header 的 $clear 逻辑）
  document.getElementById("st-btn-clear-chat")?.addEventListener("click", () => {
    document.getElementById("btn-clear")?.click();
  });

  // 启动时把当前 windowMode / theme 从 storage 读取并 sync UI
  chrome.storage.local.get(["windowMode", "theme"], (data) => {
    if (data.windowMode) {
      document.querySelectorAll('.drawer-panel[data-panel="settings"] [data-window-mode]').forEach(b =>
        b.classList.toggle("active", b.dataset.windowMode === data.windowMode)
      );
    }
    if (data.theme) {
      const $sel = document.getElementById("st-theme-select");
      if ($sel) $sel.value = data.theme;
    }
  });
})();
```

- [ ] **Step T5.5**: commit

```bash
git add src/popup.html src/popup.css src/popup-settings-panel.js
git commit -m "feat(popup): add ask-extension + settings drawer panels"
```

---

## Task P2-T6: 抽屉状态机单元测试

**Files:**
- Create: `src/test/popup-toolbar.test.mjs`

- [ ] **Step T6.1**: 创建测试文件

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

// 测纯状态机逻辑（DOM 操作单独测）
function makeToolbar() {
  let active = null;
  return {
    toggle(name) {
      if (active === name) active = null;
      else active = name;
      return active;
    },
    open(name) { active = name; },
    close() { active = null; },
    current() { return active; },
  };
}

test("toolbar: 初始无激活", () => {
  const t = makeToolbar();
  assert.equal(t.current(), null);
});

test("toolbar: toggle 同名图标 → null", () => {
  const t = makeToolbar();
  assert.equal(t.toggle("debate"), "debate");
  assert.equal(t.toggle("debate"), null);
});

test("toolbar: toggle 不同图标 → 切换", () => {
  const t = makeToolbar();
  t.toggle("debate");
  assert.equal(t.toggle("ppt"), "ppt");
});

test("toolbar: open + close", () => {
  const t = makeToolbar();
  t.open("summary");
  assert.equal(t.current(), "summary");
  t.close();
  assert.equal(t.current(), null);
});
```

- [ ] **Step T6.2**: 跑测试

```bash
npm test
```
Expected: 26 tests pass (22 + 4 toolbar).

- [ ] **Step T6.3**: commit

```bash
git add src/test/popup-toolbar.test.mjs
git commit -m "test(popup-toolbar): drawer state machine unit tests"
```

---

## Task P2-T7: sidepanel 减肥

**Files:**
- Modify: `src/sidepanel.html` (删除 task-tabs + 3 个 task-panel，约 90 行)
- Modify: `src/sidepanel.js` (删除 task tab 切换 + debate/ppt/summary 相关绑定，约 300 行)
- Modify: `src/sidepanel.css` (删除 task-* / debate-* / ppt-* / summary-* 规则，约 200 行)

- [ ] **Step T7.1**: 删除 `src/sidepanel.html` 第 56-149 行（整个 `<div class="section task-console">`）。

> 验证：删除前 192 行，删除后约 100 行。改完后 sidepanel 只剩 header / 参与者 / 状态日志 / 统计 / dynamic-tip / footer。

- [ ] **Step T7.2**: 删除 `src/sidepanel.js` 中三类代码：

**A. DOM ref 声明（约第 7-13 行）**：删除 `judgeSelect / btnDebate / btnSummary / btnDebateRetry / guidanceInput / roundBadge / pptPromptBox / btnPptCopy / btnPptImageMenu / pptTemplateMenu / btnPptStart / btnPptxPrompt / btnPptSaveMenu / pptSaveMenu` 这些 const 声明（**保留** broadcast-input / image-previews / file-input / btn-send 因为基础广播仍在 sidepanel？— 实际 Phase 1 已把基础广播搬到 popup，但 sidepanel 也保留作为老入口。**T7 决定**：sidepanel 完全移除基础广播 input 区，用户必须开 popup 才能发消息）。

**修正 T7.2 决定**：sidepanel.html 第 70-81 行（`<div class="task-panel active" data-task-panel="ask">`）也一起删，所以 `broadcast-input` / `image-previews` / `file-input` / `btn-send` 的 sidepanel.js 引用也全部删除。

**B. 事件绑定**：
- 第 832-836 行 `.task-tab` 切换 → 删
- 第 1020-1108 行 PPT 工坊相关 → 删
- 第 1152 行 export → 删
- 第 1170 行 hardReset → 删
- 所有调用上述 DOM ref 的 listener → 删

**C. 业务函数**：保留 `handleDebate` / `handleSummary` 等函数本身吗？因为 popup 直接调 background handler，sidepanel.js 里的这些函数已无被调用方 → 删除。

> Subagent 建议：先 grep 找所有引用，再逐处删除。改完后 npm test 跑过 + 加载扩展看 sidepanel 是否能正常打开（不报 JS 错）。

- [ ] **Step T7.3**: 删除 `src/sidepanel.css` 中 task-* / debate-* / ppt-* / summary-* / mode-toggle 等相关规则。

> `grep -n "^\.task-\|^\.debate-\|^\.ppt-\|^\.summary-\|^\.mode-btn\|^\.mode-toggle" src/sidepanel.css` 列出所有要删的规则行号。

- [ ] **Step T7.4**: 手动验证（subagent 跳过留 controller）：加载扩展，sidepanel 能正常打开，参与者管理 / 统计 / 日志 / "🪟 群聊"按钮都还在；点群聊按钮 → popup 弹出 → 工具栏 5 图标 / 抽屉切换均工作；删除的 task panel 确实不再出现在 sidepanel。

- [ ] **Step T7.5**: commit

```bash
git add src/sidepanel.html src/sidepanel.js src/sidepanel.css
git commit -m "refactor(sidepanel): remove task panels (moved to popup drawer)"
```

> 注：本 commit 触动 3 个文件，但都是删除性质。如果 refactor-guard hook 拦截，subagent 报 DONE_WITH_CONCERNS。Controller 用 `/post-refactor-verify` 或创建 `$env:TEMP\.refactor-verified` 标记放行。

---

## Task P2-T8: 版本号 + Release Notes + Build + Tag

**Files:**
- Modify: `src/manifest.json` (version → "4.0.0" 不动；但显示 "v4.0.0-beta" 字符)
- Modify: `src/sidepanel.html` (footer 版本字符 v4.0.0 → v4.0.0-beta)
- Modify: `src/popup.html` (顶部 version badge v4.0.0 → v4.0.0-beta)
- Create: `docs/release-notes-4.0.0-beta.html`

- [ ] **Step T8.1**: 改 manifest.json `"version": "4.0.0"` → 保持 4.0.0（Chrome 不接受 "-beta" 后缀），但 `"version_name": "4.0.0-beta"` 字段可选加。

实际操作：manifest.json 加一行 `"version_name": "4.0.0-beta",` 紧跟 version 字段下方。

- [ ] **Step T8.2**: 改 sidepanel.html footer + popup.html version badge 中的字符串 `v4.0.0` → `v4.0.0-beta`。

- [ ] **Step T8.3**: 创建 `docs/release-notes-4.0.0-beta.html` —— 沿用 alpha 版的样式模板（在 `docs/phase1-completion-report.html` 已确立），内容更新为 Phase 2 完成事项：

(content 仿照 `docs/release-notes-4.0.0-alpha.html`，三张卡片：新增 / 体验建议 / 已知限制；新增侧重抽屉工具栏 + 辩论/PPT/总结全部在 popup 闭环 + sidepanel 减肥；已知限制：富文本仍跳原页 → v3+，历史回填仍未做 → v1.1)

- [ ] **Step T8.4**: 跑 build

```bash
npm run build
```

期望：dist/github 和 dist/store 生成 v4.0.0 zip（zip 文件名不带 -beta，因为 manifest version 是 4.0.0；但 version_name 内部标 beta）。

- [ ] **Step T8.5**: commit + tag

```bash
git add src/manifest.json src/sidepanel.html src/popup.html docs/release-notes-4.0.0-beta.html
git commit -m "release(v4.0.0-beta): popup drawer toolbar replaces sidepanel task panels"
git tag -a v4.0.0-beta -m "Phase 2: drawer toolbar + debate/PPT/summary/settings panels + sidepanel slimming"
```

---

## 自审清单

- ✅ Spec 决策 #4（sidepanel 减肥）→ P2-T1 至 P2-T7 全覆盖
- ✅ Spec 决策 #7（底部抽屉工具栏 5 图标）→ T1
- ✅ 决策 9（@mention）已在 Phase 1 完成，本 plan 不复述
- ✅ 决策 11（智能选屏）已在 Phase 1 完成
- ✅ background.js 现有 handler 复用率高（debateRound / summary / exportSession / sendPromptToService / setWindowMode / getState 都现成），仅可能新增 hardReset
- ✅ 无 placeholder：每个 task 含完整 HTML/JS/CSS 代码 + 命令
- ✅ ID 前缀化避免 sidepanel 并存期冲突（dr-/sm-/pp-/st-）
- ✅ refactor-guard hook 风险已在 T7 标注

---

## 不在 Phase 2 范围（留 v1.1 / v3+）

- 历史回填（拉 AI 原页已有 turns 合并）→ v1.1
- Artifact / Mermaid / 图片内嵌渲染 → v3+
- 跨设备同步 → v3+
- 多群聊会话切换 → v2+

---

## 关键风险点

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| background.js 现有 handler 名字和我假设不一致（buildPptPrompt 等）| 高 | 中 | T4 step 注明 subagent 先 grep 找实际名字 |
| hardReset handler 不存在 | 中 | 低 | T3 step 注明，subagent BLOCKED 时 controller 决定补 |
| sidepanel.js 删除范围把握不准 | 高 | 中 | T7 拆 3 个 sub-step（HTML/JS/CSS），逐项 grep + 删除，手动验证打开 sidepanel 无 JS 错 |
| PPT 工坊业务逻辑分散在 sidepanel.js | 高 | 中 | T4 step 注明：若 background 没有 handler，搬整段构造逻辑过来 |
