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

  globalThis.ArenaShared = {
    _loaded: true,
    getLastNonEmpty,
    setEditableLines,
  };
})();
