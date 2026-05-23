# AI Arena: 放弃 sidepanel — 全功能合并到 popup 群聊窗口

- **日期**：2026-05-23
- **版本目标**：v5.0
- **当前版本**：v4.0.15-beta
- **影响范围**：UI 重构 + chrome.action 入口变更 + 状态同步链路简化

## 1. 背景与动机

AI Arena 扩展当前并存两个交互入口：

- **sidepanel.html**（~360 px）：参与者管理、任务控制台（同时提问 / 辩论 / PPT）、状态日志、统计、主题切换
- **popup.html**（~900×720）：左对话目录侧栏 + 气泡聊天主区 + 底部 task-picker

四类用户痛点全部命中：

1. 双窗口状态同步老出 bug（v4.0.5/6/7 一连串"提取失败 / 字数消失 / 状态跳回"回归）
2. 认知负担：两窗口都有"开始辩论"按钮，新用户难以理解
3. sidepanel 太窄、强制吸附浏览器右侧、不能跨屏拖
4. 维护成本：两套主题 + 两套 button handler

## 2. 合并目标

**核心要求**：不损失任何 sidepanel 当前能力；popup 成为唯一交互入口。

**总体布局**：popup 升级为三栏

```
┌────────────┬──────────────────────────┬────────────┐
│ 左栏 220px │  聊天主区 620px          │ 右栏 260px │
│ 对话目录   │  气泡 + roster + 输入栏  │  4 Tab     │
└────────────┴──────────────────────────┴────────────┘
```

**popup 默认尺寸**：1100 × 720（从当前 900 提升）。

## 3. 左栏（对话目录） — 沿用现有

保留 v4.0.10/11/12 已实现的全部能力，不动：

- 搜索框 + 全局/仅提问 模式切换
- 时间分组（今天 / 昨天 / 日期）
- 拖动调宽
- 右键复制
- 点击跳转到对应消息

## 4. 中栏（聊天主区） — 微调

继承 v4.0.15 现状，仅做一处调整：

- **下轮发言 roster**：原本一行，保留位置
- **顶部 header**：版本号升至 v5.0；保留 🎨（主题快切，替代弹出菜单）🗑（清空）⚙️（高级设置浮层）三图标
- **状态日志**：归到右栏设置 Tab，不在主区占位

## 5. 右栏 — 4 Tab 切换（核心）

四个一级 Tab：**👥 成员 / ⚙️ 任务 / 📊 统计 / 🔧 设置**。

切换交互：点击 Tab 头切换；当前 Tab 状态记忆到 chrome.storage.local。

### 5.1 成员 Tab

来源：sidepanel `.add-group` + `.participant-list` + `.mode-toggle`

**布局**：

```
[已加入 (n/3)]
● Claude         ⋯
● Gemini         ⋯
● GPT-5          ⋯

[添加]
+ DeepSeek  + 豆包
+ 千问      + Kimi
+ 元宝      + Grok

[AI 窗口布局]
[ Tab ][ 并列 ]
```

**参与者卡片精简规则**（重要）：

- **只保留**：状态点（8 px 圆点） · 名字 · `⋯` 菜单按钮
- **移除**：字数、提取中进度（主区气泡已实时显示）
- 状态点颜色：绿=已完成 / 橙=输出中 / 红=失败 / 灰=未启动
- 点击 `⋯` 浮出菜单：`🔄 重发` / `📥 重新提取` / `🗑 移除`

**未加入按钮**：2 列 3×2 网格；点击调用现有 `addParticipant(service)`，复用所有现有逻辑。

**AI 窗口布局开关**：Tab/并列 二选一；继承现有 `state.layoutMode` 字段。

### 5.2 任务 Tab — context-sensitive

**关键设计**：内容随底部 task-picker 选择动态切换。

| 底部 task-picker 选项 | 任务 Tab 显示内容 |
|---|---|
| 同时提问 | 空状态提示"在底部输入框直接发送即可" |
| 辩论（自由/群策） | 辩论控制台（见下） |
| 裁判总结 | 裁判选择 + 输出总结 + 导出 + 重置 |
| PPT 制作 | PPT 工坊（三按钮 + prompt 编辑） |

**辩论控制台细化**：

```
[当前 · 辩论控制台]
[⚔️ 自由 |  🤝 群策]      ← 模式 toggle，互斥
▾ 引导注入（可选）
   [textarea]
□ 简洁模式
[⚔️ 开始辩论]              ← 主按钮，蓝
[🔄 强制重试]              ← 次按钮

[总结 / 导出]
[选择裁判 ▾]
[📋 输出总结]
[📤 导出] [⚡ 重置]

[PPT 工坊 ▸]              ← 默认折叠
```

**PPT 工坊折叠展开后**：保留现有三按钮（文案生成 / 图片生成 / PPT 生成）+ 模板下拉 + prompt textarea + 保存 prompt 菜单。

### 5.3 统计 Tab

来源：sidepanel `.stats-section`

```
[本次] [累计] [模型]       ← sub-tabs

┌──────┬──────┐
│  12  │   7  │
│ 对话 │辩论轮│
├──────┴──────┤
│   28.4k     │
│   Token     │
└─────────────┘

[本次活跃]
● Claude     1.2k 字
● Gemini      980 字
● GPT-5      1.5k 字
```

继承所有现有统计数据源（StateMachine.stats / lifetimeStats / perModelStats）。

### 5.4 设置 Tab

来源：sidepanel `.theme-switcher` + `.log` + 快捷键提示

```
[主题] (2 列 6 项)
● Aurora ✓   ○ Dark Command
○ Warm       ○ Neon
○ Light      ○ Sunset

[状态日志]
┌─────────────────────────┐
│ 14:23  Claude 完成      │
│ 14:23  提取 1182 字     │
│ 14:24  GPT-5 polling…   │
└─────────────────────────┘

[快捷键]
Ctrl+Enter   发送
Ctrl+Shift+D 辩论
@            单发
```

主题切换：复用 sidepanel-themes.css 全文，将 `<body data-theme="X">` 挂到 popup body 上。

## 6. 顶部 header 三图标

- **🎨 主题**：点击展开小浮层，6 主题快切；与设置 Tab 内的主题选择**双向同步**
- **🗑 清空**：调用现有 `chrome.runtime.sendMessage({ type: "chatClear" })`
- **⚙️ 设置**：直接跳转到设置 Tab（让 4 Tab 成为唯一设置入口，避免多套设置浮层）

## 7. chrome.action 入口变更

**变更前**：点击扩展图标 → 打开 sidepanel
**变更后**：点击扩展图标 → 开启或聚焦 popup 窗口

**实现**：在 background.js 的 `chrome.action.onClicked` 监听器：

```javascript
chrome.action.onClicked.addListener(async () => {
  const existing = await chrome.windows.getAll({ populate: true });
  const popupWin = existing.find(w => w.type === "popup" &&
    w.tabs?.some(t => t.url?.endsWith("/popup.html")));
  if (popupWin) {
    await chrome.windows.update(popupWin.id, { focused: true });
  } else {
    await chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      width: 1100,
      height: 720,
    });
  }
});
```

单例语义：避免多次点击产生多个 popup 窗口。

## 8. 删除清单（v5.0）

待 popup 完整承载所有功能后，物理删除：

- `src/sidepanel.html`
- `src/sidepanel.css`
- `src/sidepanel.js`
- `src/sidepanel-themes.css`（**保留主题色样本迁移到 popup.css**）
- `manifest.json` 删除 `"sidePanel"` 权限和 `side_panel` 字段
- `background.js` 删除所有 `chrome.sidePanel.*` 调用
- `tests/e2e/smoke.mjs` / `stress.mjs` 中 sidepanel-only 用例删除，新增右栏 4 Tab 用例

## 9. 状态同步链路简化

**之前**：sidepanel ↔ background ↔ popup 三方（同步 bug 高发）
**之后**：popup ↔ background 两方

background 仍然是 source of truth：StateMachine / ChatBus / 统计 / 主题偏好。popup 启动时拉 `getState`，订阅 `chrome.runtime.onMessage` 增量更新。

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| `getAiTargetLayout` 当前以 sidepanelScreen 为锚点 | 改为 popup window 自身的 `chrome.windows.get(popupId, { populate:true })` 取屏，stress.mjs A1/A2 用例同步重写 |
| 用户习惯 sidepanel 常驻浏览器右侧 | popup 支持记忆位置/尺寸（`chrome.storage.local`），关闭再打开还原 |
| Phase 1 期间双入口并存导致同步 bug | Phase 1 不删 sidepanel，但所有写操作以 popup 为主；sidepanel 设为只读演示态 |
| 主题切换在 popup 与 sidepanel 双向同步复杂 | Phase 1 直接让 sidepanel 只读 popup 主题；Phase 3 一刀切删除 |

## 11. 分阶段路线

| Phase | 版本 | 工时 | 目标 |
|---|---|---|---|
| 1 | v4.1 | 2-3 天 | popup 加 4 Tab 右栏，全功能自足；sidepanel 保留共存 |
| 2 | v4.9 | 0.5 天 | chrome.action 默认开 popup；sidepanel 设为隐藏入口 |
| 3 | v5.0 | 0.5 天 | 物理删除 sidepanel.*；版本号 4 处同步刷新 |

总计 ~4 天。

## 12. 默认采纳的设计决策

用户对方案整体笼统通过（"不错，先按这个实现"），未逐项勾选。下方为本 spec 推进时默认采纳，如后续 plan 阶段发现问题可回退调整：

1. popup 默认尺寸 **1100 × 720**
2. 右栏宽度 **260 px**
3. 参与者卡片极简：状态点 + 名字 + `⋯` 菜单（移除字数显示）
4. 任务 Tab 内容随底部 task-picker **动态切换**
5. 状态日志归到**设置 Tab**（非底部 footer）
6. 顶部 header 保留 🎨 🗑 ⚙️ 三图标

## 13. 验收标准

- 单开 popup（不开 sidepanel）能完成 v4 所有用例：添加 AI / 同时提问 / 自由辩论 / 群策群力 / 裁判总结 / PPT 三步 / 主题切换 / 统计查看 / 导出
- E2E 测试矩阵：smoke 用例覆盖 4 Tab 切换；stress 用例覆盖 task-picker ↔ 任务 Tab 联动、popup 状态同步
- v5.0 版本号在 manifest version、version_name、popup.html chat-version 三处一致
- 无任何 `chrome.sidePanel.*` 调用残留
