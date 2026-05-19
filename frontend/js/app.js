/* ================================
   Main Application - 微信式对话列表
   ================================ */

// DOM Refs
const convList = document.getElementById('convList');
const convSearch = document.getElementById('convSearch');
const chatTitle = document.getElementById('chatTitle');
const chatSubtitle = document.getElementById('chatSubtitle');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatHeaderActions = document.getElementById('chatHeaderActions');
const newGroupChatBtn = document.getElementById('newGroupChatBtn');
const newGroupModal = document.getElementById('newGroupModal');
const groupNpcCheckboxes = document.getElementById('groupNpcCheckboxes');
const newGroupConfirm = document.getElementById('newGroupConfirm');
const newGroupCancel = document.getElementById('newGroupCancel');
const connectionStatus = document.getElementById('connectionStatus');
const connectionText = document.getElementById('connectionText');
const idleCountEl = document.getElementById('idleCount');
const chattingCountEl = document.getElementById('chattingCount');
const busyCountEl = document.getElementById('busyCount');
const avgAffinityEl = document.getElementById('avgAffinity');

// State
let currentConvId = null;
let currentConv = null;
let allNpcs = [];
let pollingTimer = null;

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await refreshAllTimelineData();
    await loadNpcsAndInit();

    renderConvList();

    setConnectionStatus(true);
    startPolling();
    console.log('🏙 AI-Town v2 已就绪');
});

function setupEventListeners() {
    // Send message
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    sendBtn.addEventListener('click', sendMessage);

    // Conversation search
    convSearch.addEventListener('input', renderConvList);

    // New group chat
    newGroupChatBtn.addEventListener('click', openNewGroupModal);
    newGroupCancel.addEventListener('click', () => newGroupModal.style.display = 'none');
    newGroupConfirm.addEventListener('click', createGroupChat);

    // Escape to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            newGroupModal.style.display = 'none';
            if (!godPanel.classList.contains('collapsed')) {
                godPanel.classList.add('collapsed');
                godPanelToggle.textContent = '⚡ 上帝界面';
                if (window.innerWidth < 1024) {
                    document.getElementById('godBackdrop').classList.remove('open');
                }
            }
        }
    });

    // Sidebar toggle (mobile)
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        document.getElementById('convSidebar').classList.toggle('open');
        sidebarBackdrop.classList.toggle('open');
    });
    sidebarBackdrop.addEventListener('click', () => {
        document.getElementById('convSidebar').classList.remove('open');
        sidebarBackdrop.classList.remove('open');
    });
}

// ==================== NPC Loading ====================

async function loadNpcsAndInit() {
    try {
        const [npcsData, statesData] = await Promise.all([fetchNpcList(), fetchNpcStates()]);
        allNpcs = npcsData.npcs.map(npc => {
            const st = statesData.states.find(s => s.name === npc.name);
            return { ...npc, state: st ? st.state : 'idle', affinity: 50, level: '友好' };
        });

        // Fetch affinities
        const results = await Promise.all(allNpcs.map(n => fetchNpcAffinity(n.name).catch(() => ({ affinity: 50 }))));
        results.forEach((r, i) => { allNpcs[i].affinity = r.affinity || 50; allNpcs[i].level = r.level || '友好'; });

        // Init default conversations
        initDefaultConversations(allNpcs.map(n => n.name));
        updateStatusSummary();
    } catch (e) {
        console.error('NPC load failed:', e);
        setConnectionStatus(false);
        convList.innerHTML = `<div class="loading-placeholder" style="color:#e74c3c">
            <p>❌ 无法连接后端</p><p style="font-size:12px">${escapeHtml(e.message)}</p>
            <button class="btn btn-sm" onclick="location.reload()">🔄 重试</button></div>`;
    }
}

// ==================== Conversation List Rendering ====================

function renderConvList() {
    const list = getConversationList();
    const query = (convSearch.value || '').toLowerCase();

    const filtered = query ? list.filter(c =>
        c.name.toLowerCase().includes(query) ||
        (c.participants || []).some(p => p.toLowerCase().includes(query))
    ) : list;

    if (filtered.length === 0) {
        convList.innerHTML = '<div class="loading-placeholder">暂无对话</div>';
        return;
    }

    convList.innerHTML = filtered.map(c => {
        const avatarClass = getAvatarClass(c);
        const avatarText = getAvatarText(c);
        const timeStr = c.lastTime ? formatTimeStr(c.lastTime) : '';
        const hasUnread = (c.unread || 0) > 0;

        return `
        <div class="conv-item ${c.id === currentConvId ? 'active' : ''}" onclick="openConversation('${c.id}')" data-convid="${c.id}">
            <div class="conv-avatar ${avatarClass}">${avatarText}</div>
            <div class="conv-info">
                <div class="conv-name">${escapeHtml(c.name)}</div>
                <div class="conv-preview">${escapeHtml(c.lastMsg || '点击开始对话')}</div>
            </div>
            <div class="conv-meta">
                <div class="conv-time">${timeStr}</div>
                ${hasUnread ? `<span class="conv-unread">${c.unread}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

function getAvatarClass(conv) {
    if (conv.type === 'group') return 'group';
    if (conv.type === 'npcnpc') return 'npcnpc';
    if (conv.name === '张三') return 'npc-zhang';
    if (conv.name === '李四') return 'npc-li';
    if (conv.name === '王五') return 'npc-wang';
    return 'npc-zhang';
}

function getAvatarText(conv) {
    if (conv.type === 'group') return '👥';
    if (conv.type === 'npcnpc') return '💬';
    return (conv.name || '?')[0];
}

function updateConversationPreview(convId, msg) {
    const conv = getConversation(convId);
    if (conv) {
        conv.lastMsg = (msg.content || '').substring(0, 40);
        conv.lastTime = msg.time || new Date().toISOString();
        conv.unread = convId === currentConvId ? 0 : (conv.unread || 0) + 1;
        upsertConversation(conv);
    }
}

// ==================== Open Conversation ====================

async function openConversation(convId) {
    // Save current messages first
    if (currentConvId && currentConv) {
        saveMessages(currentConvId, getCurrentMessages());
    }

    currentConvId = convId;
    currentConv = getConversation(convId);
    if (!currentConv) return;

    markRead(convId);
    renderConvList();

    // Update chat header
    chatTitle.textContent = currentConv.name;
    if (currentConv.type === 'group') {
        chatSubtitle.textContent = '群聊 · ' + (currentConv.participants || []).join(', ');
    } else if (currentConv.type === 'npcnpc') {
        chatSubtitle.textContent = 'NPC 间对话 · ' + (currentConv.participants || []).join(' ↔ ');
    } else {
        const npc = allNpcs.find(n => n.name === currentConv.name);
        chatSubtitle.textContent = npc ? `${npc.title} · 好感度: ${Math.round(npc.affinity)}` : '';
    }

    // Header actions
    if (currentConv.type === 'group') {
        chatHeaderActions.innerHTML = `
            <button class="btn btn-sm" onclick="startContention()" title="NPC自动抢话">🎲 开始抢话</button>
            <button class="btn btn-sm" onclick="deleteConversation('${convId}')">🗑</button>`;
    } else if (currentConv.type === 'npcnpc') {
        chatHeaderActions.innerHTML = `
            <button class="btn btn-sm" onclick="deleteConversation('${convId}')">🗑</button>`;
    } else {
        chatHeaderActions.innerHTML = '';
    }

    // Load messages
    const msgs = loadMessages(convId);
    renderMessages(msgs);

    chatInput.disabled = currentConv.type === 'npcnpc';
    sendBtn.disabled = currentConv.type === 'npcnpc';

    // Auto-close sidebar on mobile
    if (window.innerWidth < 768) {
        document.getElementById('convSidebar').classList.remove('open');
        document.getElementById('sidebarBackdrop').classList.remove('open');
    }

    if (currentConv.type !== 'npcnpc') chatInput.focus();
}

function getCurrentMessages() {
    const container = chatMessages;
    const rows = container.querySelectorAll('.message-row, .message-time');
    const msgs = [];
    rows.forEach(row => {
        if (row.classList.contains('message-time')) {
            msgs.push({ type: 'system', content: row.textContent, time: new Date().toISOString() });
        } else {
            const bubble = row.querySelector('.message-bubble');
            const senderEl = row.querySelector('.message-sender');
            if (bubble) {
                msgs.push({
                    sender: senderEl ? senderEl.textContent : (row.classList.contains('self') ? 'player' : ''),
                    content: bubble.textContent,
                    time: new Date().toISOString()
                });
            }
        }
    });
    return msgs;
}

function renderMessages(msgs) {
    chatMessages.innerHTML = '';
    if (!msgs || msgs.length === 0) {
        chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">💬</div>
            <p>${currentConv ? '和 ' + currentConv.name + ' 开始对话吧' : '选择一个对话开始'}</p>
        </div>`;
        return;
    }

    msgs.forEach(msg => {
        if (msg.type === 'system') {
            chatMessages.innerHTML += `<div class="message-time">${escapeHtml(msg.content)}</div>`;
        } else {
            const isPlayer = msg.sender === 'player';
            const name = msg.sender || 'unknown';
            const initial = isPlayer ? '我' : (name[0] || '?');
            const avatarClass = isPlayer ? 'player' : (name === '张三' ? 'npc-zhang' : name === '李四' ? 'npc-li' : 'npc-wang');
            const rowClass = isPlayer ? 'self' : 'other';

            chatMessages.innerHTML += `
            <div class="message-row ${rowClass}">
                <div class="message-avatar ${avatarClass}">${initial}</div>
                <div class="message-body">
                    ${!isPlayer ? `<span class="message-sender">${escapeHtml(name)}</span>` : ''}
                    <div class="message-bubble">${escapeHtml(msg.content)}</div>
                </div>
            </div>`;
        }
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ==================== Send Message ====================

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !currentConvId || !currentConv) return;

    chatInput.value = '';
    STATE.lastActivity = Date.now();

    const playerMsg = { sender: 'player', content: text, time: new Date().toISOString() };
    appendMessage(currentConvId, playerMsg);
    renderMessages(loadMessages(currentConvId));
    updateConversationPreview(currentConvId, playerMsg);
    renderConvList();

    chatInput.disabled = true;
    sendBtn.disabled = true;

    // 统一使用场景生成端点（SSE 流式）
    streamScene(currentConv, text);

    chatInput.disabled = (currentConv && currentConv.type === 'npcnpc');
    sendBtn.disabled = (currentConv && currentConv.type === 'npcnpc');
    chatInput.focus();
}

// ==================== Group Chat ====================

function openNewGroupModal() {
    groupNpcCheckboxes.innerHTML = allNpcs.map(n => `
        <label class="checkbox-label">
            <input type="checkbox" value="${n.name}"> ${n.name} (${n.title})
        </label>
    `).join('');
    newGroupModal.style.display = 'flex';
}

async function createGroupChat() {
    const checks = groupNpcCheckboxes.querySelectorAll('input:checked');
    const names = Array.from(checks).map(c => c.value);
    if (names.length < 2) { alert('请至少选择 2 个 NPC'); return; }

    newGroupModal.style.display = 'none';
    const convId = makeGroupConvId();
    const conv = {
        id: convId, type: 'group',
        name: '群聊 (' + names.join(', ') + ')',
        participants: names,
        lastMsg: '', lastTime: new Date().toISOString(), unread: 0
    };
    upsertConversation(conv);
    renderConvList();
    openConversation(convId);

    // Auto-start contention
    setTimeout(() => startContention(), 500);
}

let abortContention = null;

async function streamScene(conv, userMessage) {
    // 中止当前的流
    if (abortContention) { abortContention.abort(); abortContention = null; }

    const npcNames = conv.type === 'group' ? conv.participants : [conv.name];
    const history = loadMessages(conv.id).slice(-8);  // 最近 8 条作为上下文

    abortContention = new AbortController();

    try {
        const resp = await fetch(API_BASE + '/chat/scene', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                npc_names: npcNames,
                message: userMessage || '',
                conversation_id: conv.id,
                history: history
            }),
            signal: abortContention.signal
        });

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const msg = JSON.parse(line.slice(6));
                    if (msg.type === 'done') return;
                    if (msg.speaker && msg.content) {
                        const stored = { sender: msg.speaker, content: msg.content, time: new Date().toISOString() };
                        appendMessage(conv.id, stored);
                        updateConversationPreview(conv.id, stored);
                        renderMessages(loadMessages(conv.id));
                        renderConvList();
                    }
                } catch (e) { /* skip parse errors */ }
            }
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            appendMessage(conv.id, { type: 'system', content: `❌ ${e.message}` });
            renderMessages(loadMessages(conv.id));
        }
    } finally {
        abortContention = null;
        updateNpcStates();
    }
}

async function startContention() {
    if (!currentConv || currentConv.type !== 'group') return;

    const bar = document.createElement('div');
    bar.className = 'contention-bar';
    bar.id = 'contentionBar';
    bar.innerHTML = '<div class="spinner"></div> NPC 自由讨论中... <button class="btn btn-sm" onclick="stopContention()">停止</button>';
    chatMessages.parentElement.insertBefore(bar, chatMessages);

    // 使用场景生成（无用户消息，纯 NPC 间互动）
    await streamScene(currentConv, '');

    const barEl = document.getElementById('contentionBar');
    if (barEl) barEl.remove();
}

function stopContention() {
    if (abortContention) { abortContention.abort(); abortContention = null; }
    const bar = document.getElementById('contentionBar');
    if (bar) bar.remove();
}

function deleteConversation(convId) {
    if (!confirm('删除此对话？聊天记录将丢失。')) return;
    removeConversation(convId);
    if (currentConvId === convId) {
        currentConvId = null;
        currentConv = null;
        chatTitle.textContent = '选择一个对话开始';
        chatSubtitle.textContent = '';
        chatHeaderActions.innerHTML = '';
        chatMessages.innerHTML = '<div class="welcome-message"><div class="welcome-icon">🏙️</div><p>选择一个对话开始</p></div>';
        chatInput.disabled = true;
        sendBtn.disabled = true;
    }
    renderConvList();
}

// ==================== NPC-NPC Chat Handling ====================

function handleNpcNpcChat(chat) {
    const convId = makeNpcNpcConvId(chat.npc_a, chat.npc_b);
    let conv = getConversation(convId);

    if (!conv) {
        conv = {
            id: convId, type: 'npcnpc',
            name: `${chat.npc_a} ↔ ${chat.npc_b}`,
            participants: [chat.npc_a, chat.npc_b],
            lastMsg: '', lastTime: new Date().toISOString(), unread: 0
        };
    }

    for (const msg of chat.messages || []) {
        const storedMsg = { sender: msg.speaker, content: msg.content, time: new Date().toISOString() };
        appendMessage(convId, storedMsg);
        conv.lastMsg = (msg.content || '').substring(0, 40);
        conv.lastTime = new Date().toISOString();
        conv.unread = convId === currentConvId ? 0 : (conv.unread || 0) + 1;
    }

    upsertConversation(conv);
    renderConvList();

    // Refresh messages if currently viewing this conversation
    if (currentConvId === convId) {
        renderMessages(loadMessages(convId));
    }
}

// ==================== NPC Proactive Messages ====================

async function checkProactiveMessages() {
    try {
        const data = await apiRequest('GET', '/npcs/pending-messages', null, { useCache: false });
        if (!data.messages || data.messages.length === 0) return;

        for (const msg of data.messages) {
            const convId = make1v1ConvId(msg.npc_name);
            const storedMsg = { sender: msg.npc_name, content: msg.content, time: msg.timestamp || new Date().toISOString() };
            appendMessage(convId, storedMsg);
            updateConversationPreview(convId, storedMsg);

            // If this conv doesn't exist, create it
            if (!getConversation(convId)) {
                upsertConversation({
                    id: convId, type: '1v1', name: msg.npc_name,
                    participants: [msg.npc_name],
                    lastMsg: msg.content.substring(0, 40),
                    lastTime: msg.timestamp || new Date().toISOString(), unread: 1
                });
            }
        }

        renderConvList();
        if (currentConvId && currentConv) {
            renderMessages(loadMessages(currentConvId));
        }
    } catch (e) { /* silent */ }
}

// ==================== Polling ====================

async function updateNpcStates() {
    try {
        const data = await fetchNpcStates();
        if (data.states) {
            allNpcs.forEach(npc => {
                const st = data.states.find(s => s.name === npc.name);
                if (st) npc.state = st.state;
            });
            updateStatusSummary();
        }
    } catch (e) { /* silent */ }
}

function startPolling() {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(async () => {
        await updateNpcStates();
        await checkProactiveMessages();

        // Check NPC-NPC chats (active + recently completed)
        try {
            const npcChatStatus = await fetchNpcNpcChatStatus();
            if (npcChatStatus.active_chats) {
                for (const chat of npcChatStatus.active_chats) {
                    handleNpcNpcChat(chat);
                }
            }
            // Also process recently completed chats from history (within 10s)
            if (npcChatStatus.history) {
                const now = Date.now();
                for (const chat of npcChatStatus.history) {
                    const endedAt = chat.ended_at ? new Date(chat.ended_at).getTime() : 0;
                    if (now - endedAt < 10000) {
                        handleNpcNpcChat(chat);
                    }
                }
            }
        } catch (e) { /* silent */ }

        renderConvList();
    }, 5000);
}

function updateStatusSummary() {
    const states = allNpcs.map(n => n.state);
    idleCountEl.textContent = states.filter(s => s === 'idle').length;
    chattingCountEl.textContent = states.filter(s => s === 'chatting').length;
    busyCountEl.textContent = states.filter(s => s === 'busy').length;
    const avg = allNpcs.reduce((s, n) => s + (n.affinity || 50), 0) / (allNpcs.length || 1);
    avgAffinityEl.textContent = Math.round(avg);
}

// Stub: called from god.js event handlers, now routes to conversation system
function addWorldMessage(type, content) {
    if (type === 'system') {
        // Find or create a system notification conversation
        const sysConvId = 'system_log';
        let conv = getConversation(sysConvId);
        if (!conv) {
            conv = { id: sysConvId, type: 'system', name: '系统通知', participants: [], lastMsg: '', lastTime: new Date().toISOString(), unread: 0 };
        }
        conv.lastMsg = content.substring(0, 50);
        conv.lastTime = new Date().toISOString();
        conv.unread = (conv.unread || 0) + 1;
        upsertConversation(conv);
        appendMessage(sysConvId, { sender: 'system', content: content, time: new Date().toISOString() });
        renderConvList();
    }
}

function setConnectionStatus(connected) {
    STATE.connected = connected;
    connectionStatus.className = 'status-dot ' + (connected ? 'online' : 'offline');
    connectionText.textContent = connected ? `已连接 (${API_BASE})` : '断开';
}

// ==================== Helpers ====================

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTimeStr(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    if (d.toDateString() === now.toDateString()) {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Expose globally
window.openConversation = openConversation;
window.startContention = startContention;
window.stopContention = stopContention;
window.deleteConversation = deleteConversation;
window.retryLoadNpcs = () => location.reload();
