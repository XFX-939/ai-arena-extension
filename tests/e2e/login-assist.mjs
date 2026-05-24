// tests/e2e/login-assist.mjs
// 启动 headed Playwright chromium，自动顺序打开未登录 AI 站
// 等用户手动登录后，检测登录态生效自动切下一站
// 用法：node tests/e2e/login-assist.mjs

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const EXT_PATH = path.join(PROJECT_ROOT, "src");
const USER_DATA_DIR = path.join(__dirname, ".userdata");

// 跳过 Claude / 已确认登录的 kimi
const SITES = [
  { name: "Gemini",   url: "https://gemini.google.com/app",     loggedInProbe: 'a[aria-label*="Google 账号"], a[aria-label*="Google Account"], button[aria-label*="账号"], [aria-label*="Google 帐户"]', loginCue: 'a[href*="accounts.google.com"], button:has-text("登录"):not([disabled])' },
  { name: "ChatGPT",  url: "https://chatgpt.com/",              loggedInProbe: '[data-testid="profile-button"], button[aria-label*="Open profile" i], button[aria-label*="用户" i]', loginCue: 'button:has-text("Log in"), button:has-text("登录")' },
  { name: "DeepSeek", url: "https://chat.deepseek.com/",        loggedInProbe: '[class*="avatar" i], [class*="user-info" i], [class*="profile" i]', loginCue: 'button:has-text("登录"), input[type="password"]' },
  { name: "豆包",     url: "https://www.doubao.com/chat/",      loggedInProbe: '[class*="avatar" i], [class*="user_avatar" i], [data-testid*="avatar" i]', loginCue: 'button:has-text("登录")' },
  { name: "千问",     url: "https://www.qianwen.com/",          loggedInProbe: '[class*="avatar" i], [class*="user-info" i]', loginCue: 'button:has-text("登录"), button:has-text("立即登录")' },
  { name: "元宝",     url: "https://yuanbao.tencent.com/",      loggedInProbe: '[class*="avatar" i], [class*="user-info" i], img[class*="avatar"]', loginCue: 'button:has-text("登录"), [class*="login-btn"]' },
  { name: "Grok",     url: "https://grok.com/",                 loggedInProbe: '[data-testid="profile-button"], [aria-label*="profile" i]', loginCue: 'button:has-text("Sign"), button:has-text("Log")' },
];

console.log(`[login-assist] profile: ${USER_DATA_DIR}`);
console.log(`[login-assist] 需要登录 ${SITES.length} 个站\n`);

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

// 把已经打开的 about:blank 页用掉
const initialPages = ctx.pages();
let page = initialPages.length ? initialPages[0] : await ctx.newPage();

const summary = [];

for (const site of SITES) {
  console.log(`\n========================================`);
  console.log(`[login-assist] ${site.name}  →  ${site.url}`);
  console.log(`========================================`);
  console.log(`请在新打开的页面登录，登录完成后我自动切下一站`);

  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    console.log(`[login-assist] 导航失败: ${e.message}`);
    summary.push({ name: site.name, status: "navigate-failed" });
    continue;
  }

  // 等用户登录：探测 loggedInProbe 出现 OR 用户手动按下 Enter
  console.log(`[login-assist] 等待登录态... (最多 5 分钟)`);

  const start = Date.now();
  const TIMEOUT = 5 * 60 * 1000;
  let detected = false;

  while (Date.now() - start < TIMEOUT) {
    try {
      const loggedIn = await page.locator(site.loggedInProbe).first().isVisible({ timeout: 1500 }).catch(() => false);
      if (loggedIn) {
        // 二次确认：登录 cue 不应该可见
        const loginVisible = await page.locator(site.loginCue).first().isVisible({ timeout: 500 }).catch(() => false);
        if (!loginVisible) {
          detected = true;
          break;
        }
      }
    } catch {}
    // 每 2 秒轮询一次
    await page.waitForTimeout(2000);
  }

  if (detected) {
    console.log(`[login-assist] ✓ ${site.name} 登录态检测到，进入下一站`);
    summary.push({ name: site.name, status: "ok" });
  } else {
    console.log(`[login-assist] ⏱ ${site.name} 超时（5min），跳过`);
    summary.push({ name: site.name, status: "timeout" });
  }
  // 不关 page，留给下一站直接 goto
}

console.log(`\n\n========================================`);
console.log(`[login-assist] 全部完成，汇总：`);
for (const s of summary) {
  console.log(`  ${s.status === "ok" ? "✓" : "✗"} ${s.name.padEnd(10)} ${s.status}`);
}
console.log(`\n[login-assist] cookies 已存到 ${USER_DATA_DIR}`);
console.log(`[login-assist] 下一步：node tests/e2e/real-debate.mjs login-check 验证`);

// 等用户确认再关
console.log(`\n[login-assist] 按 Ctrl+C 结束并保存 profile（直接关闭也会保存）`);
await new Promise(() => {});
