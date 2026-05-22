// state-machine.js — FlowState + 纯数据存储（无 ParticipantState）

// ── 状态枚举 ──
const FlowState = {
  IDLE: "idle",
  BROADCASTING: "broadcasting",
  AWAITING_RESPONSES: "awaiting_responses",
  DEBATING: "debating",
  SUMMARY: "summary"
};

// ── 状态管理器 ──
const StateMachine = {
  flowState: FlowState.IDLE,
  participants: [],     // { id, service, tabId, name, response, responsePreview }
  nextId: 1,
  debateSession: { originalQuestion: "", rounds: [], summaryText: "" },
  markerRound: 0,
  // 每个参与者最近一次"刚发出去"的 prompt，用于 readOneResponse sanity check（防把用户消息当成 AI 回复）
  lastSentByPid: {},
  // 每个参与者最近一次已接受的 AI 回复；即使进入下一轮清空 response，也用于拒绝上一轮残留。
  lastAcceptedByPid: {},

  // ── 初始化（从 storage 恢复） ──
  async init() {
    const data = await chrome.storage.local.get(["sm_flowState", "sm_participants", "sm_nextId", "sm_debateSession", "sm_markerRound", "sm_lastSentByPid", "sm_lastAcceptedByPid"]);
    if (data.sm_flowState) this.flowState = data.sm_flowState;
    if (data.sm_participants) this.participants = data.sm_participants;
    if (data.sm_nextId) this.nextId = data.sm_nextId;
    if (data.sm_debateSession) this.debateSession = data.sm_debateSession;
    if (data.sm_markerRound) this.markerRound = data.sm_markerRound;
    if (data.sm_lastSentByPid) this.lastSentByPid = data.sm_lastSentByPid;
    if (data.sm_lastAcceptedByPid) this.lastAcceptedByPid = data.sm_lastAcceptedByPid;
  },

  save() {
    chrome.storage.local.set({
      sm_flowState: this.flowState,
      sm_participants: this.participants,
      sm_nextId: this.nextId,
      sm_debateSession: this.debateSession,
      sm_markerRound: this.markerRound,
      sm_lastSentByPid: this.lastSentByPid,
      sm_lastAcceptedByPid: this.lastAcceptedByPid
    });
  },

  // ── Flow 状态转换 ──
  setFlowState(newState) {
    this.flowState = newState;
    this.save();
    this._broadcastStateUpdate();
  },

  // ── 参与者管理 ──
  addParticipant(id, service, tabId, name) {
    this.participants.push({
      id, service, tabId, name,
      response: null,
      responsePreview: null
    });
    this.save();
  },

  removeParticipant(id) {
    this.participants = this.participants.filter(p => p.id !== id);
    this.save();
  },

  getParticipant(id) {
    return this.participants.find(p => p.id === id);
  },

  getParticipantByTabId(tabId) {
    return this.participants.find(p => p.tabId === tabId) || null;
  },

  setParticipantResponse(id, text) {
    const p = this.getParticipant(id);
    if (p) {
      p.response = text;
      p.responsePreview = text ? text.slice(0, 100) : null;
      this.lastAcceptedByPid[id] = text || "";
      this.save();
      this._broadcastStateUpdate();
    }
  },

  // ── 会话管理 ──
  resetSession() {
    this.debateSession = { originalQuestion: "", rounds: [], summaryText: "" };
    this.flowState = FlowState.IDLE;
    this.markerRound = 0;
    this.lastSentByPid = {};
    this.lastAcceptedByPid = {};
    this.participants.forEach(p => {
      p.response = null;
      p.responsePreview = null;
    });
    this.save();
  },

  hardReset() {
    this.participants = [];
    this.nextId = 1;
    this.debateSession = { originalQuestion: "", rounds: [], summaryText: "" };
    this.flowState = FlowState.IDLE;
    this.markerRound = 0;
    this.lastSentByPid = {};
    this.lastAcceptedByPid = {};
    this.save();
  },

  setLastSent(pid, text) {
    this.lastSentByPid[pid] = text || "";
    this.save();
  },

  // ── 状态广播到 sidepanel ──
  _broadcastStateUpdate() {
    chrome.runtime.sendMessage({
      type: "stateUpdate",
      flowState: this.flowState,
      participants: this.participants.map(p => ({
        id: p.id, service: p.service, tabId: p.tabId, name: p.name,
        responsePreview: p.responsePreview
      })),
      debateSession: this.debateSession
    }).catch(() => {});
  },

  getFullState() {
    return {
      flowState: this.flowState,
      participants: this.participants.map(p => ({
        id: p.id, service: p.service, tabId: p.tabId, name: p.name,
        responsePreview: p.responsePreview
      })),
      debateSession: this.debateSession
    };
  }
};
