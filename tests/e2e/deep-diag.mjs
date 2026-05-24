// tests/e2e/deep-diag.mjs
// 单 AI 深度诊断：启 chromium → 加 1 个 AI → 发问 → 30s 后 dump DOM 真实结构
// 用法：node tests/e2e/deep-diag.mjs <service>   (e.g., gemini, doubao, deepseek)

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const EXT_PATH = path.join(PROJECT_ROOT, "src");
const USER_DATA_DIR = path.join(__dirname, ".userdata");
const ARTIFACTS = path.join(PROJECT_ROOT, ".arena", "artifacts", "real-debate", "deep-diag");
fs.mkdirSync(ARTIFACTS, { recursive: true });

const service = (process.argv[2] || "gemini").toLowerCase();
const QUESTION = process.argv[3] || "你好，请用一句话回答：1+1=?";

// 每个 AI 的 DOM 探测脚本（直接在 page 上跑）
const probes = {
  gemini: () => ({
    selectors: {
      "model-response": document.querySelectorAll("model-response").length,
      "[data-content-type='model']": document.querySelectorAll("[data-content-type='model']").length,
      ".markdown": document.querySelectorAll(".markdown").length,
      ".model-response-text": document.querySelectorAll(".model-response-text").length,
      ".response-container": document.querySelectorAll(".response-container").length,
      "user-query": document.querySelectorAll("user-query").length,
      "rich-textarea": document.querySelectorAll("rich-textarea").length,
      ".ql-editor": document.querySelectorAll(".ql-editor").length,
      "loading-indicator": document.querySelectorAll(".loading-indicator, .thinking-indicator").length,
    },
    lastModelResponse: (() => {
      const all = document.querySelectorAll("model-response, [data-content-type='model']");
      if (!all.length) return null;
      const last = all[all.length - 1];
      return {
        outerHTML_head: last.outerHTML.slice(0, 1500),
        innerText: last.innerText.slice(0, 500),
        tagName: last.tagName,
        hasMarkdown: !!last.querySelector(".markdown"),
        hasModelResponseText: !!last.querySelector(".model-response-text"),
        childTagNames: Array.from(last.querySelectorAll("*")).slice(0, 30).map(e => e.tagName).join(","),
      };
    })(),
    bodyTail: (document.body?.innerText || "").slice(-800),
  }),
  doubao: () => ({
    selectors: {
      "[class*='message']": document.querySelectorAll("[class*='message']").length,
      "[class*='answer']": document.querySelectorAll("[class*='answer']").length,
      "[class*='receive']": document.querySelectorAll("[class*='receive']").length,
      "[data-testid*='message']": document.querySelectorAll("[data-testid*='message']").length,
    },
    bodyTail: (document.body?.innerText || "").slice(-800),
  }),
  deepseek: () => ({
    selectors: {
      "[class*='message']": document.querySelectorAll("[class*='message']").length,
      "[class*='markdown']": document.querySelectorAll("[class*='markdown']").length,
      "[class*='content']": document.querySelectorAll("[class*='content']").length,
      "textarea": document.querySelectorAll("textarea").length,
      "[contenteditable='true']": document.querySelectorAll("[contenteditable='true']").length,
    },
    inputValue: (() => {
      const t = document.querySelector("textarea, [contenteditable='true']");
      return t ? (t.value || t.innerText || "").slice(0, 200) : null;
    })(),
    bodyTail: (document.body?.innerText || "").slice(-800),
  }),
};

if (!probes[service]) {
  console.error(`未知服务: ${service}，可用：${Object.keys(probes).join(",")}`);
  process.exit(2);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
console.log(`[deep-diag] service=${service} question="${QUESTION}"`);
console.log(`[deep-diag] profile: ${USER_DATA_DIR}`);

const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
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

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 30000 });
const extId = sw.url().split("/")[2];

const allLogs = [];
sw.on("console", m => allLogs.push(`[sw/${m.type()}] ${m.text()}`));
ctx.on("page", pg => {
  pg.on("console", m => allLogs.push(`[${pg.url().slice(0, 50)}/${m.type()}] ${m.text()}`));
  pg.on("pageerror", e => allLogs.push(`[${pg.url().slice(0, 50)}/pageerror] ${e.message}`));
});

const panel = await ctx.newPage();
await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
await panel.waitForLoadState("domcontentloaded");

async function callBG(p, type, payload = {}) {
  return await p.evaluate(({ type, payload }) =>
    new Promise(r => chrome.runtime.sendMessage({ type, ...payload }, r)),
    { type, payload });
}

await callBG(panel, "hardReset");
await panel.waitForTimeout(2000);
await callBG(panel, "setWindowMode", { mode: "tiled" });

const addR = await callBG(panel, "addParticipant", { service });
const pid = addR?.participants?.[addR.participants.length - 1]?.id;
console.log(`[deep-diag] add ${service} → pid=${pid}`);

await panel.waitForTimeout(6000);

// 找到 AI tab
const hostKeyword = {
  gemini: "gemini.google",
  chatgpt: "chatgpt",
  deepseek: "deepseek",
  doubao: "doubao",
  qwen: "qianwen",
  kimi: "kimi",
  yuanbao: "yuanbao",
  grok: "grok",
}[service] || service;
const aiPage = ctx.pages().find(p => p.url().includes(hostKeyword));
if (!aiPage) {
  console.error(`[deep-diag] 找不到 ${service} tab`);
  await ctx.close();
  process.exit(3);
}
console.log(`[deep-diag] AI tab: ${aiPage.url()}`);

// 发问：用 chatBroadcast 才会启动 polling（broadcast 只 inject 不 poll）
console.log(`[deep-diag] chatBroadcast...`);
await callBG(panel, "chatBroadcast", { text: QUESTION, targets: [service], images: [] });

// 等 30 秒（足够 streaming 完成）
await panel.waitForTimeout(30000);

// dump DOM
console.log(`[deep-diag] dumping DOM...`);
const domDump = await aiPage.evaluate(probes[service]);
console.log("\n========================================");
console.log("DOM DUMP");
console.log("========================================");
console.log(JSON.stringify(domDump, null, 2));

// 试调 content script 的 readLatestResponse（如果暴露）
let readResult = null;
try {
  readResult = await aiPage.evaluate(() => {
    if (typeof readLatestResponse === "function") return readLatestResponse();
    if (window.__arena?.readLatestResponse) return window.__arena.readLatestResponse();
    return "[readLatestResponse not exposed]";
  });
} catch (e) {
  readResult = `[error: ${e.message}]`;
}
console.log("readLatestResponse:", typeof readResult === "string" ? readResult.slice(0, 500) : readResult);

// 拿 state 看 polling 状态
// 注意：getFullState 只返回 responsePreview（前 100 字），不返回完整 response
const state = await callBG(panel, "getState");
const p = (state?.participants || []).find(x => x.id === pid);
console.log(`\n[deep-diag] participant state: responsePreview="${(p?.responsePreview || "").slice(0, 200)}" len=${p?.responsePreview?.length || 0}`);

// 直接调 readOneResponse 验证 content script 提取链路
console.log(`[deep-diag] 直接调 readOneResponse...`);
const readR = await callBG(panel, "readOneResponse", { participantId: pid });
console.log(`[deep-diag] readOneResponse → ${JSON.stringify(readR).slice(0, 500)}`);

// 直接给 tab 发 readResponse 看 content-gemini 返回
console.log(`[deep-diag] 直接给 tab 发 action=readResponse...`);
const tabReadR = await panel.evaluate(async ({ tabId }) => {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { action: "readResponse" }, r => {
      resolve({ r, err: chrome.runtime.lastError?.message });
    });
  });
}, { tabId: p?.tabId });
console.log(`[deep-diag] tab readResponse → ${JSON.stringify(tabReadR).slice(0, 500)}`);

// 截图
const ssPath = path.join(ARTIFACTS, `${service}-${ts}.png`);
await aiPage.screenshot({ path: ssPath, fullPage: false });

// 落地
const outPath = path.join(ARTIFACTS, `${service}-${ts}.json`);
fs.writeFileSync(outPath, JSON.stringify({
  service,
  question: QUESTION,
  url: aiPage.url(),
  domDump,
  readResult,
  participantState: p,
}, null, 2));

const logPath = path.join(ARTIFACTS, `${service}-${ts}-logs.txt`);
fs.writeFileSync(logPath, allLogs.join("\n"));

console.log(`\n[deep-diag] 截图: ${ssPath}`);
console.log(`[deep-diag] JSON: ${outPath}`);
console.log(`[deep-diag] logs: ${logPath}`);
console.log(`[deep-diag] log 行数: ${allLogs.length}`);

await ctx.close();
process.exit(0);
