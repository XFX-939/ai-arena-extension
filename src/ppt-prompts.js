// ppt-prompts.js — PPT 工坊 prompt 构建（共享 module，纯函数，无 DOM 依赖）
// 由 background.js importScripts，popup 通过 message `pptBuildPrompt` 调用。
// v4.3.0 新增：把 sidepanel.js 的 PPT 工坊 prompt 生成迁出，让 popup 也能用。

const PPT_TEMPLATE_META = {
  intro: {
    name: "技术介绍",
    title: "技术介绍｜揭示核心原理",
    thesis: "{对象}：基于{核心机制}实现{量化收益/能力提升}",
    angle: "解释一个技术对象为什么有效，核心是'机制可信 + 证据可验证'。",
    layout: "中部放核心机制/架构拆解图，左侧放问题约束，右侧放实验指标或收益，下方用证据条收束。",
    mustInclude: "必须出现机制拆解、关键公式/伪代码/链路图、至少 2 个指标或验证口径。",
    avoid: "不要做成领域全景或宏观趋势页；不要只罗列概念。",
    huaweiSeed: "请生成一页 16:9 华为内部技术评审 PPT 截图风格的效果图。白底、高信息密度、左上红色结论标题、顶部细线、右上可放黄色推进箭头、底部保留页码 / Huawei Confidential。标题写成结论句不要写营销口号。主体采用'问题约束 → 机制拆解 → 实验/指标证据 → 输出收益'的因果链。2-4 个紧凑区域，每框包含小标题、2-4 条短句、指标数字、方法标签或微型图表，文字/标注占框内 70%-90%。"
  },
  topic: {
    name: "技术专题",
    title: "技术专题介绍｜总分形式",
    thesis: "{专题名称}：围绕{关键抓手}突破{核心约束}，{指标}提升{数值}",
    angle: "围绕一个专题做总分式展开，核心是'一个总判断 + 多个正交抓手'。",
    layout: "顶部为红色总论点；中部 3-5 个并列模块；底部用指标/验证/场景条做闭环。",
    mustInclude: "必须出现 3-5 个正交方向、每个方向的目标/方法/指标，以及一条横向贯穿链路。",
    avoid: "不要做成单机制详解；不要让多个模块重复同一维度。",
    huaweiSeed: "请生成一页 16:9 华为内部技术专题 PPT 截图风格的效果图。'上方总判断 + 下方多方向证据'的总分结构。上方用 1 条横向技术链路概括，下方拆成 3-5 个正交方向，每个方向包含目标、方法、指标、证据图四类信息中的至少 3 类。"
  },
  compare: {
    name: "技术对比",
    title: "技术对比｜As-Is / To-Be",
    thesis: "{对象}：从 As-Is 到 To-Be，通过{关键变化}带来{量化收益}",
    angle: "突出从现状到目标态的变化，核心是'差异、路径、收益'。",
    layout: "左侧 As-Is，右侧 To-Be，中间用红色演进箭头连接；底部放 2-3 个证据对比块。",
    mustInclude: "必须出现基线指标、目标指标、关键变化点、红色收益标尺或 before/after 图。",
    avoid: "不要只列优缺点；不要缺少量化前后对比。",
    huaweiSeed: "16:9 华为内部技术对比 PPT 截图风格。左中右结构：左侧 As-Is 现有链路/痛点/基线指标，中间用粗细结合的演进箭头和红色关键变化标注，右侧 To-Be 目标架构/新机制/目标指标。"
  },
  insight: {
    name: "技术洞察",
    title: "技术洞察｜新技术科普",
    thesis: "{技术方向}：{关键变化}驱动{能力演进}，{指标}提升{数值}",
    angle: "解释一个新趋势/新技术为什么重要，核心是'变化原因 + 机制解释 + 场景启发'。",
    layout: "左上放趋势或痛点，中心放机制解释，右侧放能力演进，下方放场景收益矩阵。",
    mustInclude: "必须出现趋势判断、关键机制、应用场景、风险/边界、至少 1 个趋势图或场景矩阵。",
    avoid: "不要做成纯科普文章；不要缺少技术边界和落地场景。",
    huaweiSeed: "16:9 华为内部技术洞察 PPT 截图风格。'约束/痛点 → 技术变化 → 机制解释 → 场景收益'四段横向链路，下方放 2-3 个证据区。"
  },
  landscape: {
    name: "技术全景",
    title: "技术全景｜领域沙盘与演进",
    thesis: "{领域/系统}：按{维度A}/{维度B}/{维度C}正交拆分，支撑{收益}提升至{目标值}",
    angle: "给出一个领域/系统的全局结构，核心是'分层、演进、能力覆盖'。",
    layout: "横向用阶段轴或链路轴，纵向用能力层/数据层/模型层/场景层泳道，中下部放场景和指标块。",
    mustInclude: "必须出现分层结构、关键链路、演进阶段、场景覆盖和 2-4 个指标/能力标签。",
    avoid: "不要做成单点机制页；不要让全景图只有空框和大箭头。",
    huaweiSeed: "16:9 华为内部技术全景 PPT 截图风格的'领域沙盘/演进地图'。横向体现阶段、链路或时间演进，纵向体现能力层/数据层/模型层/场景层。顶部 3 步关键突破，中部主架构/数据链路，下部 3-4 个场景扩展或能力增强证据块。"
  }
};

function buildDiscussionFromContext(ctx) {
  const question = ctx.question || "";
  const responses = (ctx.responses || [])
    .map(r => `【${r.name}】\n${(r.text || "").trim()}`)
    .filter(Boolean)
    .join("\n\n");
  if (question || responses) {
    return [
      question ? `【原始问题】\n${question}` : "",
      responses ? `【AI 讨论摘录】\n${responses}` : ""
    ].filter(Boolean).join("\n\n").slice(0, 24000);
  }
  return "请基于我们前面在本网页中的讨论内容整理 PPT 文案；如果你看不到前文，请先向我索要讨论材料。";
}

function buildCopyPrompt(ctx) {
  const source = buildDiscussionFromContext(ctx || {});
  return `你是华为风格企业技术汇报 PPT 的内容编译器。请把我们在本 AI Web 网页中已经展开的长期讨论，整理成后续"生成单页 PPT 效果图"可直接使用的"材料池 + 单页视觉 brief"。

当前阶段：第 1 步 / 3 步：文案生成 → 图片生成 → PPT生成
本步只做内容编译，不生成图片，不生成 PPTX，不写代码。

上下文使用方式：
- 默认你已经能看到本网页上方几十轮讨论、AI 回复和我补充的追问，请优先基于"我们的讨论内容"进行整理。
- 下面的"补充摘录"只是为了防止网页上下文遗漏；如果它和上文不一致，以上文最近讨论为准。
- 不要把本条 prompt、按钮名称、工作流说明当成 PPT 内容主题；它们只是操作指令。
- 如果你完全看不到上文，也无法从补充摘录判断主题，请先向我索要讨论材料，不要凭空编造。

补充摘录：
${source}

核心目标：
1. 先建立高密度 material-pool，再确定 slide thesis、template fit、content slots、word-budget、negative constraints。
2. 把几十轮讨论压缩成"单页华为式技术评审图"需要的高密度材料。
3. 为后续 5 类模板都准备可选择的论点和内容槽，但最后给出一段最推荐的【图片生成输入文案】。

生成要求：
1. 先生成 5000-10000 字【material-pool 内容素材池】。
2. material-pool 至少覆盖：背景与问题、用户目标、对象定义、关键机制、技术路线、对比维度、数据指标、证据链、风险约束、应用场景、落地路径、反方观点、可视化元素。
3. 生成【template fit / scenario pick】：对 5 个模板逐一评分，说明推荐模板和备用模板。
4. 生成【candidate slide theses】：3-5 个结论型标题。
5. 生成【recommended content slots】：3-5 个主模块。
6. 最后输出【图片生成输入文案】：500-900 字。

请严格按以下结构输出：
【0. User brief】
【1. material-pool 内容素材池：5000-10000字】
【2. 共识 / 分歧 / 待验证假设】
【3. template fit / scenario pick】
【4. candidate slide theses】
【5. content slots + word-budget】
【6. negative constraints】
【7. 图片生成输入文案】`;
}

function buildImagePrompt(ctx, templateKey) {
  const t = PPT_TEMPLATE_META[templateKey] || PPT_TEMPLATE_META.intro;
  const copy = ctx.imageBrief || buildDiscussionFromContext(ctx || {});
  // v4.5.0: huaweiSeed 优先从用户模板 override 取（templates-builtin.js / template-store.js）
  const store = (typeof self !== "undefined" ? self : globalThis).ArenaTemplateStore;
  const fieldKey = PPT_TEMPLATE_META[templateKey] ? templateKey : "intro";
  const userSeed = store ? store.resolve("ppt", fieldKey) : "";
  const seed = userSeed || t.huaweiSeed;
  return `你是华为风格企业技术汇报 PPT 的视觉生成器。请把前面已经形成的 PPT 文案，转化为一页 16:9 华为内部技术评审 PPT 效果图。

当前阶段：第 2 步 / 3 步：文案生成 → 图片生成 → PPT生成

补充生图内容：
${copy}

选定模板：${t.title}

模板风格与版式规则：
${seed}

本模板的差异化任务：
- 叙事角度：${t.angle}
- 版式骨架：${t.layout}
- 必须包含：${t.mustInclude}
- 避免误用：${t.avoid}

视觉硬约束：
- 页眉：左上红色结论标题（参考标题格式：${t.thesis}），顶部红/灰细线，右上可放小黄色推进箭头。
- 页脚：左下小页码，中间可放 Huawei Confidential 或 HUAWEI TECHNOLOGIES CO., LTD.。
- 结构：页面由 2-4 个主要区域组成，使用细灰线、浅灰底板、黑色虚线框分区，保持模板 ${t.name} 的版式骨架。
- 信息纹理：混合使用小型图表、公式、热力图、矩阵、微型架构图、表格、标注、箭头。
- 配色：华为红 #CC0000 用于标题/结论/增益；中蓝 #005691 用于技术模块；浅灰 #F2F2F2 用于底板；黄色只用于推进箭头或局部高亮。

最终只生成图像，不要输出解释文字。`;
}

function buildPptxPrompt() {
  return `你是图片转 PowerPoint 的语义重建工程师。请将我们刚生成的 PPT 效果图，或我随后上传的 PNG/JPG，重建为一份可编辑的 PowerPoint PPTX。

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
- 如果当前环境不能直接产出 PPTX，请先输出可执行的重建方案、对象清单、页面尺寸、颜色/字体规范。`;
}

// 全局暴露给 background.js importScripts 后使用
self.PptPrompts = {
  TEMPLATE_META: PPT_TEMPLATE_META,
  buildCopyPrompt,
  buildImagePrompt,
  buildPptxPrompt,
  buildDiscussionFromContext,
};
