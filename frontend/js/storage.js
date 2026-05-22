/* ================================
   localStorage 聊天持久化
   ================================ */

const STORAGE_KEY_CONVERSATIONS = 'aitown_conversations';
const STORAGE_KEY_MESSAGES_PREFIX = 'aitown_msgs_';
const MAX_MESSAGES_PER_CONV = 200;

// ==================== Conversation List ====================

function getConversationList() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CONVERSATIONS);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveConversationList(list) {
    try {
        localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(list));
    } catch { /* quota exceeded, ignore */ }
}

function upsertConversation(conv) {
    const list = getConversationList();
    const idx = list.findIndex(c => c.id === conv.id);
    if (idx >= 0) {
        list[idx] = { ...list[idx], ...conv, updatedAt: Date.now() };
    } else {
        list.unshift({ ...conv, createdAt: Date.now(), updatedAt: Date.now() });
    }
    saveConversationList(list);
    return list;
}

function removeConversation(convId) {
    const list = getConversationList().filter(c => c.id !== convId);
    saveConversationList(list);
    // Also clear messages
    try { localStorage.removeItem(STORAGE_KEY_MESSAGES_PREFIX + convId); } catch {}
    return list;
}

function getConversation(convId) {
    return getConversationList().find(c => c.id === convId) || null;
}

// ==================== Messages ====================

function saveMessages(convId, messages) {
    try {
        const toStore = messages.slice(-MAX_MESSAGES_PER_CONV);
        localStorage.setItem(STORAGE_KEY_MESSAGES_PREFIX + convId, JSON.stringify(toStore));
    } catch { /* quota exceeded */ }
}

function loadMessages(convId) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_MESSAGES_PREFIX + convId);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function appendMessage(convId, message) {
    const msgs = loadMessages(convId);
    msgs.push({ ...message, time: message.time || new Date().toISOString() });
    saveMessages(convId, msgs);
    // Update last message in conversation list
    const conv = getConversation(convId);
    if (conv) {
        conv.lastMsg = (message.content || '').substring(0, 50);
        conv.lastTime = message.time || new Date().toISOString();
        conv.unread = (conv.unread || 0) + 1;
        upsertConversation(conv);
    } else {
        console.warn(`appendMessage: conversation ${convId} not found in list`);
    }
    return msgs;
}

function markRead(convId) {
    const conv = getConversation(convId);
    if (conv) {
        conv.unread = 0;
        upsertConversation(conv);
    }
}

// ==================== Conversation Factory ====================

function make1v1ConvId(npcName) {
    return '1v1_' + npcName;
}

function makeGroupConvId() {
    return 'group_' + Date.now();
}

function makeNpcNpcConvId(npcA, npcB) {
    const pair = [npcA, npcB].sort().join('_');
    return 'npcnpc_' + pair;
}

// Initialize default 1v1 conversations if none exist
function initDefaultConversations(npcNames) {
    const list = getConversationList();
    if (list.length === 0) {
        for (const name of npcNames) {
            upsertConversation({
                id: make1v1ConvId(name),
                type: '1v1',
                name: name,
                title: '',
                participants: [name],
                lastMsg: '',
                lastTime: new Date().toISOString(),
                unread: 0
            });
        }
    }
}
