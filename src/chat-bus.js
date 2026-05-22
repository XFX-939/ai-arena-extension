// AI Arena — 群聊业务总线（背景脚本子模块）
// 由 background.js 通过 importScripts 加载，挂在 self.ChatBus

const ChatBus = (() => {
  // ── 状态 ──
  let popupWindowId = null;        // 当前 popup window id，null 表示未开
  let popupBounds = null;          // 用户拖动后记忆的位置/尺寸
  const chatLog = [];              // 最近 100 条消息
  const MAX_LOG = 100;
  const STORAGE_KEYS = { log: "chatLog", bounds: "chatPopupBounds" };

  // ── 初始化：读 storage ──
  async function init() {
    const data = await chrome.storage.local.get([STORAGE_KEYS.log, STORAGE_KEYS.bounds]);
    if (Array.isArray(data[STORAGE_KEYS.log])) chatLog.push(...data[STORAGE_KEYS.log].slice(-MAX_LOG));
    if (data[STORAGE_KEYS.bounds]) popupBounds = data[STORAGE_KEYS.bounds];
  }

  // ── popup 生命周期 ──
  async function openChatPopup() {
    if (popupWindowId != null) {
      try {
        await chrome.windows.update(popupWindowId, { focused: true });
        return { ok: true, reused: true, windowId: popupWindowId };
      } catch {
        popupWindowId = null;  // window 已被关
      }
    }
    const bounds = popupBounds || await defaultBounds();
    const w = await chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      ...bounds,
    });
    popupWindowId = w.id;
    return { ok: true, reused: false, windowId: w.id };
  }

  async function defaultBounds() {
    try {
      const displays = await chrome.system.display.getInfo();
      const primary = displays.find(d => d.isPrimary) || displays[0];
      const w = Math.min(800, Math.round(primary.workArea.width / 2));
      const h = Math.min(900, Math.round(primary.workArea.height * 0.9));
      return {
        left: primary.workArea.left + primary.workArea.width - w - 20,
        top: primary.workArea.top + 40,
        width: w,
        height: h,
      };
    } catch {
      return { left: 100, top: 100, width: 600, height: 800 };
    }
  }

  function onWindowRemoved(windowId) {
    if (windowId === popupWindowId) popupWindowId = null;
  }

  async function rememberBounds(windowId) {
    if (windowId !== popupWindowId) return;
    try {
      const w = await chrome.windows.get(popupWindowId);
      popupBounds = { left: w.left, top: w.top, width: w.width, height: w.height };
      await chrome.storage.local.set({ [STORAGE_KEYS.bounds]: popupBounds });
    } catch {}
  }

  // ── 暂时留空，后续 task 填 ──
  async function broadcast(text, targets, images) { /* Task T8 */ }
  function getLog() { return chatLog.slice(); }
  function clearLog() { chatLog.length = 0; chrome.storage.local.remove(STORAGE_KEYS.log); }
  async function jumpToOrigin(participantId) { /* Task T10 */ }

  return {
    init,
    openChatPopup,
    onWindowRemoved,
    rememberBounds,
    broadcast,
    getLog,
    clearLog,
    jumpToOrigin,
  };
})();

self.ChatBus = ChatBus;
