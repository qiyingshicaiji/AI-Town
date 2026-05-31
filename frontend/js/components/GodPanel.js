/* ================================
   GodPanel — 上帝界面 (从 god.js 移植)
   ================================ */

import { timelineStore } from '../stores/timelineStore.js';
import * as api from '../api.js';
import { addToast } from './toastBus.js';

export const GodPanel = {
    name: 'GodPanel',
    props: {
        open: Boolean
    },
    emits: ['close', 'advanceDay'],
    setup() {
        return { timelineStore };
    },
    template: `
        <aside class="god-panel" :class="{ collapsed: !open }" id="godPanel">
                <div class="god-panel-header">
                    <h2>⚡ 上帝界面</h2>
                    <button class="btn btn-sm" @click="$emit('close')">✕</button>
                </div>
                <div class="god-section">
                    <h3>时间线管理</h3>
                    <div class="timeline-list">
                        <table class="timeline-table">
                            <thead><tr><th>名称</th><th>天数</th><th>事件</th><th>操作</th></tr></thead>
                            <tbody>
                                <tr v-for="t in timelineStore.timelines" :key="t.id" :class="{ 'active-row': t.id === timelineStore.activeTimelineId }">
                                    <td>{{ t.name }}</td>
                                    <td>第{{ t.current_day }}天</td>
                                    <td>{{ t.event_count }}条</td>
                                    <td>
                                        <button v-if="t.id !== timelineStore.activeTimelineId" class="btn btn-sm" @click="switchTimeline(t.id)">切换</button>
                                        <span v-else style="color:#07c160">当前</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="god-create-timeline">
                        <input type="text" v-model="newTimelineName" placeholder="新时间线名称..." maxlength="50">
                        <button class="btn btn-sm" @click="createTimeline">+ 创建</button>
                    </div>
                </div>
                <div class="god-section">
                    <h3>📝 今日事件</h3>
                    <p class="god-hint">每天只能编写一个事件，只能覆盖不能删除</p>
                    <textarea v-model="todayEventContent" class="event-textarea"
                              :disabled="timelineStore.currentDay === 0"
                              :placeholder="timelineStore.currentDay === 0 ? '请先推进到第1天再编写事件' : '编写今天发生的事件... (最多200字)'"
                              maxlength="200" rows="4"></textarea>
                    <div class="event-char-count"><span :style="{ color: todayEventContent.length > 180 ? '#e74c3c' : '#888' }">{{ todayEventContent.length }}</span>/200</div>
                    <button class="btn btn-primary" :disabled="timelineStore.currentDay === 0 || !todayEventContent.trim()" @click="saveEvent">💾 覆盖保存</button>
                    <p class="god-hint" :style="{ color: updateInfoColor }">{{ updateInfo }}</p>
                </div>
                <div class="god-section">
                    <h3>📜 历史事件 <span class="readonly-tag">只读</span></h3>
                    <div v-if="!events.length" class="event-history"><p class="god-hint">暂无事件记录</p></div>
                    <div v-else class="event-history">
                        <div v-for="e in events" :key="e.day" class="event-item" :class="{ today: e.day === timelineStore.currentDay }">
                            <div class="event-day">📅 第 {{ e.day }} 天 {{ e.day === timelineStore.currentDay ? '(今日)' : '' }}</div>
                            <div class="event-content">{{ e.content }}</div>
                            <div class="event-meta">修改次数: {{ e.update_count }} | 最后更新: {{ formatDate(e.updated_at) }}</div>
                        </div>
                    </div>
                </div>
            </aside>
        <div class="god-backdrop" :class="{ open: open }" @click="closeGodPanel"></div>`,
    data() {
        return {
            newTimelineName: '',
            todayEventContent: '',
            updateInfo: '',
            updateInfoColor: '#888',
            events: [],
        };
    },
    watch: {
        open(val) {
            if (val) this.refresh();
        }
    },
    mounted() {
        if (this.open) this.refresh();
    },
    methods: {
        closeGodPanel() {
            this.$emit('close');
        },
        async refresh() {
            const tid = timelineStore.activeTimelineId;
            if (!tid) return;

            try {
                const todayData = await api.fetchTodayEvent(tid);
                if (todayData.event) {
                    this.todayEventContent = todayData.event.content || '';
                    this.updateInfo = `已存在事件 (修改次数: ${todayData.event.update_count})`;
                    this.updateInfoColor = '#888';
                } else {
                    this.todayEventContent = '';
                    const msg = timelineStore.currentDay > 0 ? '今日尚无事件' : '请先推进到第1天';
                    this.updateInfo = msg;
                    this.updateInfoColor = '#888';
                }

                const eventsData = await api.fetchTimelineEvents(tid);
                this.events = (eventsData.events || []).reverse();
            } catch (e) {
                console.error('刷新上帝面板失败:', e);
            }
        },
        async switchTimeline(id) {
            try {
                await api.setActiveTimeline(id);
                timelineStore.activeTimelineId = id;
                await this.refresh();
            } catch (e) {
                console.error('切换时间线失败:', e);
            }
        },
        async createTimeline() {
            const name = this.newTimelineName.trim();
            if (!name) return;
            try {
                await api.createTimeline(name);
                this.newTimelineName = '';
                this.$parent.refreshAllData();
                this.refresh();
            } catch (e) {
                alert('创建失败: ' + (e.detail || e.message));
            }
        },
        async saveEvent() {
            const content = this.todayEventContent.trim();
            if (!content) return;
            try {
                const result = await api.setTodayEvent(timelineStore.activeTimelineId, content);
                this.updateInfo = `✅ 已保存 (修改次数: ${result.update_count})`;
                this.updateInfoColor = '#07c160';
                await this.refresh();
            } catch (e) {
                this.updateInfo = `❌ ${e.detail || e.message}`;
                this.updateInfoColor = '#e74c3c';
            }
        },
        formatDate(isoStr) {
            if (!isoStr) return '';
            const d = new Date(isoStr);
            return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        }
    }
};
