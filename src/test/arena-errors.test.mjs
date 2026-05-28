import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ArenaErrorCode,
  ArenaStage,
  makeArenaError,
  renderUserHint,
  isArenaError,
} = require("../arena-errors.js");

// ── 枚举完整性 ────────────────────────────────────────────────────
test("ArenaErrorCode: 10 个枚举值完整且 frozen", () => {
  const expected = [
    "INJECT_NO_INPUT", "INJECT_NO_SEND_BTN", "INJECT_SEND_BTN_DISABLED",
    "EXTRACT_DOM_EMPTY", "EXTRACT_TIMEOUT", "EXTRACT_STALE",
    "PROMPT_ECHO_DETECTED", "STREAM_NEVER_STARTED",
    "LOGIN_REQUIRED", "TAB_NOT_FOUND",
  ];
  for (const k of expected) {
    assert.equal(ArenaErrorCode[k], k, `${k} must self-map`);
  }
  assert.equal(Object.keys(ArenaErrorCode).length, expected.length);
  assert.ok(Object.isFrozen(ArenaErrorCode));
});

test("ArenaStage: 7 个枚举值 + frozen", () => {
  const expected = ["IDLE", "INJECTING", "AWAITING", "STREAMING", "EXTRACTING", "DONE", "FAILED"];
  for (const k of expected) assert.equal(typeof ArenaStage[k], "string");
  assert.equal(Object.keys(ArenaStage).length, expected.length);
  assert.ok(Object.isFrozen(ArenaStage));
});

// ── makeArenaError 字段 ───────────────────────────────────────────
test("makeArenaError: 基本字段就位", () => {
  const e = makeArenaError(ArenaErrorCode.INJECT_NO_INPUT, { service: "claude", stage: "injecting" });
  assert.equal(e.code, "INJECT_NO_INPUT");
  assert.equal(e.service, "claude");
  assert.equal(e.stage, "injecting");
  assert.equal(typeof e.ts, "number");
  assert.ok(e.ts > 0);
  assert.deepEqual(e.snapshot, { service: "claude", stage: "injecting" });
});

test("makeArenaError: retryable=true 的三个码", () => {
  for (const code of [ArenaErrorCode.EXTRACT_TIMEOUT, ArenaErrorCode.EXTRACT_DOM_EMPTY, ArenaErrorCode.STREAM_NEVER_STARTED]) {
    assert.equal(makeArenaError(code).retryable, true, `${code} should be retryable`);
  }
});

test("makeArenaError: retryable=false 的注入类码", () => {
  for (const code of [
    ArenaErrorCode.INJECT_NO_INPUT,
    ArenaErrorCode.INJECT_NO_SEND_BTN,
    ArenaErrorCode.INJECT_SEND_BTN_DISABLED,
    ArenaErrorCode.LOGIN_REQUIRED,
    ArenaErrorCode.TAB_NOT_FOUND,
    ArenaErrorCode.PROMPT_ECHO_DETECTED,
    ArenaErrorCode.EXTRACT_STALE,
  ]) {
    assert.equal(makeArenaError(code).retryable, false, `${code} should NOT be retryable`);
  }
});

test("makeArenaError: 不传 snapshot 也安全", () => {
  const e = makeArenaError(ArenaErrorCode.LOGIN_REQUIRED);
  assert.deepEqual(e.snapshot, {});
  assert.equal(e.service, null);
  assert.equal(e.stage, null);
});

test("makeArenaError: snapshot 非对象也兜底", () => {
  const e = makeArenaError(ArenaErrorCode.LOGIN_REQUIRED, "bad");
  assert.deepEqual(e.snapshot, {});
});

// ── renderUserHint ────────────────────────────────────────────────
test("renderUserHint: 10 个码都有大白话", () => {
  for (const code of Object.values(ArenaErrorCode)) {
    const hint = renderUserHint(code);
    assert.equal(typeof hint, "string");
    assert.ok(hint.length > 0, `hint for ${code} should not be empty`);
    assert.ok(!hint.startsWith("未知错误码"), `${code} should have a real hint, got fallback`);
  }
});

test("renderUserHint: 未知码不报错且不返回空", () => {
  const h = renderUserHint("WHATEVER_NEW");
  assert.match(h, /未知错误码：WHATEVER_NEW/);
});

test("renderUserHint: null / undefined 不崩", () => {
  assert.match(renderUserHint(null), /未知错误码/);
  assert.match(renderUserHint(undefined), /未知错误码/);
});

// ── isArenaError sniff ────────────────────────────────────────────
test("isArenaError: 工厂产物识别", () => {
  assert.equal(isArenaError(makeArenaError(ArenaErrorCode.EXTRACT_TIMEOUT)), true);
});

test("isArenaError: 老式 { ok:false, error } 拒绝", () => {
  assert.equal(isArenaError({ ok: false, error: "boom" }), false);
});

test("isArenaError: null / 字符串 / 数字 拒绝", () => {
  assert.equal(isArenaError(null), false);
  assert.equal(isArenaError("INJECT_NO_INPUT"), false);
  assert.equal(isArenaError(42), false);
  assert.equal(isArenaError(undefined), false);
});
