# AI Arena · 模板库 · 实施计划

**对应 spec**：`docs/superpowers/specs/2026-05-24-ai-arena-template-library-design.md`
**版本目标**：v4.5.0-beta

## 实施顺序（10 步）

### Step 1 · 新建 `src/templates-builtin.js`

**纯数据，无依赖。background SW importScripts 和 popup `<script>` 都加载它。**

数据结构（4 个模板对象，全 self.ArenaBuiltinTemplates 暴露）：
- `debate.free`：4 字段（main + r1 + r2 + r3），值从现有 `debate-engine.js` 提取
- `debate.collab`：4 字段，同上
- `summary`：1 字段（main），从 `buildSummaryPrompt` 提取整段
- `ppt`：5 字段（intro/topic/compare/insight/landscape），从 `PPT_TEMPLATE_META[k].huaweiSeed` 提取

每个字段：`{ key, label, value }`。
每个模板：`{ binding, emoji, name, category, fields[] }`。

### Step 2 · 新建 `src/template-store.js`

提供 `self.ArenaTemplateStore` API：

```js
self.ArenaTemplateStore = {
  init(),                                // 启动时 prefetch
  isReady(),
  resolve(binding, fieldKey),            // 同步返回字符串
  resolveAllFields(binding),             // 返回 {fieldKey: value} 全字段
  resolveTemplate(binding),              // 返回 {...builtin, fields: [...with override]}
  saveOverride(binding, fieldKey, value),
  resetOverride(binding, fieldKey?),     // 无 fieldKey 重置该 binding 所有字段
  resetAllOverrides(),
  listUserTemplates(),
  getUserTemplate(id),
  addUserTemplate({ name, body }),
  updateUserTemplate(id, patch),
  deleteUserTemplate(id),
  subscribe(cb)                          // chrome.storage.onChanged 回调
};
```

内部：
- 启动时 `chrome.storage.local.get([STORAGE_KEY])` prefetch 到 `_cache`
- 所有 `save/reset/add/update/delete` 都先改 `_cache` 再 `chrome.storage.local.set`
- 监听 `chrome.storage.onChanged` → 同步刷新 `_cache` → 调用所有订阅者
- `resolve` 永远同步返回（基于 `_cache`），未 ready 时返回 builtin

### Step 3 · 改造 `src/debate-engine.js`

```js
// 原：const styleConfig = DEBATE_STYLES[style] || DEBATE_STYLES.free;
// 原：return `${roundHint}\n\n${styleConfig.prompt}\n\n${contextText}${conciseRule}`;

// 新：
const Store = self.ArenaTemplateStore;
const binding = `debate.${style}`;       // debate.free 或 debate.collab
const mainPrompt = Store.resolve(binding, "main");
const r1 = Store.resolve(binding, "r1");
const r2 = Store.resolve(binding, "r2");
const r3 = Store.resolve(binding, "r3");
const roundHint = ({1:r1, 2:r2, 3:r3}[roundNum]) || defaultHint;
// 拼接 prompt
```

**删除**：`DEBATE_STYLES` 和 `roundHints` 硬编码常量（保留作为 fallback 在 builtin 数据中）。

**保留**：`DEBATE_STYLES = { free: { name: "自由辩论" }, collab: { name: "群策群力" } }` —— 只保留 `name` 字段，用于 `buildSummaryPrompt` 历史摘要里的 round style 显示。

`buildSummaryPrompt`：从 `Store.resolve("summary", "main")` 取整段裁判指令。

### Step 4 · 改造 `src/ppt-prompts.js`

```js
// buildImagePrompt 函数内：
const Store = self.ArenaTemplateStore;
const userSeed = Store.resolve("ppt", templateKey);   // 用户的 override
const t = PPT_TEMPLATE_META[templateKey] || PPT_TEMPLATE_META.intro;
const seed = userSeed || t.huaweiSeed;
// 用 seed 替代原来的 t.huaweiSeed
```

`PPT_TEMPLATE_META[k].huaweiSeed` 保留作为 fallback，但首选用户 override。

### Step 5 · 改 `src/popup.html`

1. 加第 5 个 Tab：
```html
<button class="rp-tab" data-tab="templates" aria-label="模板">
  <svg ...>📋</svg>
  <span>模板</span>
</button>
```

2. 加 panel：
```html
<div class="rp-panel" data-rp-panel="templates" id="rp-panel-templates"></div>
```

3. 加 modal 容器（在 chat-app 外层）：
```html
<div class="modal-mask" id="tpl-modal-mask" hidden>
  <div class="modal tpl-modal">
    ...
  </div>
</div>
```

4. 加 `<script>` 引入：
```html
<script src="templates-builtin.js"></script>
<script src="template-store.js"></script>
<script src="popup-templates.js"></script>
```

### Step 6 · 改 `src/popup-rightpanel.js`

`TABS = ["members", "tasks", "stats", "templates", "settings"]`

### Step 7 · 新建 `src/popup-templates.js`

基于 mock 的 JS 改造：
- 用真实的 `ArenaTemplateStore` 替代 mock 的 sessionStorage state
- 渲染入口：`render()` 监听 `rp:activated` 事件，在 `tab === "templates"` 时渲染
- 监听 `ArenaTemplateStore.subscribe(cb)` —— storage 变化时自动重渲染
- 编辑器：弹层 modal，多字段时 tab 切换
- 单击自定义模板：往 `#chat-input` 追加 body（保留已有内容）+ flash 反馈 + toast

### Step 8 · 改 `src/popup.css`

复制 mock 里的样式，按现有 .rp- 命名 convention 调整：
- `.tpl-list / .tpl-item / .tpl-row / .tpl-preview` 等
- `.field-tabs / .field-tab`
- `.modal-mask / .modal / .modal-header / .modal-body / .modal-footer`
- `.toast`
- 全部走 CSS 变量（`--ink`, `--card`, `--accent` 等已有）
- dark mode 已通过变量自动生效

### Step 9 · bump 版本

| 文件 | 改 |
|---|---|
| `src/manifest.json` | `"version": "4.5.0"` + `"version_name": "4.5.0-beta"` |
| `src/popup.html` | `<span class="chat-version">v4.5.0-beta</span>` |
| `src/sidepanel.html` | 同步（如有 version 显示） |
| `tests/e2e/smoke.mjs` | 4.4.2 → 4.5.0 的版本字符串断言 |

### Step 10 · 扩展 E2E `tests/e2e/smoke.mjs`

加在 8.5 节"右栏 4 Tab"附近：

```js
// 9.5) v4.5.0：5 Tab + 模板库
const rpTabsNew = await popupPage.evaluate(() => {
  const tabs = [...document.querySelectorAll(".rp-tab")];
  return tabs.map(t => t.dataset.tab);
});
check("v4.5.0：右栏 5 Tab",
  rpTabsNew.join(",") === "members,tasks,stats,templates,settings",
  JSON.stringify(rpTabsNew));

// 激活 templates Tab
await popupPage.click('.rp-tab[data-tab="templates"]');
await popupPage.waitForTimeout(200);

const tplItemCount = await popupPage.locator("#rp-panel-templates .tpl-item").count();
check("v4.5.0：内置 4 个任务模板", tplItemCount === 4, `actual: ${tplItemCount}`);

// 验证 ArenaTemplateStore API
const storeApi = await popupPage.evaluate(() => ({
  hasStore: typeof window.ArenaTemplateStore === "object",
  builtinCount: Object.keys(window.ArenaBuiltinTemplates || {}).length,
  bindings: Object.keys(window.ArenaBuiltinTemplates || {}).sort()
}));
check("v4.5.0：ArenaTemplateStore 暴露", storeApi.hasStore === true);
check("v4.5.0：4 个内置 binding", storeApi.builtinCount === 4);
check("v4.5.0：bindings 列表", storeApi.bindings.join(",") === "debate.collab,debate.free,ppt,summary");

// 模拟改 debate.free.r2 → resolve 返回新值
const overrideResult = await popupPage.evaluate(async () => {
  await window.ArenaTemplateStore.saveOverride("debate.free", "r2", "TEST_OVERRIDE_R2");
  await new Promise(r => setTimeout(r, 100));
  const v = window.ArenaTemplateStore.resolve("debate.free", "r2");
  return { v };
});
check("v4.5.0：override r2 后 resolve 返回新值",
  overrideResult.v === "TEST_OVERRIDE_R2", JSON.stringify(overrideResult));

// 重置后 resolve 返回 builtin
const resetResult = await popupPage.evaluate(async () => {
  await window.ArenaTemplateStore.resetOverride("debate.free", "r2");
  await new Promise(r => setTimeout(r, 100));
  const v = window.ArenaTemplateStore.resolve("debate.free", "r2");
  const builtin = window.ArenaBuiltinTemplates["debate.free"].fields.find(f => f.key === "r2").value;
  return { restored: v === builtin };
});
check("v4.5.0：reset 后回 builtin", resetResult.restored === true);

// 新建自定义模板 → 单击插入输入框
const insertResult = await popupPage.evaluate(async () => {
  const t = await window.ArenaTemplateStore.addUserTemplate({ name: "测试片段", body: "HELLO_INSERT_TEST" });
  await new Promise(r => setTimeout(r, 200));
  // 触发渲染（rp:activated 已在 Tab 切换时触发）
  const userItem = document.querySelector(`#rp-panel-templates .tpl-item[data-user-id="${t.id}"]`);
  if (!userItem) return { err: "user item not rendered", id: t.id };
  // 单击插入
  const input = document.getElementById("chat-input");
  input.textContent = "";
  userItem.querySelector(".tpl-row").click();
  await new Promise(r => setTimeout(r, 100));
  return { content: input.textContent, id: t.id };
});
check("v4.5.0：单击自定义模板插入输入框",
  insertResult.content === "HELLO_INSERT_TEST",
  JSON.stringify(insertResult));

// 清理：删该自定义模板 + 整库重置
await popupPage.evaluate(async (id) => {
  await window.ArenaTemplateStore.deleteUserTemplate(id);
  await window.ArenaTemplateStore.resetAllOverrides();
}, insertResult.id);

// 验证 buildDebatePrompt 真用了 override
const buildResult = await serviceWorker.evaluate(async () => {
  await self.ArenaTemplateStore.saveOverride("debate.free", "main", "OVERRIDE_MAIN_TEST");
  await new Promise(r => setTimeout(r, 100));
  const fakeResponses = {
    "claude": { name: "Claude", text: "Claude 回答" },
    "gemini": { name: "Gemini", text: "Gemini 回答" }
  };
  const prompt = self.DebateEngine.buildDebatePrompt("chatgpt", fakeResponses, "free", 1, "", false);
  await self.ArenaTemplateStore.resetOverride("debate.free", "main");
  return { containsOverride: prompt.includes("OVERRIDE_MAIN_TEST") };
});
check("v4.5.0：buildDebatePrompt 使用 override 后的 main",
  buildResult.containsOverride === true, JSON.stringify(buildResult));
```

## 完成验证（DoD）

- [ ] manifest 4.5.0
- [ ] 4 个内置模板渲染
- [ ] 编辑/重置 work
- [ ] 自定义新建+单击插入 work
- [ ] E2E smoke 全绿
- [ ] commit 包含 spec + plan + 代码

## 排错预案

| 症状 | 排查 |
|---|---|
| popup 加载后看不到模板 | 检查 popup-templates.js 是否 listen `rp:activated` |
| 改 prompt 后辩论仍用旧版 | 检查 background SW 是否也 importScripts template-store.js；resolve 在 SW 上下文是否拿到 cache |
| chrome.storage 写入失败 | 看 console，permission 已含 storage |
| 模态弹层穿透到 chrome popup 边界 | popup 是 chrome popup（max 800x600？），用 position:fixed 即可 |
