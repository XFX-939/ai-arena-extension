import { test } from "node:test";
import assert from "node:assert/strict";

// 复制 parseMentions（同步项目代码一致）— 9 个 AI
const NAME = {
  claude: "Claude", gemini: "Gemini", chatgpt: "ChatGPT",
  deepseek: "DeepSeek", doubao: "豆包", qwen: "千问",
  kimi: "Kimi", yuanbao: "元宝", grok: "Grok",
};

function parseMentions(text) {
  const targets = [];
  let cleanText = text;
  const nameToId = Object.entries(NAME).reduce((acc, [id, name]) => {
    acc[name.toLowerCase()] = id;
    acc[id] = id;
    return acc;
  }, {});
  const re = /^@(\S+)\s+/;
  while (re.test(cleanText)) {
    const match = cleanText.match(re);
    const key = match[1].toLowerCase();
    const id = nameToId[key];
    if (!id) break;
    targets.push(id);
    cleanText = cleanText.replace(re, "");
  }
  return { targets, text: cleanText };
}

test("无 @ 返回广播", () => {
  assert.deepEqual(parseMentions("分析宁王"), { targets: [], text: "分析宁王" });
});

test("@Claude 单发", () => {
  assert.deepEqual(parseMentions("@Claude 你怎么看"), { targets: ["claude"], text: "你怎么看" });
});

test("@Claude @Gemini 双发", () => {
  assert.deepEqual(parseMentions("@Claude @Gemini 对比下"), { targets: ["claude", "gemini"], text: "对比下" });
});

test("@豆包 中文名", () => {
  assert.deepEqual(parseMentions("@豆包 来一段"), { targets: ["doubao"], text: "来一段" });
});

test("@不存在 不识别", () => {
  assert.deepEqual(parseMentions("@xyz hello"), { targets: [], text: "@xyz hello" });
});
