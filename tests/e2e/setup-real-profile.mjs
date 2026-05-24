// tests/e2e/setup-real-profile.mjs
// 一次性：从主 Chrome profile 复制最小子集到隔离 .userdata/
// Chrome SQLite 文件是 shared lock，PowerShell Copy-Item 可读
// App-Bound Encryption 需要 Chrome.exe 启动，由 real-debate.mjs 处理

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const SRC = path.join(HOME, "AppData", "Local", "Google", "Chrome", "User Data");
const DST = path.resolve("tests/e2e/.userdata");

console.log(`[setup] 源 profile: ${SRC}`);
console.log(`[setup] 目标 profile: ${DST}`);

if (!fs.existsSync(SRC)) {
  console.error("[setup] 主 Chrome profile 不存在，放弃");
  process.exit(1);
}

if (fs.existsSync(DST)) {
  console.log("[setup] 清理旧 .userdata");
  fs.rmSync(DST, { recursive: true, force: true });
}
fs.mkdirSync(DST, { recursive: true });

function copyOne(srcRel) {
  const srcPath = path.join(SRC, srcRel);
  const dstPath = path.join(DST, srcRel);
  if (!fs.existsSync(srcPath)) {
    console.log(`[setup] · ${srcRel} 源不存在，跳过`);
    return false;
  }
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  // .NET FileShare.ReadWrite 绕 SQLite 独占锁
  const psScript = `
$ErrorActionPreference = 'Stop'
$src = [System.IO.FileStream]::new('${srcPath.replace(/'/g, "''")}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
$dst = [System.IO.FileStream]::new('${dstPath.replace(/'/g, "''")}', [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
try { $src.CopyTo($dst) } finally { $src.Close(); $dst.Close() }
`.trim();
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-Command", psScript], { stdio: "pipe" });
  } catch (e) {
    const msg = e.stderr?.toString() || e.message;
    console.warn(`[setup] ✗ ${srcRel}: ${msg.split("\n")[0]}`);
    return false;
  }
  const ok = fs.existsSync(dstPath);
  const size = ok ? fs.statSync(dstPath).size : 0;
  console.log(`[setup] ${ok ? "✓" : "✗"} ${srcRel} (${size} B)`);
  return ok;
}

const filesToCopy = [
  "Local State",
  "Default/Network/Cookies",
  "Default/Network/Cookies-journal",
  "Default/Network/NetworkDataMigrated",
  "Default/Login Data",
  "Default/Login Data-journal",
  "Default/Login Data For Account",
  "Default/Login Data For Account-journal",
  "Default/Preferences",
  "Default/Secure Preferences",
];

let copied = 0;
for (const f of filesToCopy) {
  if (copyOne(f)) copied++;
}

console.log(`\n[setup] 完成，${copied}/${filesToCopy.length} 个文件`);
