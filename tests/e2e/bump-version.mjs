// tests/e2e/bump-version.mjs
// 自动 bump patch 版本：manifest.json 的 version + version_name + sidepanel.html + popup.html 同步
// 用法：node tests/e2e/bump-version.mjs [new-version]
//   不传则自动 patch++（4.8.32 → 4.8.33）

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = path.join(PROJECT_ROOT, "src", "manifest.json");
const SIDEPANEL = path.join(PROJECT_ROOT, "src", "sidepanel.html");
const POPUP = path.join(PROJECT_ROOT, "src", "popup.html");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const oldVersion = manifest.version;
const oldVersionName = manifest.version_name;

let newVersion = process.argv[2];
if (!newVersion) {
  const parts = oldVersion.split(".").map(Number);
  parts[parts.length - 1]++;
  newVersion = parts.join(".");
}
const newVersionName = `${newVersion}-beta`;

console.log(`[bump] ${oldVersion} → ${newVersion}`);

// 1) manifest.json
manifest.version = newVersion;
manifest.version_name = newVersionName;
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`[bump] ✓ manifest.json`);

// 2) sidepanel.html: <span class="version">v...</span> 和 footer
let sp = fs.readFileSync(SIDEPANEL, "utf8");
const spOld = sp;
sp = sp.replace(new RegExp(`v${oldVersionName}`, "g"), `v${newVersionName}`);
sp = sp.replace(new RegExp(`AI Arena v${oldVersionName}`, "g"), `AI Arena v${newVersionName}`);
if (sp !== spOld) {
  fs.writeFileSync(SIDEPANEL, sp);
  console.log(`[bump] ✓ sidepanel.html`);
} else {
  console.log(`[bump] · sidepanel.html (no change)`);
}

// 3) popup.html: 类似
if (fs.existsSync(POPUP)) {
  let pp = fs.readFileSync(POPUP, "utf8");
  const ppOld = pp;
  pp = pp.replace(new RegExp(`v${oldVersionName}`, "g"), `v${newVersionName}`);
  pp = pp.replace(new RegExp(`AI Arena v${oldVersionName}`, "g"), `AI Arena v${newVersionName}`);
  if (pp !== ppOld) {
    fs.writeFileSync(POPUP, pp);
    console.log(`[bump] ✓ popup.html`);
  } else {
    console.log(`[bump] · popup.html (no change)`);
  }
}

console.log(`\n[bump] 完成 → v${newVersionName}`);
console.log(`[bump] 接下来：git add + commit`);
process.exit(0);
