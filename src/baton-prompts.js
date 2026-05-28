// AI Arena — 🪄 AI接力棒 meta-prompt 模板（v4.9.1）
// 让浓缩官 AI 把当前对话压成「给新 AI 看的接棒简报」
// 跟裁判总结的关键差异：目标读者是 AI 不是人 → 紧凑、结构化、可直接喂入
(function () {
  const STANCE_HINT = {
    neutral: "中立旁观，不偏向任何一方",
    "pro-current": "继承当前讨论中略占上风的立场",
    contrarian: "鼓励新人提出反方观点，挑战现有共识",
  };

  // v5.2.11: 浓缩官本来就是当前讨论的全程参与者，网页 session 里已有完整上下文 →
  // 不再传 transcript，直接让它基于已知历史输出接棒简报，省 token + 避免冗余
  function buildBatonMetaPrompt({ length = 500, stance = "neutral" } = {}) {
    const stanceHint = STANCE_HINT[stance] || STANCE_HINT.neutral;
    return `请基于我们刚才的全部讨论，给即将加入这场辩论的一个新 AI 生成一段「接棒简报」prompt。

读者是 AI 不是人 — 紧凑、结构化、可粘贴即用。

必含 6 段：
▸ 议题：一句话（≤30 字）
▸ 当前进展：第几轮、已发言哪几位 AI、还剩几轮
▸ 立场坐标：每位已发言 AI 一句话其核心论点（含名字）
▸ 关键分歧：当前 1-2 个最尖锐对立点
▸ 已达成共识：写明确，让新 AI 别复读
▸ 你接下来该：具体攻防建议（不是"请发表看法"这种废话）

风格：
- 第二人称写给新 AI（"你即将加入..." 开头）
- ${length} 字以内
- 不要客套话、不要给人看的总结结论
- 去除 markdown # 符号，用 ▸ · 等轻量符号
- 严禁元话语（"我作为一个 AI..."）

视角：${stanceHint}

直接给接棒简报正文，不要任何前后缀。`;
  }

  window.BatonPrompts = { buildBatonMetaPrompt };
})();
