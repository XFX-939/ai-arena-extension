# AI Arena · 模板库设计 v1

**日期**：2026-05-24
**目标版本**：v4.5.0-beta
**问题归属**：AI Arena Chrome 扩展（`C:\Users\lintian\AI_debate\ai-arena-extension`）

## 1 · 背景与动机

现状下 AI Arena 的"任务 prompt"散落在三处：

| 位置 | 模板内容 |
|---|---|
| `src/debate-engine.js` `DEBATE_STYLES.free.prompt` + `roundHints.free.{1,2,3}` | 自由辩论 主提示 + 3 轮引导 |
| `src/debate-engine.js` `DEBATE_STYLES.collab.prompt` + `roundHints.collab.{1,2,3}` | 群策群力 主提示 + 3 轮引导 |
| `src/debate-engine.js` `buildSummaryPrompt` 大 JSON schema | 裁判总结 |
| `src/ppt-prompts.js` `PPT_TEMPLATE_META.{intro\|topic\|compare\|insight\|landscape}.huaweiSeed` | PPT 5 风格视觉指令 |

**用户痛点**：这些 prompt 写死在代码里，用户不能微调，也不能新增自己常用的提问片段。

**目标**：在右侧栏新增「📋 模板」Tab，把所有 prompt 收纳进**统一的模板库**，让用户能编辑/重置/新建，且**修改后下次按钮触发的任务自动使用新版 prompt**（单一真相源）。

## 2 · 范围

### 包含
- 右侧栏新增第 5 个 Tab「📋 模板」
- 4 个内置任务模板（debate.free / debate.collab / summary / ppt）
- 用户自定义模板（无限制 name + body）
- 编辑器（单字段 / 多字段 tab 切换）
- 单条重置 / 整库重置
- 单击自定义模板 → 插入群聊输入框
- TemplateStore 模块（resolve / save / reset / list），background 和 popup 共用

### 不包含（P1 后续）
- 模板的导入/导出 JSON
- 模板内置默认升级时的"diff 提示弹窗"（用户已选 B2：静默以用户版为准）
- 变量占位符（`{{topic}}` 类）
- 模板分类 / 标签 / emoji 独立选择器（用户已选"精简，无分类"）

## 3 · 关键决策记录

| 决策 | 选择 | 用户确认时间 | 理由 |
|---|---|---|---|
| 模板触发方式 | 自定义模板单击=插入输入框；任务模板单击=展开预览 | 2026-05-24 | 简单可见，不打断流 |
| 改预设的处理 | 直接覆盖，每条可单独重置 + 整库重置 | 同上 | 单一真相源，无副本污染 |
| 变量占位符 | MVP 无变量，纯文本 | 同上 | 自动插入要求无弹窗打扰 |
| 复合模板呈现 | A2：合 1 条，编辑器里多字段 tab 切换 | 同上 | 列表更短 |
| 内置默认升级策略 | B2：静默以用户版为准 | 同上 | 用户无感知，简化实现 |
| 自定义片段单击 | C1：插入输入框 + 不自动发送 | 同上 | 用户可改 @ 再发 |
| 自定义模板 Schema | 仅 `{id, name, body, createdAt, updatedAt}`，**无分类/tags/emoji** | 同上 | 精简，不预设污染用户视野 |
| PPT 5 风格归并 | 合 1 条，5 字段 tab（seed.intro / seed.topic / seed.compare / seed.insight / seed.landscape） | 用户最终确认 | 与辩论模板形式一致 |

## 4 · 架构

### 4.1 模块图

```
内置默认（src/templates-builtin.js — 新文件，纯数据）
        │
        ├──→ background.js (importScripts)
        │       └──→ debate-engine.js / ppt-prompts.js
        │             buildXxxPrompt(...) 改造为从 TemplateStore.resolve 取
        │
        └──→ popup.html (<script src>)
                └──→ popup-templates.js
                       渲染 + 编辑器

  TemplateStore（src/template-store.js — 新文件）
   ├─ resolve(binding, fieldKey) → override?.[fieldKey] ?? builtin field
   ├─ resolveAll(binding) → 合并后的完整模板（含所有字段）
   ├─ saveOverride(binding, fieldKey, value)
   ├─ resetOverride(binding, fieldKey?)（无 fieldKey 重置整条）
   ├─ resetAllOverrides()
   ├─ listUserTemplates()
   ├─ addUserTemplate({ name, body })
   ├─ updateUserTemplate(id, { name?, body? })
   ├─ deleteUserTemplate(id)
   └─ subscribe(cb) → onChange 监听（chrome.storage.onChanged）
            ↑
   chrome.storage.local["arena_templates_v1"]
   {
     overrides: { "debate.free": { main, r1, r2, r3 }, "summary": {...}, "ppt": {...} },
     userTemplates: [{ id, name, body, createdAt, updatedAt }, ...]
   }
```

### 4.2 数据结构

**`src/templates-builtin.js`**：

```js
// 纯数据，无依赖。background 和 popup 都 importScripts/script 加载。
self.ArenaBuiltinTemplates = {
  "debate.free": {
    binding: "debate.free",
    emoji: "⚔️",
    name: "辩论 · 自由",
    category: "辩论",
    fields: [
      { key: "main", label: "主提示", value: "..." },
      { key: "r1",   label: "第 1 轮引导", value: "..." },
      { key: "r2",   label: "第 2 轮引导", value: "..." },
      { key: "r3",   label: "第 3 轮引导", value: "..." }
    ]
  },
  "debate.collab": { /* 同上结构，4 字段 */ },
  "summary": {
    binding: "summary",
    emoji: "⚖️",
    name: "裁判总结",
    category: "总结",
    fields: [{ key: "main", label: "总结指令", value: "..." }]
  },
  "ppt": {
    binding: "ppt",
    emoji: "📊",
    name: "PPT 风格",
    category: "PPT",
    fields: [
      { key: "intro",     label: "技术介绍",  value: "huaweiSeed for intro..." },
      { key: "topic",     label: "技术专题",  value: "..." },
      { key: "compare",   label: "技术对比",  value: "..." },
      { key: "insight",   label: "技术洞察",  value: "..." },
      { key: "landscape", label: "技术全景",  value: "..." }
    ]
  }
};
```

**`chrome.storage.local["arena_templates_v1"]`** 的实际结构：

```js
{
  overrides: {
    "debate.free": { r2: "用户改的第 2 轮文本" },
    "ppt": { intro: "用户改的 PPT intro seed" }
    // 其他 binding/field 未出现 = 用 builtin
  },
  userTemplates: [
    { id: "u_xxxxxxx", name: "📈 A股Top10", body: "...", createdAt: 1716552000000, updatedAt: 1716552000000 }
  ]
}
```

### 4.3 改造影响清单

| 文件 | 改动 |
|---|---|
| `src/templates-builtin.js` | **新建** — 纯数据（4 个内置任务模板） |
| `src/template-store.js` | **新建** — 统一访问层 |
| `src/background.js` | importScripts 增加 templates-builtin / template-store；可能增加 `templateChanged` 广播 |
| `src/debate-engine.js` | `buildDebatePrompt` 改成 `ArenaTemplateStore.resolve("debate.{style}.main"/r1/r2/r3)`；`buildSummaryPrompt` 改成取 `summary.main` |
| `src/ppt-prompts.js` | `PPT_TEMPLATE_META[k].huaweiSeed` 改成在 `buildImagePrompt` 内动态从 `resolve("ppt." + key)` 取，其他字段保持硬编码 |
| `src/popup.html` | 加第 5 个 `.rp-tab` 和对应 `.rp-panel`；引入 `templates-builtin.js`、`template-store.js`、`popup-templates.js` |
| `src/popup-rightpanel.js` | `TABS` 数组加 `"templates"` |
| `src/popup-templates.js` | **新建** — 渲染列表 + 编辑器 + 交互 |
| `src/popup.css` | 加 `.tpl-list / .tpl-item / .tpl-preview / .field-tabs / .modal` 等样式 |
| `src/manifest.json` | bump 到 `4.5.0` / `version_name: "4.5.0-beta"` |
| `src/sidepanel.html` | 同步版本号 |
| `tests/e2e/smoke.mjs` | 5 Tab 断言 + 模板渲染 + 编辑器 + 重置 + 自定义新建+插入输入框 |

### 4.4 关键交互流程

#### 4.4.1 用户改 debate.free 主提示后，下次自由辩论用新版

```
1. 用户在模板 Tab 点 ✎（编辑 ⚔️ 辩论·自由）
2. 编辑器弹层，4 字段 tab，用户改"主提示" tab 的 textarea
3. 点保存 → ArenaTemplateStore.saveOverride("debate.free", "main", newValue)
4. 写入 chrome.storage.local["arena_templates_v1"].overrides["debate.free"].main
5. background SW 通过 chrome.storage.onChanged 自动感知（不需要消息广播）
6. 用户下次从 task-picker 选自由辩论 → debateRound 消息触发
7. background.js handleDebateRound → DebateEngine.buildDebatePrompt
8. buildDebatePrompt 内部调用 ArenaTemplateStore.resolve("debate.free", "main")
   → override 存在 → 返回 newValue
9. 拼成最终 prompt 发给各 AI ✓
```

#### 4.4.2 单击自定义模板 → 插入输入框

```
1. 用户在「我的模板」区单击某条 .tpl-row
2. popup-templates.js 监听 click → 查 userTemplates[id].body
3. 取 #chat-input contenteditable，追加（cur ? cur + "\n" + body : body）
4. 光标移到末尾 + 黄色 flash 反馈 + toast "已插入"
5. 不自动发送（C1 决策）
```

## 5 · 错误处理

| 场景 | 处理 |
|---|---|
| `chrome.storage` 读失败 | TemplateStore.resolve fallback 到 builtin |
| 用户改的 body 为空字符串 | 保存为空（用户自由），resolve 返回空字符串（不 fallback 到 builtin —— 否则没法"清空"覆盖） |
| 自定义模板 name 为空 + body 为空 | 编辑器拒绝保存，toast "名字和正文都为空" |
| 内置数据结构升级（未来加新字段） | 旧 overrides 缺字段 → resolve 回退 builtin；不破坏 |
| 删除自定义模板 | confirm 确认 |
| 整库重置 | confirm 确认，仅清 overrides，不动 userTemplates |

## 6 · 测试方案

### 6.1 单元（在 popup context 内 evaluate）
- TemplateStore.resolve 在无 override 时返回 builtin
- TemplateStore.resolve 在有 override 时返回 override
- TemplateStore.resetOverride 清空 override
- TemplateStore.addUserTemplate / delete / update

### 6.2 E2E（扩展 `tests/e2e/smoke.mjs`）
- 5 Tab DOM 断言（含 templates）
- 4 个内置模板 .tpl-item 渲染
- 编辑器 open/close
- 改 debate.free 的 r2，保存 → chrome.storage.local 出现 overrides
- 单击「整库重置」→ overrides 清空
- 新建自定义模板 → 渲染 → 单击插入输入框（检查 #chat-input 内容）

### 6.3 集成（验证 prompt 真用了新版）
- 改 debate.free.main 后调 background.js 的 DebateEngine.buildDebatePrompt → 输出包含新值

## 7 · 风险

| 风险 | 缓解 |
|---|---|
| TemplateStore 是异步（chrome.storage.local），buildDebatePrompt 当前同步 | TemplateStore 启动时 prefetch 一次到内存缓存；后续 onChanged 同步更新缓存；resolve 永远同步 |
| popup 和 background 缓存可能不一致 | chrome.storage.onChanged 在两端都监听，统一刷新缓存 |
| 用户改坏 prompt 导致辩论崩 | 现有的"全部重置"是兜底；后续可加单字段 diff 预览（P1） |

## 8 · 不变更项（避免范围蔓延）

- 不动 9 个 AI 注入逻辑
- 不动 sidepanel.html（除版本号）
- 不动现有的「成员/任务/统计/设置」4 Tab 实现，只新增第 5 Tab
- 不重构 popup.css 现有规则，只追加新样式
- 不动 build.mjs

## 9 · 完成定义（DoD）

- [ ] manifest 4.5.0-beta；popup chat-version + sidepanel version 都同步
- [ ] 4 个内置任务模板可在「📋 模板」Tab 显示
- [ ] 编辑器 4 字段 tab 切换（debate.free / debate.collab / ppt）
- [ ] 改 debate.free.main 后，再走 buildDebatePrompt 输出含新值
- [ ] 改 ppt.intro 后，buildImagePrompt 输出含新 seed
- [ ] 单击自定义模板 → #chat-input 出现内容
- [ ] 整库重置后 overrides = {}
- [ ] `node tests/e2e/smoke.mjs` 全绿
- [ ] 提交 commit 含 spec + plan + 代码
