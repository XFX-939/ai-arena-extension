# 敏感信息守门员 · 设计 spec

| | |
|---|---|
| 项目 | AI Arena Chrome 扩展 |
| 里程碑 | v4.9.0（MVP 引擎 + 弹窗）/ v4.9.1（设置页 + 团队包） |
| 上游决策 | `.arena/artifacts/sensitive-info-gatekeeper-design-v1.html` |
| brainstorming 日期 | 2026-05-27 |

---

## 1. 目标与设计原则

### 1.1 目标

用户在 AI Arena 发送 prompt 时，**在内容离开本机之前**本地扫描敏感信息，命中则弹窗阻断给用户三个选项（自动打码 / 取消修改 / 我确认无敏感 · 加入白名单）。让"把内网资料给 AI"从「不敢做」变成「点几下就放心做」，扫除华为同事使用 AI 工具的合规阻力。

### 1.2 成功标准

- 命中扫描在 <50ms 内完成（用户感知无延迟，<5% 发送总耗时）
- 5 类高频敏感模式（工号 / 内网 IP / 邮箱 / 手机号 / 内网域名）通过内置正则识别准确率 >95%
- 用户/团队可自定义扩展词表；导入团队包后 <2s 立即生效
- 零网络请求（所有数据在 chrome.storage 本地）

### 1.3 核心原则

1. **纯本地** — 扫描全部在浏览器内完成，零网络请求。词表、白名单、命中记录全在 `chrome.storage.local`。
2. **透明可审计** — 用户能看到、导出、修改所有规则 / 白名单。无暗箱。
3. **默认严格、操作可放宽** — 默认开启 + 弹窗阻断；用户主动加白名单后免打扰。
4. **YAGNI** — MVP 不做实时 lint，不接 ML，不接云端校验，不扫 AI 响应。
5. **复用现有架构** — 弹窗复用 v4.8.65 `ChatModal`；拦截走 v4.8.65 同款 `{ ok:false, reason:... }` 协议。

---

## 2. 架构概览

### 2.1 拦截层：background 集中

所有发送链路（chatBroadcast / debateRound / summary / sendPromptToService / broadcast）汇聚到 `background.js` 同一个 wrapper：

```
guardedSend({ text, handler, msg })
  → if (!enabled || msg.skipGatekeeper) return handler()
  → hits = SensitiveGatekeeper.scan(text)
  → if (hits.length === 0) return handler()
  → masked = SensitiveGatekeeper.maskText(text, hits)
  → return { ok: false, reason: "sensitive_blocked", hits, masked, original: text }
```

**重发协议**：popup 收到 `reason:"sensitive_blocked"` 后调 `ChatModal.showSensitiveBlocked(...)` 弹守门员 modal。按钮回调里用 **原 chrome.runtime.sendMessage 的 message type** 重发，仅替换 text 字段 + 加 `skipGatekeeper:true` 标志。例如原是 `{ type:"debateRound", style:"free", guidance:"问题 X" }`，重发时是 `{ type:"debateRound", style:"free", guidance:"<masked>", skipGatekeeper:true }`。

为避免 popup 多处重复"收 reason → 弹 modal → 按钮重发"逻辑，抽一个公共 bridge（详见 §5.1 的 `popup-gatekeeper-bridge.js`）。

### 2.2 数据流（命中场景）

```
popup 触发某发送动作（任意 message type：chatBroadcast / debateRound / summary / ...）
  → background.<handler>(msg)
  → guardedSend({ text: msg.text||msg.guidance||..., handler, msg })
  → SensitiveGatekeeper.scan(text) → hits = [...]
  → return { ok:false, reason:"sensitive_blocked", hits, masked, original }
  → popup 收到响应 → 调 popup-gatekeeper-bridge.handleResp(originalMsg, resp)
  → bridge 内部 ChatModal.showSensitiveBlocked(hits, masked, original, handlers)
  → 用户选 ↓
     ├ 取消修改 → modal 关 + 焦点回输入框
     ├ 自动打码 → 用 originalMsg 模板重发：{ ...originalMsg, <textField>:masked, skipGatekeeper:true }
     └ 我确认无敏感·加入白名单 → addWhitelist(hits.map(h ⇒ h.text))
                                  + 用 originalMsg 模板重发 with skipGatekeeper:true
```

### 2.3 数据流（不命中场景）

```
popup → background.chatBroadcast(text)
  → guardedSend → scan → hits=[] → handler(text)
  → 原流程继续，0 额外步骤（用户无感）
```

---

## 3. 数据结构

### 3.1 Rule（规则）

```js
{
  id: "huawei-staff-id",           // 唯一标识
  category: "工号",                 // 打码后显示的标签
  type: "regex",                    // "regex" | "literal" | "literal-list"
  pattern: "\\b[A-Z]?\\d{8}\\b",    // regex 字符串
  flags: "g",
  source: "builtin",                // "builtin" | "user" | "team"
  enabled: true,
  severity: "block",                // "block"（阻断）| "warn"（标黄不阻断）
  desc: "华为工号：可选字母前缀 + 8 位数字"
}
```

### 3.2 Hit（命中结果）

```js
{
  rule: "huawei-staff-id",
  category: "工号",
  text: "Z12345678",                // 原文片段
  index: 42,
  length: 9,
  masked: "<工号>",
  severity: "block"
}
```

### 3.3 Whitelist（个人白名单）

```js
{
  "Z12345678": { addedAt: 1716800000, note: "我自己的工号" },
  "10.10.10.5": { addedAt: 1716800200, note: "" }
}
```

### 3.4 团队词表包 `.arena-pack.json`

```js
{
  schema: "arena-gatekeeper-pack/v1",
  name: "无线产品线·敏感词包",
  version: "2026.05.27",
  author: "lintian",
  rules: [ /* Rule[] */ ],
  whitelist: { /* 可选，团队级公共白名单 */ }
}
```

### 3.5 chrome.storage 布局

| key | 类型 | 用途 |
|---|---|---|
| `gatekeeper.enabled` | bool | 总开关，默认 true |
| `gatekeeper.rules.builtin` | Rule[] | 插件自带词表（首次启动注入） |
| `gatekeeper.rules.user` | Rule[] | 用户自定义词 |
| `gatekeeper.rules.team` | Rule[] | 导入的团队包 |
| `gatekeeper.whitelist` | object | 跳过过的词，下次不弹 |
| `gatekeeper.stats` | object | 命中次数 / 选择历史（仅本地，可清空） |

---

## 4. MVP 内置词表

### 4.1 正则类（高准确率，全部 severity:"block"）

| 类别 | pattern | 打码为 |
|---|---|---|
| 工号 | `\b[A-Z]?\d{8}\b` | `<工号>` |
| 内网 IP | 10/172.16-31/192.168 段 | `<内网 IP>` |
| 华为邮箱 | `[\w.]+@huawei\.com` | `<内部邮箱>` |
| 手机号 | `\b1[3-9]\d{9}\b` | `<手机号>` |
| 内网域名 | `*.huawei.com` 子集 | `<内部域名>` |

### 4.2 词表类（literal-list）

| 词 | 类别 | severity | 备注 |
|---|---|---|---|
| 中国移动 / 中国电信 / 中国联通 / 中国广电 | `<客户>` | block | 默认启用 |
| （项目代号占位） | - | - | **MVP 留空**，让用户/团队按需加 |
| 保密 / 内部 / 未公开 / 投标 / 议价 | `<保密词>` | **warn** | 标黄不强阻 |

### 4.3 设计权衡

- **不内置项目代号**：代号每个部门都不一样，内置反而误报多。靠 user/team 层补。
- **战略词（保密/内部）走 warn 级别**：在合理文档讨论里这些词常见，强阻断会造成大量误报疲劳。
- **规则可见可改**：所有 builtin 规则在「设置 → 守门员 → 词表」里能看到 + 单条禁用。

---

## 5. 模块拆分

### 5.1 新增模块

| 文件 | 职责 | 依赖 |
|---|---|---|
| `src/gatekeeper-rules.js` | 内置词表数据，导出 `BUILTIN_RULES`。纯数据。 | 无 |
| `src/gatekeeper-store.js` | 词表/白名单/统计的 storage 抽象。提供 `loadRules`、`saveUserRule`、`addWhitelist`、`importTeamPack`、`exportTeamPack`。 | gatekeeper-rules + chrome.storage |
| `src/gatekeeper-engine.js` | 扫描引擎。`scan(text) → Hit[]`、`maskText(text, hits) → string`。合并所有规则为单 mega-regex 提速。 | gatekeeper-store |
| `src/popup-gatekeeper-bridge.js` | popup 端公共桥接。`handleResp(originalMsg, resp, opts)` — 收到 `reason:"sensitive_blocked"` 时弹 modal，按钮回调用 originalMsg 模板重发。`opts.textField` 指定哪个字段是 text（默认 "text"，debateRound 是 "guidance"）。 | popup-modal |
| `src/popup-gatekeeper-settings.js` | 设置页 UI 逻辑（守门员一级 Tab）。 | gatekeeper-store |

### 5.2 现有模块改造

| 文件 | 改动 |
|---|---|
| `src/background.js` | 1. importScripts 引入 3 个 gatekeeper 模块；2. 实现 `guardedSend(text, handler, opts)` wrapper；3. chatBroadcast / debateRound / summary / sendPromptToService 入口包裹 guardedSend。 |
| `src/popup-modal.js` | 新增 `showSensitiveBlocked(ctx, handlers)`，渲染命中清单 + 3 按钮。 |
| `src/popup-tasks.js` & `src/popup-task-menu.js` & `src/popup.js handleSend` | 各发送回调把 response 喂给 `ChatGatekeeperBridge.handleResp(originalMsg, resp, opts)`，由 bridge 统一弹 modal 和重发。每处只多 2-3 行调用代码。 |
| `src/popup.html` | 右栏 tab bar 新增 `🛡 守门员` Tab，对应面板 `#rp-panel-gatekeeper`。 |
| `src/popup-rightpanel.js` | 注册新 Tab 切换逻辑。 |
| `src/popup.css` | gatekeeper 设置页样式 + modal 命中清单样式。 |
| `src/manifest.json` | 3 个新 gatekeeper-*.js 加入 background.service_worker importScripts 链。 |

---

## 6. 关键流程

### 6.1 命中后用户选「自动打码后发送」

1. popup 调用方收到 `resp = { ok:false, reason:"sensitive_blocked", hits, masked, original }`
2. 调用方调 `ChatGatekeeperBridge.handleResp(originalMsg, resp, { textField: "text" })`
3. bridge 调 `ChatModal.showSensitiveBlocked` 显示命中清单（原文高亮）+ masked 预览（绿色 diff）
4. 用户点「自动打码后发送」→ bridge 用 originalMsg 模板重发：`{ ...originalMsg, [textField]:masked, skipGatekeeper:true }`
5. background `guardedSend` 看到 skipGatekeeper=true → 直接走 handler → 注入到各 AI
6. stats +1 命中 / +1 自动打码

### 6.2 用户选「我确认无敏感 · 加入白名单」

1. bridge 调 `gatekeeper.addWhitelist(hits.map(h ⇒ h.text))`
2. bridge 用 originalMsg 模板重发：`{ ...originalMsg, [textField]:original, skipGatekeeper:true }`
3. 下次同样的词不再弹（已入白名单）
4. stats +1 命中 / +1 跳过

### 6.3 用户选「取消修改」

1. modal 关闭
2. popup 焦点回输入框，原文保留
3. stats +1 命中 / +1 取消

### 6.4 团队词表分发

1. 同事 A 在「设置 → 守门员 → 词表」加 20 个项目代号
2. 点「导出团队包」→ 下载 `arena-gatekeeper-<name>-<date>.arena-pack.json`
3. 通过任意手段（邮件 / wiki / 共享盘）发给同事 B
4. 同事 B 在「设置 → 守门员」点「导入团队包」→ 选文件
5. 词表合并到 `rules.team`，立即生效

### 6.5 误报修正

- 「设置 → 守门员 → 白名单」可看到所有跳过过的词，每条有删除按钮（删后下次又会弹）
- 一键「清空白名单」按钮（带二次确认）

---

## 7. 弹窗 UI

### 7.1 文案 v1（spec 阶段定，plan 阶段可微调）

| 元素 | 文案 |
|---|---|
| Modal 标题 | `⚠ 检测到 N 处敏感信息` |
| 副标题 | `发送前请确认，避免内部信息流向外部 AI` |
| 命中清单标题 | `命中项：` |
| 预览标题 | `📝 自动打码后的预览：` |
| 主按钮（中间，accent 蓝） | `自动打码后发送` |
| 次按钮（左，灰） | `取消修改` |
| 次按钮（右，灰） | `我确认无敏感 · 加入白名单` |
| 关闭 ✕ | 等同「取消修改」 |

### 7.2 视觉骨架

```
┌──────────────────────────────────────────────────┐
│                                              ✕  │
│         ⚠                                        │
│   检测到 3 处敏感信息                              │
│   发送前请确认，避免内部信息流向外部 AI              │
│                                                  │
│   命中项：                                         │
│   ┌──────────────────────────────────────────┐   │
│   │ 工号       Z12345678                     │   │
│   │ 内网 IP    10.10.20.5                    │   │
│   │ 客户       中国移动                       │   │
│   └──────────────────────────────────────────┘   │
│                                                  │
│   📝 自动打码后的预览：                            │
│   "请帮我分析 <工号> 在 <内网 IP> 上 ..."           │
│                                                  │
│   [ 取消修改 ]  [ 自动打码后发送 ]  [ 我确认无敏感 ] │
└──────────────────────────────────────────────────┘
```

设计要点：
- 主按钮（自动打码）放中间 accent 色，是推荐路径
- 两侧按钮颜色弱化，避免误点「确认无敏感」
- 预览块用 diff 视觉（红色原文 → 绿色 `<类别>`）让用户看清替换

---

## 8. 设置 Tab（一级新增）

### 8.1 入口

popup 右栏顶部 tab bar 新增 `🛡 守门员` Tab，与「成员 / 任务 / 统计 / 模板 / 设置」同级。

### 8.2 内容区分块

| 区块 | 内容 |
|---|---|
| **总开关** | 大尺寸 toggle「敏感信息守门员」+ 已禁用天数计数（鼓励开启） |
| **统计** | 累计命中次数 / 自动打码次数 / 跳过次数 + 一键清空 |
| **内置词表** | 5 类正则 + 词表，每条可禁用（不能删） |
| **个人词表** | 用户加的词，每条 [编辑] [删除] + 顶部「+ 添加词」 |
| **团队词表** | 已导入的团队包列表 + [导入团队包] [导出我的词表] |
| **白名单** | 跳过过的词列表 + [删除单条] [清空全部]（带二次确认） |

---

## 9. 边缘场景与错误处理

| 场景 | 处理 |
|---|---|
| 用户禁用守门员（总开关 off） | guardedSend 直接调 handler，跳过 scan。设置页加红色警示文字。 |
| 超长 prompt（> 50000 字） | 合并 regex 仍 <50ms。MVP 不分块。 |
| 团队包格式异常 | importTeamPack 用 try/catch + schema 校验（`schema === "arena-gatekeeper-pack/v1"`）。失败时弹原因。 |
| 用户白名单 > 1000 条 | 设置页加「白名单条目数」提示，超过 500 给软警告。 |
| 同时多 AI 并行注入 | scan 在 background 链路一次完成，hits=[] 后才广播。无并发问题。 |
| 弹窗时用户关 popup | text 未发送 = 默认行为「取消」。安全。 |
| 团队包带恶意 regex（ReDoS） | 导入前 safe-regex 静态检查；运行时 scan 100ms 超时兜底。 |
| Service Worker 重启后 scan 状态丢失 | 不持久化状态。下次 scan 时从 chrome.storage 重新构建 mega-regex。 |
| 用户在 modal 时收到第二个 sensitive_blocked | 复用 ChatModal 的 close-then-show 机制（已有，新 modal 覆盖旧）。 |

---

## 10. 测试策略

### 10.1 静态测试（smoke.mjs）

- 4 个新模块文件存在 + 关键 export 校验
- BUILTIN_RULES ≥ 5 条正则 + 4 个运营商词
- background.js 含 `guardedSend` wrapper + 5 个发送 handler 都被包裹
- popup-modal.js 暴露 `showSensitiveBlocked`
- popup-gatekeeper-settings.js 设置页 DOM 节点
- manifest.json importScripts 含 3 个 gatekeeper-*.js

### 10.2 运行时测试（smoke.mjs 在 popup 内 eval）

- **命中**：`scan("我的工号 Z12345678")` → `hits.length === 1` && `category === "工号"`
- **不命中**：`scan("今天天气真好")` → `hits.length === 0`
- **打码**：`maskText("Z12345678", hits) === "<工号>"`
- **白名单**：`addWhitelist("Z12345678")` 后再 scan → 0 hit
- **Modal**：`showSensitiveBlocked(...)` → DOM 出现 + 3 按钮可点
- **团队包**：`importTeamPack(JSON.stringify({...}))` → `rules.team` 数量正确
- **超时**：恶意 regex 100ms 兜底 → scan 不卡死

### 10.3 E2E 手动验证

1. 新建 popup，发"我的工号 Z12345678 是…" → 弹守门员 → 选「自动打码」→ 发送的实际内容是"`<工号>` 是…"
2. 同一句话再发 → 选「我确认无敏感」→ 再发同样的不再弹
3. 设置 → 守门员 → 白名单看到 Z12345678 → 删除 → 再发又弹
4. 导出团队包 → 用文本编辑器看 .json 结构
5. 新装 chrome profile 导入团队包 → 立即生效

---

## 11. MVP 范围与后置

### 11.1 MVP（v4.9.0 + v4.9.1）

> **本 spec 的实施 plan 范围 = v4.9.0**（引擎 + 拦截 + 弹窗 + bridge）。v4.9.1 设置页另起 plan，可不另开 spec。

**v4.9.0 — 引擎 + 拦截 + 弹窗**
- gatekeeper-rules / store / engine 三个核心模块
- popup-gatekeeper-bridge 公共桥接模块
- background guardedSend wrapper + 5 个发送链路 hook
- popup-modal showSensitiveBlocked + 3 个按钮回调
- popup-tasks / popup-task-menu / popup.js 调 bridge.handleResp

**v4.9.1 — 设置页 + 团队包**
- 右栏新增「🛡 守门员」一级 Tab
- 总开关 / 统计 / 词表 CRUD / 白名单管理
- 团队包导入导出（.arena-pack.json）

### 11.2 后置（Phase 2）

- 输入时实时 lint 高亮（UX 提升不是必需）
- 团队包 OTA 更新（订阅 URL，需要中心 URL 协调）
- 设置页搜索（白名单/词表条目多时）

### 11.3 后置（Phase 3）

- 本地 WASM 小模型上下文判定（"这个 Z12345678 是不是真的工号"）
- AI 回复扫描（价值低，用户已经发出去过自己的工号）
- 多语言扩展（英文工号格式 / 国际客户名）

---

## 12. 已知风险

| 风险 | 严重度 | 缓解 |
|---|---|---|
| 误报疲劳：内置规则太严让用户烦 | 中 | MVP 内置只保留极高准确率的正则；项目代号不内置 |
| 团队包恶意 ReDoS | 低 | 导入前 safe-regex 检查 + 运行时 100ms 超时 |
| 用户全关守门员 | 中 | 设置页加红色警示 + 已禁用天数计数；不强制启用 |
| 同事不知道有这功能 | 中 | 新手教程 v4.8.67 page 4 增加守门员说明（v4.9.0 同步） |

---

## 13. 工作量估算

参考 v4.8.65（modal + state 同步）= 1.0x 基线。

| 阶段 | 估算 | 备注 |
|---|---|---|
| v4.9.0 引擎 + 弹窗 | 1.5-2.0x | 5 个新模块 + 5 个 handler hook + modal 扩展 + E2E 完整覆盖 |
| v4.9.1 设置页 + 团队包 | 1.0-1.2x | 设置 Tab UI + 词表 CRUD + 导入导出 |

合计约 v4.8.65 的 2.5-3x 工作量，建议拆 2 个 patch。

---

## 14. 上游 design 草案

完整可视化版本：
`C:\Users\lintian\AI_debate\ai-arena-extension\.arena\artifacts\sensitive-info-gatekeeper-design-v1.html`

包含弹窗 ASCII 草案、架构图、模块卡片，跟本 spec 内容一致。
