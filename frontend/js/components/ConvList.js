/* ================================
   ConvList — 微信风格对话列表
   ================================ */

import { appStore } from '../stores/appStore.js';
import { npcStore } from '../stores/npcStore.js';
import { getConversationList, markRead, make1v1ConvId, getConversation, upsertConversation, appendMessage } from '../storage.js';
import { initiateNpcChat } from '../api.js';

export const ConvList = {
    name: 'ConvList',
    emits: ['openGroupModal', 'openNpcChatModal'],
    setup() {
        return { appStore, npcStore };
    },
    template: `
        <aside class="conv-sidebar" id="convSidebar">
            <div class="sidebar-header">
                <div class="sidebar-search">
                    <input type="text" v-model="searchQuery" placeholder="🔍 搜索对话..." class="search-input">
                </div>
                <div class="sidebar-actions">
                    <button class="btn btn-sm" @click="$emit('openGroupModal')">👥 新建群聊</button>
                    <button class="btn btn-sm" @click="$emit('openNpcChatModal')">💬 NPC对话</button>
                </div>
            </div>
            <div class="conv-list" id="convList">
                <div v-if="!filteredConvs.length" class="loading-placeholder">暂无对话</div>
                <div v-for="conv in filteredConvs" :key="conv.id"
                     class="conv-item" :class="{ active: conv.id === appStore.currentConvId }"
                     @click="selectConv(conv.id)" :data-convid="conv.id">
                    <div class="conv-avatar" :class="avatarClass(conv)">{{ avatarText(conv) }}</div>
                    <div class="conv-info">
                        <div class="conv-name">{{ conv.name }}</div>
                        <div class="conv-preview">{{ conv.lastMsg || '点击开始对话' }}</div>
                    </div>
                    <div class="conv-meta">
                        <div class="conv-time">{{ formatTime(conv.lastTime) }}</div>
                        <span v-if="conv.unread" class="conv-unread">{{ conv.unread }}</span>
                        <button v-if="conv.type === '1v1'" class="btn-initiate"
                                @click.stop="handleInitiate(conv.name, $event)" title="让NPC主动搭话">🔔</button>
                    </div>
                </div>
            </div>
            <div class="sidebar-footer">
                <div class="status-summary">
                    <span>🟢<span>{{ idleCount }}</span></span>
                    <span>🟡<span>{{ chattingCount }}</span></span>
                    <span>🔴<span>{{ busyCount }}</span></span>
                    <span>| ❤️<span>{{ avgAffinity }}</span></span>
                </div>
            </div>
        </aside>
        <div class="sidebar-backdrop" id="sidebarBackdrop" @click="closeSidebar"></div>`,
    data() {
        return {
            searchQuery: '',
            convs: [],
        };
    },
    computed: {
        filteredConvs() {
            const q = (this.searchQuery || '').toLowerCase();
            if (!q) return this.convs;
            return this.convs.filter(c =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.participants || []).some(p => p.toLowerCase().includes(q))
            );
        },
        idleCount() {
            return (npcStore.npcs || []).filter(n => n.state === 'idle').length;
        },
        chattingCount() {
            return (npcStore.npcs || []).filter(n => n.state === 'chatting').length;
        },
        busyCount() {
            return (npcStore.npcs || []).filter(n => n.state === 'busy').length;
        },
        avgAffinity() {
            const npcs = npcStore.npcs;
            if (!npcs.length) return 0;
            const avg = npcs.reduce((s, n) => s + (n.affinity || 50), 0) / npcs.length;
            return Math.round(avg);
        },
    },
    mounted() {
        this.refreshList();
        // Poll for updates every 2 seconds (lightweight, just reads localStorage)
        this._pollTimer = setInterval(() => this.refreshList(), 2000);
    },
    beforeUnmount() {
        if (this._pollTimer) clearInterval(this._pollTimer);
    },
    methods: {
        refreshList() {
            this.convs = getConversationList();
        },
        selectConv(convId) {
            appStore.currentConvId = convId;
            markRead(convId);
            this.refreshList();
            if (window.innerWidth < 768) {
                this.closeSidebar();
            }
        },
        closeSidebar() {
            const sidebar = document.getElementById('convSidebar');
            const backdrop = document.getElementById('sidebarBackdrop');
            if (sidebar) sidebar.classList.remove('open');
            if (backdrop) backdrop.classList.remove('open');
        },
        avatarClass(conv) {
            if (conv.type === 'group') return 'group';
            if (conv.type === 'npcnpc') return 'npcnpc';
            if (conv.name === '张三') return 'npc-zhang';
            if (conv.name === '李四') return 'npc-li';
            if (conv.name === '王五') return 'npc-wang';
            return 'npc-zhang';
        },
        avatarText(conv) {
            if (conv.type === 'group') return '👥';
            if (conv.type === 'npcnpc') return '💬';
            return (conv.name || '?')[0];
        },
        formatTime(isoStr) {
            if (!isoStr) return '';
            const d = new Date(isoStr);
            const now = new Date();
            if (d.toDateString() === now.toDateString()) {
                return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            }
            return `${d.getMonth()+1}/${d.getDate()}`;
        },
        async handleInitiate(npcName, event) {
            event.stopPropagation();
            try {
                const msg = await initiateNpcChat(npcName);
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
                    content: msg.content || msg.message || '',
                    time: msg.timestamp || new Date().toISOString()
                });
                this.refreshList();
                if (appStore.currentConvId === convId) {
                    appStore.currentConvId = null;
                    setTimeout(() => { appStore.currentConvId = convId; }, 0);
                } else {
                    appStore.currentConvId = convId;
                }
            } catch (e) {
                console.error('强制搭话失败:', e);
            }
        }
    }
};
