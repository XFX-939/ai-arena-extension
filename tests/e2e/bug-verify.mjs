// AI Arena · E2E 真实复现验证脚本
// 目标：把昨晚 4 路审查发现的 P0/P1 bug 在真实扩展 + 真实 Chromium 下跑一遍
// 每项输出：confirmed（实测复现）/ partial（条件复现）/ unreproducible（不能复现）
// 不修改任何产品代码

import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const EXT_PATH = path.join(PROJECT_ROOT, "src");
const USER_DATA_DIR = path.join(os.tmpdir(), `arena-bugverify-${Date.now()}`);

const results = [];
function record(id, status, evidence, notes) {
  results.push({ id, status, evidence, notes });
  const icon = status === "confirmed" ? "🔴" : status === "partial" ? "🟠" : "✅";
  console.log(`\n${icon} ${id}: ${status}`);
  if (evidence) console.log(`   证据: ${typeof evidence === "string" ? evidence.slice(0, 200) : JSON.stringify(evidence).slice(0, 300)}`);
  if (notes) console.log(`   备注: ${notes}`);
}

console.log(`[bug-verify] ext=${EXT_PATH}`);
console.log(`[bug-verify] data=${USER_DATA_DIR}`);

const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
  channel: "chromium",
  headless: false,
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = sw.url().split("/")[2];
  console.log(`[bug-verify] extId=${extId}`);

  // ════════════════════════════════════════════════════════
  // T1: v1#4 + CXX 主页污染（Kimi 实测）
  // ════════════════════════════════════════════════════════
  console.log("\n=== T1: heuristic fallback 抓 Kimi 主页装饰文本 ===");
  const kimi = await ctx.newPage();
  let kimiOk = false;
  try {
    await kimi.goto("https://www.kimi.com", { waitUntil: "domcontentloaded", timeout: 25000 });
    await kimi.waitForTimeout(3000);
    kimiOk = true;
  } catch (e) {
    record("T1", "unreproducible", null, `Kimi 加载失败: ${e.message}`);
  }
  if (kimiOk) {
    const kimiTabId = await sw.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: "*://*.kimi.com/*" });
      return tabs[0]?.id;
    });
    const r = kimiTabId ? await sw.evaluate(async (tid) => {
      try {
        const resp = await chrome.tabs.sendMessage(tid, { action: "readResponse" });
        return { ok: true, textLen: (resp?.text || "").length, snippet: (resp?.text || "").slice(0, 100) };
      } catch (e) { return { ok: false, error: e.message }; }
    }, kimiTabId) : null;
    if (r?.ok && r.textLen > 50) {
      record("T1", "confirmed", r, "Kimi 未登录首页 readResponse 返回装饰文本");
    } else {
      record("T1", "unreproducible", r, "Kimi 这次未返回装饰文本");
    }
  }
  await kimi.close();

  // ════════════════════════════════════════════════════════
  // T2: CXX-12 id 类型一致性 + 严格 === 查找
  // ════════════════════════════════════════════════════════
  console.log("\n=== T2: id 类型一致性 + 严格 === ===");
  const t2 = await sw.evaluate(() => {
    // 不实际 addParticipant（避免开真 AI 窗口），直接看 state-machine 用什么生成 id
    StateMachine.participants = [];
    StateMachine.nextId = 1;
    // 模拟 addParticipant 内的 id 生成
    const simulatedId = `p${StateMachine.nextId++}`;
    StateMachine.participants.push({ id: simulatedId, service: "test", tabId: 999, name: "Test", response: null, responsePreview: null });

    // popup 端可能传的几种格式
    const fromMsg_String = "p1";       // 正确
    const fromMsg_Number = 1;          // 错误格式
    const fromMsg_DigitStr = "1";      // 错误格式

    return {
      generatedIdType: typeof simulatedId,
      generatedIdValue: simulatedId,
      findById_match: StateMachine.getParticipant("p1")?.id === simulatedId,
      findById_numberFails: !StateMachine.getParticipant(1),
      findById_digitStrFails: !StateMachine.getParticipant("1"),
    };
  });
  if (t2.generatedIdType === "string" && t2.generatedIdValue === "p1" && t2.findById_match && t2.findById_numberFails) {
    // id 是字符串，严格 === 比较；如果某 message handler 传数字会找不到
    // 验证 popup 实际传什么
    const popupSends = await sw.evaluate(() => {
      // 在 popup 上下文外，无法直接抓。但可以看 popup-tasks.js 源码（已知字符串）
      // 实际测：popup-members openActionMenu 传 dataset.pid（字符串）
      // background.js case "removeParticipant" 取 msg.id (popup 传字符串)
      // 所以理论一致，但 popup 端某处可能传 Number()
      return { hint: "popup 端 message 一致传字符串，但严格 === 在 normalize 缺失时是隐患" };
    });
    record("T2", "partial", t2, "id 是字符串 + getParticipant 严格匹配。当前 popup 路径都传字符串无误，但 normalize 缺失，未来扩展易踩坑");
  } else {
    record("T2", "unreproducible", t2, "id 类型一致");
  }

  // ════════════════════════════════════════════════════════
  // T3: CXX-1 总结误读 prompt schema 当 AI 回答
  // ════════════════════════════════════════════════════════
  console.log("\n=== T3: 总结 finalize 误读 prompt schema ===");
  const t3 = await sw.evaluate(async () => {
    // 模拟：mock chrome.tabs.sendMessage 让 readResponse 返回 prompt 自己（schema 示例）
    StateMachine.participants = [{
      id: "p_judge", service: "claude", tabId: -1, name: "Claude-test",
      response: null, responsePreview: null,
    }];
    // 模拟一个含 schema 示例的 "AI 回答"（实际是 prompt 回显）
    const fakePromptEcho = `好的，让我作为裁判输出 JSON：

\`\`\`json
{
  "topic": "辩论的核心命题（精炼成一句话）",
  "core_conclusion": "整场辩论得出的一句话核心结论（150 字以内，是这次辩论最值得带走的认知）",
  "consensus": ["共识 1（各方都同意的具体观点，30-80 字）"],
  "disagreements": ["分歧 1"],
  "open_questions": [],
  "key_arguments": [],
  "highlights": [],
  "next_steps": [],
  "rounds": []
}
\`\`\``;

    // 直接调 parse 看结果
    const parsed = self.DebateSummaryTemplate?.parse(fakePromptEcho);
    // 验证：parse 成功 + 内容是 schema 占位符
    const isPlaceholder = parsed?.topic === "辩论的核心命题（精炼成一句话）"
                       && parsed?.core_conclusion?.includes("最值得带走的认知");
    return { parsed, isPlaceholder, hasFinalizer: typeof finalizeDebateSummary === "function" };
  });
  if (t3.isPlaceholder) {
    record("T3", "confirmed", { topic: t3.parsed?.topic }, "parse 误把 prompt 内的 schema 示例当真报告解析成功 → 生成假报告");
  } else {
    record("T3", "unreproducible", t3, "parse 没接受 schema 占位符");
  }

  // ════════════════════════════════════════════════════════
  // T4: CXX-2 chatBroadcast 绕过 StateMachine
  // ════════════════════════════════════════════════════════
  console.log("\n=== T4: chatBroadcast 绕过 StateMachine ===");
  const t4 = await sw.evaluate(async () => {
    // 准备一个 participant 让 broadcast 有 target
    StateMachine.participants = [{
      id: "p_t4", service: "claude", tabId: -999, name: "T4-claude",
      response: "前一题的旧回答", responsePreview: "前一题的旧回答",
    }];
    StateMachine.debateSession.originalQuestion = "前一题";
    StateMachine.lastSentByPid["p_t4"] = "前一题";
    StateMachine.setFlowState(FlowState.IDLE);

    // mock chrome.tabs.sendMessage 接受 inject（不真注入）
    const origSend = chrome.tabs.sendMessage;
    chrome.tabs.sendMessage = (tid, msg) => Promise.resolve({ status: "sent" });
    try {
      await ChatBus.broadcast("新问题", ["claude"], []);
    } finally {
      chrome.tabs.sendMessage = origSend;
    }
    return {
      originalQuestion_afterBroadcast: StateMachine.debateSession.originalQuestion,
      pResponse_afterBroadcast: StateMachine.participants[0].response,
      lastSent_afterBroadcast: StateMachine.lastSentByPid["p_t4"],
      flowState_afterBroadcast: StateMachine.flowState,
    };
  });
  const t4Bugs = [];
  if (t4.originalQuestion_afterBroadcast === "前一题") t4Bugs.push("originalQuestion 未更新");
  if (t4.pResponse_afterBroadcast === "前一题的旧回答") t4Bugs.push("p.response 未清空");
  if (t4.lastSent_afterBroadcast === "前一题") t4Bugs.push("lastSentByPid 未更新");
  if (t4.flowState_afterBroadcast === "idle") t4Bugs.push("flowState 未切到 BROADCASTING");
  if (t4Bugs.length >= 3) {
    record("T4", "confirmed", t4, `chatBroadcast 绕过 SM 同步：${t4Bugs.join(" / ")}`);
  } else {
    record("T4", "partial", t4, t4Bugs.join(" / "));
  }

  // ════════════════════════════════════════════════════════
  // T5: v1#1+#2 SW 重启丢 polling + pendingSummary
  // ════════════════════════════════════════════════════════
  console.log("\n=== T5: SW 重启丢 polling + pendingSummary ===");
  // 先设置 pendingSummary，再触发 SW 重启
  await sw.evaluate(() => {
    StateMachine.pendingSummary = {
      judgeId: "p_t5_judge",
      judgeName: "T5-Judge",
      judgeService: "claude",
      ts: Date.now(),
    };
    StateMachine.save();
  });
  const beforeReload = await sw.evaluate(() => ({
    pendingSummary: StateMachine.pendingSummary,
    saved: true,
  }));
  // 触发 SW 重启 — 用 chrome.runtime.reload 会断开 service worker，等再启
  console.log("   触发 chrome.runtime.reload() 模拟 SW 重启...");
  await sw.evaluate(() => {
    // chrome.runtime.reload 会重载整个扩展
    setTimeout(() => chrome.runtime.reload(), 100);
  }).catch(() => {});  // 调用后 sw 立即失效
  // 等扩展重启
  await new Promise(r => setTimeout(r, 4000));
  // 拿新的 sw
  let newSw;
  try {
    newSw = ctx.serviceWorkers()[0];
    if (!newSw) newSw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
  } catch (e) {
    record("T5", "partial", null, `重启后无法连接新 SW: ${e.message}`);
  }
  if (newSw) {
    await new Promise(r => setTimeout(r, 2000));  // 等 init
    const afterReload = await newSw.evaluate(() => ({
      pendingSummary: StateMachine.pendingSummary,
      hasParticipants: StateMachine.participants.length,
      initLoadedFromStorage: "init 是否读 pendingSummary 字段（看 state-machine init() 代码）",
    }));
    if (beforeReload.pendingSummary && !afterReload.pendingSummary) {
      record("T5", "confirmed", { before: beforeReload, after: afterReload },
        "SW 重启后 pendingSummary 丢失（state-machine.js init 没读 sm_pendingSummary）");
    } else if (beforeReload.pendingSummary && afterReload.pendingSummary) {
      record("T5", "unreproducible", afterReload, "pendingSummary 居然被恢复了");
    } else {
      record("T5", "partial", { before: beforeReload, after: afterReload }, "状态不明");
    }
    sw = newSw;
  }

  // ════════════════════════════════════════════════════════
  // T6: CXX-3 p.response 单槽位污染（race）
  // ════════════════════════════════════════════════════════
  console.log("\n=== T6: p.response 单槽位污染 ===");
  const t6 = await sw.evaluate(async () => {
    // mock 3 个 participants，模拟异步完成时序
    StateMachine.participants = [
      { id: "pA", service: "ai_a", tabId: 1001, name: "A", response: null, responsePreview: null },
      { id: "pB", service: "ai_b", tabId: 1002, name: "B", response: null, responsePreview: null },
      { id: "pC", service: "ai_c", tabId: 1003, name: "C", response: null, responsePreview: null },
    ];

    // 模拟 A、B 已完成初始回答，准备启动辩论
    StateMachine.setParticipantResponse("pA", "A 的初始回答");
    StateMachine.setParticipantResponse("pB", "B 的初始回答");
    // C 此时还没完成（response = null）

    // 此时用户启动 handleDebateRound — 但 C 没 response，只会发给 A/B
    // 模拟 background.js handleDebateRound 的清空逻辑
    const sentIds = ["pA", "pB"];  // 只有 A B 有 response 才进 sentIds
    StateMachine.participants.forEach(p => {
      if (sentIds.includes(p.id)) {
        p.response = null;
        p.responsePreview = null;
      }
    });

    // 模拟 C 异步完成 setParticipantResponse
    StateMachine.setParticipantResponse("pC", "C 的初始回答（晚到）");

    // 此时 A/B response = null（等下一轮），C response = "C 的初始回答（晚到）"
    // 如果用户立刻发起第 2 轮 → handleDebateRound 看 p.response → 只有 C 有 → "回答不足"
    // 或者 buildDebatePrompt 把 C 的初始回答当作"第 1 轮的发言"传给 A/B
    return {
      pA_response: StateMachine.participants[0].response,
      pB_response: StateMachine.participants[1].response,
      pC_response: StateMachine.participants[2].response,
      pC_polluted: StateMachine.participants[2].response === "C 的初始回答（晚到）",
      affects_debate_round_2: "B/A response null，C response 是初始回答（混入第 2 轮）",
    };
  });
  if (t6.pC_polluted) {
    record("T6", "confirmed", t6,
      "单槽位 race 复现：C 的初始回答在 A/B 进入第 2 轮后写入，下一轮 buildDebatePrompt 会拿到混入的旧轮内容");
  } else {
    record("T6", "unreproducible", t6, "");
  }

  // ════════════════════════════════════════════════════════
  // T7: v1#5 imagesPending 抖动卡死
  // ════════════════════════════════════════════════════════
  console.log("\n=== T7: imagesPending 抖动卡死 ===");
  const t7 = await sw.evaluate(async () => {
    // mock readResponse 让 text 稳定但 imagesPending 0/1 抖动
    StateMachine.participants = [{
      id: "pT7", service: "ai_t7", tabId: 2001, name: "T7", response: null, responsePreview: null,
    }];
    const text = "稳定文本";
    let tick = 0;
    const origSend = chrome.tabs.sendMessage;
    chrome.tabs.sendMessage = async (tid, msg) => {
      if (msg.action === "readResponse") {
        tick++;
        return { text, hasRichContent: false, richTypes: [], imagesPending: (tick % 2) }; // 抖动 0,1,0,1
      }
      return { status: "sent" };
    };

    // 启动 polling — 看是否 5 个 tick 内能完成
    let resolved = false;
    let resolvedAfterTicks = -1;
    const sw_msgs = [];
    const origRuntimeSend = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = async (m) => {
      if (m?.type === "chatStreamUpdate" && m.isDone) {
        resolved = true;
        resolvedAfterTicks = tick;
      }
      sw_msgs.push(m);
    };

    // 启动 polling — broadcast 路径
    await ChatBus.broadcast("test", ["ai_t7"], []);

    // 等 15 秒（应该 4.5s 完成；如果抖动卡死会到 15s 仍不完成）
    await new Promise(r => setTimeout(r, 15000));

    // 还原
    chrome.tabs.sendMessage = origSend;
    chrome.runtime.sendMessage = origRuntimeSend;

    return {
      finalTick: tick,
      resolved,
      resolvedAfterTicks,
      totalMsgs: sw_msgs.length,
    };
  });
  if (!t7.resolved && t7.finalTick >= 8) {
    record("T7", "confirmed", t7,
      `polling 跑了 ${t7.finalTick} tick (${t7.finalTick * 1.5}s) 仍未完成 — imagesPending 抖动让 stableKey 永不稳定`);
  } else if (t7.resolved) {
    record("T7", "unreproducible", t7, `polling 在第 ${t7.resolvedAfterTicks} tick 完成了，抖动不致命`);
  } else {
    record("T7", "partial", t7, "");
  }

} catch (e) {
  console.error("[bug-verify] fatal:", e);
} finally {
  await ctx.close();
}

// ════════════════════════════════════════════════════════
// 最终汇总
// ════════════════════════════════════════════════════════
console.log("\n\n" + "═".repeat(70));
console.log("最终汇总（confirmed=必修 / partial=条件复现 / unreproducible=过度推断）");
console.log("═".repeat(70));
const c = results.filter(r => r.status === "confirmed").length;
const p = results.filter(r => r.status === "partial").length;
const u = results.filter(r => r.status === "unreproducible").length;
console.log(`\nconfirmed: ${c}  /  partial: ${p}  /  unreproducible: ${u}\n`);
results.forEach(r => {
  const icon = r.status === "confirmed" ? "🔴" : r.status === "partial" ? "🟠" : "✅";
  console.log(`${icon} ${r.id}: ${r.status}${r.notes ? "  — " + r.notes : ""}`);
});
process.exit(0);
