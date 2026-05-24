// popup-role-hats.js — 成员 Tab 的「角色帽」section
// v4.6.0: 5 顶通用角色帽（templates-builtin.js role.* binding）
// v4.6.1: silent-failure 审查修复（className / lastError / closeMenu 时序 / mention 用 service id / picker overflow / emoji 表）
// v4.6.2: 重大改造 — 分工映射 + marker block 替换 + 让 AI 自识别身份
//   旧问题（v4.6.1 之前）：广播模式所有 AI 戴同一顶帽子（同质化，非分工）；AI 无从识别自己身份。
//   新机制（参考 Hub _buildDutyHatPrompt）：
//     - 维护 currentAssignments = { aiId: binding } 映射
//     - 每次戴帽子 → update 映射 → 重拼分工 block → 替换输入框 marker block（不再追加多段）
//     - 每个 AI 看到完整分工表，自己根据网页平台名识别身份 → 只做自己那行
//     - picker 删除"全员广播"，加"❌ 取消该角色"

(function () {
  const ROLE_BINDINGS = [
    "role.clarifier",
    "role.fact_check",
    "role.critic",
    "role.judge",
    "role.action"
  ];

  // service id → 中文名（与 popup.js NAME 同步；用于分工表显示）
  const NAME_MAP = {
    claude: "Claude", gemini: "Gemini", chatgpt: "ChatGPT",
    deepseek: "DeepSeek", doubao: "豆包", qwen: "千问",
    kimi: "Kimi", yuanbao: "元宝", grok: "Grok"
  };

  const SERVICE_EMOJI = {
    claude: "🟧", gemini: "🔷", chatgpt: "🟢", deepseek: "🔵",
    doubao: "🥟", qwen: "🐫", kimi: "🌙", yuanbao: "💰", grok: "❌"
  };

  // v4.6.2: marker — 在 input 中插入 / 替换的分工 block 起始标记
  const ASSIGN_MARKER = "## 本轮角色分工";

  // 跨次操作累积的分工映射：{ aiId: binding }（popup 关闭重开会重置，非持久化）
  const currentAssignments = {};

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function showToast(msg) {
    const t = document.getElementById("tpl-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("tpl-toast-show");
    clearTimeout(t._hatTimer);
    t._hatTimer = setTimeout(() => t.classList.remove("tpl-toast-show"), 1800);
  }

  // ============== AI 选择菜单 ==============
  let menuEl = null;
  let outsideHandler = null;

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    if (outsideHandler) { document.removeEventListener("click", outsideHandler, true); outsideHandler = null; }
  }

  function openAiPickerMenu(anchorBtn, binding) {
    closeMenu();
    chrome.runtime.sendMessage({ type: "getState" }, (state) => {
      if (chrome.runtime.lastError) {
        console.warn("[RoleHats] getState failed:", chrome.runtime.lastError.message);
        showToast("背景脚本未就绪，请稍后重试");
        return;
      }
      const participants = Array.isArray(state?.participants) ? state.participants : [];
      const rect = anchorBtn.getBoundingClientRect();
      menuEl = document.createElement("div");
      menuEl.className = "rp-hat-picker";
      menuEl.style.position = "fixed";

      const Store = window.ArenaTemplateStore;
      const tpl = Store?.resolveTemplate(binding);
      const hatName = tpl?.name || binding;
      const hatEmoji = tpl?.emoji || "🎩";

      // v4.6.2 fix: 用 p.service 作 currentAssignments key（不是 p.id）
      //   - p.id = "p1"/"p2" 位置 slot ID（AI 不知道自己叫 p1）
      //   - p.service = "claude"/"gemini" 产品身份（AI 自识别用这个）
      //   - p.name = "Claude-1" 带 count 后缀（同 service 多实例时 count 递增，AI 自己不知道后缀）
      // 同 service 多实例（如用户加了 2 个 Claude）会共戴同一帽（合理：分工到 AI 产品级别）
      // 去重：若同 service 已出现，跳过后续实例（避免 picker 重复条目）
      const seenServices = new Set();
      const aiItems = participants.filter(p => {
        if (seenServices.has(p.service)) return false;
        seenServices.add(p.service);
        return true;
      }).map(p => {
        const curBinding = currentAssignments[p.service];
        const isThisHat = curBinding === binding;
        const otherTpl = (curBinding && curBinding !== binding) ? Store?.resolveTemplate(curBinding) : null;
        let suffix = "";
        if (isThisHat) suffix = ` <span class="rp-hat-pi-tag-cur">当前</span>`;
        else if (otherTpl) suffix = ` <span class="rp-hat-pi-tag-other">现戴 ${escapeHtml(otherTpl.emoji)}</span>`;
        const displayName = NAME_MAP[p.service] || p.service;   // 干净产品名（不带 -count 后缀）
        return {
          kind: "assign",
          id: p.service,   // ← key 改为 service id
          html: `<span class="rp-hat-pi-em">${escapeHtml(SERVICE_EMOJI[p.service] || "🤖")}</span><span>${escapeHtml(displayName)}</span>${suffix}`
        };
      });

      // 取消选项（只在有人戴本帽时显示）
      const someoneHasThisHat = Object.values(currentAssignments).includes(binding);
      const cancelItems = someoneHasThisHat
        ? [{
            kind: "cancel_this",
            id: "__cancel_this__",
            html: `<span class="rp-hat-pi-em">❌</span><span>取消所有人的「${escapeHtml(hatName)}」</span>`
          }]
        : [];
      const items = [...aiItems, ...cancelItems];

      const header = `<div class="rp-hat-picker-header">指派 ${escapeHtml(hatEmoji)} ${escapeHtml(hatName)} 给：</div>`;
      const body = items.length === 0
        ? `<div class="rp-hat-picker-empty">先在上方添加 AI 参与者</div>`
        : items.map(it => `
            <button class="rp-hat-picker-item" data-target="${escapeHtml(it.id)}" data-kind="${it.kind}">
              ${it.html}
            </button>
          `).join("");

      menuEl.innerHTML = header + body;
      document.body.appendChild(menuEl);

      // viewport clamp
      const menuRect = menuEl.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const left = Math.max(8, Math.min(rect.left, vw - menuRect.width - 8));
      const top = (rect.bottom + 4 + menuRect.height > vh)
        ? Math.max(8, rect.top - menuRect.height - 4)
        : (rect.bottom + 4);
      menuEl.style.left = `${left}px`;
      menuEl.style.top = `${top}px`;

      menuEl.querySelectorAll(".rp-hat-picker-item").forEach(btn => {
        btn.addEventListener("click", () => {
          handlePickerChoice(binding, btn.dataset.target, btn.dataset.kind);
        });
      });

      outsideHandler = (e) => {
        if (menuEl && !menuEl.contains(e.target) && e.target !== anchorBtn) closeMenu();
      };
      setTimeout(() => document.addEventListener("click", outsideHandler, true), 0);
    });
  }

  // ============== 处理 picker 选择 ==============
  function handlePickerChoice(binding, targetId, kind) {
    if (kind === "cancel_this") {
      for (const aid of Object.keys(currentAssignments)) {
        if (currentAssignments[aid] === binding) delete currentAssignments[aid];
      }
    } else if (kind === "assign") {
      currentAssignments[targetId] = binding;
    }
    rebuildAssignmentBlock();
    refreshHatBarBadges();
    closeMenu();
    renderHatsBar();  // 刷新顶部"清空 (N)"按钮
  }

  // ============== 拼分工 block + 替换 input marker ==============
  function buildAssignmentBlock() {
    const ids = Object.keys(currentAssignments);
    if (ids.length === 0) return "";
    const Store = window.ArenaTemplateStore;
    // marker 行内合并身份识别提示 — 这样整个 block 严格只由 marker + 后续连续的 - / "  " 行组成，
    // 替换 regex 简单稳定（不依赖任何 trailing 提示行）。
    const lines = [
      ASSIGN_MARKER + " — 请各位根据自己所在网页平台名（Claude / Gemini / ChatGPT 等）识别身份，仅按你那一行的职责发言；列表外的 AI 请说明「未分配角色，仅就用户问题客观作答」。"
    ];
    for (const aid of ids) {
      const binding = currentAssignments[aid];
      const tpl = Store?.resolveTemplate(binding);
      const duty = Store?.resolve(binding, "duty") || "";
      const format = Store?.resolve(binding, "format") || "";
      const aiName = NAME_MAP[aid] || aid;
      const emoji = tpl?.emoji || "🎩";
      const label = tpl?.name || binding;
      lines.push(`- ${aiName} → 「${label}」(${emoji})：${duty}`);
      lines.push(`  输出格式：${format}`);
    }
    return lines.join("\n");
  }

  function rebuildAssignmentBlock() {
    const block = buildAssignmentBlock();
    const box = document.getElementById("chat-input");
    if (!box) return;
    const cur = box.textContent || "";
    // marker 替换：从 ## 本轮角色分工 开始，匹配后续连续的 -开头 / "  "开头 行（block 内容）
    //              直到遇到不属于 block 的行（用户问题部分）或文末
    const escMarker = ASSIGN_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blockRe = new RegExp(`${escMarker}[^\\n]*(?:\\n(?:- [^\\n]*|  [^\\n]*))*`, "");
    let next;
    if (!block) {
      next = cur.replace(blockRe, "").replace(/^\n+/, "");
    } else if (blockRe.test(cur)) {
      next = cur.replace(blockRe, block);
    } else {
      next = cur ? block + "\n\n" + cur : block;
    }
    box.textContent = next;
    box.classList.add("tpl-input-flash");
    setTimeout(() => box.classList.remove("tpl-input-flash"), 600);
    box.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(box);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
    box.dispatchEvent(new Event("input", { bubbles: true }));
    const count = Object.keys(currentAssignments).length;
    showToast(count === 0 ? "已清空分工" : `已更新分工（${count} 人）`);
  }

  // ============== 帽子按钮 badge：当前已戴该帽的 AI 数 ==============
  function refreshHatBarBadges() {
    document.querySelectorAll("#rp-panel-members .rp-hat-btn").forEach(btn => {
      const binding = btn.dataset.binding;
      const count = Object.values(currentAssignments).filter(b => b === binding).length;
      let badge = btn.querySelector(".rp-hat-badge");
      if (count > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "rp-hat-badge";
          btn.appendChild(badge);
        }
        badge.textContent = String(count);
      } else if (badge) {
        badge.remove();
      }
    });
  }

  // ============== Members Tab 渲染 ==============
  function renderHatsBar() {
    const panel = document.getElementById("rp-panel-members");
    if (!panel) return;
    let bar = panel.querySelector(".rp-hat-section");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "rp-hat-section";
      const lbTitle = panel.querySelector(".rp-lb-title");
      if (lbTitle) panel.insertBefore(bar, lbTitle);
      else panel.appendChild(bar);
    }
    const Store = window.ArenaTemplateStore;
    const hats = ROLE_BINDINGS.map(b => Store?.resolveTemplate(b)).filter(Boolean);
    const totalAssigned = Object.keys(currentAssignments).length;
    bar.innerHTML = `
      <div class="rp-section-title">
        <span>角色帽</span>
        <span class="rp-hat-hint">点击 → 选 AI → 自动写入分工到输入框</span>
        <span class="rp-hat-spacer"></span>
        ${totalAssigned > 0
          ? `<button class="rp-hat-clear-all" id="rp-hat-clear-all" title="清空全部分工 + 移除输入框分工 block">清空 (${totalAssigned})</button>`
          : ""}
      </div>
      <div class="rp-hat-bar">
        ${hats.map(h => `
          <button class="rp-hat-btn" data-binding="${escapeHtml(h.binding)}" title="${escapeHtml(h.fields[0]?.value || "")}">
            <span class="rp-hat-em">${escapeHtml(h.emoji)}</span>
            <span class="rp-hat-label">${escapeHtml(h.name)}</span>
          </button>
        `).join("")}
      </div>
    `;
    bar.querySelectorAll(".rp-hat-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openAiPickerMenu(btn, btn.dataset.binding);
      });
    });
    const clearBtn = bar.querySelector("#rp-hat-clear-all");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        for (const k of Object.keys(currentAssignments)) delete currentAssignments[k];
        rebuildAssignmentBlock();
        refreshHatBarBadges();
        renderHatsBar();
      });
    }
    refreshHatBarBadges();
  }

  // ============== 触发 ==============
  document.addEventListener("rp:activated", (e) => {
    if (e.detail?.tab === "members") setTimeout(renderHatsBar, 0);
  });

  function watchMembersPanel() {
    const panel = document.getElementById("rp-panel-members");
    if (!panel) { setTimeout(watchMembersPanel, 300); return; }
    const obs = new MutationObserver(() => {
      if (!panel.querySelector(".rp-hat-section")) renderHatsBar();
    });
    obs.observe(panel, { childList: true });
    renderHatsBar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchMembersPanel);
  } else {
    watchMembersPanel();
  }

  // v4.6.2: 暴露 API 给 E2E
  window.ArenaRoleHats = {
    ROLE_BINDINGS,
    getAssignments: () => ({ ...currentAssignments }),
    assignHat: (aiId, binding) => {
      currentAssignments[aiId] = binding;
      rebuildAssignmentBlock();
      refreshHatBarBadges();
      renderHatsBar();
    },
    clearAll: () => {
      for (const k of Object.keys(currentAssignments)) delete currentAssignments[k];
      rebuildAssignmentBlock();
      refreshHatBarBadges();
      renderHatsBar();
    },
    buildAssignmentBlock,
    ASSIGN_MARKER
  };
})();
