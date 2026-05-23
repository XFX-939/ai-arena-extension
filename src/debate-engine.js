// debate-engine.js — 辩论轮次编排、prompt 组装

// v2.1.0: marker 已移除，完成检测改用 fetch hook + MutationObserver

const DEBATE_STYLES = {
  free: { name: "自由辩论", prompt: "以下是其他 AI 对同一问题的回答，请分析他们的观点，指出你认同和不认同的地方，并给出你的改进回答。" },
  collab: { name: "群策群力", prompt: "以下是你的队友们对同一问题的回答。你们是协作关系，目标是共同得出最优方案。请：1) 吸收队友回答中的亮点和你没想到的角度；2) 补充你认为队友遗漏的重要内容；3) 整合所有人的优势，给出一个更完善的综合回答。不要攻击或否定队友，而是取长补短。" },
};

const DebateEngine = {
  buildDebatePrompt(participantId, responses, style, roundNum, guidance, concise) {
    const styleConfig = DEBATE_STYLES[style] || DEBATE_STYLES.free;
    const isCollab = style === "collab";

    const roundHints = isCollab ? {
      1: "这是第1轮协作。请仔细阅读队友们的回答，找出各自的亮点和你没想到的角度。",
      2: "这是第2轮协作。队友们已经互相补充了一轮，请在此基础上进一步整合，查漏补缺。",
      3: "这是第3轮协作。方案已趋于成熟，请做最终打磨——精简冗余，强化核心结论，形成一份完整方案。",
    } : {
      1: "这是第1轮辩论。请仔细阅读其他参与者的初始回答，找出核心分歧和共识。",
      2: "这是第2轮辩论。经过上一轮交锋，请聚焦于仍存在分歧的关键点，深化你的论证或修正你的观点。",
      3: "这是第3轮辩论。辩论已进入深水区，请避免重复已达成共识的内容，集中攻克剩余分歧点，给出最终立场。",
    };

    const defaultHint = isCollab
        ? `这是第${roundNum}轮协作。请只补充新的见解，不要重复已有内容。`
        : `这是第${roundNum}轮辩论。请只针对仍有分歧的核心问题发表精炼观点。`;
    const roundHint = roundHints[roundNum] || defaultHint;

    const conciseRule = concise
      ? "\n\n⚠️ 简洁模式：请控制回答在 1000 字以内，用要点列表呈现核心观点，避免长篇大论。每个论点简明扼要。"
      : "";

    const contextText = Object.entries(responses)
      .filter(([id, r]) => id !== participantId && r.text)
      .map(([, r]) => `【${r.name} 的回答】:\n${r.text}`)
      .join("\n\n");

    let prompt = `${roundHint}\n\n${styleConfig.prompt}\n\n${contextText}${conciseRule}`;
    if (guidance) prompt = `用户补充要求：${guidance}\n\n${prompt}`;
    return prompt;
  },

  // v4.4.1: 文本版 prompt（老格式 markdown 散文）— "输出文本总结"按钮用
  buildSummaryPromptText(originalQuestion, rounds, responses, customInstruction) {
    const allText = Object.values(responses)
      .filter(r => r.text)
      .map(r => `【${r.name} 的观点】:\n${r.text}`)
      .join("\n\n");

    let prompt = `你是一场多 AI 辩论的最终裁判。${originalQuestion ? `原始问题是：「${originalQuestion}」\n` : ""}以下是各 AI 经过 ${rounds.length} 轮辩论的最终观点：

${allText}

请你作为裁判，给出结构化的最终总结：

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

要求：客观公正，不偏袒任何一方，重点是综合各家之长得出最优答案。`;

    if (customInstruction?.trim()) prompt += `\n\n## 额外要求\n${customInstruction.trim()}`;
    return prompt;
  },

  buildSummaryPrompt(originalQuestion, rounds, responses, customInstruction) {
    let historySection = "";
    if (rounds.length > 0) {
      historySection = "\n\n## 辩论历史摘要\n";
      for (const round of rounds) {
        historySection += `\n### 第${round.roundNum}轮（${DEBATE_STYLES[round.style]?.name || round.style}）\n`;
        if (round.guidance) historySection += `用户引导：${round.guidance}\n`;
      }
      historySection += "\n（以上为辩论过程，以下为各方最终观点）\n";
    }

    const allText = Object.values(responses)
      .filter(r => r.text)
      .map(r => `【${r.name} 的观点】:\n${r.text}`)
      .join("\n\n");

    const participantNames = Object.values(responses).filter(r => r.name).map(r => r.name).join(" / ");

    // v4.4.0: 输出 JSON 结构化数据，前端 renderDebateSummaryHtml 渲染为学术 arXiv 风格 HTML
    let prompt = `你是一场多 AI 辩论的最终裁判。${originalQuestion ? `原始问题是：「${originalQuestion}」\n` : ""}以下是各 AI（${participantNames}）的讨论记录（经过 ${rounds.length} 轮辩论）。
${historySection}
${allText}

请你作为裁判，**直接输出一份 JSON**（不要任何前言/后言/markdown 标记，仅 JSON）按以下 schema：

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
2. AI 名字用：${participantNames}（数组里就用这些字符串）
3. consensus / disagreements / open_questions 数组各 1-5 条
4. key_arguments 数组 2-4 条（最有代表性的论点）
5. highlights 数组 2-4 条（最精彩的引用）
6. next_steps 数组 2-5 条（具体可行动方向）
7. rounds 数组对应实际辩论的每一轮，voices 数组覆盖该轮发言的所有 AI
8. 所有字段必须填充，没有内容就给空数组 []`;

    if (customInstruction?.trim()) prompt += `\n\n额外要求：${customInstruction.trim()}`;
    return prompt;
  },

};
