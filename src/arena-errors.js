// AI Arena — 错误码协议（v5.2.4-storage-p1）
// 双模出口：浏览器/SW 通过 global.ArenaErrors 取，Node 测试通过 require 取
//
// 设计意图：替代过去满天飞的裸字符串 error，给三类调用方（content-* → chat-bus → sidepanel）
// 一个统一的失败语义，便于：
//   1) sidepanel 渲染大白话提示 + 诊断包
//   2) chat-bus 按 retryable 判定自动重试
//   3) 上层日志按 code 聚合归因
(function (global) {
  // ── 1. 错误码枚举 ──────────────────────────────────────────────
  const ArenaErrorCode = Object.freeze({
    INJECT_NO_INPUT:           "INJECT_NO_INPUT",
    INJECT_NO_SEND_BTN:        "INJECT_NO_SEND_BTN",
    INJECT_SEND_BTN_DISABLED:  "INJECT_SEND_BTN_DISABLED",
    EXTRACT_DOM_EMPTY:         "EXTRACT_DOM_EMPTY",
    EXTRACT_TIMEOUT:           "EXTRACT_TIMEOUT",
    EXTRACT_STALE:             "EXTRACT_STALE",
    PROMPT_ECHO_DETECTED:      "PROMPT_ECHO_DETECTED",
    STREAM_NEVER_STARTED:      "STREAM_NEVER_STARTED",
    LOGIN_REQUIRED:            "LOGIN_REQUIRED",
    TAB_NOT_FOUND:             "TAB_NOT_FOUND",
  });

  // ── 2. 生命周期阶段枚举 ────────────────────────────────────────
  const ArenaStage = Object.freeze({
    IDLE:       "idle",
    INJECTING:  "injecting",
    AWAITING:   "awaiting",
    STREAMING:  "streaming",
    EXTRACTING: "extracting",
    DONE:       "done",
    FAILED:     "failed",
  });

  // 可自动重试的错误码（chat-bus 重试调度器据此决策）
  const RETRYABLE_CODES = new Set([
    ArenaErrorCode.EXTRACT_TIMEOUT,
    ArenaErrorCode.EXTRACT_DOM_EMPTY,
    ArenaErrorCode.STREAM_NEVER_STARTED,
  ]);

  // 用户大白话翻译表
  const USER_HINTS = Object.freeze({
    [ArenaErrorCode.INJECT_NO_INPUT]:          "页面输入框定位失败，可能登录过期或网站改版",
    [ArenaErrorCode.INJECT_NO_SEND_BTN]:       "发送按钮没找到",
    [ArenaErrorCode.INJECT_SEND_BTN_DISABLED]: "发送按钮当前不可点击（检查是否有文件仍在上传）",
    [ArenaErrorCode.EXTRACT_DOM_EMPTY]:        "读不到回答内容",
    [ArenaErrorCode.EXTRACT_TIMEOUT]:          "10 分钟内没收到完整回答",
    [ArenaErrorCode.EXTRACT_STALE]:            "读到的是上一轮回答，正在等本轮新内容",
    [ArenaErrorCode.PROMPT_ECHO_DETECTED]:     "识别到 prompt 回显，AI 网页可能把问题文本误当回答",
    [ArenaErrorCode.STREAM_NEVER_STARTED]:     "发出去了但 AI 没开始回答",
    [ArenaErrorCode.LOGIN_REQUIRED]:           "该 AI 站点未登录，请先去 tab 里登录",
    [ArenaErrorCode.TAB_NOT_FOUND]:            "对应 AI 的 tab 已被关闭",
  });

  // ── 3. ArenaError 工厂 ─────────────────────────────────────────
  // 兼容老调用方：未知 code 不抛错，仅 retryable=false + hint 回退
  function makeArenaError(code, snapshot) {
    const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};
    return {
      code,
      stage: safeSnapshot.stage || null,
      service: safeSnapshot.service || null,
      retryable: RETRYABLE_CODES.has(code),
      snapshot: safeSnapshot,
      ts: Date.now(),
    };
  }

  // 大白话翻译：未知 code 回退到原始 code（不返回空串，避免 UI 显示空气泡）
  function renderUserHint(code) {
    return USER_HINTS[code] || `未知错误码：${code || "(empty)"}`;
  }

  // 判断对象是否是 ArenaError 形状（chat-bus / sidepanel 接收时 sniff 用）
  function isArenaError(obj) {
    return !!(obj && typeof obj === "object" && typeof obj.code === "string" && typeof obj.ts === "number" && obj.snapshot !== undefined);
  }

  const api = { ArenaErrorCode, ArenaStage, makeArenaError, renderUserHint, isArenaError };

  // 浏览器/SW：挂全局
  global.ArenaErrors = api;
  global.ArenaErrorCode = ArenaErrorCode;
  global.ArenaStage = ArenaStage;
  global.makeArenaError = makeArenaError;
  global.renderUserHint = renderUserHint;

  // Node CommonJS：测试用
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : globalThis));
