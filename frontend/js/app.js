/* ================================
   Main Application - 聊天主逻辑
   ================================ */

// ==================== DOM Refs ====================

const npcList = document.getElementById('npcList');
const groupChatBtn = document.getElementById('groupChatBtn');
const chatTabs = document.querySelectorAll('.chat-tab');

// 1v1
const messages1v1 = document.getElementById('messages1v1');
const input1v1 = document.getElementById('input1v1');
const sendBtn1v1 = document.getElementById('sendBtn1v1');
const chatTitle1v1 = document.getElementById('chatTitle1v1');

// Group
const messagesGroup = document.getElementById('messagesGroup');
const inputGroup = document.getElementById('inputGroup');
const sendBtnGroup = document.getElementById('sendBtnGroup');
const chatTitleGroup = document.getElementById('chatTitleGroup');
const groupMembers = document.getElementById('groupMembers');

// World
const messagesWorld = document.getElementById('messagesWorld');
const triggerNpcChatBtn = document.getElementById('triggerNPCChatBtn');
const dailyCallsLeft = document.getElementById('dailyCallsLeft');
const cooldownsText = document.getElementById('cooldownsText');

// Connection
const connectionStatus = document.getElementById('connectionStatus');
const connectionText = document.getElementById('connectionText');

// Summary
const idleCountEl = document.getElementById('idleCount');
const chattingCountEl = document.getElementById('chattingCount');
const busyCountEl = document.getElementById('busyCount');
const avgAffinityEl = document.getElementById('avgAffinity');

// Trigger modal
const triggerChatModal = document.getElementById('triggerChatModal');
const triggerNpcA = document.getElementById('triggerNpcA');
const triggerNpcB = document.getElementById('triggerNpcB');
const triggerChatConfirm = document.getElementById('triggerChatConfirm');
const triggerChatCancel = document.getElementById('triggerChatCancel');

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', async () => {
    // Restore saved state
    const savedTL = localStorage.getItem('activeTimelineId');
    if (savedTL) STATE.activeTimelineId = savedTL;

    // Setup event listeners
    setupChatTabs();
    setupInputHandlers();
    setupGroupChat();
    setupTriggerChatModal();

    // Initial load
    await refreshAllTimelineData();
    await fetchAndRenderNpcs();
    await refreshGodPanel();

    // Start polling
    startPolling();

    // Set connected
    setConnectionStatus(true);

    console.log('🏙 AI-Town 前端已就绪');
});

// ==================== Chat Tabs ====================

function setupChatTabs() {
    chatTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            chatTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const mode = tab.dataset.tab;
            STATE.chatMode = mode;
            document.querySelectorAll('.chat-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`panel${mode === '1v1' ? '1v1' : mode === 'group' ? 'Group' : 'World'}`).classList.add('active');

            if (mode === 'world') {
                refreshWorldChat();
            }
        });
    });
}

// ==================== Input Handlers ====================

function setupInputHandlers() {
    // 1v1 input
    input1v1.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send1v1Message();
        }
    });
    sendBtn1v1.addEventListener('click', send1v1Message);

    // Group input
    inputGroup.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendGroupMessage();
        }
    });
    sendBtnGroup.addEventListener('click', sendGroupMessage);
}

async function send1v1Message() {
    const text = input1v1.value.trim();
    if (!text || !STATE.active1v1Npc) return;

    input1v1.value = '';
    STATE.lastActivity = Date.now();

    // Show player message
    appendMessage('1v1', 'player', text, new Date().toISOString());
    input1v1.disabled = true;
    sendBtn1v1.disabled = true;

    try {
        const data = await sendChat(STATE.active1v1Npc, text);
        appendMessage('1v1', STATE.active1v1Npc, data.message, data.timestamp || new Date().toISOString());
        // Refresh NPC list for affinity changes
        await fetchAndRenderNpcs();
    } catch (e) {
        appendMessage('1v1', 'system', `❌ 发送失败: ${e.message}`);
    } finally {
        input1v1.disabled = false;
        sendBtn1v1.disabled = false;
        input1v1.focus();
    }
}

async function sendGroupMessage() {
    const text = inputGroup.value.trim();
    if (!text || STATE.selectedGroupNpcs.length === 0) return;

    inputGroup.value = '';
    STATE.lastActivity = Date.now();

    // Show player message
    appendMessage('group', 'player', text, new Date().toISOString());

    inputGroup.disabled = true;
    sendBtnGroup.disabled = true;

    try {
        const data = await sendGroupChat(STATE.selectedGroupNpcs, text);
        for (const [name, resp] of Object.entries(data.responses)) {
            appendMessage('group', name, resp.message, resp.timestamp || new Date().toISOString());
        }
        if (data.failed.length > 0) {
            appendMessage('group', 'system', `⚠️ ${data.failed.join(', ')} 回复失败`);
        }
        await fetchAndRenderNpcs();
    } catch (e) {
        appendMessage('group', 'system', `❌ 群聊失败: ${e.message}`);
    } finally {
        inputGroup.disabled = false;
        sendBtnGroup.disabled = false;
        inputGroup.focus();
    }
}

// ==================== Group Chat Management ====================

function setupGroupChat() {
    groupChatBtn.addEventListener('click', () => {
        if (STATE.selectedGroupNpcs.length === 0) {
            // Toggle group mode
            STATE.chatMode = 'group';
            document.querySelectorAll('.chat-panel').forEach(p => p.classList.remove('active'));
            document.getElementById('panelGroup').classList.add('active');
            chatTabs.forEach(t => t.classList.remove('active'));
            document.querySelector('[data-tab="group"]').classList.add('active');
        } else {
            // Clear group selection
            STATE.selectedGroupNpcs = [];
            updateGroupUI();
            renderNpcCards();
        }
    });
}

function toggleGroupNpc(npcName) {
    const idx = STATE.selectedGroupNpcs.indexOf(npcName);
    if (idx >= 0) {
        STATE.selectedGroupNpcs.splice(idx, 1);
    } else {
        if (STATE.selectedGroupNpcs.length >= 5) {
            alert('群聊最多 5 个 NPC');
            return;
        }
        STATE.selectedGroupNpcs.push(npcName);
    }
    updateGroupUI();
    renderNpcCards();

    if (STATE.selectedGroupNpcs.length > 0) {
        STATE.chatMode = 'group';
        document.querySelectorAll('.chat-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('panelGroup').classList.add('active');
        chatTabs.forEach(t => t.classList.remove('active'));
        document.querySelector('[data-tab="group"]').classList.add('active');
    }
}

function updateGroupUI() {
    groupMembers.innerHTML = STATE.selectedGroupNpcs.map(name =>
        `<span class="group-member-tag" onclick="toggleGroupNpc('${name}')">${name}</span>`
    ).join('');
    chatTitleGroup.textContent = STATE.selectedGroupNpcs.length > 0
        ? `群聊 (${STATE.selectedGroupNpcs.join(', ')})`
        : '群聊 - 请选择参与者';
    inputGroup.disabled = STATE.selectedGroupNpcs.length === 0;
    sendBtnGroup.disabled = STATE.selectedGroupNpcs.length === 0;
}

// ==================== NPC Cards ====================

async function fetchAndRenderNpcs() {
    try {
        const [npcsData, statesData] = await Promise.all([
            fetchNpcList(),
            fetchNpcStates()
        ]);

        const npcs = npcsData.npcs.map(npc => {
            const state = statesData.states.find(s => s.name === npc.name);
            return {
                ...npc,
                state: state ? state.state : 'idle',
                affinity: 50,  // Will be updated below
                level: '友好'
            };
        });

        // Fetch affinities in parallel
        const affinityPromises = npcs.map(npc =>
            fetchNpcAffinity(npc.name).then(data => ({
                name: npc.name,
                affinity: data.affinity || 50,
                level: data.level || '友好'
            })).catch(() => ({ name: npc.name, affinity: 50, level: '友好' }))
        );
        const affinities = await Promise.all(affinityPromises);

        for (const aff of affinities) {
            const npc = npcs.find(n => n.name === aff.name);
            if (npc) {
                npc.affinity = aff.affinity;
                npc.level = aff.level;
            }
        }

        // Update state
        STATE.npcs = npcs;
        STATE.npcStates = statesData.states;
        if (statesData.current_day) {
            setState('currentDay', statesData.current_day);
            currentDaySpan.textContent = statesData.current_day;
        }
        if (statesData.active_timeline) {
            setState('activeTimelineId', statesData.active_timeline);
        }

        renderNpcCards();
        updateSummary();

    } catch (e) {
        console.error('Failed to fetch NPCs:', e);
        setConnectionStatus(false);
        npcList.innerHTML = `
            <div class="loading-placeholder" style="color:#e74c3c">
                <p>❌ 无法连接到后端</p>
                <p style="font-size:12px;color:#888">${escapeHtml(e.message || '网络错误')}</p>
                <p style="font-size:12px;color:#888">后端地址: ${API_BASE}</p>
                <button class="btn btn-sm" onclick="retryLoadNpcs()" style="margin-top:10px">🔄 重试</button>
            </div>`;
    }
}

function renderNpcCards() {
    if (STATE.npcs.length === 0) {
        npcList.innerHTML = '<div class="loading-placeholder">暂无NPC数据</div>';
        return;
    }

    npcList.innerHTML = STATE.npcs.map(npc => {
        const isSelected = STATE.active1v1Npc === npc.name;
        const isGrouped = STATE.selectedGroupNpcs.includes(npc.name);
        const avatarClass = npc.name === '张三' ? 'zhang' : npc.name === '李四' ? 'li' : 'wang';
        const stateClass = npc.state;
        const affPct = Math.round(npc.affinity);
        const affColor = affPct >= 60 ? '#4caf50' : affPct >= 40 ? '#ff9800' : '#f44336';

        let cardClass = 'npc-card';
        if (isSelected) cardClass += ' selected';
        if (isGrouped) cardClass += ' group-selected';
        if (npc.state === 'chatting') cardClass += ' chatting';
        if (npc.state === 'busy') cardClass += ' busy';

        return `
        <div class="${cardClass}" onclick="selectNpc('${npc.name}')" data-npc="${npc.name}">
            <span class="npc-state-indicator"><span class="state-light ${stateClass}" title="${stateClass}"></span></span>
            <div class="npc-card-header">
                <div class="npc-avatar ${avatarClass}">${npc.name[0]}</div>
                <div class="npc-info">
                    <div class="npc-name">${npc.name}</div>
                    <div class="npc-title">${npc.title}</div>
                </div>
            </div>
            <div class="affinity-bar">
                <div class="affinity-fill" style="width:${affPct}%; background:${affColor}"></div>
            </div>
            <div class="affinity-label">好感: ${affPct} (${npc.level})</div>
        </div>`;
    }).join('');

    // Restore scroll position
}

function updateSummary() {
    const states = STATE.npcs.map(n => n.state);
    idleCountEl.textContent = states.filter(s => s === 'idle').length;
    chattingCountEl.textContent = states.filter(s => s === 'chatting').length;
    busyCountEl.textContent = states.filter(s => s === 'busy').length;
    const avg = STATE.npcs.reduce((sum, n) => sum + n.affinity, 0) / (STATE.npcs.length || 1);
    avgAffinityEl.textContent = Math.round(avg);
}

// ==================== NPC Selection ====================

function selectNpc(npcName) {
    if (STATE.chatMode === 'group' || STATE.selectedGroupNpcs.length > 0) {
        toggleGroupNpc(npcName);
        return;
    }

    STATE.active1v1Npc = npcName;
    STATE.chatMode = '1v1';

    // Switch to 1v1 tab
    document.querySelectorAll('.chat-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel1v1').classList.add('active');
    chatTabs.forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="1v1"]').classList.add('active');

    // Update UI
    const npc = STATE.npcs.find(n => n.name === npcName);
    chatTitle1v1.textContent = npc ? `${npc.name} (${npc.title}) · 好感度: ${Math.round(npc.affinity)}` : npcName;
    input1v1.disabled = false;
    sendBtn1v1.disabled = false;
    input1v1.focus();

    // Clear previous messages for this NPC (keep minimal history)
    messages1v1.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">💬</div>
            <p>正在与 <strong>${npcName}</strong> 对话</p>
            ${npc ? `<p class="hint">好感度: ${Math.round(npc.affinity)} (${npc.level}) | 状态: ${npc.state}</p>` : ''}
        </div>`;

    renderNpcCards();
    STATE.lastActivity = Date.now();
}

// ==================== Message Rendering ====================

function appendMessage(panel, sender, content, timestamp) {
    const isPlayer = sender === 'player';
    const isSystem = sender === 'system';
    const panelId = panel === '1v1' ? 'messages1v1' : panel === 'group' ? 'messagesGroup' : 'messagesWorld';
    const container = document.getElementById(panelId);

    if (isSystem) {
        container.innerHTML += `<div class="message-time">${content}</div>`;
    } else {
        const avatarClass = isPlayer ? 'player' : (sender === '张三' ? 'zhang' : sender === '李四' ? 'li' : 'wang');
        const initial = isPlayer ? '我' : sender[0];
        const rowClass = isPlayer ? 'self' : `other ${sender === '张三' ? 'npc-zhang' : sender === '李四' ? 'npc-李四' : 'npc-王五'}`;

        const timeStr = formatTime(timestamp);
        container.innerHTML += `
        <div class="message-row ${rowClass}">
            <div class="message-avatar ${avatarClass}">${initial}</div>
            <div class="message-body">
                ${!isPlayer ? `<span class="message-sender">${sender}</span>` : ''}
                <div class="message-bubble">${escapeHtml(content)}</div>
                <span style="font-size:10px; color:#aaa; ${isPlayer ? 'text-align:right' : ''}">${timeStr}</span>
            </div>
        </div>`;
    }

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function appendWorldMessage(sender, content, npcPair = '') {
    const container = messagesWorld;
    let html = '';
    if (sender === 'system') {
        html = `<div class="message-time">${content}</div>`;
    } else {
        html = `
        <div class="world-message">
            <div class="wm-speakers">💬 ${npcPair || sender}</div>
            <div>${escapeHtml(content)}</div>
        </div>`;
    }
    container.innerHTML += html;
    container.scrollTop = container.scrollHeight;
}

// ==================== World Chat ====================

async function refreshWorldChat() {
    try {
        const status = await fetchNpcNpcChatStatus();
        STATE.npcChatStatus = status;
        STATE.dailyCallsLeft = 50; // default

        // Update stats
        if (status.cooldowns) {
            const cdEntries = Object.entries(status.cooldowns);
            cooldownsText.textContent = cdEntries.length > 0
                ? `冷却: ${cdEntries.map(([k, v]) => `${k}(${v}s)`).join(', ')}`
                : '';
        }

        // Show active chats
        for (const chat of status.active_chats || []) {
            for (const msg of chat.messages || []) {
                appendWorldMessage(msg.speaker, msg.content, `${chat.npc_a} ↔ ${chat.npc_b}`);
            }
        }

        // Show recent history that wasn't shown yet
        if (status.history && status.history.length > 0) {
            const lastChat = status.history[status.history.length - 1];
            if (!messagesWorld.dataset.lastChatId || messagesWorld.dataset.lastChatId !== lastChat.id) {
                messagesWorld.dataset.lastChatId = lastChat.id;
                for (const msg of lastChat.messages || []) {
                    appendWorldMessage(msg.speaker, msg.content, `${lastChat.npc_a} ↔ ${lastChat.npc_b}`);
                }
            }
        }

    } catch (e) {
        console.error('Failed to refresh world chat:', e);
    }
}

// ==================== NPC Chat Trigger Modal ====================

function setupTriggerChatModal() {
    triggerNpcChatBtn.addEventListener('click', () => {
        triggerNpcA.innerHTML = STATE.npcs.map(n => `<option value="${n.name}">${n.name}</option>`).join('');
        triggerNpcB.innerHTML = STATE.npcs.map(n => `<option value="${n.name}">${n.name}</option>`).join('');
        triggerChatModal.style.display = 'flex';
    });

    triggerChatCancel.addEventListener('click', () => {
        triggerChatModal.style.display = 'none';
    });

    triggerChatConfirm.addEventListener('click', async () => {
        const a = triggerNpcA.value;
        const b = triggerNpcB.value;
        if (a === b) {
            alert('请选择不同的 NPC');
            return;
        }
        triggerChatModal.style.display = 'none';
        try {
            const result = await triggerNpcNpcChat(a, b);
            addWorldMessage('system', `🎲 手动触发: ${a} 与 ${b} 开始对话`);
            addWorldMessage('system', result.message || '已触发');
            setTimeout(refreshWorldChat, 2000);
        } catch (e) {
            addWorldMessage('system', `❌ 触发失败: ${e.message}`);
        }
    });
}

// ==================== Polling ====================

function startPolling() {
    if (STATE.pollTimer) clearInterval(STATE.pollTimer);

    STATE.pollTimer = setInterval(async () => {
        // Adaptive polling
        const idleTime = (Date.now() - STATE.lastActivity) / 1000;
        if (STATE.chatMode === '1v1' && STATE.active1v1Npc) {
            STATE.pollInterval = 3000;
        } else if (STATE.chatMode === 'world') {
            STATE.pollInterval = 5000;
        } else if (idleTime > 60) {
            STATE.pollInterval = 15000;
        } else {
            STATE.pollInterval = 10000;
        }

        try {
            await fetchAndRenderNpcs();
        } catch (e) {
            // Silent fail for polling
        }

        if (STATE.chatMode === 'world' || document.getElementById('panelWorld').classList.contains('active')) {
            try {
                await refreshWorldChat();
            } catch (e) { /* silent */ }
        }

    }, 5000); // Base 5s, actual interval managed by adaptive logic
}

// Reset polling timer after activity
document.addEventListener('click', () => { STATE.lastActivity = Date.now(); });
document.addEventListener('keydown', () => { STATE.lastActivity = Date.now(); });

// ==================== Connection ====================

function setConnectionStatus(connected) {
    STATE.connected = connected;
    connectionStatus.className = 'status-dot ' + (connected ? 'online' : 'offline');
    connectionText.textContent = connected ? `已连接 (${API_BASE})` : '断开';
}

// ==================== Keyboard Shortcuts ====================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Close god panel
        if (!godPanel.classList.contains('collapsed')) {
            godPanel.classList.add('collapsed');
            godPanelToggle.textContent = '⚡ 上帝界面';
        }
        // Close modals
        advanceModal.style.display = 'none';
        triggerChatModal.style.display = 'none';
    }

    // Ctrl+N: new timeline
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        newTimelineName.focus();
    }
});

// Retry function for failed NPC load
function retryLoadNpcs() {
    npcList.innerHTML = '<div class="loading-placeholder">🔄 重试中...</div>';
    STATE.connected = true;
    connectionStatus.className = 'status-dot online';
    connectionText.textContent = '连接中...';
    fetchAndRenderNpcs();
}

// Expose functions globally for onclick handlers
window.selectNpc = selectNpc;
window.toggleGroupNpc = toggleGroupNpc;
window.switchActiveTimeline = switchActiveTimeline;
window.retryLoadNpcs = retryLoadNpcs;
