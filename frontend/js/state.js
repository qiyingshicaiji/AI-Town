/* ================================
   State Management - 前端全局状态
   ================================ */

const STATE = {
    // Connection
    connected: false,

    // NPCs
    npcs: [],         // { name, title, state, affinity, level }
    npcStates: [],    // from /api/npcs/states

    // Timelines
    timelines: [],
    activeTimelineId: null,
    currentDay: 0,

    // Chat
    active1v1Npc: null,      // current NPC name for 1v1
    selectedGroupNpcs: [],   // selected NPC names for group chat
    chatMode: '1v1',         // '1v1' | 'group' | 'world'

    // Messages
    messages1v1: [],         // [{sender, content, time, npcAvatar}]
    messagesGroup: [],
    messagesWorld: [],

    // NPC Chat
    npcChatStatus: null,
    dailyCallsLeft: 50,

    // Polling
    pollTimer: null,
    pollInterval: 10000,     // default 10s
    lastActivity: Date.now(),
};

// Event subscribers
const _listeners = {};

function on(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
}

function off(event, callback) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(cb => cb !== callback);
}

function emit(event, data) {
    if (!_listeners[event]) return;
    _listeners[event].forEach(cb => {
        try { cb(data); } catch(e) { console.error(`Event ${event} handler error:`, e); }
    });
}

// Update state helper
function setState(key, value) {
    STATE[key] = value;
    emit('stateChange', { key, value });
    emit(`change:${key}`, value);
}
