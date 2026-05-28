// templates-builtin.js — 内置任务模板的默认数据（纯数据，无依赖）
// 被 background.js importScripts 和 popup.html 直接 <script> 加载
// 用户的覆盖存在 chrome.storage.local["arena_templates_v1"].overrides[binding][fieldKey]
// resolve 顺序：override?.[fieldKey] ?? builtin field.value

(function (root) {
  const BUILTIN = {
    "debate.free": {
      binding: "debate.free",
      emoji: "⚔️",
      name: "辩论 · 自由",
      category: "辩论",
      fields: [
        {
          key: "main",
          label: "主提示",
          value: "以下是其他 AI 对同一问题的回答，请分析他们的观点，指出你认同和不认同的地方，并给出你的改进回答。"
        },
        {
          key: "r1",
          label: "第 1 轮引导",
          value: "这是第1轮辩论。请仔细阅读其他参与者的初始回答，找出核心分歧和共识。"
        },
        {
          key: "r2",
          label: "第 2 轮引导",
          value: "这是第2轮辩论。经过上一轮交锋，请聚焦于仍存在分歧的关键点，深化你的论证或修正你的观点。"
        },
        {
          key: "r3",
          label: "第 3 轮引导",
          value: "这是第3轮辩论。辩论已进入深水区，请避免重复已达成共识的内容，集中攻克剩余分歧点，给出最终立场。"
        }
      ]
    },
    "debate.collab": {
      binding: "debate.collab",
      emoji: "🤝",
      name: "辩论 · 群策群力",
      category: "辩论",
      fields: [
        {
          key: "main",
          label: "主提示",
          value: "以下是你的队友们对同一问题的回答。你们是协作关系，目标是共同得出最优方案。请：1) 吸收队友回答中的亮点和你没想到的角度；2) 补充你认为队友遗漏的重要内容；3) 整合所有人的优势，给出一个更完善的综合回答。不要攻击或否定队友，而是取长补短。"
        },
        {
          key: "r1",
          label: "第 1 轮引导",
          value: "这是第1轮协作。请仔细阅读队友们的回答，找出各自的亮点和你没想到的角度。"
        },
        {
          key: "r2",
          label: "第 2 轮引导",
          value: "这是第2轮协作。队友们已经互相补充了一轮，请在此基础上进一步整合，查漏补缺。"
        },
        {
          key: "r3",
          label: "第 3 轮引导",
          value: "这是第3轮协作。方案已趋于成熟，请做最终打磨——精简冗余，强化核心结论，形成一份完整方案。"
        }
      ]
    },
    "summary": {
      binding: "summary",
      emoji: "⚖️",
      name: "裁判总结",
      category: "总结",
      // 说明：buildSummaryPrompt / buildSummaryPromptText 会在此字段前自动拼接
      //       "你是一场多 AI 辩论的最终裁判 + 问题 + 历史 + 各 AI 观点"的固定 header。
      // 用户编辑这里 = 调整裁判的输出格式 / schema / 严格要求。
      // 两个字段对应两种总结模式：JSON（学术 HTML 报告）+ Text（散文 markdown）
      fields: [
        {
          key: "instruction_json",
          label: "JSON 总结（学术 HTML 报告）",
          value: `请你作为裁判，**直接输出一份 JSON**（不要任何前言/后言/markdown 标记，仅 JSON）按以下 schema：

\`\`\`json
{
  "topic": "辩论的核心命题（精炼成一句话）",
  "core_conclusion": "整场辩论得出的一句话核心结论（150 字以内，是这次辩论最值得带走的认知）",
  "consensus": [
    "共识 1（各方都同意的具体观点，30-80 字）",
    "共识 2"
  ],
  "disagreements": [
    "分歧 1（仍有明确不同立场的点，30-80 字）",
    "分歧 2"
  ],
  "open_questions": [
    "待证 1（辩论中提出但未答的问题，30-80 字）"
  ],
  "key_arguments": [
    {
      "title": "关键论点 1 的命题（如 'Scaling Law 已撞墙'）",
      "supports": [
        { "ai": "Claude", "text": "Claude 支持该论点的核心理由（30-60 字）" }
      ],
      "opposes": [
        { "ai": "Gemini", "text": "Gemini 反对/不同视角的核心理由" }
      ]
    }
  ],
  "highlights": [
    { "ai": "Claude", "text": "整场最精彩的一句引用（原话或浓缩）", "round": 4 }
  ],
  "next_steps": [
    "后续可继续思考的方向 1（具体可行动，30-80 字）"
  ],
  "rounds": [
    {
      "num": 1,
      "title": "本轮的子主题（如 '初始立场' / 'Scaling Law 之争'）",
      "voices": [
        { "ai": "Claude", "text": "Claude 在本轮的核心观点（30-60 字浓缩）" },
        { "ai": "Gemini", "text": "..." }
      ]
    }
  ]
}
\`\`\`

**严格要求**：
1. **整个输出必须是一段合法 JSON**，不要加 \`\`\`json 围栏、不要前言"好的"/"以下是"、不要后续解释
2. AI 名字用前面给出的参与者名字（数组里就用这些字符串）
3. consensus / disagreements / open_questions 数组各 1-5 条
4. key_arguments 数组 2-4 条（最有代表性的论点）
5. highlights 数组 2-4 条（最精彩的引用）
6. next_steps 数组 2-5 条（具体可行动方向）
7. rounds 数组对应实际辩论的每一轮，voices 数组覆盖该轮发言的所有 AI
8. 所有字段必须填充，没有内容就给空数组 []`
        },
        {
          key: "instruction_text",
          label: "文本总结（老版散文 markdown）",
          value: `请你作为裁判，给出结构化的最终总结：

## 共识结论
各方一致认同的核心观点

## 分歧焦点
仍存在争议的地方，列出各方立场

## 最终裁定
综合各方观点后，你认为最准确、最完整的结论是什么

## 实操建议
基于以上讨论，给出可落地的建议

## 标注规则
请对每个结论标注共识度：
- 🟢 全员共识：所有参与者都明确支持此观点
- 🟡 多数认同：多数参与者支持，少数持保留意见
- 🔴 存在争议：参与者之间有明确分歧，列出各方立场
- 💡 独家洞察：仅一方提出但有价值的独特视角

要求：客观公正，不偏袒任何一方，重点是综合各家之长得出最优答案。`
        }
      ]
    },
    "ppt": {
      binding: "ppt",
      emoji: "📊",
      name: "PPT 风格",
      category: "PPT",
      // 说明：前 5 个字段（intro/topic/compare/insight/landscape）= 第 2 步"图片生成"的 huaweiSeed
      //       copy = 第 1 步"文案生成"完整 prompt（含 {{SOURCE}} 占位符表示讨论上下文插入点）
      //       pptx = 第 3 步"PPT 生成"完整 prompt（纯静态，无占位符）
      fields: [
        {
          key: "intro",
          label: "图片生成 · 技术介绍",
          value: "请生成一页 16:9 华为内部技术评审 PPT 截图风格的效果图。白底、高信息密度、左上红色结论标题、顶部细线、右上可放黄色推进箭头、底部保留页码 / Huawei Confidential。标题写成结论句不要写营销口号。主体采用'问题约束 → 机制拆解 → 实验/指标证据 → 输出收益'的因果链。2-4 个紧凑区域，每框包含小标题、2-4 条短句、指标数字、方法标签或微型图表，文字/标注占框内 70%-90%。"
        },
        {
          key: "topic",
          label: "图片生成 · 技术专题",
          value: "请生成一页 16:9 华为内部技术专题 PPT 截图风格的效果图。'上方总判断 + 下方多方向证据'的总分结构。上方用 1 条横向技术链路概括，下方拆成 3-5 个正交方向，每个方向包含目标、方法、指标、证据图四类信息中的至少 3 类。"
        },
        {
          key: "compare",
          label: "图片生成 · 技术对比",
          value: "16:9 华为内部技术对比 PPT 截图风格。左中右结构：左侧 As-Is 现有链路/痛点/基线指标，中间用粗细结合的演进箭头和红色关键变化标注，右侧 To-Be 目标架构/新机制/目标指标。"
        },
        {
          key: "insight",
          label: "图片生成 · 技术洞察",
          value: "16:9 华为内部技术洞察 PPT 截图风格。'约束/痛点 → 技术变化 → 机制解释 → 场景收益'四段横向链路，下方放 2-3 个证据区。"
        },
        {
          key: "landscape",
          label: "图片生成 · 技术全景",
          value: "16:9 华为内部技术全景 PPT 截图风格的'领域沙盘/演进地图'。横向体现阶段、链路或时间演进，纵向体现能力层/数据层/模型层/场景层。顶部 3 步关键突破，中部主架构/数据链路，下部 3-4 个场景扩展或能力增强证据块。"
        },
        {
          key: "copy",
          label: "文案生成（材料池）",
          // v4.9.x: 三方迭代收敛 4 轮的 v3 单页素材包 prompt
          // 角色 = 素材厨房（不是设计师）；4 个认知偏置分工产 8 槽位素材；
          // 含 /handoff 协议直接对齐 gen-ppt-image skill 入参。
          // 完整设计文档：C:\Users\lintian\.arena\prompts\ppt-material-pack-v3.md
          // {{SOURCE}} 占位符由 buildCopyPrompt 替换为讨论摘录
          value: `你是单页 PPT 的"素材厨房"——不是设计师，是素材库。
任务：为我即将自己拼版的单页 PPT，准备一套多选菜单零件库。
不要交付成品页，要交付可重组的素材包。

【模式判断】
- 如果下面"上下文/补充摘录"里有实质讨论 → 走「有源模式」，基于其展开
- 如果没有(或只有几句指令) → 走「无源模式」，先索要 7 项变量再开工：
  页面目标 / 听众 / 论证逻辑 / 必须内容 / 发散边界 / 页面风格 / 输出用途

上下文(优先)：本网页上方讨论
补充摘录：
{{SOURCE}}

【强制第一步 · 复述确认】
用一句话告诉我：你理解的"这页要回答什么问题、给谁看、期望什么动作"。
等我确认或纠偏，再产出素材。不要跳过这步。

【第二步 · 按认知偏置分工产素材】
(适用于 Arena 多 AI 场景；单 AI 场景下一个 AI 全包)

- 忠实执行者：严格按我原逻辑展开
    → 深度分析段 ×1-2(250-400字) + 精简金句 ×5(≤15字)

- 视角颠覆者：换叙事视角(受众/反方/时间纵深 任选)
    → 主标题 ×5(必须含数据型1/设问型1/判断型1/自由2)
    + 红腰带 ×3(≤12字标语+20-30字洞察，独立体裁)

- 反方批判者：挑逻辑漏洞 / 套路警告 / 数据可疑
    → 反方观点 ×3 + 受众尖锐提问 ×5 + 套路警告(如"这是 SWOT 别用")

- 数据视觉官：联网查证 + 出可视化建议
    → 关键数据点 ×≥5(数字+口径+来源+时间)
    + 数据可视化建议 ×2(类型+轴+为什么)
    + 配图 idea ×3(图类型+元素≥3+英文 prompt ≤80词，逗号分隔，加风格词如 flat vector)

- 结构总编(可由任一 AI 兼)：页面骨架 ×2(布局描述) + 内容优先级排序

【输出规则】
- 每个素材标：[遵循原逻辑] / [基于原逻辑补充] / [新角度建议]
- 风格参数(默认华为，可改)：{华为/苹果/麦肯锡/学术/科普}
- 严禁：SWOT/PEST/波特五力 / "挑战机遇并存"废话 / 编造数据
- 数据不确定明说"需核实"，不要硬上
- 总输出 >2000 字时分批，每批结尾问"是否继续"

【第三步 · 等待我挑选，不要自动二轮】
我会回贴："标题3再来5个更狠的" / "配图2出英文 prompt" / "/roast 这套" 这类指令。
内置追问话术(我复制粘贴触发，不要主动跑)：
  • 标题再来5个 → 你出 5 个新主标题，变锐利、加数字、缩短到 8-12 字
  • 配图N出 prompt → 把配图 idea N 细化成 3 个英文 prompt 风格变体(写实/扁平/线条)
  • /roast 这套 → 反方批判者 + 颠覆者联手对当前选定方案挑刺，每条给改法
  • /diverge → 再出 2 套替代方案(换视角 + 换抽象层次)

【最终交接 · 我说"/handoff" 时】
输出两份 artifact (直接对齐 gen-ppt-image skill 入参，跳过它的自动联网搜素材)：

▎artifact 1: material-pool.md (按 6 章节组织，直接喂 gen-ppt-image Step 2.3)
─────────────────
# 主题：{我选定的页面主题}

## 一 · 背景与定义
- {从素材库选取的背景类条目} [来源:...]
- ...

## 二 · 核心机制
- {机制/算法/原理类条目}

## 三 · 关键数据 / 实测
- {数字/benchmark/SOTA，每条带 ✅已核实 / ⚠️需复核 标签}

## 四 · 对比 / 演进
- {As-Is vs To-Be / 竞争对手 / 时间纵深}

## 五 · 案例 / 引用
- {真实落地案例 / 失败教训 / 用户故事}

## 六 · 视觉素材建议 (mini-figure 候选)
- {配图 idea 选定项，含英文 prompt 和隐喻意图}
- {数据可视化建议，含图表类型+轴+理由}

▎artifact 2: handoff.json (喂 gen-ppt-image 的 user_request + meta 字段)
─────────────────
{
  "skill": "gen-ppt-image",
  "user_request": "{一句话总结这页要回答什么问题、给谁看、期望什么动作}",
  "style_pack": "huawei",
  "scenario_mode": "user-locked | auto-pick",
  "scenario_hint": "tpl-1-intro | tpl-2-topic | tpl-3-compare | tpl-4-insight | tpl-5-landscape | (留空让 skill 自动选)",
  "requested_count": 3,
  "title_candidates": ["主标题1", "主标题2"],
  "subtitle_belt_candidates": ["红腰带1", "红腰带2"],
  "negative_constraints": ["不要 SWOT", "不画饼图"],
  "material_pool_ref": "./material-pool.md",
  "source": "ai-arena-ppt-material-pack-v3"
}

▎使用流程
1. 我把上面两份 artifact 保存到 C:/Users/lintian/.ai-team/gen-ppt-image/runs/<时间戳>-<topic>/
2. 进入 Claude Code 调 /gen-ppt-image，告诉它"已准备好 material-pool 和 user_request，
   跳过 Step 2 联网搜集，直接进入 Step 3 选模板 + 出 N 个草稿"
3. 在 Hard Gate 1 选稿后，接力 /huawei-ppt 出 .pptx`
        },
        {
          key: "pptx",
          label: "PPT 生成（语义重建）",
          value: `你是图片转 PowerPoint 的语义重建工程师。请将我们刚生成的 PPT 效果图，或我随后上传的 PNG/JPG，重建为一份可编辑的 PowerPoint PPTX。

当前阶段：第 3 步 / 3 步：文案生成 → 图片生成 → PPT生成

重建原则：
- 视觉 1:1 优先：先保持上一步效果图的整体视觉、布局、层级、配色、密度和 Huawei 技术评审页质感。
- 再恢复可编辑性：标题、正文、表格、图表标签、流程节点、指标数字、箭头尽量使用 PowerPoint 原生对象。
- 可采用"视觉优先 + 可编辑对象覆盖"的混合重建：必要时用小面积 PNG/SVG fallback 保住复杂纹理。
- 如果可以执行文件生成，请按闭环思路完成：源图 → 结构化页面规格 → PPTX → 渲染预览 → 评分 → 差异修正。

重建流程：
1. 识别语义结构：标题区、页眉页脚、主模块、证据图、表格/图表、流程箭头、指标标签。
2. 为每个语义单元建立对象清单，标注 role、bbox、style、native text / native shape / native chart / small fallback。
3. 元素路由：标题、正文、表格、图表轴/标签为 whitelist 必须 native；小箭头、徽标可 native 或小 fallback；复杂纹理、微小 logo 可 fallback。
4. 按视觉层级重建：背景与分区 → 主体模块 → 图表/流程 → 文字与指标 → 标注与细节。
5. 中文字体优先使用微软雅黑；英文和数字使用 Arial。
6. fallback 图片总面积尽量控制在 5% 以内。

交付要求：
- 如果可以直接生成文件，请输出 PPTX。
- 必须检查中文文本是否乱码或异常问号。
- 如果当前环境不能直接产出 PPTX，请先输出可执行的重建方案、对象清单、页面尺寸、颜色/字体规范。`
        }
      ]
    },

    // ============================================================
    // v4.5.2: 场景预设 — 不绑定任务按钮，单击直接插入输入框（clickAction="insert"）
    // 用户可编辑 / 重置 / 不可删
    // ============================================================
    "scenario.literature": {
      binding: "scenario.literature",
      emoji: "📚",
      name: "文献调研",
      category: "场景",
      clickAction: "insert",
      // v4.9.x: 反编造护栏（三方共识 P0）
      //   - ✅/⚠️/❌ 三档标签，让 AI 主动暴露不确定性
      //   - 末尾自评，标记哪些值得用户重点核实
      //   - 反方论文列，避免单一视角
      fields: [
        {
          key: "main",
          label: "文献调研开场",
          value: `请帮我做一次文献调研。

研究主题：[在这里填写你想调研的主题]
时间范围：近 3-5 年的新进展 + 必须包含公认的基础论文（无视年限）
我的背景：[简述你的领域 / 角色 / 已知什么]

【反编造铁律 · 每篇论文必须标注】
✅ 已确认存在：标题、作者、年份、期刊/会议 我都能确定（可联网验证）
⚠️ 不确定标题精确：方向对的论文存在，但标题/作者/年份可能不完全对（请用户复核）
❌ 可能是推测：基于领域知识"应该有这样的论文"，但未必真实存在
🚫 不要硬上：宁可少给 5 篇，也不要凑数编造

请覆盖：
1. 该领域的核心论文（5-10 篇标志性工作）
   - 每篇 1-2 句话说为什么重要
   - 每篇前面打 ✅/⚠️/❌ 标签
2. 主流技术路线 / 学派对比（用表格列）
   - 每个流派列代表论文 + 标签
   - 加 1 列"反方论文"（质疑或竞争路线）
3. 当前 SOTA（state-of-the-art）+ 开源实现链接
   - 开源仓库 URL 也要打 ✅/⚠️/❌
4. 仍未解决的关键挑战（3-5 个）
5. 给我一份推荐入门顺序
   - 先读什么 → 再读什么 → 最后读什么
   - 只推荐 ✅ 标签的论文，⚠️/❌ 不进入入门列表

【输出末尾必须自评】
- 我有信心的部分：__（哪些论文我确定存在）
- 我不确定的部分：__（哪些只是方向推测）
- 建议你额外核实的：__（哪 1-2 篇值得用户用 Google Scholar 验一下）

【严禁】
- 编造看起来像真的但实际不存在的论文标题
- 把"我觉得应该有这种研究"包装成"已发表论文"
- 用模糊措辞掩盖不确定（"研究表明..."后面不给来源）`
        }
      ]
    },
    "scenario.idea": {
      binding: "scenario.idea",
      emoji: "💡",
      name: "创新孵化",
      category: "场景",
      clickAction: "insert",
      fields: [
        {
          key: "main",
          label: "Idea 讨论开场",
          value: `我有一个 idea 想跟你们一起打磨：

[在这里描述你的 idea：要解决什么问题 / 核心思路 / 当前进展]

请你们扮演不同的角色帮我审视：
- 第一位：提出最关键的质疑（哪里没想清楚？最容易失败的点是什么？）
- 第二位：补充落地方案（最小 MVP 怎么做？需要哪些资源 / 团队 / 时间？里程碑怎么切？）
- 第三位：指出市场 / 竞品（已经有谁在做？我们的差异化壁垒在哪？为什么这个时机做？）

最后请综合给一个明确的 GO / NO-GO / PIVOT 建议 + 下一步 3 个具体行动。

要求：尖锐、具体、可执行；避免礼貌性表扬，我要的是真问题。`
        }
      ]
    },

    // ============================================================
    // v4.6.0: 角色帽 — 通用 5 顶（参考 Hub 群聊职责帽机制）
    // 模板库里 clickAction="preview"（展开预览/编辑）
    // 成员栏里独立 UI 触发 → 选 AI → 拼 prompt 入输入框（popup-role-hats.js）
    // ============================================================
    "role.clarifier": {
      binding: "role.clarifier",
      emoji: "❓",
      name: "问题澄清员",
      category: "角色帽",
      fields: [
        { key: "duty",   label: "职责",     value: "负责拆解用户问题、补齐前提、指出会改变答案的关键缺口；不要直接替其他角色下结论。" },
        { key: "format", label: "输出格式", value: "问题拆解 / 已知前提 / 缺失信息 / 关键追问 / 默认假设" }
      ]
    },
    "role.fact_check": {
      binding: "role.fact_check",
      emoji: "🔍",
      name: "事实核验员",
      category: "角色帽",
      fields: [
        { key: "duty",   label: "职责",     value: "负责核验关键事实、数字、引用、时间点与来源；不确定内容必须明确标注「未核验」。" },
        { key: "format", label: "输出格式", value: "已确认事实 / 来源与时间 / 不确定项 / 冲突口径 / 需补查" }
      ]
    },
    "role.critic": {
      binding: "role.critic",
      emoji: "⚠️",
      name: "反方挑战者",
      category: "角色帽",
      fields: [
        { key: "duty",   label: "职责",     value: "负责寻找遗漏、反例、逻辑跳跃和失败路径；避免复述方案优点，避免礼貌性表扬。" },
        { key: "format", label: "输出格式", value: "最大风险 / 反例 / 隐含假设 / 失败信号 / 修正建议" }
      ]
    },
    "role.judge": {
      binding: "role.judge",
      emoji: "🎯",
      name: "综合裁判",
      category: "角色帽",
      fields: [
        { key: "duty",   label: "职责",     value: "负责收敛共识与分歧、给可执行结论和取舍理由；不做无差别折中，不和稀泥。" },
        { key: "format", label: "输出格式", value: "结论 / 取舍理由 / 主要分歧 / 决策条件 / 下一步" }
      ]
    },
    "role.action": {
      binding: "role.action",
      emoji: "✅",
      name: "行动拆解员",
      category: "角色帽",
      fields: [
        { key: "duty",   label: "职责",     value: "负责把结论拆成下一步动作、负责人、验证方式和截止条件；不要再做分析，只输出 actionable 项。" },
        { key: "format", label: "输出格式", value: "下一步 / 优先级 / 负责人或角色 / 验证标准 / 截止条件" }
      ]
    },

    "scenario.code_review": {
      binding: "scenario.code_review",
      emoji: "🔍",
      name: "代码审视",
      category: "场景",
      clickAction: "insert",
      fields: [
        {
          key: "main",
          label: "代码审视开场",
          value: `请帮我审视下面这段代码：

\`\`\`
[在这里粘贴代码]
\`\`\`

上下文：[这段代码做什么 / 在哪里被调用 / 已知的约束]

请覆盖：
1. 正确性：有没有 bug、边界条件遗漏、异常处理缺失、并发 / 异步陷阱
2. 性能：复杂度是否合理、有没有明显瓶颈、内存 / IO 模式是否健康
3. 可读性：命名 / 结构 / 注释是否清晰、能否一眼看懂意图
4. 安全：注入 / 越界 / 敏感信息泄漏 / 输入验证缺失
5. 改进建议：给我 3 个最有 ROI 的修改（按收益 / 成本排序），每个附最小 diff

要求：直接指出问题代码位置 + 行号；避免空泛建议；如果代码本身没大问题就明确说"这段没大问题"，不要为了凑数硬挑刺。`
        }
      ]
    }
  };

  // self 在 SW 中是 ServiceWorkerGlobalScope，在 popup 中是 window
  root.ArenaBuiltinTemplates = BUILTIN;
})(typeof self !== "undefined" ? self : window);
