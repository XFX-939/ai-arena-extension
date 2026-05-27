# 敏感信息守门员 v4.9.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 AI Arena v4.9.0 敏感信息守门员 MVP — 发送 prompt 时本地扫描敏感信息，命中弹窗给用户 3 选项（自动打码 / 取消 / 加入白名单继续）

**Architecture:** background 集中拦截 — 所有发送链路（chatBroadcast / debateRound / summary / sendPromptToService / broadcast）经 `guardedSend()` wrapper 扫描，命中 return `{ ok:false, reason:"sensitive_blocked", hits, masked, original }`；popup 端通过 `ChatGatekeeperBridge` 统一弹 modal + 重发。

**Tech Stack:** Chrome MV3 扩展 / vanilla JS / chrome.storage.local / 复用 v4.8.65 ChatModal

**Spec:** `docs/superpowers/specs/2026-05-27-sensitive-info-gatekeeper-design.md`

**Worktree:** 建议在 `ai-arena-extension-v490` worktree 内执行（命令在 Task 0）。

---

## File Structure

### 新增文件（4 个）

| 文件 | 责任 |
|---|---|
| `src/gatekeeper-rules.js` | 内置词表数据（BUILTIN_RULES） |
| `src/gatekeeper-store.js` | chrome.storage 抽象 — loadRules / loadWhitelist / addWhitelist / saveStats |
| `src/gatekeeper-engine.js` | 扫描引擎 — scan(text) / maskText(text, hits) |
| `src/popup-gatekeeper-bridge.js` | popup 端公共桥接 — handleResp(originalMsg, resp, opts) |

### 改造文件（7 个）

| 文件 | 改动 |
|---|---|
| `src/manifest.json` | importScripts 加 3 个 gatekeeper-*.js；version 4.8.67 → 4.9.0 |
| `src/background.js` | importScripts 引入；新增 `guardedSend()` wrapper；5 个 handler 包裹 |
| `src/popup-modal.js` | 新增 `showSensitiveBlocked()` API |
| `src/popup.css` | modal 命中清单 + masked 预览 + diff 样式 |
| `src/popup.html` | 引入 popup-gatekeeper-bridge.js；version 文本 4.8.67 → 4.9.0 |
| `src/popup-tasks.js` | bindDebate 收到 sensitive_blocked 调 bridge |
| `src/popup-task-menu.js` | dispatch 收到 sensitive_blocked 调 bridge |
| `src/sidepanel.html` | 2 处版本号 4.8.67 → 4.9.0 |
| `tests/e2e/smoke.mjs` | 加 v4.9.0 静态 + 运行时断言；版本号 4.8.67 → 4.9.0 |

---

## Task 0: 建 worktree + rebase 到 main

**Files:** 无新增/修改，纯环境

- [ ] **Step 1: 进 worktree**

执行（Claude Code 内调 EnterWorktree 工具）：
```
EnterWorktree(name="ai-arena-extension-v490")
```

- [ ] **Step 2: 确认 base 是最新 main HEAD**

```bash
git log -1 --oneline
```

预期输出包含 `merge: v4.8.67`。如果不是最新（worktree 是从 origin/main 创建可能落后），rebase：
```bash
git rebase main
```

- [ ] **Step 3: 当前测试基线快照**

```bash
node tests/e2e/smoke.mjs 2>&1 | tail -2
```

预期：`==== 446 passed, 0 failed ====`

记下基线数字（446）。后续 v4.9.0 应加约 15-20 条新断言。

---

## Task 1: gatekeeper-rules.js — 内置词表数据

**Files:**
- Create: `src/gatekeeper-rules.js`
- Test: `tests/e2e/smoke.mjs`（追加静态断言）

- [ ] **Step 1: 写 BUILTIN_RULES 数据文件**

`src/gatekeeper-rules.js`:
```javascript
// gatekeeper-rules.js — v4.9.0 内置敏感词规则
// 纯数据，无逻辑。被 gatekeeper-store.js 在首次启动时注入到 chrome.storage
// 用户和团队可在此基础上扩展（v4.9.1 设置页 + 团队包）

(function () {
  const BUILTIN_RULES = [
    // ── 正则类（高准确率） ──
    {
      id: "huawei-staff-id",
      category: "工号",
      type: "regex",
      pattern: "\\b[A-Z]?\\d{8}\\b",
      flags: "g",
      severity: "block",
      source: "builtin",
      enabled: true,
      desc: "华为工号：可选字母前缀 + 8 位数字",
    },
    {
      id: "internal-ip-10",
      category: "内网 IP",
      type: "regex",
      pattern: "\\b10\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)){2}\\b",
      flags: "g",
      severity: "block",
      source: "builtin",
      enabled: true,
      desc: "10.x.x.x 段内网 IP",
    },
    {
      id: "internal-ip-172",
      category: "内网 IP",
      type: "regex",
      pattern: "\\b172\\.(1[6-9]|2\\d|3[01])(?:\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)){2}\\b",
      flags: "g",
      severity: "block",
      source: "builtin",
      enabled: true,
      desc: "172.16-31.x.x 段内网 IP",
    },
    {
      id: "internal-ip-192",
      category: "内网 IP",
      type: "regex",
      pattern: "\\b192\\.168(?:\\.(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)){2}\\b",
      flags: "g",
      severity: "block",
      source: "builtin",
      enabled: true,
      desc: "192.168.x.x 段内网 IP",
    },
    {
      id: "huawei-email",
      category: "内部邮箱",
      type: "regex",
      pattern: "\\b[\\w.+-]+@huawei\\.com\\b",
      flags: "gi",
      severity: "block",
      source: "builtin",
      enabled: true,
      desc: "华为邮箱 (*@huawei.com)",
    },
    {
      id: "mobile-phone-cn",
      category: "手机号",
      type: "regex",
      pattern: "\\b1[3-9]\\d{9}\\b",
      flags: "g",
      severity: "block",
      source: "builtin",
      enabled: true,
      desc: "中国大陆手机号（11 位）",
    },
    {
      id: "huawei-internal-domain",
      category: "内部域名",
      type: "regex",
      pattern: "\\b(?:[\\w-]+\\.)+(?:huawei\\.com\\.cn|hi\\.huawei\\.com|w3\\.huawei\\.com|inhuawei\\.com)\\b",
      flags: "gi",
      severity: "block",
      source: "builtin",
      enabled: true,
      desc: "华为内网子域名（hi.huawei.com / w3.huawei.com 等）",
    },

    // ── 词表类（literal-list）──
    {
      id: "carrier-cn",
      category: "客户",
      type: "literal-list",
      pattern: ["中国移动", "中国电信", "中国联通", "中国广电"],
      severity: "block",
      source: "builtin",
      enabled: true,
      desc: "国内运营商客户名",
    },
    {
      id: "strategic-keywords",
      category: "保密词",
      type: "literal-list",
      pattern: ["保密", "未公开", "投标价", "议价", "内部资料"],
      severity: "warn",
      source: "builtin",
      enabled: true,
      desc: "战略关键词 — 软提醒，弹窗标黄不强阻",
    },
  ];

  // 暴露给 background service worker 和 popup（双端共用）
  if (typeof self !== "undefined") self.BUILTIN_RULES = BUILTIN_RULES;
  if (typeof window !== "undefined") window.BUILTIN_RULES = BUILTIN_RULES;
})();
```

- [ ] **Step 2: 加静态断言到 smoke.mjs**

在 `tests/e2e/smoke.mjs` 末尾"v4.8.67"断言块之后追加：

```javascript
  // ── v4.9.0 ①: gatekeeper-rules.js 内置词表 ──
  const rulesJsV490 = fs.readFileSync(path.join(EXT_PATH, "gatekeeper-rules.js"), "utf8");
  check("v4.9.0 ①: gatekeeper-rules.js 暴露 BUILTIN_RULES 含 5 类正则 + 2 个词表",
    /self\.BUILTIN_RULES\s*=/.test(rulesJsV490) &&
    /id:\s*"huawei-staff-id"/.test(rulesJsV490) &&
    /id:\s*"internal-ip-10"/.test(rulesJsV490) &&
    /id:\s*"huawei-email"/.test(rulesJsV490) &&
    /id:\s*"mobile-phone-cn"/.test(rulesJsV490) &&
    /id:\s*"carrier-cn"/.test(rulesJsV490) &&
    /id:\s*"strategic-keywords"/.test(rulesJsV490),
    "gatekeeper-rules.js 词表不完整");
```

- [ ] **Step 3: 跑 smoke.mjs 验证**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0|fail"
```

预期：`✓ v4.9.0 ①: gatekeeper-rules.js 暴露 BUILTIN_RULES...` + `0 failed`

- [ ] **Step 4: commit**

```bash
git add src/gatekeeper-rules.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-1): gatekeeper-rules 内置词表（5 正则 + 2 词表类）"
```

---

## Task 2: gatekeeper-store.js — storage 抽象层

**Files:**
- Create: `src/gatekeeper-store.js`
- Test: `tests/e2e/smoke.mjs`

- [ ] **Step 1: 写 store 模块**

`src/gatekeeper-store.js`:
```javascript
// gatekeeper-store.js — v4.9.0 chrome.storage 抽象
// 提供 loadRules / loadWhitelist / addWhitelist / saveStats 等纯数据操作
// 双端共用（background service worker + popup）

(function () {
  const KEY_ENABLED   = "gatekeeper.enabled";
  const KEY_USER      = "gatekeeper.rules.user";
  const KEY_TEAM      = "gatekeeper.rules.team";
  const KEY_WHITELIST = "gatekeeper.whitelist";
  const KEY_STATS     = "gatekeeper.stats";

  async function _get(keys) {
    return new Promise(res => chrome.storage.local.get(keys, r => res(r || {})));
  }
  async function _set(obj) {
    return new Promise(res => chrome.storage.local.set(obj, () => res()));
  }

  async function isEnabled() {
    const r = await _get([KEY_ENABLED]);
    return r[KEY_ENABLED] !== false;   // 默认启用
  }

  async function setEnabled(v) {
    await _set({ [KEY_ENABLED]: !!v });
  }

  // 加载全部启用规则：builtin（self.BUILTIN_RULES）+ user + team
  async function loadRules() {
    const r = await _get([KEY_USER, KEY_TEAM]);
    const builtin = (typeof self !== "undefined" && self.BUILTIN_RULES)
                  || (typeof window !== "undefined" && window.BUILTIN_RULES)
                  || [];
    const all = [...builtin, ...(r[KEY_USER] || []), ...(r[KEY_TEAM] || [])];
    return all.filter(rule => rule.enabled !== false);
  }

  async function loadWhitelist() {
    const r = await _get([KEY_WHITELIST]);
    return r[KEY_WHITELIST] || {};
  }

  async function addWhitelist(words, note) {
    const wl = await loadWhitelist();
    const ts = Date.now();
    for (const w of words) {
      if (!wl[w]) wl[w] = { addedAt: ts, note: note || "" };
    }
    await _set({ [KEY_WHITELIST]: wl });
  }

  async function removeWhitelist(word) {
    const wl = await loadWhitelist();
    delete wl[word];
    await _set({ [KEY_WHITELIST]: wl });
  }

  async function loadStats() {
    const r = await _get([KEY_STATS]);
    return r[KEY_STATS] || { hits: 0, masked: 0, skipped: 0, cancelled: 0 };
  }

  async function bumpStat(key) {
    const s = await loadStats();
    s[key] = (s[key] || 0) + 1;
    await _set({ [KEY_STATS]: s });
  }

  const api = {
    isEnabled, setEnabled,
    loadRules, loadWhitelist, addWhitelist, removeWhitelist,
    loadStats, bumpStat,
  };
  if (typeof self !== "undefined")   self.GatekeeperStore   = api;
  if (typeof window !== "undefined") window.GatekeeperStore = api;
})();
```

- [ ] **Step 2: 加静态断言**

在 smoke.mjs 的 v4.9.0 块追加：

```javascript
  // ── v4.9.0 ②: gatekeeper-store.js storage 抽象 ──
  const storeJsV490 = fs.readFileSync(path.join(EXT_PATH, "gatekeeper-store.js"), "utf8");
  check("v4.9.0 ②: gatekeeper-store 暴露 6 个核心 API",
    /self\.GatekeeperStore\s*=/.test(storeJsV490) &&
    /isEnabled,\s*setEnabled,/.test(storeJsV490) &&
    /loadRules,/.test(storeJsV490) &&
    /loadWhitelist,\s*addWhitelist,\s*removeWhitelist/.test(storeJsV490) &&
    /loadStats,\s*bumpStat/.test(storeJsV490),
    "gatekeeper-store API 不完整");
  check("v4.9.0 ②: 默认启用（isEnabled 未设值返回 true）",
    /\[KEY_ENABLED\]\s*!==\s*false/.test(storeJsV490),
    "默认启用语义不对");
```

- [ ] **Step 3: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ②|fail"
```

预期：2 条 v4.9.0 ② 全 ✓ + 0 failed

- [ ] **Step 4: commit**

```bash
git add src/gatekeeper-store.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-2): gatekeeper-store chrome.storage 抽象层"
```

---

## Task 3: gatekeeper-engine.js — 扫描引擎

**Files:**
- Create: `src/gatekeeper-engine.js`
- Test: `tests/e2e/smoke.mjs`

- [ ] **Step 1: 写 engine 模块**

`src/gatekeeper-engine.js`:
```javascript
// gatekeeper-engine.js — v4.9.0 敏感信息扫描引擎
// scan(text) → Hit[]，maskText(text, hits) → string
// 简单 for-loop 逐 rule exec，MVP 不做 mega-regex（10 几条规则总 < 10ms 够用）
// 100ms 超时兜底防 ReDoS

(function () {
  const SCAN_TIMEOUT_MS = 100;

  // 把 rule 编译成 RegExp 或 literal RegExp
  function compileRule(rule) {
    if (rule.type === "regex") {
      try { return new RegExp(rule.pattern, rule.flags || "g"); }
      catch (e) { console.warn("[Gatekeeper] bad regex", rule.id, e); return null; }
    }
    if (rule.type === "literal" || rule.type === "literal-list") {
      const words = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern];
      const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      try { return new RegExp("(?:" + escaped.join("|") + ")", "g"); }
      catch (e) { console.warn("[Gatekeeper] bad literal", rule.id, e); return null; }
    }
    return null;
  }

  async function scan(text) {
    if (!text || typeof text !== "string") return [];
    const Store = (self.GatekeeperStore || window.GatekeeperStore);
    if (!Store) return [];

    const enabled = await Store.isEnabled();
    if (!enabled) return [];

    const rules = await Store.loadRules();
    const whitelist = await Store.loadWhitelist();
    const hits = [];

    const deadline = Date.now() + SCAN_TIMEOUT_MS;
    for (const rule of rules) {
      if (Date.now() > deadline) {
        console.warn("[Gatekeeper] scan timeout, returning partial hits");
        break;
      }
      const re = compileRule(rule);
      if (!re) continue;
      let m;
      // 用新对象避免 lastIndex 串扰
      const localRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      while ((m = localRe.exec(text)) !== null) {
        const matched = m[0];
        if (whitelist[matched]) continue;
        hits.push({
          rule: rule.id,
          category: rule.category,
          text: matched,
          index: m.index,
          length: matched.length,
          masked: `<${rule.category}>`,
          severity: rule.severity || "block",
        });
        if (m.index === localRe.lastIndex) localRe.lastIndex++;  // 防 0-width 死循环
      }
    }

    // 按 index 升序返回（用户视觉顺序）
    return hits.sort((a, b) => a.index - b.index);
  }

  function maskText(text, hits) {
    if (!hits || !hits.length) return text;
    // 按 index 倒序替换，避免 offset 错乱
    const sorted = [...hits].sort((a, b) => b.index - a.index);
    let result = text;
    for (const h of sorted) {
      result = result.slice(0, h.index) + h.masked + result.slice(h.index + h.length);
    }
    return result;
  }

  // 仅判断有没有 block 级命中（warn 不算）— 给"是否阻断"的判定
  function hasBlocking(hits) {
    return hits.some(h => h.severity !== "warn");
  }

  const api = { scan, maskText, hasBlocking };
  if (typeof self !== "undefined")   self.GatekeeperEngine   = api;
  if (typeof window !== "undefined") window.GatekeeperEngine = api;
})();
```

- [ ] **Step 2: 加静态断言 + 运行时断言**

在 smoke.mjs v4.9.0 块追加：

```javascript
  // ── v4.9.0 ③: gatekeeper-engine.js 扫描引擎 ──
  const engineJsV490 = fs.readFileSync(path.join(EXT_PATH, "gatekeeper-engine.js"), "utf8");
  check("v4.9.0 ③: gatekeeper-engine 暴露 scan / maskText / hasBlocking",
    /self\.GatekeeperEngine\s*=/.test(engineJsV490) &&
    /scan,\s*maskText,\s*hasBlocking/.test(engineJsV490),
    "engine API 不完整");
  check("v4.9.0 ③: scan 含 100ms 超时兜底（防 ReDoS）",
    /SCAN_TIMEOUT_MS\s*=\s*100/.test(engineJsV490) &&
    /Date\.now\(\)\s*>\s*deadline/.test(engineJsV490),
    "scan 缺超时兜底");
  check("v4.9.0 ③: scan 接 whitelist 跳过 + 按 index 倒序 mask",
    /if\s*\(whitelist\[matched\]\)\s*continue/.test(engineJsV490) &&
    /sort\(\(a,\s*b\)\s*=>\s*b\.index\s*-\s*a\.index\)/.test(engineJsV490),
    "engine 行为不符 spec");

  // 运行时：popup 中 eval scan/mask（service worker 那边 background 已 import）
  // 但 popup 还没 import engine，跳过运行时；放 task 13 做 e2e 一起
```

- [ ] **Step 3: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ③|fail"
```

预期：3 条 v4.9.0 ③ 全 ✓ + 0 failed

- [ ] **Step 4: commit**

```bash
git add src/gatekeeper-engine.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-3): gatekeeper-engine scan + maskText（100ms 超时兜底）"
```

---

## Task 4: manifest.json + background.js importScripts

**Files:**
- Modify: `src/manifest.json`
- Modify: `src/background.js`（importScripts 行）

- [ ] **Step 1: manifest.json importScripts 加 3 个**

注意：MV3 manifest **不显式列 importScripts**，background.js 自己用 importScripts 加载。manifest 只声明 service_worker 入口。所以这步实际改的是 background.js 的 importScripts 调用。

打开 `src/background.js` 第 1-10 行附近找到 importScripts 那行，在末尾加 3 个新文件：

```javascript
// 改前（v4.8.67）
importScripts("selectors-config.js", "state-machine.js", "templates-builtin.js", "template-store.js", "debate-engine.js", "cdp-extractor.js", "chat-bus.js", "ppt-prompts.js", "debate-summary-template.js");
```

改成：
```javascript
// v4.9.0: 加入 gatekeeper 三个模块（rules → store → engine 顺序）
importScripts("selectors-config.js", "state-machine.js", "templates-builtin.js", "template-store.js", "debate-engine.js", "cdp-extractor.js", "chat-bus.js", "ppt-prompts.js", "debate-summary-template.js", "gatekeeper-rules.js", "gatekeeper-store.js", "gatekeeper-engine.js");
```

- [ ] **Step 2: 加静态断言**

```javascript
  // ── v4.9.0 ④: background.js importScripts 加 3 个 gatekeeper-*.js ──
  const bgV490 = fs.readFileSync(path.join(EXT_PATH, "background.js"), "utf8");
  check("v4.9.0 ④: background.js importScripts 含 gatekeeper-rules/store/engine",
    /importScripts\([^)]*"gatekeeper-rules\.js"[^)]*"gatekeeper-store\.js"[^)]*"gatekeeper-engine\.js"/.test(bgV490),
    "background.js importScripts 缺 gatekeeper 模块");
```

- [ ] **Step 3: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ④|fail"
```

预期：1 条 ✓ + 0 failed

- [ ] **Step 4: commit**

```bash
git add src/background.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-4): background.js importScripts 加载 gatekeeper 3 模块"
```

---

## Task 5: background.js guardedSend wrapper

**Files:**
- Modify: `src/background.js`（新增函数）

- [ ] **Step 1: 在 background.js 找合适位置加 guardedSend**

定位：找 `notifyStatus` 函数定义之后（约 line 1629 附近），加新函数：

```javascript
// v4.9.0: 敏感信息守门员 wrapper — 所有发送 handler 走这里扫一次
//   { text, handler, msg } → 命中则返回 { ok:false, reason:"sensitive_blocked", hits, masked, original }
//   不命中或 msg.skipGatekeeper === true → 直接调 handler() return 结果
//   handler 是不带参数的函数（闭包捕获 msg.* 等）
async function guardedSend({ text, handler, msg }) {
  try {
    if (msg?.skipGatekeeper) return await handler();
    const Store = self.GatekeeperStore;
    const Engine = self.GatekeeperEngine;
    if (!Store || !Engine) return await handler();   // 守门员未加载，降级放行
    if (!(await Store.isEnabled())) return await handler();
    if (typeof text !== "string" || !text.trim()) return await handler();

    const hits = await Engine.scan(text);
    if (!hits.length) return await handler();

    // 命中 → 不走 handler，return reason 给 popup
    const masked = Engine.maskText(text, hits);
    try { await Store.bumpStat("hits"); } catch (_) {}
    return { ok: false, reason: "sensitive_blocked", hits, masked, original: text };
  } catch (e) {
    console.warn("[Gatekeeper] guardedSend error, falling back to handler:", e);
    return await handler();
  }
}
```

- [ ] **Step 2: 加静态断言**

```javascript
  // ── v4.9.0 ⑤: background.js guardedSend wrapper ──
  check("v4.9.0 ⑤: background.js 含 async function guardedSend",
    /async function guardedSend\(\{\s*text,\s*handler,\s*msg\s*\}\)/.test(bgV490),
    "缺 guardedSend 函数");
  check("v4.9.0 ⑤: guardedSend 检查 skipGatekeeper + isEnabled + return reason:sensitive_blocked",
    /msg\?\.skipGatekeeper/.test(bgV490) &&
    /Store\.isEnabled\(\)/.test(bgV490) &&
    /reason:\s*"sensitive_blocked"/.test(bgV490) &&
    /hits,\s*masked,\s*original/.test(bgV490),
    "guardedSend 行为不符 spec");
  check("v4.9.0 ⑤: guardedSend 异常时降级放行（try/catch）",
    /catch\s*\(e\)\s*\{[\s\S]{0,200}falling back to handler/.test(bgV490),
    "guardedSend 缺异常降级");
```

注：smoke.mjs 已经 readFile 过 background.js（bgV490），在 task 4 加的断言之后追加即可。

- [ ] **Step 3: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ⑤|fail"
```

预期：3 条 ✓ + 0 failed

- [ ] **Step 4: commit**

```bash
git add src/background.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-5): background.js guardedSend wrapper（命中 return reason）"
```

---

## Task 6: background.js 5 个 handler 接入 guardedSend

**Files:**
- Modify: `src/background.js`（5 处 case）

- [ ] **Step 1: 改 `case "broadcast"`（line 397）**

```javascript
// 改前
case "broadcast":         sendResponse(await handleBroadcast(msg.text, msg.images)); break;

// 改后
case "broadcast":
  sendResponse(await guardedSend({
    text: msg.text || "",
    msg,
    handler: () => handleBroadcast(msg.text, msg.images),
  }));
  break;
```

- [ ] **Step 2: 改 `case "debateRound"`（line 398）**

```javascript
// 改前
case "debateRound":       sendResponse(await handleDebateRound(msg.style, msg.guidance, msg.concise, msg.force)); break;

// 改后
case "debateRound":
  sendResponse(await guardedSend({
    text: msg.guidance || "",
    msg,
    handler: () => handleDebateRound(msg.style, msg.guidance, msg.concise, msg.force),
  }));
  break;
```

- [ ] **Step 3: 改 `case "summary"`（line 399）**

```javascript
// 改前
case "summary":           sendResponse(await handleSummary(msg.judgeId, msg.customInstruction, msg.format)); break;

// 改后
case "summary":
  sendResponse(await guardedSend({
    text: msg.customInstruction || "",
    msg,
    handler: () => handleSummary(msg.judgeId, msg.customInstruction, msg.format),
  }));
  break;
```

- [ ] **Step 4: 改 `case "sendPromptToService"`（line 403）**

```javascript
// 改前
case "sendPromptToService": sendResponse(await sendPromptToService(msg.service || "chatgpt", msg.text || "")); break;

// 改后
case "sendPromptToService":
  sendResponse(await guardedSend({
    text: msg.text || "",
    msg,
    handler: () => sendPromptToService(msg.service || "chatgpt", msg.text || ""),
  }));
  break;
```

- [ ] **Step 5: 改 `case "chatBroadcast"`（line 449-450）**

定位现有代码（line 449-450）：
```javascript
case "chatBroadcast":
  sendResponse(await ChatBus.broadcast(msg.text, msg.targets || [], msg.images || [])); break;
```

改成：
```javascript
case "chatBroadcast":
  sendResponse(await guardedSend({
    text: msg.text || "",
    msg,
    handler: () => ChatBus.broadcast(msg.text, msg.targets || [], msg.images || []),
  }));
  break;
```

- [ ] **Step 6: 加静态断言**

```javascript
  // ── v4.9.0 ⑥: 5 个 handler 都包了 guardedSend ──
  check("v4.9.0 ⑥: case 'broadcast' 走 guardedSend",
    /case\s+"broadcast":\s*\n\s*sendResponse\(await guardedSend/.test(bgV490),
    "case broadcast 没接 guardedSend");
  check("v4.9.0 ⑥: case 'debateRound' 用 msg.guidance 做 text",
    /case\s+"debateRound":[\s\S]{0,200}text:\s*msg\.guidance/.test(bgV490),
    "case debateRound 没接或字段不对");
  check("v4.9.0 ⑥: case 'summary' 用 msg.customInstruction 做 text",
    /case\s+"summary":[\s\S]{0,200}text:\s*msg\.customInstruction/.test(bgV490),
    "case summary 没接或字段不对");
  check("v4.9.0 ⑥: case 'sendPromptToService' 走 guardedSend",
    /case\s+"sendPromptToService":[\s\S]{0,300}guardedSend/.test(bgV490),
    "case sendPromptToService 没接");
  check("v4.9.0 ⑥: case 'chatBroadcast' 走 guardedSend",
    /case\s+"chatBroadcast":[\s\S]{0,300}guardedSend/.test(bgV490),
    "case chatBroadcast 没接");
```

- [ ] **Step 7: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ⑥|fail"
```

预期：5 条 ✓ + 0 failed

- [ ] **Step 8: commit**

```bash
git add src/background.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-6): 5 个发送 handler 接入 guardedSend（broadcast/debateRound/summary/sendPromptToService/chatBroadcast）"
```

---

## Task 7: popup-modal.js — showSensitiveBlocked

**Files:**
- Modify: `src/popup-modal.js`（新增方法）

- [ ] **Step 1: 在 ChatModal 暴露的 API 加 showSensitiveBlocked**

找到 popup-modal.js 末尾的 `window.ChatModal = { ... };` 行，在它之前加新函数：

```javascript
  // v4.9.0: 敏感信息守门员命中专用 modal
  //   ctx: { hits: Hit[], masked: string, original: string }
  //   handlers: { onMask(masked), onConfirm(original, hits), onCancel() }
  function showSensitiveBlocked(ctx, handlers) {
    const { hits = [], masked = "", original = "" } = ctx || {};
    const n = hits.length;

    // 命中清单 HTML — 每条一行 "类别 高亮原文"
    const hitsHtml = hits.map(h => `
      <div class="gk-hit-row">
        <span class="gk-hit-cat">${escapeHtml(h.category)}</span>
        <span class="gk-hit-text">${escapeHtml(h.text)}</span>
      </div>
    `).join("");

    // masked 预览 — 简单 escape + 把 <类别> 包成 highlight span
    const previewHtml = escapeHtml(masked).replace(
      /&lt;([^&]+?)&gt;/g,
      '<span class="gk-mask-tag">&lt;$1&gt;</span>'
    );

    close();   // 关掉可能已存在的 modal
    const overlay = document.createElement("div");
    overlay.className = "arena-modal-overlay tone-warning gatekeeper-modal";
    overlay.innerHTML = `
      <div class="arena-modal" role="dialog" aria-modal="true">
        <div class="arena-modal-icon">⚠</div>
        <div class="arena-modal-title">检测到 ${n} 处敏感信息</div>
        <div class="arena-modal-message">发送前请确认，避免内部信息流向外部 AI</div>

        <div class="gk-hits">
          <div class="gk-hits-label">命中项：</div>
          ${hitsHtml}
        </div>

        <div class="gk-preview">
          <div class="gk-preview-label">📝 自动打码后的预览：</div>
          <div class="gk-preview-body">${previewHtml}</div>
        </div>

        <div class="arena-modal-actions gk-actions">
          <button type="button" class="arena-modal-btn secondary" data-role="cancel">取消修改</button>
          <button type="button" class="arena-modal-btn primary"   data-role="mask">自动打码后发送</button>
          <button type="button" class="arena-modal-btn secondary" data-role="confirm">我确认无敏感 · 加入白名单</button>
        </div>

        <button type="button" class="arena-modal-close" data-role="cancel" aria-label="关闭">✕</button>
      </div>`;
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    overlay.addEventListener("click", (e) => {
      const role = e.target?.dataset?.role;
      if (role === "mask") {
        close();
        try { handlers?.onMask?.(masked); } catch (err) { console.warn(err); }
      } else if (role === "confirm") {
        close();
        try { handlers?.onConfirm?.(original, hits); } catch (err) { console.warn(err); }
      } else if (role === "cancel") {
        close();
        try { handlers?.onCancel?.(); } catch (err) { console.warn(err); }
      } else if (e.target === overlay) {
        close();
        try { handlers?.onCancel?.(); } catch (err) { console.warn(err); }
      }
    });

    document.addEventListener("keydown", function escListener(ev) {
      if (ev.key === "Escape") {
        document.removeEventListener("keydown", escListener);
        close();
        try { handlers?.onCancel?.(); } catch (err) {}
      }
    });

    requestAnimationFrame(() => overlay.classList.add("show"));
  }
```

然后在 `window.ChatModal = { ... }` 里加 `showSensitiveBlocked`：

```javascript
// 改前
window.ChatModal = { show, close, showInsufficientResponses };

// 改后
window.ChatModal = { show, close, showInsufficientResponses, showSensitiveBlocked };
```

- [ ] **Step 2: 加静态 + 运行时断言**

```javascript
  // ── v4.9.0 ⑦: popup-modal.js showSensitiveBlocked ──
  const modalJsV490 = fs.readFileSync(path.join(EXT_PATH, "popup-modal.js"), "utf8");
  check("v4.9.0 ⑦: popup-modal 暴露 showSensitiveBlocked + 3 个 role(mask/confirm/cancel)",
    /window\.ChatModal\s*=\s*\{[^}]*showSensitiveBlocked/s.test(modalJsV490) &&
    /data-role="mask"/.test(modalJsV490) &&
    /data-role="confirm"/.test(modalJsV490) &&
    /data-role="cancel"/.test(modalJsV490),
    "showSensitiveBlocked API 或按钮 role 不完整");
  check("v4.9.0 ⑦: modal 文案符合 spec（检测到 N 处敏感信息 + 3 按钮中文）",
    /\$\{n\}\s*处敏感信息/.test(modalJsV490) &&
    /自动打码后发送/.test(modalJsV490) &&
    /我确认无敏感\s*·\s*加入白名单/.test(modalJsV490) &&
    /取消修改/.test(modalJsV490),
    "modal 文案不符 spec v1");

  // 运行时：popup 中调 showSensitiveBlocked 验证 DOM 出现 + 按钮可点
  const gkModalRuntime = await popupPage.evaluate(async () => {
    if (!window.ChatModal?.showSensitiveBlocked) return { err: "showSensitiveBlocked 未暴露" };
    let maskCalled = false, confirmCalled = false, cancelCalled = false;
    window.ChatModal.showSensitiveBlocked(
      {
        hits: [
          { category: "工号", text: "Z12345678", masked: "<工号>", severity: "block" },
          { category: "客户", text: "中国移动",   masked: "<客户>", severity: "block" },
        ],
        masked: "请帮我分析 <工号> 在 <客户> 的需求",
        original: "请帮我分析 Z12345678 在 中国移动 的需求",
      },
      {
        onMask: () => { maskCalled = true; },
        onConfirm: () => { confirmCalled = true; },
        onCancel: () => { cancelCalled = true; },
      }
    );
    await new Promise(r => setTimeout(r, 50));
    const overlay = document.querySelector(".gatekeeper-modal");
    const titleText = document.querySelector(".arena-modal-title")?.textContent || "";
    const hitsRowCount = document.querySelectorAll(".gk-hit-row").length;
    const previewText = document.querySelector(".gk-preview-body")?.textContent || "";
    const maskTagCount = document.querySelectorAll(".gk-mask-tag").length;
    // 测点主按钮
    document.querySelector('[data-role="mask"]')?.click();
    await new Promise(r => setTimeout(r, 200));
    const gone = !document.querySelector(".gatekeeper-modal");
    return { hasOverlay: !!overlay, titleText, hitsRowCount, previewText, maskTagCount, maskCalled, gone };
  });
  check("v4.9.0 ⑦ 运行时: showSensitiveBlocked 渲染 overlay + 2 hits + 2 mask-tag + 标题数字正确",
    !gkModalRuntime.err &&
    gkModalRuntime.hasOverlay &&
    gkModalRuntime.titleText.includes("2 处敏感信息") &&
    gkModalRuntime.hitsRowCount === 2 &&
    gkModalRuntime.previewText.includes("<工号>") &&
    gkModalRuntime.maskTagCount === 2,
    `actual: ${JSON.stringify(gkModalRuntime)}`);
  check("v4.9.0 ⑦ 运行时: 点击主按钮触发 onMask + modal 关闭",
    gkModalRuntime.maskCalled === true && gkModalRuntime.gone === true,
    `actual: ${JSON.stringify(gkModalRuntime)}`);
```

- [ ] **Step 3: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ⑦|fail"
```

预期：4 条 ✓ + 0 failed

- [ ] **Step 4: commit**

```bash
git add src/popup-modal.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-7): popup-modal showSensitiveBlocked（命中清单 + 预览 + 3 按钮）"
```

---

## Task 8: popup.css — 守门员 modal 样式

**Files:**
- Modify: `src/popup.css`（追加守门员相关样式）

- [ ] **Step 1: 在 popup.css 末尾追加样式**

```css
/* v4.9.0: 敏感信息守门员 modal — 跟 v4.8.65 ChatModal 共用 .arena-modal 基础体系 */
.gatekeeper-modal .arena-modal {
  width: min(480px, 96vw);   /* 比标准 modal 宽一点放命中清单 */
}
.gk-hits {
  margin: 12px 0 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  text-align: left;
  max-height: 160px;
  overflow-y: auto;
}
.gk-hits-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-soft);
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.gk-hit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--border);
}
.gk-hit-row:last-child { border-bottom: none; }
.gk-hit-cat {
  flex-shrink: 0;
  min-width: 60px;
  padding: 2px 8px;
  background: rgba(255, 159, 10, 0.18);
  color: #ff9f0a;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 700;
}
.gk-hit-text {
  font-family: "SF Mono", "Consolas", monospace;
  font-size: 12.5px;
  color: var(--ink);
  background: rgba(255, 59, 48, 0.10);
  padding: 1px 6px;
  border-radius: 4px;
}

.gk-preview {
  margin-bottom: 16px;
  text-align: left;
}
.gk-preview-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-soft);
  margin-bottom: 6px;
  letter-spacing: 0.04em;
}
.gk-preview-body {
  font-size: 12.5px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  line-height: 1.6;
  color: var(--ink);
  max-height: 120px;
  overflow-y: auto;
  word-break: break-all;
}
.gk-mask-tag {
  display: inline;
  background: rgba(52, 199, 89, 0.16);
  color: #34c759;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: "SF Mono", "Consolas", monospace;
  font-size: 11.5px;
  font-weight: 600;
}

/* gk-actions 不同布局：3 按钮横排，主按钮中间 */
.arena-modal-actions.gk-actions {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.arena-modal-actions.gk-actions .arena-modal-btn {
  flex: 1 1 auto;
  min-width: 110px;
}
```

- [ ] **Step 2: 加静态断言**

```javascript
  // ── v4.9.0 ⑧: popup.css 守门员 modal 样式 ──
  const cssV490 = fs.readFileSync(path.join(EXT_PATH, "popup.css"), "utf8");
  check("v4.9.0 ⑧: popup.css 含 .gk-hits / .gk-hit-cat / .gk-mask-tag / .gk-preview-body 样式",
    /\.gk-hits\s*\{/.test(cssV490) &&
    /\.gk-hit-cat\s*\{[^}]*background:\s*rgba\(255,\s*159,\s*10/.test(cssV490) &&
    /\.gk-mask-tag\s*\{[^}]*color:\s*#34c759/.test(cssV490) &&
    /\.gk-preview-body\s*\{/.test(cssV490) &&
    /\.arena-modal-actions\.gk-actions/.test(cssV490),
    "守门员 modal 样式不完整");
```

- [ ] **Step 3: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ⑧|fail"
```

预期：1 条 ✓ + 0 failed

- [ ] **Step 4: commit**

```bash
git add src/popup.css tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-8): popup.css 守门员 modal 命中清单 + 预览样式"
```

---

## Task 9: popup-gatekeeper-bridge.js — popup 端公共桥接

**Files:**
- Create: `src/popup-gatekeeper-bridge.js`

- [ ] **Step 1: 写 bridge 模块**

`src/popup-gatekeeper-bridge.js`:
```javascript
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
```

- [ ] **Step 2: 加静态 + 运行时断言**

```javascript
  // ── v4.9.0 ⑨: popup-gatekeeper-bridge.js ──
  const bridgeJsV490 = fs.readFileSync(path.join(EXT_PATH, "popup-gatekeeper-bridge.js"), "utf8");
  check("v4.9.0 ⑨: bridge 暴露 ChatGatekeeperBridge.handleResp",
    /window\.ChatGatekeeperBridge\s*=\s*\{[^}]*handleResp/s.test(bridgeJsV490),
    "bridge handleResp 未暴露");
  check("v4.9.0 ⑨: handleResp 仅在 reason === sensitive_blocked 时处理",
    /resp\.reason\s*!==\s*"sensitive_blocked"/.test(bridgeJsV490),
    "bridge 触发条件不严");
  check("v4.9.0 ⑨: bridge onMask/onConfirm 用 textField + skipGatekeeper:true 重发",
    /\[textField\]:\s*newText/.test(bridgeJsV490) &&
    /skipGatekeeper:\s*true/.test(bridgeJsV490),
    "bridge 重发协议不符 spec");
  check("v4.9.0 ⑨: bridge onConfirm 调 GatekeeperStore.addWhitelist",
    /GatekeeperStore[\s\S]{0,200}addWhitelist\(theHits\.map\(h\s*=>\s*h\.text\)\)/.test(bridgeJsV490),
    "bridge onConfirm 未加白名单");
```

- [ ] **Step 3: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ⑨|fail"
```

预期：4 条 ✓ + 0 failed

- [ ] **Step 4: commit**

```bash
git add src/popup-gatekeeper-bridge.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-9): popup-gatekeeper-bridge 公共重发桥接（弹 modal + textField 重发）"
```

---

## Task 10: popup.html 引入 bridge + 3 个 gatekeeper-*.js

**Files:**
- Modify: `src/popup.html`

popup 端需要 GatekeeperStore（加白名单时用）和 GatekeeperEngine 可选（实际只用 store），以及 ChatGatekeeperBridge。

- [ ] **Step 1: 找 popup.html script 引入区域**

打开 `src/popup.html`，找到 `<script src="popup-logo-style.js"></script>` 那一带（约 line 263）。

在 `<script src="popup-modal.js"></script>` **之前**加 3 个：

```html
<!-- v4.9.0: 守门员模块（顺序：rules → store → engine → bridge） -->
<script src="gatekeeper-rules.js"></script>
<script src="gatekeeper-store.js"></script>
<script src="gatekeeper-engine.js"></script>
<script src="popup-logo-style.js"></script>
<script src="popup-action-icons.js"></script>
<script src="popup-modal.js"></script>
<script src="popup-gatekeeper-bridge.js"></script>
<script src="popup-arena-badge.js"></script>
```

注意：bridge **必须在 popup-modal.js 之后**（依赖 ChatModal）。

- [ ] **Step 2: 加静态断言**

```javascript
  // ── v4.9.0 ⑩: popup.html 引入 4 个 gatekeeper 脚本 ──
  const htmlV490 = fs.readFileSync(path.join(EXT_PATH, "popup.html"), "utf8");
  check("v4.9.0 ⑩: popup.html 含 gatekeeper-rules/store/engine + bridge 4 个 script",
    /<script src="gatekeeper-rules\.js"><\/script>/.test(htmlV490) &&
    /<script src="gatekeeper-store\.js"><\/script>/.test(htmlV490) &&
    /<script src="gatekeeper-engine\.js"><\/script>/.test(htmlV490) &&
    /<script src="popup-gatekeeper-bridge\.js"><\/script>/.test(htmlV490),
    "popup.html 缺 gatekeeper 脚本引入");
  check("v4.9.0 ⑩: bridge 在 popup-modal 之后引入（依赖顺序对）",
    /popup-modal\.js[\s\S]*popup-gatekeeper-bridge\.js/.test(htmlV490),
    "bridge 引入顺序在 popup-modal 之前");
```

- [ ] **Step 3: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ⑩|fail"
```

预期：2 条 ✓ + 0 failed

- [ ] **Step 4: 验证 popup 中模块都加载（运行时）**

加运行时断言：

```javascript
  // 运行时：popup 加载后 4 个全局 API 都可用
  const gkLoadCheck = await popupPage.evaluate(() => ({
    hasRules: Array.isArray(window.BUILTIN_RULES),
    hasStore: typeof window.GatekeeperStore?.isEnabled === "function",
    hasEngine: typeof window.GatekeeperEngine?.scan === "function",
    hasBridge: typeof window.ChatGatekeeperBridge?.handleResp === "function",
  }));
  check("v4.9.0 ⑩ 运行时: popup 全局含 BUILTIN_RULES / GatekeeperStore / Engine / Bridge",
    gkLoadCheck.hasRules && gkLoadCheck.hasStore && gkLoadCheck.hasEngine && gkLoadCheck.hasBridge,
    `actual: ${JSON.stringify(gkLoadCheck)}`);

  // 运行时：scan 真实运行验证（带白名单跳过）
  const scanRuntime = await popupPage.evaluate(async () => {
    if (!window.GatekeeperEngine) return { err: "engine 未加载" };
    // 清白名单先
    await new Promise(r => chrome.storage.local.set({ "gatekeeper.whitelist": {} }, r));
    const hits1 = await window.GatekeeperEngine.scan("我的工号 Z12345678 邮箱 abc@huawei.com");
    const cats = hits1.map(h => h.category).sort();
    const masked1 = window.GatekeeperEngine.maskText("Z12345678 abc@huawei.com", hits1);
    // 加白名单后再扫
    await window.GatekeeperStore.addWhitelist(["Z12345678"]);
    const hits2 = await window.GatekeeperEngine.scan("我的工号 Z12345678 邮箱 abc@huawei.com");
    return { hits1Count: hits1.length, cats, masked1, hits2Count: hits2.length };
  });
  check("v4.9.0 ⑩ 运行时: scan 命中 2 类（工号 + 内部邮箱）+ mask 替换为 <类别>",
    !scanRuntime.err &&
    scanRuntime.hits1Count === 2 &&
    JSON.stringify(scanRuntime.cats) === JSON.stringify(["内部邮箱", "工号"]) &&
    scanRuntime.masked1 === "<工号> <内部邮箱>",
    `actual: ${JSON.stringify(scanRuntime)}`);
  check("v4.9.0 ⑩ 运行时: 白名单加入后命中数下降（Z12345678 不再算 hit）",
    !scanRuntime.err && scanRuntime.hits2Count === 1,
    `actual: ${JSON.stringify(scanRuntime)}`);
```

- [ ] **Step 5: 跑 smoke.mjs 全套**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ⑩|fail"
```

预期：5 条 ✓ + 0 failed

- [ ] **Step 6: commit**

```bash
git add src/popup.html tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-10): popup.html 引入 gatekeeper 4 模块 + 运行时 scan/mask 验证"
```

---

## Task 11: popup-task-menu.js dispatch → bridge

**Files:**
- Modify: `src/popup-task-menu.js`

popup-task-menu.js 的 `dispatch(text, targets)` 在 task = "ask"/"debate"/"summary"/"ppt" 时分别 sendMessage。每个分支收到响应后调 bridge 检查 sensitive_blocked。

- [ ] **Step 1: 改 ask 分支**

定位（约 line 112-119）：
```javascript
if (c.task === "ask") {
  return new Promise((res) => {
    chrome.runtime.sendMessage(
      { type: "chatBroadcast", text, targets, images: [] },
      (resp) => res(resp || { ok: false, error: chrome.runtime.lastError?.message })
    );
  });
}
```

改成：
```javascript
if (c.task === "ask") {
  const msg = { type: "chatBroadcast", text, targets, images: [] };
  return new Promise((res) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      // v4.9.0: 守门员命中 → bridge 接管弹 modal + 重发
      if (window.ChatGatekeeperBridge?.handleResp(msg, resp, { textField: "text" })) {
        res({ ok: false, intercepted: "sensitive_blocked" });
        return;
      }
      res(resp || { ok: false, error: chrome.runtime.lastError?.message });
    });
  });
}
```

- [ ] **Step 2: 改 debate 分支**

定位（约 line 120-145，sendOnce 函数内 sendMessage 那行）：

```javascript
chrome.runtime.sendMessage(
  { type: "debateRound", style: c.style, guidance: text || "", concise: false, force },
  (resp) => {
    if (resp?.needsConfirm) { ... }
    if (resp && !resp.ok) {
      if (resp.reason === "insufficient_responses" && window.ChatModal) { ... }
      else { alert(...); }
    }
    res(...);
  }
);
```

在 needsConfirm 分支判断**之前**插入 sensitive_blocked 拦截：

```javascript
const msg = { type: "debateRound", style: c.style, guidance: text || "", concise: false, force };
chrome.runtime.sendMessage(msg, (resp) => {
  // v4.9.0: 守门员拦截（在 needsConfirm 之前判断 — guardedSend 在 handleDebateRound 之前已 return）
  if (window.ChatGatekeeperBridge?.handleResp(msg, resp, { textField: "guidance" })) {
    res({ ok: false, intercepted: "sensitive_blocked" });
    return;
  }
  if (resp?.needsConfirm) {
    if (window.confirm(resp.message)) { sendOnce(true); }
    else { res({ ok: false, cancelled: true }); }
    return;
  }
  if (resp && !resp.ok) {
    if (resp.reason === "insufficient_responses" && window.ChatModal) {
      window.ChatModal.showInsufficientResponses(resp, {
        onReextract: (missing) => _reextractMissing(missing),
        onSwitchAsk: () => setTask("ask"),
      });
    } else {
      alert(`辩论失败：${resp.error || "未知错误"}`);
    }
  }
  res(resp || { ok: false, error: chrome.runtime.lastError?.message });
});
```

- [ ] **Step 3: 改 summary 分支**

定位（约 line 144-154）：
```javascript
if (c.task === "summary") {
  return new Promise((res) => {
    chrome.runtime.sendMessage(
      { type: "summary", judgeId: c.judgeId, customInstruction: text || "" },
      (resp) => {
        if (resp && !resp.ok) alert(`总结失败：${resp.error || "未知错误"}`);
        res(resp || { ok: false, error: chrome.runtime.lastError?.message });
      }
    );
  });
}
```

改成：
```javascript
if (c.task === "summary") {
  const msg = { type: "summary", judgeId: c.judgeId, customInstruction: text || "" };
  return new Promise((res) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (window.ChatGatekeeperBridge?.handleResp(msg, resp, { textField: "customInstruction" })) {
        res({ ok: false, intercepted: "sensitive_blocked" });
        return;
      }
      if (resp && !resp.ok) alert(`总结失败：${resp.error || "未知错误"}`);
      res(resp || { ok: false, error: chrome.runtime.lastError?.message });
    });
  });
}
```

- [ ] **Step 4: 加静态断言**

```javascript
  // ── v4.9.0 ⑪: popup-task-menu.js dispatch 3 分支接 bridge ──
  const taskMenuJsV490 = fs.readFileSync(path.join(EXT_PATH, "popup-task-menu.js"), "utf8");
  check("v4.9.0 ⑪: ask 分支调 ChatGatekeeperBridge.handleResp（textField: text）",
    /type:\s*"chatBroadcast"[\s\S]{0,400}ChatGatekeeperBridge\?\.handleResp\(msg,\s*resp,\s*\{\s*textField:\s*"text"/.test(taskMenuJsV490),
    "ask 分支未接 bridge");
  check("v4.9.0 ⑪: debate 分支用 textField: guidance",
    /type:\s*"debateRound"[\s\S]{0,500}ChatGatekeeperBridge\?\.handleResp\(msg,\s*resp,\s*\{\s*textField:\s*"guidance"/.test(taskMenuJsV490),
    "debate 分支未接 bridge 或 textField 不对");
  check("v4.9.0 ⑪: summary 分支用 textField: customInstruction",
    /type:\s*"summary"[\s\S]{0,400}ChatGatekeeperBridge\?\.handleResp\(msg,\s*resp,\s*\{\s*textField:\s*"customInstruction"/.test(taskMenuJsV490),
    "summary 分支未接 bridge 或 textField 不对");
```

- [ ] **Step 5: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ⑪|fail"
```

预期：3 条 ✓ + 0 failed

- [ ] **Step 6: commit**

```bash
git add src/popup-task-menu.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-11): popup-task-menu dispatch 3 分支接守门员 bridge"
```

---

## Task 12: popup-tasks.js bindDebate + PPT 发送 → bridge

**Files:**
- Modify: `src/popup-tasks.js`（两处：bindDebate sendOnce + bindPpt 的 #rp-btn-ppt-send handler）

popup-tasks.js 有两个独立 sendMessage 出去的入口：① 右栏「开始辩论」按钮（debateRound） ② PPT 工坊「📤 发送给 ChatGPT」按钮（sendPromptToService）。两个都要接 bridge。

- [ ] **Step 1: 改 bindDebate 的 sendOnce**

定位（约 line 80-104，rp-btn-debate 的 click handler）：

```javascript
// 改前
const sendOnce = (force) => {
  chrome.runtime.sendMessage({
    type: "debateRound",
    style: state.style,
    guidance: state.guidance,
    concise: state.concise,
    force,
  }, (resp) => {
    if (resp?.needsConfirm) { ... }
    if (resp && !resp.ok) { ... }
  });
};
```

改成（在 needsConfirm 之前加 bridge 拦截）：
```javascript
const sendOnce = (force) => {
  const msg = {
    type: "debateRound",
    style: state.style,
    guidance: state.guidance,
    concise: state.concise,
    force,
  };
  chrome.runtime.sendMessage(msg, (resp) => {
    // v4.9.0: 守门员拦截
    if (window.ChatGatekeeperBridge?.handleResp(msg, resp, { textField: "guidance" })) return;
    if (resp?.needsConfirm) {
      if (window.confirm(resp.message)) sendOnce(true);
      return;
    }
    if (resp && !resp.ok) {
      if (resp.reason === "insufficient_responses" && window.ChatModal) {
        window.ChatModal.showInsufficientResponses(resp, {
          onReextract: (missing) => reextractMissing(missing),
          onSwitchAsk: () => window.ChatTaskMenu?.setTask?.("ask"),
        });
      } else {
        alert(`辩论失败：${resp.error || "未知错误"}`);
      }
    }
  });
};
```

- [ ] **Step 2: 改 PPT 工坊「📤 发送给 ChatGPT」按钮**

定位（约 line 251-259，rp-btn-ppt-send 的 click handler）：

```javascript
// 改前
root.querySelector("#rp-btn-ppt-send")?.addEventListener("click", () => {
  const text = ta?.value?.trim();
  if (!text) { alert("prompt 为空，先点 1/2/3 按钮生成"); return; }
  chrome.runtime.sendMessage({
    type: "sendPromptToService", service: "chatgpt", text,
  }, (resp) => {
    if (resp && !resp.ok) alert(`发送失败：${resp.error || "未知错误"}\n（请先添加 GPT 参与者并打开 chatgpt.com 标签页）`);
  });
});
```

改成：
```javascript
root.querySelector("#rp-btn-ppt-send")?.addEventListener("click", () => {
  const text = ta?.value?.trim();
  if (!text) { alert("prompt 为空，先点 1/2/3 按钮生成"); return; }
  const msg = { type: "sendPromptToService", service: "chatgpt", text };
  chrome.runtime.sendMessage(msg, (resp) => {
    // v4.9.0: 守门员拦截（PPT prompt 可能很长，更可能含敏感信息）
    if (window.ChatGatekeeperBridge?.handleResp(msg, resp, { textField: "text" })) return;
    if (resp && !resp.ok) alert(`发送失败：${resp.error || "未知错误"}\n（请先添加 GPT 参与者并打开 chatgpt.com 标签页）`);
  });
});
```

- [ ] **Step 3: 加静态断言**

```javascript
  // ── v4.9.0 ⑫: popup-tasks.js bindDebate + PPT 发送 都接 bridge ──
  const tasksJsV490 = fs.readFileSync(path.join(EXT_PATH, "popup-tasks.js"), "utf8");
  check("v4.9.0 ⑫a: popup-tasks bindDebate sendOnce 调 ChatGatekeeperBridge.handleResp",
    /sendOnce\s*=\s*\(force\)\s*=>\s*\{[\s\S]{0,400}ChatGatekeeperBridge\?\.handleResp\(msg,\s*resp,\s*\{\s*textField:\s*"guidance"/.test(tasksJsV490),
    "popup-tasks bindDebate 未接 bridge");
  check("v4.9.0 ⑫b: popup-tasks PPT 发送按钮接 bridge（textField: text）",
    /#rp-btn-ppt-send[\s\S]{0,600}ChatGatekeeperBridge\?\.handleResp\(msg,\s*resp,\s*\{\s*textField:\s*"text"/.test(tasksJsV490),
    "PPT 发送按钮未接 bridge");
```

- [ ] **Step 4: 跑 smoke.mjs**

```bash
node tests/e2e/smoke.mjs 2>&1 | grep -E "v4\.9\.0 ⑫|fail"
```

预期：2 条 ✓ + 0 failed

- [ ] **Step 5: commit**

```bash
git add src/popup-tasks.js tests/e2e/smoke.mjs
git commit -m "feat(v4.9.0-12): popup-tasks bindDebate + PPT 发送 都接守门员 bridge"
```

---

## Task 13: 版本号 4 处 bump + 端到端运行时 E2E + commit + merge

**Files:**
- Modify: `src/manifest.json`、`src/popup.html`、`src/sidepanel.html`、`tests/e2e/smoke.mjs`
- 最后 merge

- [ ] **Step 1: 版本号 4 处同步**

```bash
# 1. manifest.json
```
打开 `src/manifest.json`，把 `"version": "4.8.67"` 和 `"version_name": "4.8.67-beta"` 改成：
```json
"version": "4.9.0",
"version_name": "4.9.0-beta",
```

```bash
# 2. popup.html
```
找 `<span class="chat-version">v4.8.67-beta</span>` 改成 `v4.9.0-beta`

```bash
# 3. sidepanel.html (header 和 footer 各一处)
```
找 2 处 `v4.8.67-beta` 全替 `v4.9.0-beta`

```bash
# 4. smoke.mjs (4 处期望值)
```
找 smoke.mjs 中所有 `4.8.67-beta` 全替 `4.9.0-beta`

- [ ] **Step 2: 加端到端运行时 E2E — 模拟"完整守门员发送流程"**

在 smoke.mjs 的 v4.9.0 ⑫ 断言之后加：

```javascript
  // ── v4.9.0 ⑬ 端到端: 模拟 bridge.handleResp 完整重发流程 ──
  const e2eFlow = await popupPage.evaluate(async () => {
    // 清白名单
    await new Promise(r => chrome.storage.local.set({ "gatekeeper.whitelist": {} }, r));
    let retryFired = false;
    let retryMsg = null;
    const originalMsg = {
      type: "chatBroadcast",
      text: "我的工号 Z12345678 是机密",
      targets: ["claude"],
      images: [],
    };
    // 模拟 background return 的 sensitive_blocked 响应
    const resp = {
      ok: false,
      reason: "sensitive_blocked",
      hits: [{ rule: "huawei-staff-id", category: "工号", text: "Z12345678", index: 5, length: 9, masked: "<工号>", severity: "block" }],
      masked: "我的工号 <工号> 是机密",
      original: "我的工号 Z12345678 是机密",
    };
    const handled = window.ChatGatekeeperBridge.handleResp(originalMsg, resp, {
      textField: "text",
      onRetry: (newMsg) => { retryFired = true; retryMsg = newMsg; },
    });
    await new Promise(r => setTimeout(r, 50));
    // 模拟用户点"自动打码"
    document.querySelector('[data-role="mask"]')?.click();
    await new Promise(r => setTimeout(r, 250));
    return {
      handled,
      retryFired,
      retryText: retryMsg?.text,
      retryHasSkip: retryMsg?.skipGatekeeper === true,
      retryType: retryMsg?.type,
      retryTargets: retryMsg?.targets,
    };
  });
  check("v4.9.0 ⑬ E2E: bridge.handleResp 返回 true（已处理）",
    e2eFlow.handled === true, `actual: ${JSON.stringify(e2eFlow)}`);
  check("v4.9.0 ⑬ E2E: 用户点'自动打码' → onRetry 触发 + 用 masked 文本 + skipGatekeeper:true + 保留 type/targets",
    e2eFlow.retryFired === true &&
    e2eFlow.retryText === "我的工号 <工号> 是机密" &&
    e2eFlow.retryHasSkip === true &&
    e2eFlow.retryType === "chatBroadcast" &&
    JSON.stringify(e2eFlow.retryTargets) === JSON.stringify(["claude"]),
    `actual: ${JSON.stringify(e2eFlow)}`);

  // ── E2E 加入白名单流程 ──
  const e2eConfirm = await popupPage.evaluate(async () => {
    await new Promise(r => chrome.storage.local.set({ "gatekeeper.whitelist": {} }, r));
    let retryMsg = null;
    const originalMsg = { type: "chatBroadcast", text: "工号 W99999999", targets: [], images: [] };
    const resp = {
      ok: false, reason: "sensitive_blocked",
      hits: [{ rule: "huawei-staff-id", category: "工号", text: "W99999999", index: 3, length: 9, masked: "<工号>", severity: "block" }],
      masked: "工号 <工号>",
      original: "工号 W99999999",
    };
    window.ChatGatekeeperBridge.handleResp(originalMsg, resp, {
      textField: "text",
      onRetry: (m) => { retryMsg = m; },
    });
    await new Promise(r => setTimeout(r, 50));
    // 点"加入白名单"
    document.querySelector('[data-role="confirm"]')?.click();
    await new Promise(r => setTimeout(r, 300));
    // 验证白名单已写
    const wl = await new Promise(r => chrome.storage.local.get(["gatekeeper.whitelist"], resp => r(resp["gatekeeper.whitelist"] || {})));
    return {
      retryText: retryMsg?.text,
      retryHasSkip: retryMsg?.skipGatekeeper === true,
      whitelistHasWord: !!wl["W99999999"],
    };
  });
  check("v4.9.0 ⑬ E2E: 点'加入白名单' → 用 original 重发 + skipGatekeeper:true + 白名单已写",
    e2eConfirm.retryText === "工号 W99999999" &&
    e2eConfirm.retryHasSkip === true &&
    e2eConfirm.whitelistHasWord === true,
    `actual: ${JSON.stringify(e2eConfirm)}`);
```

- [ ] **Step 3: 跑完整 smoke.mjs 全套**

```bash
node tests/e2e/smoke.mjs 2>&1 | tail -3
```

预期：`==== ~465 passed, 0 failed ====`（基线 446 + 约 20 条 v4.9.0 新断言）

如果有 fail：grep 看具体错误，修复后再跑。

- [ ] **Step 4: 写 hook marker（refactor-verified + e2e-tested）**

PowerShell 各一条：
```powershell
$ts = [int][double]::Parse((Get-Date -UFormat %s)); $json = "{`"ts`":$ts}"; [System.IO.File]::WriteAllText("$env:TEMP\.refactor-verified", $json, (New-Object System.Text.UTF8Encoding $false))
```
```powershell
$ts = [int][double]::Parse((Get-Date -UFormat %s)); $json = "{`"ts`":$ts}"; [System.IO.File]::WriteAllText("$env:TEMP\.e2e-tested", $json, (New-Object System.Text.UTF8Encoding $false))
```

- [ ] **Step 5: stage + commit**

```bash
git add -A src/ tests/e2e/smoke.mjs
git status --short
git commit -m "$(cat <<'EOF'
feat(v4.9.0): 敏感信息守门员 MVP — 引擎 + 拦截 + 弹窗 + bridge

设计：docs/superpowers/specs/2026-05-27-sensitive-info-gatekeeper-design.md
plan：docs/superpowers/plans/2026-05-27-sensitive-info-gatekeeper-v4.9.0.md

新增模块：
- gatekeeper-rules.js   5 类正则 + 2 个词表（运营商 / 战略词）
- gatekeeper-store.js   chrome.storage 抽象（rules / whitelist / stats）
- gatekeeper-engine.js  scan + maskText + 100ms 超时兜底
- popup-gatekeeper-bridge.js  popup 端公共桥接（handleResp + textField 重发）

改造：
- background.js     新增 guardedSend wrapper + 5 个 handler 接入
  (broadcast/debateRound/summary/sendPromptToService/chatBroadcast)
- popup-modal.js    新增 showSensitiveBlocked（3 按钮 + 命中清单 + masked 预览）
- popup-tasks.js    bindDebate 接 bridge
- popup-task-menu.js  dispatch 3 分支接 bridge

行为：
- 默认开启，所有发送链路扫一次
- 命中 → 弹 modal → 3 选项（自动打码 / 取消 / 加入白名单继续）
- "加入白名单继续"自动写 gatekeeper.whitelist，下次同词不弹
- 异常时降级放行不阻断

版本：4.8.67 → 4.9.0（manifest / popup.html / sidepanel.html × 2 / smoke.mjs）
测试：E2E ~465 passed / 0 failed（含运行时 bridge 完整流程 + 白名单流程）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: merge 回主干（在主仓库）**

```bash
cd C:/Users/lintian/AI_debate/ai-arena-extension
git merge --no-ff worktree-ai-arena-extension-v490 -m "merge: v4.9.0 敏感信息守门员 MVP (from worktree-ai-arena-extension-v490)"
git log -3 --oneline
```

- [ ] **Step 7: 退出 worktree（remove）**

```
ExitWorktree(action="remove", discard_changes=true)
```

注：worktree commit 已 merge 进 main，worktree branch 上的同样 commit 会被"discarded"显示，但主干已有，无影响。

---

## 完成验证清单（用户手动）

reload 扩展后验证：

1. **基础命中流程**：群聊输入 "我的工号 Z12345678 是…"，点同时提问 → 弹守门员 modal → 显示「工号 Z12345678」一条命中
2. **自动打码路径**：modal 点「自动打码后发送」→ AI 收到的实际是 "我的工号 `<工号>` 是…"
3. **加白名单路径**：再发 "工号 Z12345678 是…"，点「我确认无敏感 · 加入白名单」→ AI 收到原文 + 下次同样的句子不再弹
4. **辩论场景**：右栏「开始辩论」→ 输入含工号 guidance → 弹 modal → 流程同上
5. **关闭/取消**：点 ✕ 或「取消修改」→ modal 关，原文留在输入框
6. **运营商客户名**："中国移动的方案" → 弹 modal 提示「客户 中国移动」
7. **战略词软提示**：单独的「保密」「未公开」也会触发（severity:warn，但 MVP modal 一视同仁阻断；v4.9.1 设置页加颜色区分）

---

## 注意事项

- **v4.9.0 不含设置页** — 用户无法通过 UI 禁用守门员 / 看白名单 / 改规则。v4.9.1 补。如果 v4.9.0 测试期间需要禁用守门员，可在 DevTools console 执行 `chrome.storage.local.set({ "gatekeeper.enabled": false })`。
- **战略词 warn 级别在 v4.9.0 视觉上跟 block 一样** — modal 不区分。v4.9.1 可加颜色差异。spec §4.2 已说明这是 MVP 妥协。
- **不扫 AI 响应** — spec 已确认是 Phase 3 后置。
- **新手教程**：v4.8.67 加的 5 页教程没提守门员。建议 v4.9.0 后同步 task 改教程 page 4（排障）加守门员说明。**这条不在本 plan 范围**，留 backlog。
