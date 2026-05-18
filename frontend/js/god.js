/* ================================
   God Interface - 时间线管理 + 事件编辑
   ================================ */

// DOM refs
const godPanel = document.getElementById('godPanel');
const godPanelToggle = document.getElementById('godPanelToggle');
const godPanelClose = document.getElementById('godPanelClose');
const timelineSelect = document.getElementById('timelineSelect');
const currentDaySpan = document.getElementById('currentDay');
const advanceDayBtn = document.getElementById('advanceDayBtn');
const advanceModal = document.getElementById('advanceModal');
const advanceTargetDay = document.getElementById('advanceTargetDay');
const advanceConfirm = document.getElementById('advanceConfirm');
const advanceCancel = document.getElementById('advanceCancel');
const godTimelineTableBody = document.getElementById('godTimelineTableBody');
const newTimelineName = document.getElementById('newTimelineName');
const createTimelineBtn = document.getElementById('createTimelineBtn');
const todayEventInput = document.getElementById('todayEventInput');
const eventCharCount = document.getElementById('eventCharCount');
const saveEventBtn = document.getElementById('saveEventBtn');
const eventUpdateInfo = document.getElementById('eventUpdateInfo');
const eventHistory = document.getElementById('eventHistory');

// God panel toggle
godPanelToggle.addEventListener('click', () => {
    godPanel.classList.toggle('collapsed');
    const isCollapsed = godPanel.classList.contains('collapsed');
    godPanelToggle.textContent = isCollapsed ? '⚡ 上帝界面' : '⚡ 隐藏';
    // Backdrop for tablet/mobile
    if (window.innerWidth < 1024) {
        document.getElementById('godBackdrop').classList.toggle('open', !isCollapsed);
    }
    if (!isCollapsed) {
        refreshGodPanel();
    }
});

godPanelClose.addEventListener('click', () => {
    godPanel.classList.add('collapsed');
    godPanelToggle.textContent = '⚡ 上帝界面';
    if (window.innerWidth < 1024) {
        document.getElementById('godBackdrop').classList.remove('open');
    }
});

// God backdrop click to close
document.getElementById('godBackdrop').addEventListener('click', () => {
    godPanel.classList.add('collapsed');
    godPanelToggle.textContent = '⚡ 上帝界面';
    document.getElementById('godBackdrop').classList.remove('open');
});

// Timeline selector change
timelineSelect.addEventListener('change', async () => {
    const id = timelineSelect.value;
    if (id && id !== STATE.activeTimelineId) {
        try {
            await setActiveTimeline(id);
            setState('activeTimelineId', id);
            await refreshAllTimelineData();
        } catch (e) {
            console.error('切换时间线失败:', e);
        }
    }
});

// Advance day
advanceDayBtn.addEventListener('click', () => {
    advanceTargetDay.textContent = STATE.currentDay + 1;
    advanceModal.style.display = 'flex';
});

advanceCancel.addEventListener('click', () => {
    advanceModal.style.display = 'none';
});

advanceConfirm.addEventListener('click', async () => {
    advanceModal.style.display = 'none';
    try {
        const result = await advanceDay(STATE.activeTimelineId);
        setState('currentDay', result.new_day);
        currentDaySpan.textContent = result.new_day;
        await refreshGodPanel();
        await refreshAllTimelineData();
        addWorldMessage('system', `⏩ 时间推进到第 ${result.new_day} 天`);
    } catch (e) {
        alert('推进失败: ' + (e.detail || e.message));
    }
});

// Save today event
saveEventBtn.addEventListener('click', async () => {
    const content = todayEventInput.value.trim();
    if (!content) return;
    try {
        const result = await setTodayEvent(STATE.activeTimelineId, content);
        eventUpdateInfo.textContent = `✅ 已保存 (修改次数: ${result.update_count})`;
        eventUpdateInfo.style.color = '#07c160';
        await refreshGodPanel();
        addWorldMessage('system', `📝 今日事件已更新: ${content.substring(0, 30)}...`);
    } catch (e) {
        eventUpdateInfo.textContent = `❌ ${e.detail || e.message}`;
        eventUpdateInfo.style.color = '#e74c3c';
    }
});

// Create timeline
createTimelineBtn.addEventListener('click', async () => {
    const name = newTimelineName.value.trim();
    if (!name) return;
    try {
        await createTimeline(name);
        newTimelineName.value = '';
        await refreshAllTimelineData();
    } catch (e) {
        alert('创建失败: ' + (e.detail || e.message));
    }
});

// Today event input
todayEventInput.addEventListener('input', () => {
    const len = todayEventInput.value.length;
    eventCharCount.textContent = len;
    eventCharCount.style.color = len > 180 ? '#e74c3c' : '#888';
});

/* ==================== Refresh Functions ==================== */

async function refreshAllTimelineData() {
    try {
        const data = await fetchTimelines();
        setState('timelines', data.timelines);

        // Update top bar selector
        const currentVal = timelineSelect.value;
        timelineSelect.innerHTML = data.timelines.map(t =>
            `<option value="${t.id}" ${t.id === data.active_id ? 'selected' : ''}>${t.name} (第${t.current_day}天)</option>`
        ).join('');

        // If active changed
        if (data.active_id && data.active_id !== STATE.activeTimelineId) {
            setState('activeTimelineId', data.active_id);
        }

        // Update current day
        const activeTL = data.timelines.find(t => t.id === data.active_id);
        if (activeTL) {
            setState('currentDay', activeTL.current_day);
            currentDaySpan.textContent = activeTL.current_day;
        }

        // Save to localStorage
        localStorage.setItem('activeTimelineId', data.active_id || '');

    } catch (e) {
        console.error('Failed to refresh timelines:', e);
        setConnectionStatus(false);
    }
}

async function refreshGodPanel() {
    if (godPanel.classList.contains('collapsed')) return;

    const tid = STATE.activeTimelineId;
    if (!tid) return;

    try {
        // Timeline list for god panel
        const timelines = await fetchTimelines();
        godTimelineTableBody.innerHTML = timelines.timelines.map(t =>
            `<tr class="${t.id === timelines.active_id ? 'active-row' : ''}">
                <td>${t.name}</td>
                <td>第${t.current_day}天</td>
                <td>${t.event_count}条</td>
                <td>
                    ${t.id !== timelines.active_id ?
                        `<button class="btn btn-sm" onclick="switchActiveTimeline('${t.id}')">切换</button>` :
                        '<span style="color:#07c160">当前</span>'}
                </td>
            </tr>`
        ).join('');

        // Today's event
        const todayData = await fetchTodayEvent(tid);
        if (todayData.event) {
            todayEventInput.value = todayData.event.content;
            eventCharCount.textContent = todayData.event.content.length;
            eventUpdateInfo.textContent = `已存在事件 (修改次数: ${todayData.event.update_count})`;
            eventUpdateInfo.style.color = '#888';
        } else {
            todayEventInput.value = '';
            eventCharCount.textContent = '0';
            eventUpdateInfo.textContent = STATE.currentDay > 0 ? '今日尚无事件' : '请先推进到第1天';
            eventUpdateInfo.style.color = '#888';
        }

        // Disable editor for day 0
        if (STATE.currentDay === 0) {
            todayEventInput.disabled = true;
            saveEventBtn.disabled = true;
            todayEventInput.placeholder = '请先推进到第1天再编写事件';
        } else {
            todayEventInput.disabled = false;
            saveEventBtn.disabled = false;
            todayEventInput.placeholder = '编写今天发生的事件... (最多200字)';
        }

        // Event history
        const eventsData = await fetchTimelineEvents(tid);
        if (eventsData.events.length === 0) {
            eventHistory.innerHTML = '<p class="god-hint">暂无事件记录</p>';
        } else {
            eventHistory.innerHTML = eventsData.events.map(e =>
                `<div class="event-item ${e.day === STATE.currentDay ? 'today' : ''}">
                    <div class="event-day">📅 第 ${e.day} 天 ${e.day === STATE.currentDay ? '(今日)' : ''}</div>
                    <div class="event-content">${escapeHtml(e.content)}</div>
                    <div class="event-meta">修改次数: ${e.update_count} | 最后更新: ${formatDate(e.updated_at)}</div>
                </div>`
            ).reverse().join('');
        }

    } catch (e) {
        console.error('Failed to refresh god panel:', e);
    }
}

/* ==================== Helpers ==================== */

async function switchActiveTimeline(id) {
    try {
        await setActiveTimeline(id);
        setState('activeTimelineId', id);
        timelineSelect.value = id;
        await refreshAllTimelineData();
        await refreshGodPanel();
    } catch (e) {
        console.error('Failed to switch timeline:', e);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
