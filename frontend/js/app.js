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
const pauseBtn = document.getElementById('pauseBtn');
const newNpcChatBtn = document.getElementById('newNpcChatBtn');
const newNpcChatModal = document.getElementById('newNpcChatModal');
const npcChatSelectA = document.getElementById('npcChatSelectA');
const npcChatSelectB = document.getElementById('npcChatSelectB');
const npcChatHint = document.getElementById('npcChatHint');
const newNpcChatConfirm = document.getElementById('newNpcChatConfirm');
const newNpcChatCancel = document.getElementById('newNpcChatCancel');
const npcManagerToggle = document.getElementById('npcManagerToggle');
const npcManagerPanel = document.getElementById('npcManagerPanel');
const npcManagerBackdrop = document.getElementById('npcManagerBackdrop');
const npcManagerClose = document.getElementById('npcManagerClose');
const createNpcBtn = document.getElementById('createNpcBtn');
const npcList = document.getElementById('npcList');
const npcWizardModal = document.getElementById('npcWizardModal');
const wizardTitle = document.getElementById('wizardTitle');
const wizardContent = document.getElementById('wizardContent');
const wizardPrev = document.getElementById('wizardPrev');
const wizardNext = document.getElementById('wizardNext');
const wizardSave = document.getElementById('wizardSave');
const wizardCancel = document.getElementById('wizardCancel');
const aiGenInput = document.getElementById('aiGenInput');
const aiGenBtn = document.getElementById('aiGenBtn');
const npcDetailModal = document.getElementById('npcDetailModal');
const npcDetailTitle = document.getElementById('npcDetailTitle');
const npcDetailCard = document.getElementById('npcDetailCard');
const npcDetailEdit = document.getElementById('npcDetailEdit');
const npcDetailDelete = document.getElementById('npcDetailDelete');
const npcDetailClose = document.getElementById('npcDetailClose');
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
let npcNpcAffinities = {};  // NPC-NPC affinity matrix
let pollingTimer = null;
let lastPollHadData = false;  // Track polling status

// ==================== Toast Notifications ====================

function showToast(title, text, type, convId) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'npcnpc' ? '💬' : '📩';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-body">
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-text">${escapeHtml(text)}</div>
        </div>`;

    toast.addEventListener('click', () => {
        if (convId) openConversation(convId);
        toast.remove();
    });

    container.appendChild(toast);

    // Auto-remove after animation
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);

    // Limit to 5 toasts
    const toasts = container.querySelectorAll('.toast');
    if (toasts.length > 5) toasts[0].remove();
}

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await refreshAllTimelineData();
    await loadNpcsAndInit();

    // 加载历史 NPC 间对话（避免页面加载前触发的对话丢失）
    try {
        const historyData = await fetchNpcNpcChatHistory(10);
        console.log(`📜 初始加载 NPC-NPC 历史: ${historyData.history?.length || 0} 条`);
        if (historyData.history) {
            for (const chat of historyData.history) {
                console.log(`   chat: ${chat.npc_a} ↔ ${chat.npc_b}, messages=${chat.messages?.length || 0}, ended_at=${chat.ended_at}`);
                handleNpcNpcChat(chat);
            }
        }
    } catch (e) {
        console.error('初始加载 NPC-NPC 历史失败:', e);
    }

    renderConvList();

    setConnectionStatus(true);
    syncPauseState();
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

    // Pause / Resume simulation
    pauseBtn.addEventListener('click', togglePause);

    // NPC-NPC chat modal
    newNpcChatBtn.addEventListener('click', openNewNpcChatModal);
    newNpcChatCancel.addEventListener('click', () => newNpcChatModal.style.display = 'none');
    newNpcChatConfirm.addEventListener('click', createNpcNpcChat);

    // NPC Manager
    npcManagerToggle.addEventListener('click', () => { toggleNpcManager(true); });
    npcManagerClose.addEventListener('click', () => { toggleNpcManager(false); });
    npcManagerBackdrop.addEventListener('click', () => { toggleNpcManager(false); });
    createNpcBtn.addEventListener('click', () => openNpcWizard(null));

    // Wizard
    wizardNext.addEventListener('click', () => wizardNavigate(1));
    wizardPrev.addEventListener('click', () => wizardNavigate(-1));
    wizardSave.addEventListener('click', saveNpcFromWizard);
    wizardCancel.addEventListener('click', () => npcWizardModal.style.display = 'none');
    aiGenBtn.addEventListener('click', aiGenerateNpc);

    // Detail modal
    npcDetailClose.addEventListener('click', () => npcDetailModal.style.display = 'none');
    npcDetailEdit.addEventListener('click', editNpcFromDetail);
    npcDetailDelete.addEventListener('click', deleteNpcFromDetail);

    // Escape to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            newGroupModal.style.display = 'none';
            newNpcChatModal.style.display = 'none';
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

// ==================== Pause / Resume ====================

async function togglePause() {
    try {
        const status = await getSimulationStatus();
        if (status.paused) {
            await resumeSimulation();
            pauseBtn.textContent = '⏸ 暂停';
            pauseBtn.classList.remove('paused');
        } else {
            await pauseSimulation();
            pauseBtn.textContent = '▶ 恢复';
            pauseBtn.classList.add('paused');
        }
    } catch (e) {
        console.error('暂停切换失败:', e);
    }
}

async function syncPauseState() {
    try {
        const status = await getSimulationStatus();
        if (status.paused) {
            pauseBtn.textContent = '▶ 恢复';
            pauseBtn.classList.add('paused');
        } else {
            pauseBtn.textContent = '⏸ 暂停';
            pauseBtn.classList.remove('paused');
        }
    } catch (e) { /* silent */ }
}

// ==================== NPC-NPC Chat Modal ====================

function openNewNpcChatModal() {
    const options = allNpcs.map(n => `<option value="${n.name}">${n.name} (${n.title || ''})</option>`).join('');
    npcChatSelectA.innerHTML = '<option value="">-- 选择NPC A --</option>' + options;
    npcChatSelectB.innerHTML = '<option value="">-- 选择NPC B --</option>' + options;
    npcChatHint.textContent = '';
    newNpcChatModal.style.display = 'flex';
}

async function createNpcNpcChat() {
    const a = npcChatSelectA.value;
    const b = npcChatSelectB.value;

    if (!a || !b) {
        npcChatHint.textContent = '请选择两个NPC';
        return;
    }
    if (a === b) {
        npcChatHint.textContent = '请选择两个不同的NPC';
        return;
    }

    newNpcChatModal.style.display = 'none';

    try {
        const result = await triggerNpcNpcChat(a, b);
        console.log('NPC对话已触发:', result);

        // Open the read-only NPC-NPC conversation
        const convId = makeNpcNpcConvId(a, b);
        if (!getConversation(convId)) {
            upsertConversation({
                id: convId, type: 'npcnpc',
                name: `${a} ↔ ${b}`,
                participants: [a, b],
                lastMsg: '', lastTime: new Date().toISOString(), unread: 0
            });
        }
        renderConvList();
        openConversation(convId);
    } catch (e) {
        if (e.status === 409) {
            alert('已有对话正在进行，请等待结束后再试');
        } else {
            alert(`触发失败: ${e.message || '未知错误'}`);
        }
    }
}

// ==================== Force NPC Initiate ====================

async function handleInitiateClick(npcName, event) {
    event.stopPropagation();
    try {
        const msg = await initiateNpcChat(npcName);
        console.log(`${npcName} 主动搭话:`, msg);

        const convId = make1v1ConvId(npcName);
        if (!getConversation(convId)) {
            upsertConversation({
                id: convId, type: '1v1', name: npcName,
                participants: [npcName],
                lastMsg: '', lastTime: new Date().toISOString(), unread: 0
            });
        }

        appendMessage(convId, {
            sender: npcName,
            content: msg.content,
            time: msg.timestamp || new Date().toISOString()
        });

        renderConvList();
        if (currentConvId === convId) {
            renderMessages(loadMessages(convId));
        } else {
            openConversation(convId);
        }
    } catch (e) {
        console.error('强制搭话失败:', e);
    }
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
        const results = await Promise.all(allNpcs.map(n => fetchNpcAffinity(n.name).catch(() => null)));
        results.forEach((r, i) => { if (r) { allNpcs[i].affinity = r.affinity ?? 50; allNpcs[i].level = r.level || '友好'; } });

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

        const initiateBtn = c.type === '1v1'
            ? `<button class="btn-initiate" onclick="handleInitiateClick('${escapeHtml(c.name)}', event)" title="让NPC主动搭话">🔔</button>`
            : '';

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
                ${initiateBtn}
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
        const [a, b] = (currentConv.participants || []);
        const affData = (npcNpcAffinities[a] && npcNpcAffinities[a][b]) || (npcNpcAffinities[b] && npcNpcAffinities[b][a]) || {};
        const affText = affData.affinity != null ? ` · 好感度: ${Math.round(affData.affinity)}` : '';
        chatSubtitle.textContent = 'NPC 间对话 · ' + (currentConv.participants || []).join(' ↔ ') + affText;
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

    let lastDateKey = '';
    msgs.forEach((msg, idx) => {
        if (msg.type === 'system') {
            chatMessages.innerHTML += `<div class="message-date-separator">${escapeHtml(msg.content)}</div>`;
            return;
        }

        // Date separator: insert when crossing a day boundary
        const msgDateKey = msg.time ? msg.time.substring(0, 10) : '';
        if (msgDateKey && msgDateKey !== lastDateKey) {
            lastDateKey = msgDateKey;
            const label = formatDateSeparator(msg.time);
            if (label) {
                chatMessages.innerHTML += `<div class="message-date-separator">──── ${label} ────</div>`;
            }
        }

        const isPlayer = msg.sender === 'player';
        const name = msg.sender || 'unknown';
        const initial = isPlayer ? '我' : (name[0] || '?');
        const avatarClass = isPlayer ? 'player' : (name === '张三' ? 'npc-zhang' : name === '李四' ? 'npc-li' : 'npc-wang');
        const rowClass = isPlayer ? 'self' : 'other';
        const timeDisplay = formatMessageTime(msg.time);

        chatMessages.innerHTML += `
        <div class="message-row ${rowClass}">
            <div class="message-avatar ${avatarClass}">${initial}</div>
            <div class="message-body">
                ${!isPlayer ? `<span class="message-sender">${escapeHtml(name)}</span>` : ''}
                <div class="message-bubble-wrapper">
                    <div class="message-bubble">${escapeHtml(msg.content)}</div>
                    ${timeDisplay ? `<span class="message-time-inline">${timeDisplay}</span>` : ''}
                </div>
            </div>
        </div>`;
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
                    if (msg.type === 'done') {
                        // 应用好感度更新
                        if (msg.affinity_updates) {
                            for (const [name, data] of Object.entries(msg.affinity_updates)) {
                                const npc = allNpcs.find(n => n.name === name);
                                if (npc) {
                                    npc.affinity = data.affinity;
                                    npc.level = data.level;
                                }
                            }
                            updateStatusSummary();
                            // 刷新正在查看的对话头（好感度数字）
                            if (currentConv && currentConv.type === '1v1') {
                                const npc = allNpcs.find(n => n.name === currentConv.name);
                                if (npc) chatSubtitle.textContent = `${npc.title} · 好感度: ${Math.round(npc.affinity)}`;
                            }
                        }
                        return;
                    }
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

/** 鲁棒解析 Python datetime 字符串 (ISO 8601 或 str() 格式) → 毫秒时间戳 */
function parsePythonDate(s) {
    if (!s) return 0;
    // ISO 8601: "2026-05-19T12:30:45.123456" — 直接解析
    const ts = new Date(s).getTime();
    if (!isNaN(ts)) return ts;
    // str(datetime): "2026-05-19 12:30:45.123456" — 替换空格为 T
    return new Date(s.replace(' ', 'T')).getTime();
}

function handleNpcNpcChat(chat) {
    if (!chat.npc_a || !chat.npc_b) {
        console.warn('⚠️ handleNpcNpcChat: 缺少 npc_a 或 npc_b', chat);
        return;
    }

    const convId = makeNpcNpcConvId(chat.npc_a, chat.npc_b);
    let conv = getConversation(convId);

    if (!conv) {
        conv = {
            id: convId, type: 'npcnpc',
            name: `${chat.npc_a} ↔ ${chat.npc_b}`,
            participants: [chat.npc_a, chat.npc_b],
            lastMsg: '', lastTime: '', unread: 0
        };
        upsertConversation(conv);
        console.log(`📝 创建 NPC-NPC 对话: ${conv.name}`);
    }

    // 去重
    const existing = loadMessages(convId) || [];
    const existingKeys = new Set(existing.map(m => `${m.sender}::${m.content}`));

    let newCount = 0;
    for (const msg of chat.messages || []) {
        if (!msg.speaker || !msg.content) continue;
        const dedupeKey = `${msg.speaker}::${msg.content}`;
        if (existingKeys.has(dedupeKey)) continue;
        existingKeys.add(dedupeKey);
        newCount++;

        const storedMsg = { sender: msg.speaker, content: msg.content, time: new Date().toISOString() };
        appendMessage(convId, storedMsg);
    }

    if (newCount > 0) {
        console.log(`💬 NPC间对话 [${chat.npc_a} ↔ ${chat.npc_b}]: +${newCount} 条新消息 (chat_id=${chat.id})`);
        // Show toast notification
        const lastMsg = chat.messages && chat.messages.length > 0
            ? chat.messages[chat.messages.length - 1].content : '';
        showToast(
            `NPC 对话: ${chat.npc_a} ↔ ${chat.npc_b}`,
            lastMsg || `${newCount} 条新消息`,
            'npcnpc',
            convId
        );
        // 当前正在查看的对话不计入未读
        if (convId === currentConvId) markRead(convId);
    }

    renderConvList();

    // 如果正在查看该对话，刷新显示
    if (currentConvId === convId) {
        renderMessages(loadMessages(convId));
    }
}

// ==================== NPC Proactive Messages ====================

async function checkProactiveMessages() {
    try {
        const data = await apiRequest('GET', '/npcs/pending-messages', null, { useCache: false });
        if (!data.messages || data.messages.length === 0) return 0;

        console.log(`📩 收到 ${data.messages.length} 条 NPC 主动消息:`, data.messages.map(m => `${m.npc_name}: ${m.content?.substring(0, 20)}`));

        const processedKeys = [];

        for (const msg of data.messages) {
            const convId = make1v1ConvId(msg.npc_name);
            const msgKey = `${msg.npc_name}::${msg.timestamp}`;
            processedKeys.push(msgKey);

            // 去重：检查是否已有相同时间戳和内容的消息
            const existing = loadMessages(convId) || [];
            if (existing.some(m => m.content === msg.content && m.time === msg.timestamp)) continue;

            // 先确保 conversation 存在
            if (!getConversation(convId)) {
                upsertConversation({
                    id: convId, type: '1v1', name: msg.npc_name,
                    participants: [msg.npc_name],
                    lastMsg: '', lastTime: new Date().toISOString(), unread: 0
                });
            }

            const storedMsg = { sender: msg.npc_name, content: msg.content, time: msg.timestamp || new Date().toISOString() };
            appendMessage(convId, storedMsg);

            // Show toast for each proactive message
            showToast(
                `${msg.npc_name} 主动发来消息`,
                (msg.content || '').substring(0, 60),
                'proactive',
                convId
            );

            // 当前正在查看的对话不计入未读
            if (convId === currentConvId) markRead(convId);
        }

        // ACK — 只确认已处理的具体消息，避免误删新消息
        try {
            await apiRequest('POST', '/npcs/pending-messages/ack', {
                message_keys: processedKeys
            }, { useCache: false });
        } catch (e) {
            console.warn('ACK 失败，消息将在下次轮询重试:', e);
        }

        renderConvList();
        if (currentConvId && getConversation(currentConvId)) {
            renderMessages(loadMessages(currentConvId));
        }
        return data.messages.length;
    } catch (e) { console.error('checkProactiveMessages failed:', e); }
    return 0;
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

let lastAffinityRefresh = 0;

function startPolling() {
    if (pollingTimer) { clearTimeout(pollingTimer); pollingTimer = null; }

    async function tick() {
        let pollHadData = false;
        await updateNpcStates();
        const proactiveCount = await checkProactiveMessages();
        if (proactiveCount > 0) pollHadData = true;

        // 定期刷新暂停状态和好感度（每 30 秒）
        if (Date.now() - lastAffinityRefresh > 30000) {
            syncPauseState();
            lastAffinityRefresh = Date.now();
            try {
                const results = await Promise.all(allNpcs.map(n => fetchNpcAffinity(n.name).catch(() => null)));
                results.forEach((r, i) => { if (r) { allNpcs[i].affinity = r.affinity ?? 50; allNpcs[i].level = r.level || '友好'; } });
                updateStatusSummary();
            } catch (e) { /* silent */ }

            // 刷新 NPC 间好感度
            try {
                const data = await fetchNpcNpcAffinities();
                if (data.matrix) npcNpcAffinities = data.matrix;
                // 如果当前正在查看 NPC 间对话，刷新副标题
                if (currentConvId && currentConvId.startsWith('npcnpc_')) {
                    const conv = getConversation(currentConvId);
                    if (conv) {
                        const [a, b] = (conv.participants || []);
                        const affData = (npcNpcAffinities[a] && npcNpcAffinities[a][b]) || (npcNpcAffinities[b] && npcNpcAffinities[b][a]) || {};
                        const affText = affData.affinity != null ? ` · 好感度: ${Math.round(affData.affinity)}` : '';
                        chatSubtitle.textContent = 'NPC 间对话 · ' + (conv.participants || []).join(' ↔ ') + affText;
                    }
                }
            } catch (e) { /* silent */ }
        }

        // Check NPC-NPC chats (active + recently completed)
        try {
            const npcChatStatus = await fetchNpcNpcChatStatus();
            const activeCount = npcChatStatus.active_chats?.length || 0;
            const historyCount = npcChatStatus.history?.length || 0;
            if (activeCount > 0 || historyCount > 0) {
                console.log(`🔍 轮询 NPC-NPC: active=${activeCount}, history=${historyCount}`);
                pollHadData = true;
            }
            if (npcChatStatus.active_chats) {
                for (const chat of npcChatStatus.active_chats) {
                    console.log(`   active chat: ${chat.npc_a} ↔ ${chat.npc_b}, msgs=${chat.messages?.length || 0}, ended=${chat.ended_at || '(未结束)'}`);
                    handleNpcNpcChat(chat);
                }
            }
            // Also process recently completed chats from history (within 60s)
            if (npcChatStatus.history) {
                const now = Date.now();
                for (const chat of npcChatStatus.history) {
                    const endedAt = parsePythonDate(chat.ended_at);
                    const age = endedAt ? Math.round((now - endedAt) / 1000) : 999;
                    if (endedAt && (now - endedAt) < 60000) {
                        console.log(`   history chat: ${chat.npc_a} ↔ ${chat.npc_b}, msgs=${chat.messages?.length || 0}, age=${age}s`);
                        handleNpcNpcChat(chat);
                    }
                }
            }
        } catch (e) { console.error('NPC chat check failed:', e); }

        updatePollIndicator(pollHadData);

        renderConvList();

        pollingTimer = setTimeout(tick, 5000);
    }

    tick();
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

function updatePollIndicator(hadData) {
    const dot = document.getElementById('pollDot');
    const label = document.getElementById('pollLabel');
    const indicator = document.getElementById('pollIndicator');
    if (!dot || !label || !indicator) return;
    if (hadData) {
        dot.classList.add('active');
        indicator.classList.add('active');
        label.textContent = '有数据';
        lastPollHadData = true;
    } else {
        dot.classList.remove('active');
        indicator.classList.remove('active');
        if (lastPollHadData) {
            label.textContent = '等待中...';
        }
    }
}

// ==================== NPC Config Manager ====================

let npcManagerOpen = false;
let wizardStep = 1;
let wizardMode = 'create';  // 'create' | 'edit'
let wizardEditName = null;
let wizardData = {};        // Accumulated form data across steps
let detailNpcName = null;

const WIZARD_FIELDS = {
    1: ['name', 'title', 'location', 'activity'],
    2: ['core_personality', 'personality', 'speaking_style', 'style'],
    3: ['quirks', 'emotional_triggers_positive', 'emotional_triggers_negative', 'pet_peeves'],
    4: ['work_context', 'expertise', 'hobbies']
};

const WIZARD_LABELS = {
    name: 'NPC名称', title: '职位', location: '位置', activity: '典型活动',
    core_personality: '核心性格（150-300字）', personality: '性格简述（20-40字）',
    speaking_style: '说话风格', style: '风格简述（10-20字）',
    quirks: '习惯（每行一个，3-4个）', emotional_triggers_positive: '开心的事（每行一个）',
    emotional_triggers_negative: '不爽的事（每行一个）', pet_peeves: '雷区',
    work_context: '工作背景', expertise: '专长技能（顿号分隔）', hobbies: '爱好（顿号分隔）'
};

function toggleNpcManager(open) {
    npcManagerOpen = open;
    if (open) {
        npcManagerPanel.classList.remove('collapsed');
        npcManagerBackdrop.classList.add('open');
        loadNpcList();
    } else {
        npcManagerPanel.classList.add('collapsed');
        npcManagerBackdrop.classList.remove('open');
    }
}

async function loadNpcList() {
    try {
        const data = await fetchNpcConfigs();
        renderNpcList(data.npcs || []);
    } catch (e) {
        npcList.innerHTML = `<p class="god-hint" style="color:var(--danger)">加载失败: ${e.message}</p>`;
    }
}

function renderNpcList(npcs) {
    if (!npcs.length) { npcList.innerHTML = '<p class="god-hint">暂无NPC</p>'; return; }
    npcList.innerHTML = npcs.map(n => `
        <div class="npc-card" onclick="openNpcDetail('${n.name}')">
            <div class="npc-card-avatar">${n.name[0]}</div>
            <div class="npc-card-info">
                <div class="npc-card-name">${escapeHtml(n.name)} ${n.is_builtin ? '<span class="npc-badge-builtin">内置</span>' : ''}</div>
                <div class="npc-card-title">${escapeHtml(n.title)}</div>
                <div class="npc-card-personality">${escapeHtml(n.personality || '')}</div>
            </div>
            <div class="npc-card-actions" onclick="event.stopPropagation()">
                <button class="btn btn-sm" onclick="openNpcWizard('${n.name}')">✏️</button>
                ${!n.is_builtin ? `<button class="btn btn-sm" style="color:var(--danger)" onclick="deleteNpcCard('${n.name}')">🗑</button>` : ''}
            </div>
        </div>
    `).join('');
}

// ==================== NPC Detail ====================

async function openNpcDetail(name) {
    try {
        const data = await fetchNpcConfig(name);
        detailNpcName = name;
        npcDetailTitle.textContent = `${name} · ${data.title || ''}`;
        const t = data.emotional_triggers || {};
        npcDetailCard.innerHTML = `
            <div class="detail-section"><span class="detail-label">📍</span> ${escapeHtml(data.location || '')} · ${escapeHtml(data.activity || '')}</div>
            <div class="detail-section"><strong>核心性格</strong><p>${escapeHtml(data.core_personality || '')}</p></div>
            <div class="detail-section"><strong>说话风格</strong><p>${escapeHtml(data.speaking_style || '')}</p></div>
            <div class="detail-section"><strong>习惯</strong><div>${(data.quirks || []).map(q => `<span class="npc-tag">${escapeHtml(q)}</span>`).join(' ')}</div></div>
            <div class="detail-section"><strong>开心的事</strong><div>${(t.positive || []).map(q => `<span class="npc-tag positive">${escapeHtml(q)}</span>`).join(' ')}</div></div>
            <div class="detail-section"><strong>不爽的事</strong><div>${(t.negative || []).map(q => `<span class="npc-tag negative">${escapeHtml(q)}</span>`).join(' ')}</div></div>
            <div class="detail-section"><strong>雷区</strong><p>${escapeHtml(data.pet_peeves || '')}</p></div>
            <div class="detail-section"><strong>专长</strong><p>${escapeHtml(data.expertise || '')}</p></div>
            <div class="detail-section"><strong>爱好</strong><p>${escapeHtml(data.hobbies || '')}</p></div>`;
        npcDetailModal.style.display = 'flex';
    } catch (e) { console.error('获取NPC详情失败:', e); }
}

function editNpcFromDetail() {
    npcDetailModal.style.display = 'none';
    if (detailNpcName) openNpcWizard(detailNpcName);
}

async function deleteNpcFromDetail() {
    if (!detailNpcName) return;
    if (!confirm(`确定删除NPC "${detailNpcName}" 吗？此操作不可恢复。`)) return;
    try {
        await deleteNpcConfig(detailNpcName);
        npcDetailModal.style.display = 'none';
        loadNpcList();
    } catch (e) {
        if (e.status === 403) alert('内置NPC不能删除');
        else alert(`删除失败: ${e.message}`);
    }
}

async function deleteNpcCard(name) {
    if (!confirm(`确定删除NPC "${name}" 吗？`)) return;
    try {
        await deleteNpcConfig(name);
        loadNpcList();
    } catch (e) { alert(`删除失败: ${e.message}`); }
}

// ==================== NPC Wizard ====================

async function openNpcWizard(editName) {
    wizardStep = 1;
    wizardData = {};
    if (editName) {
        wizardMode = 'edit';
        wizardEditName = editName;
        wizardTitle.textContent = `编辑NPC: ${editName}`;
        try {
            const data = await fetchNpcConfig(editName);
            wizardData = {
                name: editName, title: data.title || '', location: data.location || '',
                activity: data.activity || '', core_personality: data.core_personality || '',
                personality: data.personality || '', speaking_style: data.speaking_style || '',
                style: data.style || '', quirks: (data.quirks || []).join('\n'),
                emotional_triggers_positive: ((data.emotional_triggers || {}).positive || []).join('\n'),
                emotional_triggers_negative: ((data.emotional_triggers || {}).negative || []).join('\n'),
                pet_peeves: data.pet_peeves || '', work_context: data.work_context || '',
                expertise: data.expertise || '', hobbies: data.hobbies || ''
            };
        } catch (e) { console.error('加载NPC配置失败:', e); }
    } else {
        wizardMode = 'create';
        wizardEditName = null;
        wizardTitle.textContent = '创建新NPC';
    }
    renderWizardStep();
    npcWizardModal.style.display = 'flex';
}

function wizardNavigate(delta) {
    // Collect current step data
    const fields = WIZARD_FIELDS[wizardStep] || [];
    fields.forEach(f => {
        const el = document.getElementById('wiz_' + f);
        if (el) wizardData[f] = el.value || '';
    });
    wizardStep += delta;
    if (wizardStep < 1) wizardStep = 1;
    if (wizardStep > 4) wizardStep = 4;
    renderWizardStep();
}

function renderWizardStep() {
    const fields = WIZARD_FIELDS[wizardStep] || [];
    const isLast = wizardStep === 4;
    const isFirst = wizardStep === 1;

    // Update step indicators
    document.querySelectorAll('.wizard-step').forEach(el => {
        el.classList.remove('active');
        if (parseInt(el.dataset.step) === wizardStep) el.classList.add('active');
    });

    // Render fields
    wizardContent.innerHTML = fields.map(f => {
        const val = wizardData[f] || '';
        const label = WIZARD_LABELS[f] || f;
        const isTextarea = ['core_personality', 'speaking_style', 'quirks', 'emotional_triggers_positive',
            'emotional_triggers_negative', 'pet_peeves', 'work_context'].includes(f);
        const rows = f === 'core_personality' ? 6 : f === 'speaking_style' ? 3 : 3;
        const disabled = wizardMode === 'edit' && f === 'name';

        if (isTextarea) {
            return `<div class="wizard-field">
                <label>${label}</label>
                <textarea id="wiz_${f}" class="wiz-textarea" rows="${rows}" ${disabled ? 'disabled' : ''}>${escapeHtml(val)}</textarea>
            </div>`;
        }
        return `<div class="wizard-field">
            <label>${label}</label>
            <input id="wiz_${f}" class="wiz-input" value="${escapeHtml(val)}" ${disabled ? 'disabled' : ''}>
        </div>`;
    }).join('');

    // Show/hide AI bar (only step 1 + create mode)
    const aiBar = document.querySelector('.ai-generate-bar');
    if (aiBar) aiBar.style.display = (wizardStep === 1 && wizardMode === 'create') ? 'flex' : 'none';

    // Navigation buttons
    wizardPrev.style.display = isFirst ? 'none' : 'inline-block';
    wizardNext.style.display = isLast ? 'none' : 'inline-block';
    wizardSave.style.display = isLast ? 'inline-block' : 'none';
}

async function aiGenerateNpc() {
    const desc = aiGenInput.value.trim();
    if (!desc) return;
    aiGenBtn.disabled = true;
    aiGenBtn.textContent = '生成中...';
    try {
        const result = await generateNpcConfig(desc);
        const c = result.config || {};
        wizardData = {
            name: c.name || result.name || '',
            title: c.title || '', location: c.location || '',
            activity: c.activity || '', core_personality: c.core_personality || '',
            personality: c.personality || '', speaking_style: c.speaking_style || '',
            style: c.style || '', quirks: (c.quirks || []).join('\n'),
            emotional_triggers_positive: ((c.emotional_triggers || {}).positive || []).join('\n'),
            emotional_triggers_negative: ((c.emotional_triggers || {}).negative || []).join('\n'),
            pet_peeves: c.pet_peeves || '', work_context: c.work_context || '',
            expertise: c.expertise || '', hobbies: c.hobbies || ''
        };
        renderWizardStep();
        aiGenInput.value = '';
    } catch (e) { alert(`AI生成失败: ${e.message}`); }
    finally { aiGenBtn.disabled = false; aiGenBtn.textContent = 'AI生成'; }
}

async function saveNpcFromWizard() {
    // Collect step 4 data
    const fields = WIZARD_FIELDS[4] || [];
    fields.forEach(f => {
        const el = document.getElementById('wiz_' + f);
        if (el) wizardData[f] = el.value || '';
    });

    // Build config
    const config = {
        title: wizardData.title || '',
        location: wizardData.location || '',
        activity: wizardData.activity || '',
        core_personality: wizardData.core_personality || '',
        personality: wizardData.personality || '',
        speaking_style: wizardData.speaking_style || '',
        style: wizardData.style || '',
        quirks: (wizardData.quirks || '').split('\n').filter(s => s.trim()),
        emotional_triggers: {
            positive: (wizardData.emotional_triggers_positive || '').split('\n').filter(s => s.trim()),
            negative: (wizardData.emotional_triggers_negative || '').split('\n').filter(s => s.trim())
        },
        pet_peeves: wizardData.pet_peeves || '',
        work_context: wizardData.work_context || '',
        expertise: wizardData.expertise || '',
        hobbies: wizardData.hobbies || ''
    };

    if (!config.title || !config.core_personality) {
        alert('职位和核心性格为必填字段');
        return;
    }

    try {
        if (wizardMode === 'create') {
            if (!wizardData.name) { alert('NPC名称为必填'); return; }
            await createNpcConfig({ name: wizardData.name, ...config });
        } else {
            await updateNpcConfig(wizardEditName, config);
        }
        npcWizardModal.style.display = 'none';
        loadNpcList();
        // 为新NPC创建聊天列表入口
        if (wizardMode === 'create' && wizardData.name) {
            initDefaultConversations([wizardData.name]);
        }
    } catch (e) {
        alert(`${wizardMode === 'create' ? '创建' : '更新'}失败: ${e.message}`);
    }
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

function formatMessageTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today - 86400000);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    if (msgDay.getTime() === today.getTime()) {
        return timeStr;
    }
    if (msgDay.getTime() === yesterday.getTime()) {
        return `昨天 ${timeStr}`;
    }
    if (d.getFullYear() === now.getFullYear()) {
        return `${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`;
    }
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`;
}

function formatDateSeparator(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today - 86400000);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (msgDay.getTime() === today.getTime()) return '今天';
    if (msgDay.getTime() === yesterday.getTime()) return '昨天';
    if (d.getFullYear() === now.getFullYear()) {
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// Expose globally
window.openConversation = openConversation;
window.startContention = startContention;
window.stopContention = stopContention;
window.deleteConversation = deleteConversation;
window.handleInitiateClick = handleInitiateClick;
window.openNpcWizard = openNpcWizard;
window.openNpcDetail = openNpcDetail;
window.deleteNpcCard = deleteNpcCard;
window.retryLoadNpcs = () => location.reload();
