// AI Arena — 完整 markdown 渲染（XSS-safe 转义 + 白名单标签）
// 支持：标题 h1-h6 / 粗斜体 / 删除线 / 行内 code / 代码块 / 链接 /
//       图片 / 无序+有序+任务列表（可嵌套） / 引用 / 表格 / 分割线
(function (global) {
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 安全 URL：只接受 http/https，data:image base64 也允许（图像）
  function safeUrl(url) {
    if (typeof url !== "string") return null;
    const u = url.trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(u)) return u;
    return null;
  }

  function renderInline(text) {
    // 已转义后再做内联替换。注意所有 `<`/`>`/`&` 已是 entity，
    // 所以用 entity 形式匹配，不会撞用户的字面文本。
    let s = text;
    // 行内 code 占位（避免内部被其他规则改）
    const inlineCodes = [];
    s = s.replace(/\x02INLINE([\s\S]*?)\x02/g, (m, c) => {
      const idx = inlineCodes.push(c) - 1;
      return `\x03IC${idx}\x03`;
    });
    // 粗体 **xxx**
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    // 斜体 *xxx* 或 _xxx_（避免误伤数学*：要求 *_ 后非空白且前非字母数字）
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    // 删除线 ~~xxx~~
    s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    // 图片 ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, (m, alt, url) => {
      const u = safeUrl(url);
      if (!u) return m;
      return `<img src="${u}" alt="${alt}" class="md-img">`;
    });
    // 链接 [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (m, txt, url) => {
      const u = safeUrl(url);
      if (!u) return m;
      return `<a href="${u}" target="_blank" rel="noopener noreferrer">${txt}</a>`;
    });
    // 回填行内 code
    s = s.replace(/\x03IC(\d+)\x03/g, (m, i) => `<code>${inlineCodes[Number(i)]}</code>`);
    return s;
  }

  // 行类型识别
  function lineType(line) {
    if (/^\s*$/.test(line)) return "blank";
    if (/^(\s*)(#{1,6})\s+(.+)$/.test(line)) return "heading";
    if (/^(\s*)[-*]\s+\[[ xX]\]\s+/.test(line)) return "task";
    if (/^(\s*)[-*+]\s+/.test(line)) return "ul";
    if (/^(\s*)\d+\.\s+/.test(line)) return "ol";
    if (/^(?:>|&gt;)\s?/.test(line)) return "blockquote";
    if (/^\s*\|.*\|\s*$/.test(line)) return "table-row";
    if (/^\s*(?:[-*_]\s*){3,}\s*$/.test(line)) return "hr";
    return "paragraph";
  }

  function parseListItem(line, type) {
    const m = type === "task"
      ? line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.+)$/)
      : type === "ul"
        ? line.match(/^(\s*)[-*+]\s+(.+)$/)
        : line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (!m) return null;
    const indent = m[1].length;
    if (type === "task") return { indent, content: m[3], checked: m[2].toLowerCase() === "x" };
    return { indent, content: m[2] };
  }

  function renderTable(rows) {
    // rows: ["| h1 | h2 |", "|---|---|", "| a | b |", ...]
    if (rows.length < 2) return rows.join("\n");
    const parseRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(s => s.trim());
    const header = parseRow(rows[0]);
    const align = parseRow(rows[1]).map(c => {
      const left = c.startsWith(":");
      const right = c.endsWith(":");
      if (left && right) return "center";
      if (right) return "right";
      if (left) return "left";
      return null;
    });
    const body = rows.slice(2).map(parseRow);
    let html = '<table class="md-table"><thead><tr>';
    header.forEach((h, i) => {
      const a = align[i] ? ` style="text-align:${align[i]}"` : "";
      html += `<th${a}>${renderInline(h)}</th>`;
    });
    html += "</tr></thead><tbody>";
    body.forEach(row => {
      html += "<tr>";
      row.forEach((c, i) => {
        const a = align[i] ? ` style="text-align:${align[i]}"` : "";
        html += `<td${a}>${renderInline(c)}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }

  function renderMarkdown(src) {
    if (!src) return "";

    // 1) 提取代码块占位
    const codeBlocks = [];
    src = src.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (m, lang, code) => {
      const idx = codeBlocks.push({ lang, code }) - 1;
      return `\x01CODE${idx}\x01`;
    });

    // 2) 行内 code 占位
    src = src.replace(/`([^`\n]+)`/g, (m, c) => `\x02INLINE${escapeHtml(c)}\x02`);

    // 3) 转义其它 HTML
    src = escapeHtml(src);

    // 4) 按行处理块级元素
    const lines = src.split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const t = lineType(line);

      // hr
      if (t === "hr") { out.push("<hr>"); i++; continue; }

      // heading
      if (t === "heading") {
        const m = line.match(/^(\s*)(#{1,6})\s+(.+)$/);
        const level = m[2].length;
        out.push(`<h${level}>${renderInline(m[3])}</h${level}>`);
        i++; continue;
      }

      // blockquote（连续 > / &gt;）
      if (t === "blockquote") {
        const block = [];
        while (i < lines.length && lineType(lines[i]) === "blockquote") {
          block.push(lines[i].replace(/^(?:>|&gt;)\s?/, ""));
          i++;
        }
        out.push(`<blockquote>${block.map(renderInline).join("<br>")}</blockquote>`);
        continue;
      }

      // table（一行 |...| + 下一行 |---|）
      if (t === "table-row" && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        const rows = [lines[i], lines[i + 1]];
        i += 2;
        while (i < lines.length && lineType(lines[i]) === "table-row") {
          rows.push(lines[i]);
          i++;
        }
        out.push(renderTable(rows));
        continue;
      }

      // 列表（ul / ol / task）支持简单嵌套（2-space indent）
      if (t === "ul" || t === "ol" || t === "task") {
        const initialType = t;
        const items = [];
        while (i < lines.length) {
          const tt = lineType(lines[i]);
          if (tt !== "ul" && tt !== "ol" && tt !== "task") break;
          const parsed = parseListItem(lines[i], tt);
          if (!parsed) break;
          items.push({ ...parsed, type: tt });
          i++;
        }
        // 渲染顶层列表（嵌套仅支持两层）
        const baseIndent = items[0]?.indent ?? 0;
        const tag = initialType === "ol" ? "ol" : "ul";
        let html = `<${tag} class="md-list">`;
        const stack = [{ indent: baseIndent, tag }];
        items.forEach((it, idx) => {
          while (stack.length > 1 && it.indent < stack[stack.length - 1].indent) {
            html += `</${stack.pop().tag}>`;
          }
          if (it.indent > stack[stack.length - 1].indent) {
            const nestedTag = it.type === "ol" ? "ol" : "ul";
            html += `<${nestedTag} class="md-list">`;
            stack.push({ indent: it.indent, tag: nestedTag });
          }
          if (it.type === "task") {
            const checked = it.checked ? "checked" : "";
            html += `<li class="md-task"><input type="checkbox" ${checked} disabled> ${renderInline(it.content)}</li>`;
          } else {
            html += `<li>${renderInline(it.content)}</li>`;
          }
        });
        while (stack.length > 0) html += `</${stack.pop().tag}>`;
        out.push(html);
        continue;
      }

      // 段落：收集到 blank 或下一个块元素
      if (t === "paragraph") {
        const buf = [line];
        i++;
        while (i < lines.length) {
          const tt = lineType(lines[i]);
          if (tt !== "paragraph") break;
          buf.push(lines[i]);
          i++;
        }
        out.push(`<p>${renderInline(buf.join("<br>"))}</p>`);
        continue;
      }

      // blank
      i++;
    }

    let result = out.join("");

    // 5) 回填行内 code（renderInline 内部已处理，但代码块外的 inline 占位也要收尾）
    result = result.replace(/\x02INLINE([\s\S]*?)\x02/g, (m, c) => `<code>${c}</code>`);

    // 6) 回填代码块（含 html/svg 预览支持）
    result = result.replace(/\x01CODE(\d+)\x01/g, (m, idx) => {
      const { lang, code } = codeBlocks[Number(idx)];
      // 没有 lang 标记时用启发式检测代码内容是否像 HTML/SVG
      // （AI 平台 DOM 抓取时 class 可能不是标准 language-html，fence 会缺 lang）
      let effectiveLang = lang;
      if (!effectiveLang && code) {
        if (/<!DOCTYPE\s+html/i.test(code) || /<html[\s>]/i.test(code)) {
          effectiveLang = "html";
        } else if (/^\s*<svg[\s>]/i.test(code)) {
          effectiveLang = "svg";
        } else {
          // 含 ≥3 个常见 HTML 块级标签 → 视为 HTML 片段
          const tagMatches = code.match(/<\/?(html|head|body|div|p|span|h[1-6]|ul|ol|table|section|nav|footer|header|main|article|button|input|form|a|img|script|style|link|meta)\b/gi);
          if (tagMatches && tagMatches.length >= 3) effectiveLang = "html";
        }
      }
      const displayLang = effectiveLang || "";
      const langClass = displayLang ? ` class="language-${escapeHtml(displayLang)}"` : "";
      const preHtml = `<pre><code${langClass}>${escapeHtml(code)}</code></pre>`;
      const previewable = /^x?html$/i.test(displayLang) || /^svg$/i.test(displayLang);
      if (!previewable) return preHtml;
      // 把原始 code base64 存到 data-* —— popup-codepreview.js 切到预览时 decode 设 iframe.srcdoc
      let b64 = "";
      try {
        if (typeof btoa === "function") {
          b64 = btoa(unescape(encodeURIComponent(code)));
        } else {
          b64 = Buffer.from(code, "utf8").toString("base64");
        }
      } catch { b64 = ""; }
      const labelLang = displayLang.toUpperCase();
      return `<div class="code-block-wrap" data-lang="${escapeHtml(displayLang)}">
<div class="code-block-tabs">
<button class="code-block-tab active" data-tab="code">代码 ${escapeHtml(labelLang)}</button>
<button class="code-block-tab" data-tab="preview" title="在沙箱 iframe 中渲染">▶ 预览</button>
<button class="code-block-tab code-block-copy" data-tab="copy" title="复制">📋</button>
</div>
<div class="code-block-pane code-block-pane-code">${preHtml}</div>
<div class="code-block-pane code-block-pane-preview" data-html-b64="${b64}" hidden></div>
</div>`;
    });

    return result;
  }

  global.renderMarkdown = renderMarkdown;
  if (typeof module !== "undefined") module.exports = { renderMarkdown, escapeHtml, safeUrl };
})(typeof window !== "undefined" ? window : globalThis);
