// tests/e2e/night-runner.mjs
// 夜间无人值守：循环跑 capability-check + 场景 1-4，发现 bug 写报告退出
// 由 Claude 主控：每轮跑完读 reports，修 bug 后再启下一轮
//
// 用法：node tests/e2e/night-runner.mjs [round-num]
//   round-num: 当前轮次编号（写入 report 文件名）

import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const ARTIFACTS = path.join(PROJECT_ROOT, ".arena", "artifacts", "real-debate", "night");
fs.mkdirSync(ARTIFACTS, { recursive: true });

const roundNum = parseInt(process.argv[2] || "1", 10);
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const roundDir = path.join(ARTIFACTS, `round-${String(roundNum).padStart(3, "0")}-${ts}`);
fs.mkdirSync(roundDir, { recursive: true });

function nowTs() { return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); }

function runStep(name, command, args, timeoutMs = 15 * 60 * 1000) {
  console.log(`\n========================================`);
  console.log(`[night-runner] round=${roundNum} step=${name}`);
  console.log(`========================================`);
  const t0 = Date.now();
  const logPath = path.join(roundDir, `${name}.log`);
  const out = fs.openSync(logPath, "w");
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", out, out],
      shell: false,
    });
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try { proc.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 5000);
    }, timeoutMs);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      fs.closeSync(out);
      const elapsed = Date.now() - t0;
      console.log(`[night-runner] ${name} exit=${code} elapsed=${elapsed}ms${killed ? " (TIMEOUT)" : ""}`);
      resolve({ name, code, elapsed, killed, logPath });
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      fs.closeSync(out);
      console.log(`[night-runner] ${name} error: ${e.message}`);
      resolve({ name, code: -1, elapsed: Date.now() - t0, err: e.message, logPath });
    });
  });
}

const steps = [
  { name: "scenario1", args: ["tests/e2e/real-debate.mjs", "scenario1"], timeout: 10 * 60 * 1000 },
  { name: "scenario2", args: ["tests/e2e/real-debate.mjs", "scenario2"], timeout: 20 * 60 * 1000 },
  { name: "scenario3", args: ["tests/e2e/real-debate.mjs", "scenario3"], timeout: 10 * 60 * 1000 },
  { name: "scenario4", args: ["tests/e2e/real-debate.mjs", "scenario4"], timeout: 20 * 60 * 1000 },
];

const results = [];
for (const step of steps) {
  const r = await runStep(step.name, "node", step.args, step.timeout);
  results.push(r);
  // 短停防限流
  await new Promise(r => setTimeout(r, 5000));
}

const report = {
  round: roundNum,
  timestamp: ts,
  results,
  summary: {
    pass: results.filter(r => r.code === 0).length,
    fail: results.filter(r => r.code !== 0).length,
    timeouts: results.filter(r => r.killed).length,
  },
};

const reportPath = path.join(roundDir, `round-report.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n========================================`);
console.log(`[night-runner] ROUND ${roundNum} 完成`);
console.log(`========================================`);
console.log(`pass: ${report.summary.pass}/${steps.length}`);
console.log(`fail: ${report.summary.fail}`);
console.log(`timeouts: ${report.summary.timeouts}`);
console.log(`报告: ${reportPath}`);
console.log(`目录: ${roundDir}`);
process.exit(report.summary.fail === 0 ? 0 : 1);
