// popup-settings.js — 设置 Tab：主题 + 状态日志 + 快捷键
(function () {
  const THEMES = [
    { id: "C", name: "Aurora",  gradient: "linear-gradient(135deg,#5eead4,#a78bfa)" },
    { id: "A", name: "Dark",    gradient: "linear-gradient(135deg,#4f8cff,#6ee7ff)" },
    { id: "B", name: "Warm",    gradient: "linear-gradient(135deg,#b85c38,#e6d7c8)" },
    { id: "D", name: "Neon",    gradient: "linear-gradient(135deg,#ff2d95,#00f0ff)" },
    { id: "E", name: "Light",   gradient: "linear-gradient(135deg,#1a1a2e,#fff)" },
    { id: "F", name: "Sunset",  gradient: "linear-gradient(135deg,#ff8c42,#e84393)" },
  ];
  const THEME_KEY = "uiTheme";

  let currentTheme = "C";
  let logs = [];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function renderLogLine(line) {
    const ts = line.ts
      ? new Date(line.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      : "";
    const level = line.level || "info";
    const cls = level === "warn" ? "warn" : level === "error" || level === "err" ? "err" : level === "success" || level === "ok" ? "ok" : "";
    return `<div class="rp-log-line"><span class="t">[${ts}]</span><span class="${cls}">${escapeHtml(line.text || "")}</span></div>`;
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
        ${logs.length ? logs.map(renderLogLine).join("") : '<div class="rp-log-line"><span style="color:#aeaeb2">暂无日志</span></div>'}
      </div>

      <div class="rp-section-title">快捷键</div>
      <div class="rp-kbd-list">
        <div><span class="rp-kbd">Ctrl+Enter</span> 发送给全部</div>
        <div><span class="rp-kbd">Ctrl+Shift+D</span> 辩论</div>
        <div><span class="rp-kbd">@</span> 单发指定 AI</div>
        <div><span class="rp-kbd">@all</span> 显式全发</div>
      </div>
    `;

    root.querySelectorAll(".rp-theme-item").forEach(el => {
      el.addEventListener("click", () => setTheme(el.dataset.theme));
    });
  }

  function setTheme(id) {
    currentTheme = id;
    document.body.setAttribute("data-theme", id);
    try { chrome.storage.local.set({ [THEME_KEY]: id }); } catch (_) {}
    render();
    document.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme: id } }));
  }

  function pushLog(line) {
    logs.push(line);
    if (logs.length > 100) logs = logs.slice(-100);
    const box = document.getElementById("rp-log-box");
    if (!box) return;
    if (logs.length === 1) {
      box.innerHTML = renderLogLine(line);
    } else {
      box.insertAdjacentHTML("beforeend", renderLogLine(line));
    }
    box.scrollTop = box.scrollHeight;
  }

  async function refresh() {
    try {
      const r = await new Promise(res => {
        chrome.storage.local.get([THEME_KEY], resp => res(resp || {}));
      });
      if (r[THEME_KEY]) {
        currentTheme = r[THEME_KEY];
        document.body.setAttribute("data-theme", currentTheme);
      } else {
        document.body.setAttribute("data-theme", currentTheme);
      }
    } catch (_) {}
    render();
  }

  // 监听 background 推送的 status 消息当作 log
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "status" && msg.message) {
        pushLog({
          ts: Date.now(),
          text: msg.message,
          level: msg.level || "info",
        });
      }
    });
  } catch (_) {}

  document.addEventListener("rp:activated", (e) => {
    if (e.detail?.tab === "settings") refresh();
  });

  // 与顶部 🎨 按钮联动
  document.addEventListener("theme:cycle", () => {
    const ids = THEMES.map(t => t.id);
    const idx = ids.indexOf(currentTheme);
    const next = ids[(idx + 1) % ids.length];
    setTheme(next);
  });

  window.ChatSettings = {
    refresh,
    render,
    setTheme,
    currentTheme: () => currentTheme,
    pushLog,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
})();
