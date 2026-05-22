import { test } from "node:test";
import assert from "node:assert/strict";

// 测纯逻辑：FIFO 上限 + 添加 + 清空
const MAX_LOG = 100;

function makeLog() {
  const log = [];
  return {
    push(entry) {
      log.push(entry);
      while (log.length > MAX_LOG) log.shift();
    },
    clear() { log.length = 0; },
    snapshot() { return log.slice(); },
    size() { return log.length; },
  };
}

test("chatLog: push 100 条不溢出", () => {
  const L = makeLog();
  for (let i = 0; i < 100; i++) L.push({ msgId: `m${i}`, text: `t${i}` });
  assert.equal(L.size(), 100);
  assert.equal(L.snapshot()[0].msgId, "m0");
  assert.equal(L.snapshot()[99].msgId, "m99");
});

test("chatLog: push 150 条 FIFO 丢前 50 条", () => {
  const L = makeLog();
  for (let i = 0; i < 150; i++) L.push({ msgId: `m${i}`, text: `t${i}` });
  assert.equal(L.size(), 100);
  assert.equal(L.snapshot()[0].msgId, "m50");
  assert.equal(L.snapshot()[99].msgId, "m149");
});

test("chatLog: clear 清空", () => {
  const L = makeLog();
  L.push({ msgId: "a", text: "x" });
  L.clear();
  assert.equal(L.size(), 0);
});

test("chatLog: snapshot 是独立副本", () => {
  const L = makeLog();
  L.push({ msgId: "a" });
  const snap = L.snapshot();
  L.push({ msgId: "b" });
  assert.equal(snap.length, 1);  // snap 不受后续 push 影响
});
