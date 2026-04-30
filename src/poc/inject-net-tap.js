// AI Arena PoC — Method A: MAIN world fetch interceptor
// Injected via chrome.scripting.executeScript({world: 'MAIN'})
// Hooks window.fetch to intercept SSE streams from AI endpoints
(() => {
  if (window.__arenaNetTap) return;
  window.__arenaNetTap = true;

  const originalFetch = window.fetch;

  const SSE_PATTERNS = [
    /backend-api\/conversation/,           // ChatGPT
    /\/api\/organizations\/.*\/completion/, // Claude (Phase 2)
    /generativelanguage\.googleapis/,       // Gemini (Phase 2)
    /api\.deepseek\.com/,                   // DeepSeek (Phase 2)
  ];

  function isTargetURL(url) {
    return SSE_PATTERNS.some(p => p.test(url));
  }

  function emit(type, payload) {
    window.postMessage({
      __arenaNetTap: true, type, payload, ts: Date.now()
    }, '*');
  }

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = (args[0] instanceof Request) ? args[0].url : String(args[0]);
      if (!isTargetURL(url)) return response;

      const ct = response.headers.get('content-type') || '';
      if (!/event-stream|text\/plain|octet-stream/.test(ct)) return response;

      const clone = response.clone();
      const reader = clone.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      emit('stream-start', { url });

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();

              if (data === '[DONE]') {
                emit('stream-done', { url, fullText });
                continue;
              }

              try {
                const json = JSON.parse(data);
                const extracted = extractText(json);
                if (extracted !== null) {
                  fullText = extracted;
                  emit('stream-chunk', { url, text: fullText });
                }
              } catch {}
            }
          }
          if (fullText) emit('stream-done', { url, fullText });
        } catch (e) {
          emit('stream-error', { url, error: e.message });
        }
      })();
    } catch {}

    return response;
  };

  function extractText(json) {
    // ChatGPT: message.content.parts[] (accumulated)
    const msg = json.message;
    if (msg?.author?.role === 'assistant' && msg?.content?.parts) {
      return msg.content.parts.filter(p => typeof p === 'string').join('');
    }
    // OpenAI compatible: choices[0].delta.content (incremental)
    const delta = json.choices?.[0]?.delta;
    if (delta?.content) return delta.content;
    return null;
  }
})();
