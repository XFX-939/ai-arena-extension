// AI Arena PoC — Bridge content script (ISOLATED world)
// Runs all 4 capture methods simultaneously, reports metrics via chrome.runtime
(() => {
  let captureActive = false;
  let captureStartTs = 0;

  // Per-method state
  let stateA, stateC, stateH, stateBL;

  function resetState() {
    stateA  = { firstTs: 0, doneTs: 0, text: '', chunks: 0 };
    stateC  = { firstTs: 0, doneTs: 0, text: '', observer: null, lastText: '', lastChangeTs: 0, timer: null };
    stateH  = { firstTs: 0, doneTs: 0, text: '', observer: null, moObserver: null, lastH: 0, timer: null, target: null };
    stateBL = { startTs: 0, doneTs: 0, text: '', timer: null };
  }
  resetState();

  function report(method, event, data) {
    chrome.runtime.sendMessage({
      type: 'poc-event', method, event, data,
      ts: Date.now(),
      elapsed: Date.now() - captureStartTs
    }).catch(() => {});
  }

  // ════════ Method A: Network tap (postMessage from MAIN world) ════════
  window.addEventListener('message', (e) => {
    if (!captureActive || e.source !== window || !e.data?.__arenaNetTap) return;
    const { type, payload } = e.data;

    if (type === 'stream-start') {
      report('A', 'start', {});
    } else if (type === 'stream-chunk') {
      if (!stateA.firstTs) stateA.firstTs = Date.now();
      stateA.chunks++;
      stateA.text = payload.text;
    } else if (type === 'stream-done') {
      stateA.doneTs = Date.now();
      stateA.text = payload.fullText || stateA.text;
      report('A', 'done', {
        text: stateA.text,
        firstDelay: stateA.firstTs ? stateA.firstTs - captureStartTs : -1,
        totalTime: stateA.doneTs - captureStartTs,
        chunks: stateA.chunks,
        textLen: stateA.text.length
      });
    } else if (type === 'stream-error') {
      report('A', 'error', payload);
    }
  });

  // ════════ Method C: MutationObserver + node anchoring ════════
  function startMethodC() {
    const container = findChatContainer();
    if (!container) { report('C', 'error', { msg: 'container not found' }); return; }

    const knownIds = new Set();
    container.querySelectorAll('[data-message-author-role="assistant"]').forEach(el => {
      knownIds.add(getNodeKey(el));
    });

    stateC.observer = new MutationObserver(() => {
      const all = container.querySelectorAll('[data-message-author-role="assistant"]');
      const latest = all[all.length - 1];
      if (!latest) return;

      const key = getNodeKey(latest);
      if (knownIds.has(key) && all.length <= knownIds.size) return;

      const text = latest.innerText?.trim() || '';
      if (!text || text === stateC.lastText) return;

      if (!stateC.firstTs) stateC.firstTs = Date.now();
      stateC.lastText = text;
      stateC.lastChangeTs = Date.now();
      stateC.text = text;

      if (stateC.timer) clearTimeout(stateC.timer);
      stateC.timer = setTimeout(() => settleMethodC(), 800);
    });

    stateC.observer.observe(container, { childList: true, subtree: true, characterData: true });
  }

  function settleMethodC() {
    if (stateC.doneTs) return;
    if (isStopButtonVisible()) {
      stateC.timer = setTimeout(() => settleMethodC(), 500);
      return;
    }
    stateC.doneTs = Date.now();
    report('C', 'done', {
      text: stateC.text,
      firstDelay: stateC.firstTs ? stateC.firstTs - captureStartTs : -1,
      totalTime: stateC.doneTs - captureStartTs,
      textLen: stateC.text.length
    });
  }

  // ════════ Method H: ResizeObserver ════════
  function startMethodH() {
    const container = findChatContainer();
    if (!container) { report('H', 'error', { msg: 'container not found' }); return; }

    stateH.moObserver = new MutationObserver(() => {
      const all = container.querySelectorAll('[data-message-author-role="assistant"]');
      const latest = all[all.length - 1];
      if (latest && latest !== stateH.target) {
        stateH.target = latest;
        attachResize(latest);
      }
    });
    stateH.moObserver.observe(container, { childList: true, subtree: true });
  }

  function attachResize(el) {
    if (stateH.observer) stateH.observer.disconnect();
    stateH.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h === stateH.lastH) return;

        if (!stateH.firstTs) stateH.firstTs = Date.now();
        stateH.lastH = h;

        if (stateH.timer) clearTimeout(stateH.timer);
        stateH.timer = setTimeout(() => settleMethodH(el), 500);
      }
    });
    stateH.observer.observe(el);
  }

  function settleMethodH(el) {
    if (stateH.doneTs) return;
    if (isStopButtonVisible()) {
      stateH.timer = setTimeout(() => settleMethodH(el), 500);
      return;
    }
    stateH.text = el?.innerText?.trim() || '';
    stateH.doneTs = Date.now();
    report('H', 'done', {
      text: stateH.text,
      firstDelay: stateH.firstTs ? stateH.firstTs - captureStartTs : -1,
      totalTime: stateH.doneTs - captureStartTs,
      textLen: stateH.text.length
    });
  }

  // ════════ Baseline: Marker polling ════════
  function startBaseline() {
    stateBL.timer = setInterval(() => {
      const all = document.querySelectorAll('[data-message-author-role="assistant"]');
      const latest = all[all.length - 1];
      if (!latest) return;

      const text = latest.textContent || '';

      if (/ARENA_START_R\d+/.test(text) && !stateBL.startTs) {
        stateBL.startTs = Date.now();
      }

      if (/ARENA_DONE_R\d+/.test(text.slice(-200)) && !stateBL.doneTs) {
        stateBL.doneTs = Date.now();
        stateBL.text = text.replace(/ARENA_START_R\d+/g, '').replace(/ARENA_DONE_R\d+/g, '').trim();
        report('baseline', 'done', {
          text: stateBL.text,
          startDelay: stateBL.startTs ? stateBL.startTs - captureStartTs : -1,
          totalTime: stateBL.doneTs - captureStartTs,
          textLen: stateBL.text.length
        });
        clearInterval(stateBL.timer);
      }
    }, 250);
  }

  // ════════ Helpers ════════
  function getNodeKey(el) {
    return el.getAttribute('data-message-id') || el.getAttribute('data-testid') || el.textContent?.slice(0, 80) || '';
  }

  function findChatContainer() {
    return document.querySelector('[role="presentation"]')
      || document.querySelector('main')
      || document.body;
  }

  function isStopButtonVisible() {
    const sel = 'button[aria-label="Stop generating"], button[aria-label="Stop streaming"], [data-testid="stop-button"]';
    const btn = document.querySelector(sel);
    if (!btn) return false;
    const rect = btn.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function stopCapture() {
    captureActive = false;
    if (stateC.observer) stateC.observer.disconnect();
    if (stateC.timer) clearTimeout(stateC.timer);
    if (stateH.observer) stateH.observer.disconnect();
    if (stateH.moObserver) stateH.moObserver.disconnect();
    if (stateH.timer) clearTimeout(stateH.timer);
    if (stateBL.timer) clearInterval(stateBL.timer);
  }

  // ════════ Message handler ════════
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'poc-start-capture') {
      stopCapture();
      resetState();
      captureActive = true;
      captureStartTs = Date.now();
      startMethodC();
      startMethodH();
      startBaseline();
      report('all', 'capture-started', { prompt: msg.prompt || '' });
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === 'poc-stop-capture') {
      stopCapture();
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === 'poc-get-results') {
      sendResponse({
        A: {
          text: stateA.text, textLen: stateA.text.length, chunks: stateA.chunks,
          firstDelay: stateA.firstTs ? stateA.firstTs - captureStartTs : -1,
          totalTime: stateA.doneTs ? stateA.doneTs - captureStartTs : -1
        },
        C: {
          text: stateC.text, textLen: stateC.text.length,
          firstDelay: stateC.firstTs ? stateC.firstTs - captureStartTs : -1,
          totalTime: stateC.doneTs ? stateC.doneTs - captureStartTs : -1
        },
        H: {
          text: stateH.text, textLen: stateH.text.length,
          firstDelay: stateH.firstTs ? stateH.firstTs - captureStartTs : -1,
          totalTime: stateH.doneTs ? stateH.doneTs - captureStartTs : -1
        },
        baseline: {
          text: stateBL.text, textLen: stateBL.text.length,
          startDelay: stateBL.startTs ? stateBL.startTs - captureStartTs : -1,
          totalTime: stateBL.doneTs ? stateBL.doneTs - captureStartTs : -1
        }
      });
      return false;
    }
  });
})();
