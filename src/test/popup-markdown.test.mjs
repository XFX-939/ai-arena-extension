import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { renderMarkdown, escapeHtml } = require("../popup-markdown.js");

test("escapeHtml: 5 字符全转义", () => {
  assert.equal(escapeHtml(`<script>"&'`), "&lt;script&gt;&quot;&amp;&#39;");
});

test("renderMarkdown: 纯文本段落", () => {
  const html = renderMarkdown("hello world");
  assert.match(html, /<p>hello world<\/p>/);
});

test("renderMarkdown: 代码块带语言", () => {
  const html = renderMarkdown("```python\nprint(1)\n```");
  assert.match(html, /<pre><code class="language-python">print\(1\)\n<\/code><\/pre>/);
});

test("renderMarkdown: 行内 code", () => {
  const html = renderMarkdown("用 `Array.map` 处理");
  assert.match(html, /<code>Array\.map<\/code>/);
});

test("renderMarkdown: 链接只允许 http/https", () => {
  const ok = renderMarkdown("[claude](https://claude.ai)");
  assert.match(ok, /<a href="https:\/\/claude\.ai" target="_blank"/);

  const evil = renderMarkdown("[xss](javascript:alert(1))");
  assert.doesNotMatch(evil, /<a/);
});

test("renderMarkdown: XSS 转义", () => {
  const html = renderMarkdown("<script>alert(1)</script>");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderMarkdown: 粗体", () => {
  const html = renderMarkdown("**重要**提示");
  assert.match(html, /<strong>重要<\/strong>/);
});

test("renderMarkdown: 无序列表", () => {
  const html = renderMarkdown("- 苹果\n- 香蕉\n- 橙子");
  assert.match(html, /<ul class="md-list"><li>苹果<\/li><li>香蕉<\/li><li>橙子<\/li><\/ul>/);
});

test("renderMarkdown: 空输入", () => {
  assert.equal(renderMarkdown(""), "");
  assert.equal(renderMarkdown(null), "");
});

// ── v4.0.10：完整 markdown 新增 ──
test("renderMarkdown: h1-h6 多级标题", () => {
  const html = renderMarkdown("# 一级\n## 二级\n### 三级\n#### 四级\n##### 五级\n###### 六级");
  assert.match(html, /<h1>一级<\/h1>/);
  assert.match(html, /<h4>四级<\/h4>/);
  assert.match(html, /<h6>六级<\/h6>/);
});

test("renderMarkdown: 有序列表", () => {
  const html = renderMarkdown("1. 第一\n2. 第二\n3. 第三");
  assert.match(html, /<ol class="md-list"><li>第一<\/li><li>第二<\/li><li>第三<\/li><\/ol>/);
});

test("renderMarkdown: 任务列表", () => {
  const html = renderMarkdown("- [x] 已完成\n- [ ] 未完成");
  assert.match(html, /<li class="md-task"><input type="checkbox" checked disabled> 已完成<\/li>/);
  assert.match(html, /<li class="md-task"><input type="checkbox"\s+disabled> 未完成<\/li>/);
});

test("renderMarkdown: 引用块", () => {
  const html = renderMarkdown("> 这是引用\n> 第二行");
  assert.match(html, /<blockquote>这是引用<br>第二行<\/blockquote>/);
});

test("renderMarkdown: 表格（带对齐）", () => {
  const html = renderMarkdown("| 列1 | 列2 | 列3 |\n|:---|:---:|---:|\n| a | b | c |\n| d | e | f |");
  assert.match(html, /<table class="md-table">/);
  assert.match(html, /<th style="text-align:left">列1<\/th>/);
  assert.match(html, /<th style="text-align:center">列2<\/th>/);
  assert.match(html, /<th style="text-align:right">列3<\/th>/);
  assert.match(html, /<td[^>]*>a<\/td>/);
  assert.match(html, /<td[^>]*>f<\/td>/);
});

test("renderMarkdown: 删除线", () => {
  const html = renderMarkdown("这是 ~~删除~~ 的");
  assert.match(html, /<del>删除<\/del>/);
});

test("renderMarkdown: 水平分割线", () => {
  const html = renderMarkdown("上文\n\n---\n\n下文");
  assert.match(html, /<hr>/);
});

test("renderMarkdown: 图片 http", () => {
  const html = renderMarkdown("![logo](https://example.com/x.png)");
  assert.match(html, /<img src="https:\/\/example\.com\/x\.png" alt="logo" class="md-img">/);
});

test("renderMarkdown: 图片 base64 data URI", () => {
  const tiny = "data:image/png;base64,iVBORw0KGgoAAAANS";
  const html = renderMarkdown(`![](${tiny})`);
  assert.match(html, new RegExp(`<img src="${tiny.replace(/\+/g, "\\+")}"`));
});

test("renderMarkdown: 图片拒绝非安全 url", () => {
  const html = renderMarkdown("![evil](javascript:alert(1))");
  assert.doesNotMatch(html, /<img/);
});

test("renderMarkdown: 行内 code 不被粗体污染", () => {
  const html = renderMarkdown("混合 `**not-bold**` 文字");
  assert.match(html, /<code>\*\*not-bold\*\*<\/code>/);
  assert.doesNotMatch(html, /<strong>not-bold/);
});

test("renderMarkdown: 嵌套列表", () => {
  const html = renderMarkdown("- 外层\n  - 内层");
  // 外层 ul 内含 内层嵌套 ul
  assert.match(html, /<ul class="md-list"><li>外层<\/li><ul class="md-list"><li>内层<\/li><\/ul><\/ul>/);
});

// ── v4.0.13: HTML/SVG 代码块预览支持 ──
test("renderMarkdown: HTML 代码块带预览 toggle", () => {
  const html = renderMarkdown("```html\n<h1>Hello</h1>\n```");
  assert.match(html, /class="code-block-wrap"/);
  assert.match(html, /data-tab="code"/);
  assert.match(html, /data-tab="preview"/);
  assert.match(html, /data-html-b64="/);  // base64 编码的原 HTML
  // 同时仍含 pre/code 显示原代码
  assert.match(html, /<pre><code class="language-html">/);
});

test("renderMarkdown: SVG 代码块也有预览", () => {
  const html = renderMarkdown("```svg\n<svg width='10' height='10'></svg>\n```");
  assert.match(html, /class="code-block-wrap"/);
  assert.match(html, /data-lang="svg"/);
});

test("renderMarkdown: 普通代码块（python）无预览 toggle", () => {
  const html = renderMarkdown("```python\nprint(1)\n```");
  assert.doesNotMatch(html, /code-block-wrap/);
  assert.match(html, /<pre><code class="language-python">/);
});

test("renderMarkdown: HTML 启发式 — 缺 lang 但有 <!DOCTYPE> 也识别", () => {
  const html = renderMarkdown("```\n<!DOCTYPE html>\n<html><body>hi</body></html>\n```");
  assert.match(html, /class="code-block-wrap"/);
  assert.match(html, /data-lang="html"/);
});

test("renderMarkdown: HTML 启发式 — 含 3+ HTML 标签也识别", () => {
  const html = renderMarkdown("```\n<div><h1>a</h1><p>b</p></div>\n```");
  assert.match(html, /class="code-block-wrap"/);
  assert.match(html, /data-lang="html"/);
});

test("renderMarkdown: HTML 启发式 — 含 <svg> 起头识别为 SVG", () => {
  const html = renderMarkdown("```\n<svg width='10'><circle/></svg>\n```");
  assert.match(html, /data-lang="svg"/);
});

test("renderMarkdown: 启发式不误伤 — 普通文字代码块仍是 pre/code", () => {
  const html = renderMarkdown("```\nhello world\nprint(1)\n```");
  assert.doesNotMatch(html, /code-block-wrap/);
});

test("renderMarkdown: HTML 代码块 base64 可往返", () => {
  const original = "<div>中文 + emoji 🚀</div>";
  const html = renderMarkdown("```html\n" + original + "\n```");
  const m = html.match(/data-html-b64="([^"]+)"/);
  assert.ok(m, "应该有 b64 attr");
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  assert.equal(decoded.trim(), original);
});

test("renderMarkdown: 表格 + 段落混排", () => {
  const html = renderMarkdown("先说明\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n结尾");
  assert.match(html, /<p>先说明<\/p>/);
  assert.match(html, /<table class="md-table">/);
  assert.match(html, /<p>结尾<\/p>/);
});
