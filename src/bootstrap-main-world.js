// AI Arena — MAIN world visibility patch (v4.8.19 F32)
// 在 document_start 注入到 AI 网页的 MAIN world，让网页永远以为自己在前台
// 替代之前 chrome.debugger.attach（避免顶部通知条，删 debugger 权限）
//
// 关键洞察：React 18 的 fiber scheduler 走 MessageChannel.postMessage 不是 rAF，
// MessageChannel 不被 Chrome throttle。所以 background tab 时 DOM 树本来就在
// 正常更新，只是视觉 paint 停了。但 content script 读 innerText/querySelector
// 读的是 DOM 状态不是像素，所以根本不需要解 throttle。
// 唯一需要的：让 SPA 内部基于 document.visibilityState/hidden/blur 等做的
// "暂停"逻辑（如 ChatGPT 的某些 idle 检测）失效。
//
// 工业实践：Sider / Glasp / Monica / HARPA AI（4 个百万级 AI 抓取扩展）
// 都是这套路线，无一用 chrome.debugger。
(() => {
  if (window.__arenaMainWorldPatched) return;
  window.__arenaMainWorldPatched = true;

  // ── 1. document.visibilityState / hidden 锁死 ──
  // 同时 patch Document.prototype（防 SPA 直接读 prototype 属性）+ document 实例
  const visibleDesc = { get: () => "visible", configurable: true };
  const hiddenDesc = { get: () => false, configurable: true };
  try {
    Object.defineProperty(Document.prototype, "visibilityState", visibleDesc);
    Object.defineProperty(Document.prototype, "hidden", hiddenDesc);
  } catch (_) {}
  try {
    Object.defineProperty(document, "visibilityState", visibleDesc);
    Object.defineProperty(document, "hidden", hiddenDesc);
  } catch (_) {}

  // webkit 兼容字段
  try {
    Object.defineProperty(document, "webkitVisibilityState", visibleDesc);
    Object.defineProperty(document, "webkitHidden", hiddenDesc);
  } catch (_) {}

  // ── 2. 拦截所有 visibility / focus 相关事件（capture 阶段最优先）──
  const blockedEvents = [
    "visibilitychange", "webkitvisibilitychange",
    "blur", "pagehide", "freeze",
  ];
  blockedEvents.forEach(type => {
    document.addEventListener(type, e => e.stopImmediatePropagation(), true);
    window.addEventListener(type, e => e.stopImmediatePropagation(), true);
  });

  // ── 3. document.hasFocus() 永远 true ──
  try {
    document.hasFocus = () => true;
  } catch (_) {}

  // ── 4. rAF polyfill：document.hidden 时（虽然我们已经 patch 但兜底）走 MessageChannel ──
  // React 18 scheduler 自己走 MessageChannel 不依赖 rAF，但老 Angular zone / 动画库可能依赖
  try {
    const origRAF = window.requestAnimationFrame.bind(window);
    const origCAF = window.cancelAnimationFrame.bind(window);
    const ch = new MessageChannel();
    const queue = new Map();
    let nextId = 1 << 30;
    ch.port1.onmessage = () => {
      const t = performance.now();
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) {
        try { cb(t); } catch (_) {}
      }
    };
    window.requestAnimationFrame = function (cb) {
      // 因为我们 patch 了 document.hidden 永远 false，原生 rAF 应该总能跑
      // 但如果浏览器内部走的不是 JS 层 document.hidden，仍可能被节流——兜底走 MessageChannel
      try {
        const id = origRAF(cb);
        if (id) return id;
      } catch (_) {}
      const id = nextId++;
      queue.set(id, cb);
      ch.port2.postMessage(0);
      return id;
    };
    window.cancelAnimationFrame = function (id) {
      if (queue.has(id)) { queue.delete(id); return; }
      try { origCAF(id); } catch (_) {}
    };
  } catch (_) {}

  // ── 5. setTimeout 极短延时映射到 MessageChannel（兜底 Angular zone）──
  // Chrome 对 hidden tab 的 setTimeout 节流到 1Hz，影响某些 SPA 内部 polling
  // 把 < 4ms 的 setTimeout 改走 MessageChannel（不被节流），保持原行为兼容
  try {
    const origSetTimeout = window.setTimeout.bind(window);
    const origClearTimeout = window.clearTimeout.bind(window);
    const fastCh = new MessageChannel();
    const fastQueue = new Map();
    let fastId = 2 << 30;
    fastCh.port1.onmessage = (e) => {
      const id = e.data;
      const cb = fastQueue.get(id);
      if (cb) {
        fastQueue.delete(id);
        try { cb(); } catch (_) {}
      }
    };
    window.setTimeout = function (cb, delay, ...args) {
      // 只接管极短延时 + 函数回调（字符串 eval 走原生）
      if (typeof cb === "function" && (delay == null || delay <= 4)) {
        const id = fastId++;
        fastQueue.set(id, args.length ? () => cb(...args) : cb);
        fastCh.port2.postMessage(id);
        return id;
      }
      return origSetTimeout(cb, delay, ...args);
    };
    window.clearTimeout = function (id) {
      if (fastQueue.has(id)) { fastQueue.delete(id); return; }
      origClearTimeout(id);
    };
  } catch (_) {}

  console.log("[AI Arena] MAIN world visibility patch applied");
})();
