// AI Arena — 千问/夸克 提取噪音过滤器（v5.2.3）
// 双模出口：浏览器 content script 通过 globalThis.QwenNoiseFilter 取，Node 测试通过 require 取
//
// 背景：千问页（tongyi.aliyun.com / qianwen.com 实际后端是夸克 AI 搜索）回答正文后追加
//   "相关推荐"卡片组（视频/笔记/网页），用 CSS-in-JS hash 命名（如 .video-item-FJQ1X）
//   渲染。selector 抓 wrapper 时一锅端 → 回答末尾混入：
//     1) hydrate JSON payload (`{"data":{"initialData":{...}}}`)
//     2) 内联脚本注入 (`window._hydrate_core && ...`)
//     3) 大量 CSS hash 规则块 (`.box-On2XC{...}` 连续 N 个)
//     4) 10 条相关视频标题 + author
//     5) 千问 UI 控件文本 (`▴ 收起 39574 字`)
//
// 双层防御：
//   - stripQwenDomNoise(el): clone 节点 → 删 script/style + 已知噪音容器 → 提取
//   - cleanQwenNoise(text): 提取后字串再过 4 锚点截断（兜底 DOM 漏网）
(function (global) {
  // ── DOM 层：clone 节点删 noise 子节点 ──────────────────────────
  // 已知噪音容器的 class 前缀（CSS modules hash 命名，前缀稳定）
  const NOISE_SELECTORS = [
    "script", "style",
    '[class*="video_note_list"]',     // 相关视频/笔记/网页卡片组容器
    '[class*="video-item-"]',          // 单个视频卡
    '[class*="note-item-"]',           // 单个笔记卡
    '[class*="doc-item-"]',            // 单个文档卡
    '[class*="web-item-"]',            // 单个网页卡
    '[class*="hydrate"]',              // hydrate 标记节点
  ].join(",");

  // 入参：response 容器节点；返回值：clone 后的净节点（**不修改原 DOM**）
  function stripQwenDomNoise(srcEl) {
    if (!srcEl || typeof srcEl.cloneNode !== "function") return srcEl;
    const clone = srcEl.cloneNode(true);
    try {
      clone.querySelectorAll(NOISE_SELECTORS).forEach((n) => n.remove());
    } catch (_) { /* querySelectorAll 异常时降级返回原 clone */ }
    return clone;
  }

  // ── 字串层：4 锚点截断（DOM 漏网兜底） ──────────────────────────
  // 阈值：截断后剩余 < 原 10% → 视为锚点误判，放弃截断（保留原文）
  const MIN_KEEP_RATIO = 0.1;

  function cleanQwenNoise(text) {
    if (!text || typeof text !== "string") return text || "";
    const origLen = text.length;
    let result = text;
    const cuts = []; // 记录所有命中位置，取最早的

    // 锚点 1：千问 UI 控件 "▴/▾ 收起/展开 N字"
    const collapseMatch = result.match(/[▴▾]\s*\n?\s*(收起|展开)\s*\n?\s*\d+\s*字/);
    if (collapseMatch && collapseMatch.index > 0) cuts.push({ at: collapseMatch.index, tag: "collapse" });

    // 锚点 2（加固版）：hydrate JSON payload — 必须含夸克独有 key 才触发
    //   原版 /\{"data":\{"initialData":/ 太宽，开发者教学 JSON 会误伤
    //   加固：起点 200 字符内必须出现 reqId / hydrateId / originalData / user_agent 至少一个
    const hydrateMatch = result.match(/\{"data":\s*\{"initialData":[\s\S]{0,200}?"(reqId|hydrateId|originalData|user_agent)"/);
    if (hydrateMatch && hydrateMatch.index > 0) cuts.push({ at: hydrateMatch.index, tag: "hydrate" });

    // 锚点 3：夸克内联脚本注入特征
    const scriptMatch = result.match(/window\._hydrate_core\s*&&/);
    if (scriptMatch && scriptMatch.index > 0) cuts.push({ at: scriptMatch.index, tag: "script" });

    // 锚点 4：CSS hash 规则块密度 — 连续 3+ 个 .xxx-AbCd5{...} 视为 CSS-in-JS dump
    const cssRules = [...result.matchAll(/\.[\w-]+-[A-Za-z0-9_]{4,6}\s*\{[^}]*\}/g)];
    if (cssRules.length >= 3 && cssRules[0].index > 0) {
      cuts.push({ at: cssRules[0].index, tag: "css" });
    }

    if (cuts.length === 0) return result;

    // 取最早命中位置
    cuts.sort((a, b) => a.at - b.at);
    const earliest = cuts[0];
    const keepRatio = earliest.at / origLen;

    // 10% 兜底：截断后保留太少 → 锚点疑似误判，放弃
    if (keepRatio < MIN_KEEP_RATIO) {
      try { console.warn(`[qwen-noise] skip truncate (keep ratio ${keepRatio.toFixed(3)} < ${MIN_KEEP_RATIO}, tag=${earliest.tag})`); } catch (_) {}
      return result;
    }

    try { console.log(`[qwen-noise] truncated at ${earliest.tag} (offset=${earliest.at}, removed=${origLen - earliest.at} chars)`); } catch (_) {}
    return result.slice(0, earliest.at).trim();
  }

  const api = { stripQwenDomNoise, cleanQwenNoise };

  // 浏览器 / content script：挂全局
  global.QwenNoiseFilter = api;
  global.stripQwenDomNoise = stripQwenDomNoise;
  global.cleanQwenNoise = cleanQwenNoise;

  // Node CommonJS：测试用
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : globalThis));
