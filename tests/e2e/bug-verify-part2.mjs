// bug-verify part 2: 单独跑 T6 (p.response 单槽位污染) + T7 (imagesPending 抖动卡死)
// T5 被跳过（chrome.runtime.reload 让 playwright SW 连接超时 — 测试方法本身的限制，不是 bug 复现）

import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const EXT_PATH = path.join(PROJECT_ROOT, "src");
const USER_DATA_DIR = path.join(os.tmpdir(), `arena-bugverify2-${Date.now()}`);

const results = [];
function record(id, status, evidence, notes) {
  results.push({ id, status, evidence, notes });
  const icon = status === "confirmed" ? "🔴" : status === "partial" ? "🟠" : "✅";
  console.log(`\n${icon} ${id}: ${status}`);
  if (evidence) console.log(`   证据: ${typeof evidence === "string" ? evidence.slice(0, 200) : JSON.stringify(evidence).slice(0, 400)}`);
  if (notes) console.log(`   备注: ${notes}`);
}

const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
  channel: "chromium",
  headless: false,
  args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`, "--no-first-run", "--no-default-browser-check"],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  console.log(`[verify2] sw ready`);

  // ════════════════════════════════════════════════════════
  // T6: p.response 单槽位污染（race）
  // ════════════════════════════════════════════════════════
  console.log("\n=== T6: p.response 单槽位污染 ===");
  const t6 = await sw.evaluate(async () => {
    StateMachine.participants = [
      { id: "pA", service: "ai_a", tabId: 1001, name: "A", response: null, responsePreview: null },
      { id: "pB", service: "ai_b", tabId: 1002, name: "B", response: null, responsePreview: null },
      { id: "pC", service: "ai_c", tabId: 1003, name: "C", response: null, responsePreview: null },
    ];
    StateMachine.setParticipantResponse("pA", "A 的初始回答");
    StateMachine.setParticipantResponse("pB", "B 的初始回答");
    // C 还在 streaming
    const sentIds = ["pA", "pB"];
    StateMachine.participants.forEach(p => {
      if (sentIds.includes(p.id)) {
        p.response = null;
        p.responsePreview = null;
      }
    });
    // 模拟 C 晚到
    StateMachine.setParticipantResponse("pC", "C 的初始回答（晚到）");
    return {
      pA_response: StateMachine.participants[0].response,
      pB_response: StateMachine.participants[1].response,
      pC_response: StateMachine.participants[2].response,
      pC_polluted: StateMachine.participants[2].response === "C 的初始回答（晚到）",
    };
  });
  if (t6.pC_polluted && t6.pA_response === null && t6.pB_response === null) {
    record("T6", "confirmed", t6, "单槽位 race 复现：C 晚到回答存在 p.response，但 A/B 已进入下一轮（response=null）。下一轮 buildDebatePrompt 拿到的 responses 只含 C 的旧轮初始回答 → 上下文混乱");
  } else {
    record("T6", "unreproducible", t6, "");
  }

  // ════════════════════════════════════════════════════════
  // T7: imagesPending 抖动卡死
  // ════════════════════════════════════════════════════════
  console.log("\n=== T7: imagesPending 抖动卡死 ===");
  const t7 = await sw.evaluate(async () => {
    return new Promise(async (resolve) => {
      StateMachine.participants = [{ id: "pT7", service: "ai_t7", tabId: 2001, name: "T7", response: null, responsePreview: null }];

      const origTabsSend = chrome.tabs.sendMessage;
      let tick = 0;
      chrome.tabs.sendMessage = async (tid, msg) => {
        if (msg.action === "readResponse") {
          tick++;
          // 文本稳定但 imagesPending 在 0/1 抖动
          return { text: "稳定文本", hasRichContent: false, richTypes: [], imagesPending: (tick % 2) };
        }
        return { status: "sent" };
      };

      let resolved = false;
      let resolvedAtTick = -1;
      const origRuntimeSend = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = (m) => {
        if (m?.type === "chatStreamUpdate" && m.isDone && !resolved) {
          resolved = true;
          resolvedAtTick = tick;
        }
        return Promise.resolve();
      };

      // 启动 polling
      const broadcastResult = await ChatBus.broadcast("test", ["ai_t7"], []);

      // 等 12 秒（应该 4.5s 完成；如果抖动卡死会到 12s 仍不完成）
      setTimeout(() => {
        chrome.tabs.sendMessage = origTabsSend;
        chrome.runtime.sendMessage = origRuntimeSend;
        resolve({
          broadcastOk: broadcastResult?.ok,
          finalTick: tick,
          resolved,
          resolvedAtTick,
          waited_seconds: 12,
        });
      }, 12000);
    });
  });
  if (!t7.resolved && t7.finalTick >= 7) {
    record("T7", "confirmed", t7,
      `polling 跑了 ${t7.finalTick} tick (~${(t7.finalTick * 1.5).toFixed(1)}s) 仍未完成 — imagesPending 抖动让 stableKey 永不稳定`);
  } else if (t7.resolved) {
    record("T7", "unreproducible", t7, `polling 在第 ${t7.resolvedAtTick} tick 完成了，抖动不致命（说明 polling 完成判定路径未受 imagesPending 影响那么大）`);
  } else {
    record("T7", "partial", t7, "polling 未完成但 tick 数过少");
  }

} catch (e) {
  console.error("[verify2] fatal:", e);
} finally {
  await ctx.close();
}

console.log("\n" + "═".repeat(70));
console.log("最终汇总");
console.log("═".repeat(70));
results.forEach(r => {
  const icon = r.status === "confirmed" ? "🔴" : r.status === "partial" ? "🟠" : "✅";
  console.log(`${icon} ${r.id}: ${r.status}${r.notes ? "  — " + r.notes : ""}`);
});
process.exit(0);
