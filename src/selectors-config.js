// selectors-config.js — 内置默认选择器配置
// 每个平台的每个 action 是一个选择器数组，按优先级排列

const DEFAULT_SELECTORS = {
  claude: {
    input: [
      "div.ProseMirror[contenteditable='true']",
      ".ProseMirror[contenteditable]",
      "[contenteditable='true']"
    ],
    response: [
      "[data-testid='chat-message-content']",
      ".font-claude-message",
      "[data-is-streaming]",
      ".prose, .markdown",
      '[class*="message"], [class*="response"], [class*="assistant"]'
    ],
    streaming: [
      '[data-is-streaming="true"]',
      '.font-claude-message [data-is-streaming="true"]',
      ".is-streaming",
      'button[aria-label="Stop Response"]',
      'button[aria-label="Stop response"]',
      '[data-is-thinking="true"]',
      ".font-claude-message .thinking-indicator",
      '.font-claude-message [class*="thinking"]',
      'button[aria-label="Cancel"]',
      ".font-claude-message .animate-spin",
      "[data-is-streaming] .animate-spin"
    ],
    sendButton: [
      'button[aria-label="Send Message"]',
      'button[aria-label="Send message"]',
      'button[data-testid="send-button"]'
    ],
    userMessage: [
      '[data-testid="human-turn"]'
    ],
    conversation: [
      '[data-testid="human-turn"], .font-claude-message, [data-is-streaming]'
    ]
  },
  chatgpt: {
    // v5.2.13: ChatGPT 真输入框是 DIV#prompt-textarea.ProseMirror (contenteditable)，
    //   页面还有个 TEXTAREA.wcDTda_fallbackTextarea hidden 兜底框（浏览器自动填充用）。
    //   原 "textarea" fallback 会误抓 hidden 框 → 注入文字但用户看不到、send 不响应。
    //   修：ProseMirror 显式优先 + textarea 改为限定 #prompt-textarea（id 不会撞 hidden 那个）
    input: [
      "div.ProseMirror[contenteditable='true']",   // v5.2.13 主 — 精准命中
      "#prompt-textarea",                          // id 兜底（DIV 或 textarea 都行）
      "[contenteditable='true']",                  // 通用兜底
      "textarea#prompt-textarea"                   // 极端兜底（限定 id，避开 hidden）
    ],
    response: [
      // v4.3.2: 加宽匹配，捕获 ChatGPT 生图模式下的 image attachment 容器
      '[data-message-author-role="assistant"]',
      '[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])',
      ".markdown.prose",
      'div.group\\/turn-messages:last-child'
    ],
    streaming: [
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop streaming"]',
      '[data-testid="stop-button"]'
    ],
    sendButton: [
      '[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send"]'
    ],
    conversation: [
      "[data-message-author-role]"
    ]
  },
  gemini: {
    input: [
      ".ql-editor[contenteditable='true']",
      "rich-textarea .ql-editor",
      ".text-input-field textarea",
      "[contenteditable='true']"
    ],
    response: [
      ".model-response-text .markdown",
      ".response-container .markdown",
      "[data-content-type='model']"
    ],
    streaming: [
      "model-response .loading-indicator",
      "button[aria-label='Stop response']",
      "button[aria-label='Stop generating']",
      "button[aria-label*='Stop']",
      ".thinking-indicator",
      "thinking-tag",
      "model-response .thinking",
      "model-response [class*='thinking']",
      "model-response .animate-spin",
      "model-response mat-spinner"
    ],
    sendButton: [
      'button[aria-label="Send message"]',
      'button[aria-label*="发送"]',
      "button.send-button"
    ],
    conversation: [
      "user-query, model-response",
      "[data-content-type]"
    ]
  },
  deepseek: {
    input: [
      "#chat-input",
      "textarea[placeholder]",
      "textarea",
      '[contenteditable="true"]'
    ],
    response: [
      ".ds-markdown",
      '[class*="assistant-message"]',
      '[class*="bot-message"]',
      ".markdown-body",
      ".prose"
    ],
    streaming: [
      ".ds-loading",
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop"]'
    ],
    sendButton: [
      '[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]'
    ],
    userMessage: [
      '[class*="user-message"]',
      '[class*="human"]',
      ".fbb737a4"
    ]
  },
  doubao: {
    // v5.2.3: MCP playwright 未登录态游客发送实测 — v_list_row 实际有 4 个：
    //   idx 0,3 = 空 spacer 占位行（无 data-observe-row 属性，含 v_list_top/bottom_indicator）
    //   idx 1   = 用户消息（含 bg-g-send）
    //   idx 2   = 真 AI 回复（含 data-observe-row="block_XXX"）
    //   v5.2.2 bug: 只用 :not(:has(bg-g-send)) 会命中 idx 0+2+3 三个，readLatestResponse 取 last → 拿到空 spacer
    //   修复：加 [data-observe-row] 属性 → 排除 spacer，只剩真消息行
    //   输入框：textarea.semi-input-textarea（Semi Design）
    input: [
      'textarea.semi-input-textarea',                    // 主输入框（实测）
      '[contenteditable="true"]',
      "textarea",
      '[class*="input"][class*="editor"]'
    ],
    response: [
      // v5.2.3: 核心 selector — v_list_row + data-observe-row 业务消息行 + 非 bg-g-send（=AI 行）
      '[class*="v_list_row"][data-observe-row]:not(:has([class*="bg-g-send"]))',
      // 兜底 1：万一 data-observe-row 属性也变了，回退到 v5.2.2 selector（仍可能误抓 spacer 但有内容总比无强）
      '[class*="v_list_row"]:not(:has([class*="bg-g-send"]))',
      // 兜底 2：万一 v_list_row 命名变了，fallback 到老命名
      '[class*="assistant"] [class*="content"]',
      '[class*="bot-message"]',
      '[class*="markdown"]'
    ],
    streaming: [
      'button[class*="stop"]',
      '[class*="generating"]'
    ],
    sendButton: [
      // v5.2.15: MCP 实测真 class 含 bg-g-send-msg-btn-bg / send-msg-btn-bg / [&_svg]:size-[16px]
      'button[class*="send-msg-btn"]',         // 最精准（豆包专属）
      'button[class*="g-send-msg"]',           // bg-g-send-msg-* hash 命名空间
      'button[aria-label*="发送"]',             // aria-label 兜底（未来若加 a11y）
      'button[class*="send"]',                  // 历史
      '[class*="send-btn"]'
    ],
    userMessage: [
      // v5.2.3: 用户消息 = bg-g-send 块（实测 idx 1 v_list_row 内含 bg-g-send）
      '[class*="bg-g-send"]',
      '[class*="send-msg-bubble-text"]',
      // 老 selector：
      '[class*="user-message"]',
      '[class*="human-message"]',
      '[class*="user_message"]'
    ]
  },
  qwen: {
    // v5.2.13: MCP 实测千问真 DOM 命名（www.qianwen.com 2026-05）
    //   送 selector 之前用 button[class*="send"] 永远 0 命中 —— 千问 send 按钮真实 class 全是
    //   "inline-flex size-8 shrink-0 ..." Tailwind，无 send/submit 字样，唯一稳定特征是
    //   aria-label="发送消息"。修：以 aria-label 为主 selector。
    input: [
      '[role="textbox"]',
      '[contenteditable="true"]',
      '[contenteditable]',
      "textarea"
    ],
    response: [
      // v5.2.13: MCP 实测真命名（qk = QianWen Kit）
      '[class*="qk-markdown"]',                  // 主 — 直接命中千问 markdown 容器
      '.qk-md-paragraph',                        // 段落 fallback
      // 历史兜底（其他平台 / 旧版本）
      '[class*="markdown"]',
      '[class*="assistant"] [class*="content"]',
      '[class*="answer-content"]'
    ],
    streaming: [
      // v5.2.13: 强信号 — qk-markdown 容器没 complete 标志 = 还在 streaming
      //   完成态 class: "qk-markdown qk-markdown-complete"；streaming 时无 complete
      '[class*="qk-markdown"]:not([class*="qk-markdown-complete"])',
      'button[class*="stop"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="Stop"]',
      '[class*="generating"]'
    ],
    sendButton: [
      'button[aria-label="发送消息"]',          // v5.2.13 主 — MCP 实测唯一稳定特征
      'button[aria-label*="发送"]',             // v5.2.13 兜底 — 兼容微调
      'button[aria-label*="Send"]',             // v5.2.13 英文 UI
      'button[class*="send"]',                 // 历史兜底（其他 AI 可能用）
      'button[class*="submit"]'
    ],
    userMessage: [
      '[class*="user"] [class*="content"]',
      '[class*="human"] [class*="text"]',
      '[class*="question"]'
    ]
  },
  kimi: {
    input: [
      '[role="textbox"]',
      '[contenteditable="true"]',
      '[contenteditable]',
      "textarea"
    ],
    response: [
      // v4.3.7 加宽 — Kimi 网页改 class 频繁
      '[class*="segment-assistant"]',
      '[class*="assistant-segment"]',
      '[class*="message-content"]',
      '[class*="assistant"] [class*="content"]',
      '[class*="assistant"] [class*="markdown"]',
      '[class*="markdown-body"]',
      '[data-role="assistant"]',
      'div.markdown',
      '[class*="ChatBubble"][class*="assistant"]'
    ],
    streaming: [
      'button[class*="stop"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="Stop"]',
      '[class*="generating"]',
      '[class*="loading"]'
    ],
    sendButton: [
      // v5.2.15: 防御加强 — Kimi 真 send 按钮 class 未实测，加 aria-label 兜底
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      'button[aria-label="提交"]',
      'button[class*="send"]',
      'button[class*="submit"]'
    ],
    userMessage: [
      '[class*="user"] [class*="content"]',
      '[class*="human"]'
    ]
  },
  yuanbao: {
    input: [
      '[contenteditable="true"]',
      "textarea",
      '#chat-input'
    ],
    response: [
      // v5.2.20: MCP 登录态实测真命名（腾讯混元 hyc-* 命名空间）— 修"表格被拆成单列"
      //   元宝 AI 回答容器是 hyc-content-md（内含原生 <table>），旧 selector 全是
      //   markdown/bot-message/answer → 0 命中 → 走 heuristic 抓错容器 → table 没识别 →
      //   每个单元格 innerText 各自换行 → 单列。实测 hyc-content-md 命中后 table→md 正确。
      '[class*="hyc-content-md"]',                // 主 — AI 回答主容器（含 table），实测精准命中
      '[class*="hyc-common-markdown"]',           // markdown 渲染层兜底
      '[class*="hyc-component-text"]',            // 文本组件兜底
      // 历史兜底（旧版本 / 其他形态）
      '[class*="bot-message"] [class*="markdown"]',
      '[class*="assistant"] [class*="markdown"]',
      '[class*="answer"] [class*="markdown"]',
      '[class*="markdown-body"]',
      '[class*="bot-message"]',
      '[class*="answer"]',
      '[class*="assistant"] [class*="content"]'
    ],
    streaming: [
      // v5.2.20: 强信号 — hyc-content-md 完成后加 hyc-content-md-done 标记，无 done = 生成中
      '[class*="hyc-content-md"]:not([class*="hyc-content-md-done"])',
      'button[class*="stop"]',
      'button[aria-label*="停止"]',
      'button[aria-label*="Stop"]',
      '[class*="generating"]'
      // v5.2.20: 删 [class*="loading"] — 太宽，误命中元宝页面持久 loading 占位致 isStreaming 卡 true
    ],
    sendButton: [
      // v5.2.15: 防御加强 — 元宝真 send 按钮未实测，加 aria-label 兜底
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      'button[aria-label="提交"]',
      'button[class*="send"]',
      'button[class*="submit"]'
    ],
    userMessage: [
      '[class*="user"] [class*="content"]',
      '[class*="human"]'
    ]
  },
  grok: {
    input: [
      'div.tiptap.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      "textarea"
    ],
    response: [
      '[class*="message-bubble"] [class*="markdown"]',
      '[class*="assistant"] [class*="content"]',
      '[class*="markdown"]',
      ".prose"
    ],
    streaming: [
      'button[aria-label="Stop"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label="停止"]',
      '[class*="stop"]'
    ],
    sendButton: [
      'button[aria-label="提交"]',
      'button[aria-label="Submit"]',
      'button[aria-label="Send"]'
    ],
    userMessage: [
      '[class*="user"] [class*="content"]',
      '[class*="human"]'
    ]
  }
};
