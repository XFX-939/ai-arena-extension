// popup-gatekeeper-bridge.js — v4.9.0 popup 端守门员桥接
// 把"接收 sensitive_blocked 响应 → 弹 modal → 按钮回调重发"逻辑抽出来
// popup-tasks / popup-task-menu / popup.js 各处发送回调统一调 handleResp
//
// 用法：
//   const resp = await chrome.runtime.sendMessage(msg);
//   if (ChatGatekeeperBridge.handleResp(msg, resp, { textField: "text", onRetry })) return;
//   // resp.ok === true 时 handleResp 返回 false → 走正常成功路径
//
// opts.textField: 原 msg 里哪个字段是 text（默认 "text"，debateRound 是 "guidance"，
//                  summary 是 "customInstruction"）
// opts.onRetry(newMsg) 可选 — 重发触发点（默认用 chrome.runtime.sendMessage 重发）
// opts.onCancel() 可选 — 用户取消时回调（如焦点回输入框）

(function () {
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // 返回 true 表示已经处理（命中并弹了 modal），调用方应 return 不再走正常逻辑
  // 返回 false 表示无命中或异常，调用方继续正常处理
  function handleResp(originalMsg, resp, opts) {
    if (!resp || resp.ok !== false || resp.reason !== "sensitive_blocked") return false;
    if (!window.ChatModal?.showSensitiveBlocked) {
      console.warn("[Gatekeeper] ChatModal.showSensitiveBlocked 未加载");
      return false;
    }

    const { hits = [], masked = "", original = "" } = resp;
    const textField = opts?.textField || "text";

    function retry(newText) {
      const newMsg = { ...originalMsg, [textField]: newText, skipGatekeeper: true };
      if (opts?.onRetry) {
        try { opts.onRetry(newMsg); } catch (e) { console.warn(e); }
        return;
      }
      chrome.runtime.sendMessage(newMsg, (r) => { void chrome.runtime.lastError; });
    }

    window.ChatModal.showSensitiveBlocked(
      { hits, masked, original },
      {
        onMask: () => retry(masked),
        onConfirm: async (orig, theHits) => {
          // 加入个人白名单
          try {
            const Store = window.GatekeeperStore;
            if (Store) await Store.addWhitelist(theHits.map(h => h.text));
            await chrome.runtime.sendMessage({ type: "_bumpGatekeeperStat", key: "skipped" }).catch(() => {});
          } catch (e) { console.warn("[Gatekeeper] addWhitelist failed", e); }
          retry(orig);
        },
        onCancel: () => {
          try { opts?.onCancel?.(); } catch (e) {}
          chrome.runtime.sendMessage({ type: "_bumpGatekeeperStat", key: "cancelled" }).catch(() => {});
        },
      }
    );
    return true;
  }

  window.ChatGatekeeperBridge = { handleResp, _escapeHtml: escapeHtml };
})();
