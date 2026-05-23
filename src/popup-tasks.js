// popup-tasks.js — 任务 Tab：context-sensitive，随 task-picker 切换内容
(function () {
  const state = {
    task: "ask",
    style: "free",
    judgeId: null,
    judgeName: null,
    kind: null,
    guidance: "",
    concise: false,
  };
  let judgesList = [];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function render() {
    const root = document.getElementById("rp-panel-tasks");
    if (!root) return;
    if (state.task === "ask") {
      root.innerHTML = `<div class="rp-empty">
        在底部输入框直接输入消息<br>
        <span class="rp-kbd">Ctrl+Enter</span> 发送给全部<br>
        <span class="rp-kbd">@</span> 单发指定 AI
      </div>`;
      return;
    }
    if (state.task === "debate") {
      root.innerHTML = renderDebate();
      bindDebate(root);
      return;
    }
    if (state.task === "summary") {
      root.innerHTML = renderSummary();
      bindSummary(root);
      return;
    }
    if (state.task === "ppt") {
      root.innerHTML = renderPpt();
      bindPpt(root);
      return;
    }
    root.innerHTML = `<div class="rp-empty">未识别任务</div>`;
  }

  function renderDebate() {
    return `
      <div class="rp-section-title">辩论控制台</div>
      <div class="rp-mode-toggle">
        <button class="rp-mode-btn ${state.style === "free" ? "active" : ""}" data-style="free">⚔️ 自由</button>
        <button class="rp-mode-btn ${state.style === "collab" ? "active" : ""}" data-style="collab">🤝 群策</button>
      </div>
      <details style="margin-bottom:6px">
        <summary style="cursor:pointer;font-size:11px;color:var(--ink-soft);padding:4px 0">引导注入（可选）</summary>
        <textarea class="rp-textarea" id="rp-guidance" placeholder="如：聚焦性能问题">${escapeHtml(state.guidance)}</textarea>
      </details>
      <label class="rp-checkbox-row">
        <input type="checkbox" id="rp-concise" ${state.concise ? "checked" : ""}> 简洁模式
      </label>
      <button class="rp-btn primary" id="rp-btn-debate">⚔️ 开始辩论</button>
      <button class="rp-btn" id="rp-btn-debate-retry" title="如果辩论卡住可强制重试">🔄 强制重试</button>
    `;
  }

  function bindDebate(root) {
    root.querySelectorAll(".rp-mode-btn[data-style]").forEach(b => {
      b.addEventListener("click", () => {
        state.style = b.dataset.style;
        // 保留 textarea 当前值
        const cur = root.querySelector("#rp-guidance")?.value;
        const cc = root.querySelector("#rp-concise")?.checked;
        if (cur !== undefined) state.guidance = cur;
        if (cc !== undefined) state.concise = cc;
        render();
      });
    });
    root.querySelector("#rp-btn-debate")?.addEventListener("click", () => {
      state.guidance = root.querySelector("#rp-guidance")?.value || "";
      state.concise = root.querySelector("#rp-concise")?.checked || false;
      chrome.runtime.sendMessage({
        type: "debateRound",
        style: state.style,
        guidance: state.guidance,
        concise: state.concise,
      }, (resp) => {
        if (resp && !resp.ok) alert(`辩论失败：${resp.error || "未知错误"}`);
      });
    });
    root.querySelector("#rp-btn-debate-retry")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "retryInject" }, () => {});
    });
  }

  function renderSummary() {
    const opts = judgesList.length
      ? judgesList.map(j => `<option value="${escapeHtml(j.id)}" ${j.id === state.judgeId ? "selected" : ""}>${escapeHtml(j.name)}</option>`).join("")
      : `<option value="">（先添加参与者）</option>`;
    return `
      <div class="rp-section-title">裁判总结</div>
      <select class="rp-select" id="rp-judge">
        <option value="">选择裁判…</option>
        ${opts}
      </select>
      <button class="rp-btn primary" id="rp-btn-summary">📋 输出总结</button>
      <button class="rp-btn" id="rp-btn-export">📤 导出会话</button>
      <button class="rp-btn danger-soft" id="rp-btn-reset">⚡ 重置</button>
    `;
  }

  function bindSummary(root) {
    root.querySelector("#rp-btn-summary")?.addEventListener("click", () => {
      const judgeId = root.querySelector("#rp-judge")?.value;
      if (!judgeId) { alert("请先选择裁判"); return; }
      state.judgeId = judgeId;
      chrome.runtime.sendMessage({
        type: "summary",
        judgeId,
        customInstruction: "",
      }, (resp) => {
        if (resp && !resp.ok) alert(`总结失败：${resp.error || "未知错误"}`);
      });
    });
    root.querySelector("#rp-btn-export")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "exportSession" }, (resp) => {
        if (resp && !resp.ok) alert(`导出失败：${resp.error || "未知错误"}`);
      });
    });
    root.querySelector("#rp-btn-reset")?.addEventListener("click", () => {
      if (!confirm("重置当前会话上下文？所有未导出的内容会丢失。")) return;
      chrome.runtime.sendMessage({ type: "hardReset" }, () => {});
    });
  }

  function renderPpt() {
    const k = state.kind || "copy";
    const kindLabel = { copy: "📝 文案", image: "🎨 图片", pptx: "📊 PPT" }[k] || "?";
    return `
      <div class="rp-section-title">PPT 工坊</div>
      <div class="rp-empty" style="text-align:left;padding:6px 0;color:var(--ink)">
        当前已选：<strong>${kindLabel} 生成</strong><br>
        <br>
        Phase 1 阶段 PPT 完整工坊仍依赖 sidepanel —
        请点击下方按钮打开 sidepanel 完成。
      </div>
      <button class="rp-btn primary" id="rp-btn-open-sidepanel">在 sidepanel 打开 PPT 工坊</button>
      <button class="rp-btn" id="rp-btn-ppt-quick">⚡ 快速发送给 ChatGPT</button>
    `;
  }

  function bindPpt(root) {
    root.querySelector("#rp-btn-open-sidepanel")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "openSidepanel" }, () => {});
    });
    root.querySelector("#rp-btn-ppt-quick")?.addEventListener("click", () => {
      const text = prompt("快速发送 PPT 任务内容到 ChatGPT：", "请帮我设计一份 PPT");
      if (!text) return;
      chrome.runtime.sendMessage({
        type: "sendPromptToService",
        service: "chatgpt",
        text,
      }, () => {});
    });
  }

  async function refreshJudges() {
    try {
      const r = await new Promise(res => {
        chrome.runtime.sendMessage({ type: "getState" }, resp => res(resp || {}));
      });
      judgesList = (r.participants || []).map(p => ({ id: p.id, name: p.name || p.service }));
    } catch (_) {}
  }

  document.addEventListener("task:changed", (e) => {
    const d = e.detail || {};
    state.task = d.task || "ask";
    if (d.style) state.style = d.style;
    if (d.judgeId) { state.judgeId = d.judgeId; state.judgeName = d.judgeName; }
    if (d.kind) state.kind = d.kind;
    if (state.task === "summary") {
      refreshJudges().then(render);
    } else {
      render();
    }
    // 自动切到任务 Tab（仅当不是 ask）
    if (state.task !== "ask" && window.ChatRightPanel?.current !== "tasks") {
      window.ChatRightPanel?.activate("tasks");
    }
  });

  document.addEventListener("rp:activated", (e) => {
    if (e.detail?.tab === "tasks") {
      if (state.task === "summary") refreshJudges().then(render);
      else render();
    }
  });

  window.ChatTasks = { render, state: () => ({ ...state }) };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
