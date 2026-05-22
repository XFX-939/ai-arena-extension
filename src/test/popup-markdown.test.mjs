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
  assert.match(html, /<ul><li>苹果<\/li><li>香蕉<\/li><li>橙子<\/li><\/ul>/);
});

test("renderMarkdown: 空输入", () => {
  assert.equal(renderMarkdown(""), "");
  assert.equal(renderMarkdown(null), "");
});
