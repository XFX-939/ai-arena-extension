// tests/e2e/capability-check.mjs
// 顺序测试每个 AI 站能否在未登录/部分登录态下问答
// 流程：加 1 个 participant → 发问 → 等回答 → 删 → 下一个
// 跳过 Claude（用户防封号）

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const EXT_PATH = path.join(PROJECT_ROOT, "src");
const USER_DATA_DIR = path.join(__dirname, ".userdata");
const ARTIFACTS = path.join(PROJECT_ROOT, ".arena", "artifacts", "real-debate", "capability");

fs.mkdirSync(ARTIFACTS, { recursive: true });

const SERVICES = ["gemini", "chatgpt", "deepseek", "doubao", "qwen", "kimi", "yuanbao", "grok"];
const QUESTION = "你好，请用一句话回答：1+1=?（回答控制在 30 字以内）";
const WAIT_MS = 60000;

function nowTs() { return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); }

async function callBG(page, type, payload = {}) {
  return await page.evaluate(({ type, payload }) =>
    new Promise(resolve => chrome.runtime.sendMessage({ type, ...payload }, resolve)),
    { type, payload }
  );
}

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  channel: "chromium",
  headless: false,
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--start-maximized",
  ],
  viewport: null,
  ignoreDefaultArgs: ["--enable-automation"],
});

// 拿 extension ID
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 30000 });
const extId = sw.url().split("/")[2];
console.log(`[capability-check] ext=${extId}`);

// 开 sidepanel 作为控制面板
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
await panel.waitForLoadState("domcontentloaded");

// 收集 sw + panel + 所有 AI tab 的 console
const allLogs = [];
const pageLogs = new Map();  // tabId -> [logs]
sw.on("console", msg => allLogs.push(`[sw/${msg.type()}] ${msg.text()}`));
panel.on("console", msg => allLogs.push(`[panel/${msg.type()}] ${msg.text()}`));
context.on("page", pg => {
  pg.on("console", msg => {
    const url = pg.url().slice(0, 60);
    allLogs.push(`[${url}/${msg.type()}] ${msg.text()}`);
  });
  pg.on("pageerror", e => allLogs.push(`[${pg.url().slice(0, 60)}/pageerror] ${e.message}`));
});

// 启动时 hardReset 清掉任何遗留 participant 状态（SW 没死的话）
const resetR = await callBG(panel, "hardReset");
console.log(`[capability-check] hardReset → ${JSON.stringify(resetR).slice(0, 100)}`);
await panel.waitForTimeout(2000);

// 切 tiled 模式（每 AI 一个窗口）
await callBG(panel, "setWindowMode", { mode: "tiled" });
console.log(`[capability-check] mode=tiled`);

const results = [];

for (const service of SERVICES) {
  console.log(`\n========================================`);
  console.log(`[capability-check] 测试 ${service}`);
  console.log(`========================================`);
  const t0 = Date.now();
  const before = allLogs.length;

  // 1) 加 participant
  let addR;
  try {
    addR = await callBG(panel, "addParticipant", { service });
  } catch (e) {
    results.push({ service, status: "add-failed", err: e.message });
    continue;
  }
  // addR = { ok: true, participants: [{id, service, name, response, ...}, ...] }
  const ps = addR?.participants || [];
  const newOne = ps[ps.length - 1];
  const pid = newOne?.id;
  console.log(`[capability-check] add → pid=${pid} ok=${addR?.ok} total=${ps.length}`);
  if (!pid) {
    results.push({ service, status: "add-failed", err: JSON.stringify(addR).slice(0, 200), elapsed: Date.now() - t0 });
    continue;
  }

  // 等窗口和 content script 起来
  await panel.waitForTimeout(6000);

  // 2) 发问：必须用 chatBroadcast（走 ChatBus.broadcast，启动 polling）
  //    旧的 broadcast 走 handleBroadcast 只 inject 不 polling，永远拿不到 response
  console.log(`[capability-check] 发问...`);
  await callBG(panel, "chatBroadcast", { text: QUESTION, targets: [service], images: [] });

  // 3) 等回答（最多 WAIT_MS）
  // 注意：getFullState 只返回 responsePreview（前 100 字），不返回完整 response
  let resp = "";
  let waitElapsed = 0;
  while (waitElapsed < WAIT_MS) {
    const st = await callBG(panel, "getState");
    const p = (st?.participants || []).find(x => x.id === pid);
    if (p?.responsePreview && p.responsePreview.length > 1) {
      resp = p.responsePreview;
      break;
    }
    await panel.waitForTimeout(2000);
    waitElapsed = Date.now() - t0 - 6000;
  }

  // 4) 截图（参与者 tab）
  let tabScreenshot = "";
  for (const pg of context.pages()) {
    const url = pg.url();
    if (url.includes(service === "gemini" ? "gemini.google" :
                     service === "chatgpt" ? "chatgpt.com" :
                     service === "deepseek" ? "deepseek.com" :
                     service === "doubao" ? "doubao.com" :
                     service === "qwen" ? "qianwen.com" :
                     service === "kimi" ? "kimi.com" :
                     service === "yuanbao" ? "yuanbao.tencent" :
                     service === "grok" ? "grok.com" : "@@no@@")) {
      const ssPath = path.join(ARTIFACTS, `${service}-${nowTs()}.png`);
      try {
        await pg.screenshot({ path: ssPath, fullPage: false });
        tabScreenshot = ssPath;
      } catch {}
      break;
    }
  }

  const elapsed = Date.now() - t0;
  const status = resp ? "ok" : "no-response";
  console.log(`[capability-check] ${service}: status=${status} respLen=${resp.length} elapsed=${elapsed}ms`);
  if (resp) console.log(`  回答片段: ${resp.slice(0, 100).replace(/\n/g, " ")}`);

  // 收集该轮的日志摘要
  const newLogs = allLogs.slice(before);
  const errs = newLogs.filter(l => /error|fail/i.test(l) && !/lastError consumed/.test(l));

  results.push({
    service,
    status,
    pid,
    respLen: resp.length,
    respHead: resp.slice(0, 150),
    elapsed,
    tabScreenshot,
    errors: errs.slice(0, 10),
    logCount: newLogs.length,
  });

  // 5) 删 participant，准备下一个
  try {
    await callBG(panel, "removeParticipant", { id: pid });
    console.log(`[capability-check] remove ${pid} OK`);
  } catch (e) {
    console.log(`[capability-check] remove fail: ${e.message}`);
  }
  await panel.waitForTimeout(2000);
}

// 汇总
const ts = nowTs();
const reportPath = path.join(ARTIFACTS, `report-${ts}.json`);
fs.writeFileSync(reportPath, JSON.stringify({ timestamp: ts, extId, results }, null, 2));
fs.writeFileSync(path.join(ARTIFACTS, `all-logs-${ts}.txt`), allLogs.join("\n"));

console.log(`\n\n========================================`);
console.log(`[capability-check] 汇总`);
console.log(`========================================`);
for (const r of results) {
  const icon = r.status === "ok" ? "✓" : "✗";
  console.log(`${icon} ${r.service.padEnd(10)} status=${r.status.padEnd(15)} respLen=${String(r.respLen).padStart(4)} elapsed=${String(r.elapsed).padStart(6)}ms`);
}
console.log(`\n报告: ${reportPath}`);

await context.close();
const okCount = results.filter(r => r.status === "ok").length;
console.log(`\n[capability-check] ${okCount}/${results.length} 能正常问答`);
process.exit(okCount === results.length ? 0 : 1);
