// tests/e2e/copy-cookies-on-close.mjs
// 监听 chrome.exe 进程数，降到 0 立即复制 Cookies，复制完提示重开
// 配合 setup-real-profile.mjs 用，针对 Cookies 独占锁问题

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const SRC_BASE = path.join(HOME, "AppData", "Local", "Google", "Chrome", "User Data");
const DST_BASE = path.resolve("tests/e2e/.userdata");

const cookieFiles = [
  "Default/Network/Cookies",
  "Default/Network/Cookies-journal",
];

function chromeRunning() {
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command",
      "(Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object).Count"
    ], { stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    return parseInt(out, 10) || 0;
  } catch { return 0; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

console.log(`\n[copy-cookies] 当前 chrome 进程数: ${chromeRunning()}`);
console.log(`[copy-cookies] 请关闭所有 Chrome 窗口（任务栏右键 Chrome 图标 → 关闭窗口，或 Ctrl+Shift+Q）`);
console.log(`[copy-cookies] 我会等你，关掉后自动复制 cookies 然后你立即重开`);
console.log(`[copy-cookies] 监听中...\n`);

let lastCount = chromeRunning();
while (true) {
  const n = chromeRunning();
  if (n !== lastCount) {
    process.stdout.write(`\r[copy-cookies] chrome 进程: ${n}    `);
    lastCount = n;
  }
  if (n === 0) {
    console.log(`\n[copy-cookies] Chrome 已关闭，开始复制 cookies...`);
    break;
  }
  await sleep(500);
  // 60 秒不动也继续 polling，不超时
}

// 现在复制 Cookies
let ok = true;
for (const rel of cookieFiles) {
  const src = path.join(SRC_BASE, rel);
  const dst = path.join(DST_BASE, rel);
  if (!fs.existsSync(src)) { console.log(`[copy-cookies] · ${rel} 源不存在`); continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    fs.copyFileSync(src, dst);
    const size = fs.statSync(dst).size;
    console.log(`[copy-cookies] ✓ ${rel} (${size} B)`);
  } catch (e) {
    console.error(`[copy-cookies] ✗ ${rel}: ${e.message}`);
    ok = false;
  }
}

console.log(`\n[copy-cookies] ${ok ? "✓ Cookies 复制成功" : "✗ Cookies 复制失败"}`);
console.log(`[copy-cookies] 你现在可以重新打开 Chrome 了`);
console.log(`[copy-cookies] 下一步：node tests/e2e/real-debate.mjs 验证登录态`);
