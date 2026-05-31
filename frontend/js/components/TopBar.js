/* ================================
   TopBar — 顶部导航栏
   ================================ */

import { appStore } from '../stores/appStore.js';
import { npcStore } from '../stores/npcStore.js';
import { timelineStore } from '../stores/timelineStore.js';
import * as api from '../api.js';

export const TopBar = {
    name: 'TopBar',
    emits: ['toggleGod', 'toggleNpcManager'],
    setup() {
        return { appStore, npcStore, timelineStore };
    },
    template: `
        <header class="top-bar">
            <div class="top-bar-left">
                <button class="hamburger" @click="toggleSidebar">☰</button>
                <h1 class="app-title">🏙 AI-Town 赛博小镇</h1>
            </div>
            <div class="top-bar-center">
                <div class="timeline-selector">
                    <select v-model="selectedTimelineId" @change="switchTimeline">
                        <option v-for="t in timelineStore.timelines" :key="t.id" :value="t.id">
                            {{ t.name }} (第{{ t.current_day }}天)
                        </option>
                    </select>
                </div>
                <div class="day-display">📅 第 <span>{{ timelineStore.currentDay }}</span> 天</div>
                <button class="btn btn-sm" @click="advanceDay">⏩ +1天</button>
                <button class="btn btn-sm btn-god" @click="$emit('toggleGod')">⚡ 上帝界面</button>
                <button class="btn btn-sm btn-pause" :class="{ paused: isPaused }" @click="togglePause">
                    {{ isPaused ? '▶ 恢复' : '⏸ 暂停' }}
                </button>
                <button class="btn btn-sm" @click="$emit('toggleNpcManager')">⚙ NPC管理</button>
            </div>
            <div class="top-bar-right">
                <span class="status-dot" :class="appStore.connected ? 'online' : 'offline'"></span>
                <span>{{ appStore.connected ? '已连接' : '断开' }}</span>
                <span v-if="showPollIndicator" class="poll-indicator" :class="{ active: appStore.polling }">
                    · <span class="poll-dot"></span> {{ pollLabel }}
                </span>
            </div>
        </header>`,
    data() {
        return {
            isPaused: false,
            selectedTimelineId: null,
            pollLabel: '等待中...',
            showPollIndicator: false,
            lastPollHadData: false,
        };
    },
    mounted() {
        this.selectedTimelineId = timelineStore.activeTimelineId;
    },
    methods: {
        toggleSidebar() {
            const sidebar = document.getElementById('convSidebar');
            const backdrop = document.getElementById('sidebarBackdrop');
            if (sidebar) sidebar.classList.toggle('open');
            if (backdrop) backdrop.classList.toggle('open');
        },
        async togglePause() {
            try {
                const status = await api.getSimulationStatus();
                if (status.paused) {
                    await api.resumeSimulation();
                    this.isPaused = false;
                } else {
                    await api.pauseSimulation();
                    this.isPaused = true;
                }
            } catch (e) {
                console.error('暂停切换失败:', e);
            }
        },
        async switchTimeline() {
            const id = this.selectedTimelineId;
            if (id && id !== timelineStore.activeTimelineId) {
                try {
                    await api.setActiveTimeline(id);
                    timelineStore.activeTimelineId = id;
                    this.$emit('timelineChanged');
                } catch (e) {
                    console.error('切换时间线失败:', e);
                }
            }
        },
        advanceDay() {
            this.$emit('advanceDay');
        },
        updatePollIndicator(hadData) {
            this.showPollIndicator = true;
            if (hadData) {
                this.pollLabel = '有数据';
                this.lastPollHadData = true;
                appStore.polling = true;
            } else {
                appStore.polling = false;
                if (this.lastPollHadData) {
                    this.pollLabel = '等待中...';
                }
            }
        }
    }
};
