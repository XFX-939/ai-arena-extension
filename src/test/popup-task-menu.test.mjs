import { test } from "node:test";
import assert from "node:assert/strict";

// 复制 popup-task-menu.js 的 labelOf 函数（纯逻辑）
function labelOf(state) {
  if (state.task === "ask") return "同时提问";
  if (state.task === "debate") return state.style === "collab" ? "辩论·群策" : "辩论·自由";
  if (state.task === "summary") return `总结·${state.judgeName || "选裁判"}`;
  if (state.task === "ppt") {
    const m = { copy: "PPT·文案", image: "PPT·图片", pptx: "PPT·生成" };
    return m[state.kind] || "PPT";
  }
  return "?";
}

test("labelOf: ask 默认", () => assert.equal(labelOf({task:"ask"}), "同时提问"));
test("labelOf: debate free", () => assert.equal(labelOf({task:"debate",style:"free"}), "辩论·自由"));
test("labelOf: debate collab", () => assert.equal(labelOf({task:"debate",style:"collab"}), "辩论·群策"));
test("labelOf: summary with judge", () => assert.equal(labelOf({task:"summary",judgeName:"Claude"}), "总结·Claude"));
test("labelOf: summary 无 judge", () => assert.equal(labelOf({task:"summary"}), "总结·选裁判"));
test("labelOf: ppt copy", () => assert.equal(labelOf({task:"ppt",kind:"copy"}), "PPT·文案"));
test("labelOf: ppt image", () => assert.equal(labelOf({task:"ppt",kind:"image"}), "PPT·图片"));
test("labelOf: ppt pptx", () => assert.equal(labelOf({task:"ppt",kind:"pptx"}), "PPT·生成"));
