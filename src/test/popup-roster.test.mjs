import { test } from "node:test";
import assert from "node:assert/strict";

// 测 roster 纯状态机：toggle + 全空回弹
function makeRoster(all) {
  let selected = new Set(all);
  return {
    toggle(svc) {
      if (selected.has(svc)) selected.delete(svc);
      else selected.add(svc);
      if (selected.size === 0) selected = new Set(all);
      return [...selected].sort();
    },
    get() { return [...selected].sort(); },
  };
}

test("roster: 默认全选", () => {
  const r = makeRoster(["claude","gemini","chatgpt"]);
  assert.deepEqual(r.get(), ["chatgpt","claude","gemini"]);
});

test("roster: toggle 去除", () => {
  const r = makeRoster(["claude","gemini","chatgpt"]);
  r.toggle("gemini");
  assert.deepEqual(r.get(), ["chatgpt","claude"]);
});

test("roster: 全空时回弹全选", () => {
  const r = makeRoster(["claude","gemini"]);
  r.toggle("claude");
  r.toggle("gemini");  // 此时全空 → 回弹
  assert.deepEqual(r.get(), ["claude","gemini"]);
});

test("roster: 再 toggle 加回", () => {
  const r = makeRoster(["claude","gemini","chatgpt"]);
  r.toggle("gemini");
  r.toggle("gemini");
  assert.deepEqual(r.get(), ["chatgpt","claude","gemini"]);
});
