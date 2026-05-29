// AI Arena — Content Script Shared Helpers
// v5.2.6: 跨 9 平台提取共用工具
//
// 设计原则：
// - 必须在 inject-images.js 之前注入（manifest content_scripts 顺序）
// - 暴露到 globalThis.ArenaShared，避免污染 page world
// - IIFE + guard 防御 reload 扩展时重复声明
(function () {
  if (globalThis.ArenaShared && globalThis.ArenaShared._loaded) return;

  // 取数组里最后一个有 innerText 内容的元素
  // 解决：
  //   - 豆包 spacer 占位行（v_list_row 4 行里 2 行空）
  //   - streaming 起步窗口（容器建好但 SSE 还没填）
  //   - 思考链分容器（DeepSeek 思考 + 回复分两个 .ds-markdown，末位可能是空 thinking）
  //   - fallback selector 命中装饰元素（spinner / toolbar / 推荐问题）
  //
  // 行为：从末尾向前扫，第一个 innerText.trim().length > 0 的元素返回
  //       找不到返回 null —— 调用方应 fallback 到 responses[length-1] 保守兜底
  function getLastNonEmpty(elements) {
    if (!elements) return null;
    // v5.2.17: 防御非类数组单元素（多方审查 DeepSeek）— 单 DOM 元素 length 为 undefined
    //   且不可迭代，[...el] 会抛错。用 Array.isArray / length 数字判断更稳。
    let arr;
    if (Array.isArray(elements)) arr = elements;
    else if (typeof elements.length === "number") arr = elements;  // NodeList / HTMLCollection
    else arr = [elements];  // 单元素兜底
    for (let i = arr.length - 1; i >= 0; i--) {
      const el = arr[i];
      if (!el) continue;
      // v5.2.17: 分别 trim 再择优（多方审查 Codex 高置信）— 旧 `el.innerText || el.textContent`
      //   当 innerText 是纯空白 "   "（truthy）时不会回退 textContent，trim 后变空 → 误判该
      //   元素为空跳过，但 textContent 可能有内容（背景 tab innerText 常返回空白）。
      const it = (el.innerText || "").trim();
      const tc = (el.textContent || "").trim();
      if ((it || tc).length > 0) return el;
    }
    return null;
  }

  // v5.2.17: 安全往 contenteditable 注入多行文本（替代 innerHTML 拼接用户 prompt）
  //   多方审查 Codex 高危发现：robustInject 兜底 `el.innerHTML = text.split("\n").map(
  //   l => `<p>${l}</p>`)` 把用户 prompt 直接拼进 innerHTML —— prompt 含 < > & 或
  //   "<img onerror=...>" 会被浏览器解析：轻则 prompt 内容被篡改/截断（如问"比较 <div>
  //   和 <span>"），重则在 AI 页面上下文执行脚本。改用 createElement + textContent 杜绝。
  function setEditableLines(el, text) {
    if (!el) return;
    el.innerHTML = "";
    const lines = String(text == null ? "" : text).split("\n");
    for (const line of lines) {
      const p = document.createElement("p");
      if (line) p.textContent = line;           // textContent 不解析 HTML，安全
      else p.appendChild(document.createElement("br"));
      el.appendChild(p);
    }
    try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
  }

  // v5.2.20: 判定元素当前是否落在视口纵向可见区域（排除滚出视口的历史残留 + 隐藏元素）
  //   旧逻辑只看 getBoundingClientRect().width > 0 —— 滚出视口的残留 width 照样 > 0 → 误判。
  function _visibleInViewport(el, win) {
    const r = el.getBoundingClientRect?.();
    if (!r) return false;
    if (r.width <= 0 || r.height <= 0) return false;
    const vh = (win && win.innerHeight) || 0;
    return r.bottom > 0 && (vh ? r.top < vh : true);
  }

  // v5.2.20: streaming 信号判定 —— 治本替代各 content 脚本里
  //   `queryBySelectors("streaming")`（全文档 querySelector 取第一个）+ 裸 width>0 的旧逻辑。
  //   旧逻辑第二/三轮起会命中上方历史轮残留（千问未完成 qk-markdown / 残留 Stop 按钮 /
  //   宽通配 [class*="stop"]），isStreaming 卡 true → 完成判定永远差 !isStreaming →
  //   拖到 12s 兜底、甚至 5min 超时（截图实锤：千问"超时 5 分钟强制结束"）。
  //   新规则：streaming selector 命中的元素，只在以下任一成立时才算"正在生成"：
  //     ① 属于最新回答容器（容器自身或其子节点）—— 当前这条回答在流式
  //     ② 当前视口内可见 —— 覆盖全局 Stop 按钮 / 与回答同级的 loading 指示器，
  //        同时排除滚出视口上方的历史残留。
  function detectStreaming(streamingSelectors, latestEl, win, doc) {
    win = win || (typeof window !== "undefined" ? window : globalThis);
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc) return false;
    const sels = Array.isArray(streamingSelectors) ? streamingSelectors : [];
    for (const sel of sels) {
      let els;
      try { els = doc.querySelectorAll(sel); } catch (_) { continue; }
      for (const el of els) {
        if (!el) continue;
        if (latestEl && (el === latestEl || (latestEl.contains && latestEl.contains(el)))) return true;
        if (_visibleInViewport(el, win)) return true;
      }
    }
    return false;
  }

  globalThis.ArenaShared = {
    _loaded: true,
    getLastNonEmpty,
    setEditableLines,
    detectStreaming,
  };
})();
