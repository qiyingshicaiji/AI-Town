/* ================================
   AppShell — 顶层容器: 初始化 + 轮询 + 组件协调
   ================================ */

import { appStore } from '../stores/appStore.js';
import { npcStore } from '../stores/npcStore.js';
import { timelineStore } from '../stores/timelineStore.js';
import * as api from '../api.js';
import { initDefaultConversations, appendMessage, getConversation, upsertConversation, loadMessages, markRead, make1v1ConvId } from '../storage.js';
import { addToast } from './toastBus.js';

import { TopBar } from './TopBar.js';
import { ConvList } from './ConvList.js';
import { ChatArea } from './ChatArea.js';
import { GodPanel } from './GodPanel.js';
import { NpcManager } from './NpcManager.js';
import { NpcWizard } from './NpcWizard.js';
import { Modals } from './Modals.js';
import { Toast } from './Toast.js';

export const AppShell = {
    name: 'AppShell',
    components: { TopBar, ConvList, ChatArea, GodPanel, NpcManager, NpcWizard, Modals, Toast },
    template: `
        <div class="app-shell">
            <top-bar ref="topBar"
                     @toggle-god="godOpen = !godOpen"
                     @toggle-npc-manager="npcManagerOpen = !npcManagerOpen"
                     @advance-day="$refs.modalsRef.openAdvanceModal()"
                     @timeline-changed="refreshAllData">
            </top-bar>
            <div class="main-container">
                <conv-list @open-group-modal="$refs.modalsRef.openGroupModal()"
                           @open-npc-chat-modal="$refs.modalsRef.openNpcChatModal()">
                </conv-list>
                <chat-area ref="chatArea"></chat-area>
                <god-panel ref="godPanel" :open="godOpen" @close="godOpen = false"></god-panel>
                <npc-manager ref="npcManager" :open="npcManagerOpen"
                             @close="npcManagerOpen = false"
                             @open-wizard="openNpcWizard"
                             @open-detail="$refs.modalsRef.openNpcDetail($event)">
                </npc-manager>
            </div>
            <modals ref="modalsRef"
                    @open-conv="openConv"
                    @advance-day="onAdvanceDay"
                    @start-contention="startContention">
            </modals>
            <npc-wizard ref="wizard"
                        :edit-name="wizardEditName"
                        @close="wizardEditName = null"
                        @saved="onWizardSaved">
            </npc-wizard>
            <toast></toast>
        </div>`,
    data() {
        return {
            godOpen: false,
            npcManagerOpen: false,
            wizardEditName: null,
            pollingTimer: null,
            lastAffinityRefresh: 0,
            lastPollHadData: false,
        };
    },
    mounted() {
        this.init();
    },
    methods: {
        async init() {
            try {
                await this.refreshAllData();
                await this.loadNpcsAndInit();

                // Load initial NPC-NPC chat history
                try {
                    const historyData = await api.fetchNpcNpcChatHistory(10);
                    if (historyData.history) {
                        for (const chat of historyData.history) {
                            this.$refs.chatArea.receiveNpcNpcMessages(chat);
                        }
                    }
                } catch (e) {
                    console.error('初始加载 NPC-NPC 历史失败:', e);
                }

                appStore.connected = true;
                await this.syncPauseState();
                this.startPolling();
                console.log('🏙 AI-Town Vue 已就绪');
            } catch (e) {
                console.error('初始化失败:', e);
                appStore.connected = false;
            }
        },

        async refreshAllData() {
            try {
                const data = await api.fetchTimelines();
                timelineStore.timelines = data.timelines || [];
                if (data.active_id) {
                    timelineStore.activeTimelineId = data.active_id;
                }
                const activeTL = (data.timelines || []).find(t => t.id === data.active_id);
                if (activeTL) {
                    timelineStore.currentDay = activeTL.current_day;
                }
            } catch (e) {
                console.error('刷新时间线失败:', e);
            }
        },

        async loadNpcsAndInit() {
            try {
                const [npcsData, statesData] = await Promise.all([
                    api.fetchNpcList(), api.fetchNpcStates()
                ]);
                npcStore.npcs = (npcsData.npcs || []).map(npc => {
                    const st = (statesData.states || []).find(s => s.name === npc.name);
                    return { ...npc, state: st ? st.state : 'idle', affinity: 50, level: '友好' };
                });

                // Fetch affinities
                const results = await Promise.all(
                    npcStore.npcs.map(n => api.fetchNpcAffinity(n.name).catch(() => null))
                );
                results.forEach((r, i) => {
                    if (r) {
                        npcStore.npcs[i].affinity = r.affinity ?? 50;
                        npcStore.npcs[i].level = r.level || '友好';
                    }
                });

                initDefaultConversations(npcStore.npcs.map(n => n.name));
            } catch (e) {
                console.error('NPC load failed:', e);
                appStore.connected = false;
            }
        },

        async syncPauseState() {
            try {
                const status = await api.getSimulationStatus();
                if (this.$refs.topBar) {
                    this.$refs.topBar.isPaused = status.paused || false;
                }
            } catch (e) { /* silent */ }
        },

        // ---- Polling ----
        startPolling() {
            if (this.pollingTimer) { clearTimeout(this.pollingTimer); this.pollingTimer = null; }
            const tick = async () => {
                let pollHadData = false;
                await this.updateNpcStates();
                const proactiveCount = await this.checkProactiveMessages();
                if (proactiveCount > 0) pollHadData = true;

                if (Date.now() - this.lastAffinityRefresh > 30000) {
                    this.lastAffinityRefresh = Date.now();
                    await this.syncPauseState();
                    try {
                        const results = await Promise.all(
                            npcStore.npcs.map(n => api.fetchNpcAffinity(n.name).catch(() => null))
                        );
                        results.forEach((r, i) => {
                            if (r) {
                                npcStore.npcs[i].affinity = r.affinity ?? 50;
                                npcStore.npcs[i].level = r.level || '友好';
                            }
                        });
                    } catch (e) { /* silent */ }

                    try {
                        const data = await api.fetchNpcNpcAffinities();
                        if (data.matrix) npcStore.npcNpcAffinities = data.matrix;
                    } catch (e) { /* silent */ }
                }

                // NPC-NPC chat status
                try {
                    const npcChatStatus = await api.fetchNpcNpcChatStatus();
                    if ((npcChatStatus.active_chats?.length || 0) > 0 || (npcChatStatus.history?.length || 0) > 0) {
                        pollHadData = true;
                    }
                    if (npcChatStatus.active_chats) {
                        for (const chat of npcChatStatus.active_chats) {
                            this.$refs.chatArea.receiveNpcNpcMessages(chat);
                        }
                    }
                    if (npcChatStatus.history) {
                        const now = Date.now();
                        for (const chat of npcChatStatus.history) {
                            const endedAt = this.parsePythonDate(chat.ended_at);
                            if (endedAt && (now - endedAt) < 60000) {
                                this.$refs.chatArea.receiveNpcNpcMessages(chat);
                            }
                        }
                    }
                } catch (e) {
                    console.error('NPC chat check failed:', e);
                }

                if (this.$refs.topBar) {
                    this.$refs.topBar.updatePollIndicator(pollHadData);
                }
                this.pollingTimer = setTimeout(tick, 5000);
            };
            tick();
        },

        async updateNpcStates() {
            try {
                const data = await api.fetchNpcStates();
                if (data.states) {
                    npcStore.npcs.forEach(npc => {
                        const st = data.states.find(s => s.name === npc.name);
                        if (st) npc.state = st.state;
                    });
                }
            } catch (e) { /* silent */ }
        },

        async checkProactiveMessages() {
            try {
                const data = await api.apiRequest('GET', '/npcs/pending-messages', null, { useCache: false });
                if (!data.messages || !data.messages.length) return 0;

                const processedKeys = [];
                for (const msg of data.messages) {
                    const convId = make1v1ConvId(msg.npc_name);
                    const msgKey = `${msg.npc_name}::${msg.timestamp}`;
                    processedKeys.push(msgKey);

                    const existing = loadMessages(convId) || [];
                    if (existing.some(m => m.content === msg.content && m.time === msg.timestamp)) continue;

                    if (!getConversation(convId)) {
                        upsertConversation({
                            id: convId, type: '1v1', name: msg.npc_name,
                            participants: [msg.npc_name],
                            lastMsg: '', lastTime: new Date().toISOString(), unread: 0
                        });
                    }

                    appendMessage(convId, {
                        sender: msg.npc_name,
                        content: msg.content,
                        time: msg.timestamp || new Date().toISOString()
                    });

                    addToast(
                        `${msg.npc_name} 主动发来消息`,
                        (msg.content || '').substring(0, 60),
                        'proactive',
                        convId
                    );

                    if (convId === appStore.currentConvId) markRead(convId);
                }

                try {
                    await api.apiRequest('POST', '/npcs/pending-messages/ack');
                } catch (e) {
                    // ACK is best-effort; failure is harmless (message may re-deliver)
                }

                return data.messages.length;
            } catch (e) {
                console.error('checkProactiveMessages failed:', e);
            }
            return 0;
        },

        // ---- Cross-component coordination ----
        openConv(convId) {
            appStore.currentConvId = convId;
        },

        openNpcWizard(editName) {
            if (editName) {
                this.wizardEditName = editName;
                this.$nextTick(() => {
                    this.$refs.wizard.open(editName);
                });
            } else {
                this.wizardEditName = null;
                this.$nextTick(() => {
                    this.$refs.wizard.open(null);
                });
            }
        },

        onWizardSaved() {
            if (this.$refs.npcManager) {
                this.$refs.npcManager.loadConfigs();
            }
        },

        async onAdvanceDay(newDay) {
            await this.refreshAllData();
            if (this.$refs.godPanel) {
                this.$refs.godPanel.refresh();
            }
            appendMessage('system_log', {
                sender: 'system',
                content: `⏩ 时间推进到第 ${newDay} 天`,
                time: new Date().toISOString()
            });
        },

        startContention() {
            if (this.$refs.chatArea) {
                this.$refs.chatArea.startContention();
            }
        },

        parsePythonDate(s) {
            if (!s) return 0;
            const ts = new Date(s).getTime();
            if (!isNaN(ts)) return ts;
            return new Date(s.replace(' ', 'T')).getTime();
        }
    }
};
