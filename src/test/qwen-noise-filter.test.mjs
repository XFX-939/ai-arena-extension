import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { cleanQwenNoise, stripQwenDomNoise } = require("../qwen-noise-filter.js");

// ── 锚点 1：千问 UI 控件 "▴ 收起 N 字" ─────────────────────────
test("cleanQwenNoise: 截断 ▴ 收起 N字 控件文本", () => {
  const text = "这是一段千问的正常回答。\n详细分析过程 ......\n▴ 收起 39574 字\n后面是相关推荐...";
  const out = cleanQwenNoise(text);
  assert.match(out, /详细分析过程/);
  assert.doesNotMatch(out, /收起/);
  assert.doesNotMatch(out, /相关推荐/);
});

test("cleanQwenNoise: ▾ 展开 也截断", () => {
  const text = "回答正文 ".repeat(50) + "▾ 展开 12345 字\n推荐区...";
  const out = cleanQwenNoise(text);
  assert.match(out, /回答正文/);
  assert.doesNotMatch(out, /展开/);
});

test("cleanQwenNoise: 回答里出现『5000 字』但无三角符号不截断", () => {
  const text = "我建议你写一篇 5000 字的长文 ".repeat(20);
  const out = cleanQwenNoise(text);
  assert.equal(out, text);
});

// ── 锚点 2（加固版）：hydrate JSON 必须含夸克独有 key ─────────────────
test("cleanQwenNoise: 截断夸克 hydrate JSON（含 reqId）", () => {
  const text = "回答正文，关于厨师合伙的建议... ".repeat(40)
    + '{"data":{"initialData":{"reqId":"c8ad181abb5b497ba205f8be727f59f4"}}}';
  const out = cleanQwenNoise(text);
  assert.match(out, /厨师合伙/);
  assert.doesNotMatch(out, /reqId/);
});

test("cleanQwenNoise: 截断夸克 hydrate JSON（含 hydrateId）", () => {
  const text = "回答正文 ".repeat(50)
    + '{"data":{"initialData":{"foo":"bar","hydrateId":"card_xx"}}}';
  const out = cleanQwenNoise(text);
  assert.match(out, /回答正文/);
  assert.doesNotMatch(out, /hydrateId/);
});

test("cleanQwenNoise: 加固关键 — 普通教学 JSON 不误伤", () => {
  const text = "你的 API 响应应该长这样：".repeat(30)
    + '{"data":{"initialData":{"foo":1,"bar":2,"baz":3,"users":[]}}}';
  const out = cleanQwenNoise(text);
  assert.equal(out, text);
});

test("cleanQwenNoise: 加固关键 — 普通 React state JSON 不误伤", () => {
  const text = "React 初始数据示例 ".repeat(40)
    + '{"data":{"initialData":{"counter":0,"items":["a","b"]}}}';
  const out = cleanQwenNoise(text);
  assert.equal(out, text);
});

// ── 锚点 3：夸克 _hydrate_core 内联脚本 ────────────────────────
test("cleanQwenNoise: 截断 window._hydrate_core 注入脚本", () => {
  const text = "回答正文 ".repeat(50) + 'window._hydrate_core && window._hydrate_core.run_sc({log:{jsSize:204674}})';
  const out = cleanQwenNoise(text);
  assert.match(out, /回答正文/);
  assert.doesNotMatch(out, /_hydrate_core/);
});

// ── 锚点 4：CSS hash 规则块密度 ─────────────────────────────────
test("cleanQwenNoise: 截断连续 3+ 个 CSS hash 规则块", () => {
  const text = "回答正文部分 ".repeat(40)
    + ".video-item-FJQ1X{width:100%;height:auto}"
    + ".box-On2XC{display:flex}"
    + ".container-3D4Pp{position:relative}";
  const out = cleanQwenNoise(text);
  assert.match(out, /回答正文部分/);
  assert.doesNotMatch(out, /FJQ1X/);
});

test("cleanQwenNoise: 单个 CSS hash 不触发（密度阈值）", () => {
  const single = "示例：使用 .video-item-FJQ1X{width:100%} 即可，无副作用。";
  const out = cleanQwenNoise(single);
  assert.equal(out, single);
});

test("cleanQwenNoise: 2 个 CSS hash 不触发（< 3 阈值）", () => {
  const text = "教 CSS：.foo-AbCd1{a:1} 和 .bar-EfGh2{b:2}";
  const out = cleanQwenNoise(text);
  assert.equal(out, text);
});

// ── 10% 兜底：截断后剩余太少 → 锚点疑似误判，放弃 ─────────────
test("cleanQwenNoise: 锚点在第 5% 处 → 放弃截断（疑似误判）", () => {
  const text = "短引子" + '{"data":{"initialData":{"reqId":"x"}}}'.repeat(100);
  const out = cleanQwenNoise(text);
  assert.equal(out, text);
});

test("cleanQwenNoise: 锚点在 50% 处 → 正常截断", () => {
  const head = "正常回答内容 ".repeat(40);
  const text = head + 'window._hydrate_core && junk';
  const out = cleanQwenNoise(text);
  assert.match(out, /正常回答内容/);
  assert.doesNotMatch(out, /_hydrate_core/);
});

// ── 多锚点同存 → 取最早的 ─────────────────────────────────
test("cleanQwenNoise: 多锚点同时存在 → 取最早命中", () => {
  const head = "正文 ".repeat(50);
  const text = head + "▴ 收起 100 字" + " 中间填充 " + 'window._hydrate_core &&';
  const out = cleanQwenNoise(text);
  assert.match(out, /正文/);
  assert.doesNotMatch(out, /收起/);
  assert.doesNotMatch(out, /_hydrate_core/);
});

// ── 边界 ──
test("cleanQwenNoise: 空串 / null / undefined 不崩", () => {
  assert.equal(cleanQwenNoise(""), "");
  assert.equal(cleanQwenNoise(null), "");
  assert.equal(cleanQwenNoise(undefined), "");
});

test("cleanQwenNoise: 纯净回答不动", () => {
  const text = "这是一段没有任何噪音的正常回答。" + "包含一些列表：\n- 项 1\n- 项 2";
  const out = cleanQwenNoise(text);
  assert.equal(out, text);
});

// ── DOM 层 stripQwenDomNoise ──────────────────────────────────
function makeMockEl(noiseChildren = []) {
  const removed = [];
  const allDescendants = noiseChildren.map((cls) => ({
    cls, removed: false,
    remove() { this.removed = true; removed.push(this.cls); },
  }));
  const node = {
    cloneNode(_deep) {
      const cloned = makeMockEl(noiseChildren);
      cloned._removed = removed;
      return cloned;
    },
    querySelectorAll(_sel) { return allDescendants; },
    _allDescendants: allDescendants,
    _removed: removed,
  };
  return node;
}

test("stripQwenDomNoise: 调 cloneNode + querySelectorAll + remove 删 noise 子节点", () => {
  const el = makeMockEl(["video_note_list_picture_list", "video-item-FJQ1X", "hydrateScript"]);
  const cleaned = stripQwenDomNoise(el);
  assert.ok(cleaned);
  assert.equal(cleaned._allDescendants.length, 3);
  for (const child of cleaned._allDescendants) {
    assert.equal(child.removed, true, `${child.cls} should be removed`);
  }
});

test("stripQwenDomNoise: 入参 null / 无 cloneNode 不崩", () => {
  assert.equal(stripQwenDomNoise(null), null);
  assert.equal(stripQwenDomNoise(undefined), undefined);
  const obj = {};
  assert.equal(stripQwenDomNoise(obj), obj);
});

test("stripQwenDomNoise: querySelectorAll 抛异常时降级", () => {
  const el = {
    cloneNode() {
      return { querySelectorAll() { throw new Error("dom error"); } };
    },
  };
  const cleaned = stripQwenDomNoise(el);
  assert.ok(cleaned);
});
