/* ================================
   ChatArea — 聊天核心 (SSE 流式 + 消息渲染)
   ================================ */

import { appStore } from '../stores/appStore.js';
import { npcStore } from '../stores/npcStore.js';
import { getConversation, loadMessages, saveMessages, appendMessage, markRead, removeConversation, getConversationList, makeNpcNpcConvId, upsertConversation } from '../storage.js';
import { API_BASE } from '../api.js';
import { addToast } from './toastBus.js';

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatMessageTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today - 86400000);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (msgDay.getTime() === today.getTime()) return timeStr;
    if (msgDay.getTime() === yesterday.getTime()) return `昨天 ${timeStr}`;
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth()+1}月${d.getDate()}日 ${timeStr}`;
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${timeStr}`;
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
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth()+1}月${d.getDate()}日`;
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

export const ChatArea = {
    name: 'ChatArea',
    setup() {
        return { appStore, npcStore };
    },
    template: `
        <section class="chat-area" id="chatArea">
            <div class="chat-panel active" id="chatPanel">
                <div class="chat-header">
                    <div class="chat-header-info">
                        <span id="chatTitle">{{ chatTitle }}</span>
                        <span class="chat-subtitle" id="chatSubtitle">{{ chatSubtitle }}</span>
                    </div>
                    <div class="chat-header-actions">
                        <button v-if="isGroup" class="btn btn-sm" @click="startContention">🎲 开始抢话</button>
                        <button v-if="currentConv" class="btn btn-sm" @click="deleteConv">🗑</button>
                    </div>
                </div>
                <div class="chat-messages" id="chatMessages" ref="msgContainer">
                    <div v-if="!messages.length" class="welcome-message">
                        <div class="welcome-icon">💬</div>
                        <p>{{ currentConv ? '和 ' + currentConv.name + ' 开始对话吧' : '点击左侧对话开始聊天' }}</p>
                    </div>
                    <template v-for="(msg, idx) in displayMessages" :key="idx">
                        <div v-if="msg._dateSep" class="message-date-separator">──── {{ msg._dateSep }} ────</div>
                        <div v-if="msg._type === 'system'" class="message-date-separator">{{ msg.content }}</div>
                        <div v-else class="message-row" :class="msg.sender === 'player' ? 'self' : 'other'">
                            <div class="message-avatar" :class="avatarClass(msg.sender)">{{ avatarText(msg.sender) }}</div>
                            <div class="message-body">
                                <span v-if="msg.sender !== 'player'" class="message-sender">{{ msg.sender }}</span>
                                <div class="message-bubble-wrapper">
                                    <div class="message-bubble">{{ msg.content }}</div>
                                    <span v-if="msg.time" class="message-time-inline">{{ formatMsgTime(msg.time) }}</span>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
                <div v-if="contending" class="contention-bar" id="contentionBar">
                    <div class="spinner"></div> NPC 自由讨论中...
                    <button class="btn btn-sm" @click="stopContention">停止</button>
                </div>
                <div class="chat-input-area">
                    <textarea v-model="inputText" class="chat-input"
                              :disabled="isReadonly"
                              :placeholder="isReadonly ? 'NPC 间对话（只读）' : '输入消息... (Enter发送, Shift+Enter换行)'"
                              rows="2" @keydown.enter.exact.prevent="sendMessage"></textarea>
                    <button class="btn btn-send" :disabled="isReadonly" @click="sendMessage">发送</button>
                </div>
            </div>
        </section>`,
    data() {
        return {
            currentConv: null,
            messages: [],
            inputText: '',
            contending: false,
        };
    },
    computed: {
        watchedConvId() {
            return appStore.currentConvId;
        },
        chatTitle() {
            return this.currentConv ? this.currentConv.name : '选择一个对话开始';
        },
        chatSubtitle() {
            if (!this.currentConv) return '';
            if (this.currentConv.type === 'group') {
                return '群聊 · ' + (this.currentConv.participants || []).join(', ');
            }
            if (this.currentConv.type === 'npcnpc') {
                const [a, b] = (this.currentConv.participants || []);
                const affData = (npcStore.npcNpcAffinities[a] && npcStore.npcNpcAffinities[a][b])
                    || (npcStore.npcNpcAffinities[b] && npcStore.npcNpcAffinities[b][a]) || {};
                const affText = affData.affinity != null ? ` · 好感度: ${Math.round(affData.affinity)}` : '';
                return 'NPC 间对话 · ' + (this.currentConv.participants || []).join(' ↔ ') + affText;
            }
            const npc = (npcStore.npcs || []).find(n => n.name === this.currentConv.name);
            return npc ? `${npc.title || ''} · 好感度: ${Math.round(npc.affinity || 50)}` : '';
        },
        isGroup() {
            return this.currentConv && this.currentConv.type === 'group';
        },
        isReadonly() {
            return this.currentConv && this.currentConv.type === 'npcnpc';
        },
        displayMessages() {
            const result = [];
            let lastDateKey = '';
            for (const msg of this.messages) {
                if (msg.type === 'system') {
                    result.push({ ...msg, _type: 'system' });
                    continue;
                }
                const msgDateKey = msg.time ? msg.time.substring(0, 10) : '';
                if (msgDateKey && msgDateKey !== lastDateKey) {
                    lastDateKey = msgDateKey;
                    const label = formatDateSeparator(msg.time);
                    if (label) {
                        result.push({ _dateSep: label });
                    }
                }
                result.push(msg);
            }
            return result;
        }
    },
    watch: {
        watchedConvId(newId) {
            if (newId) this.loadConversation(newId);
        }
    },
    mounted() {
        if (appStore.currentConvId) {
            this.loadConversation(appStore.currentConvId);
        }
    },
    methods: {
        formatMsgTime: formatMessageTime,

        loadConversation(convId) {
            const conv = getConversation(convId);
            if (!conv) return;
            this.currentConv = conv;
            appStore.currentConv = conv;
            markRead(convId);
            this.messages = loadMessages(convId);
            this.$nextTick(() => {
                const el = this.$refs.msgContainer;
                if (el) el.scrollTop = el.scrollHeight;
            });
        },

        avatarClass(sender) {
            if (sender === 'player') return 'player';
            if (sender === '张三') return 'npc-zhang';
            if (sender === '李四') return 'npc-li';
            if (sender === '王五') return 'npc-wang';
            return 'npc-zhang';
        },
        avatarText(sender) {
            if (sender === 'player') return '我';
            return (sender || '?')[0];
        },

        async sendMessage() {
            const text = this.inputText.trim();
            if (!text || !this.currentConv) return;
            this.inputText = '';

            const playerMsg = { sender: 'player', content: text, time: new Date().toISOString() };
            appendMessage(this.currentConv.id, playerMsg);
            markRead(this.currentConv.id);
            this.messages = loadMessages(this.currentConv.id);
            this.scrollToBottom();

            this.streamScene(text);
        },

        async streamScene(userMessage) {
            if (appStore.abortContention) {
                appStore.abortContention.abort();
                appStore.abortContention = null;
            }

            const conv = this.currentConv;
            const npcNames = conv.type === 'group' ? conv.participants : [conv.name];
            const history = loadMessages(conv.id).slice(-8);

            const controller = new AbortController();
            appStore.abortContention = controller;

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
                    signal: controller.signal
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
                                if (msg.affinity_updates) {
                                    for (const [name, data] of Object.entries(msg.affinity_updates)) {
                                        const npc = (npcStore.npcs || []).find(n => n.name === name);
                                        if (npc) {
                                            npc.affinity = data.affinity;
                                            npc.level = data.level;
                                        }
                                    }
                                }
                                return;
                            }
                            if (msg.speaker && msg.content) {
                                const stored = { sender: msg.speaker, content: msg.content, time: new Date().toISOString() };
                                appendMessage(conv.id, stored);
                                if (conv.id === appStore.currentConvId) markRead(conv.id);
                                this.messages = loadMessages(conv.id);
                                this.scrollToBottom();
                            }
                        } catch (e) { /* skip parse errors */ }
                    }
                }
            } catch (e) {
                if (e.name !== 'AbortError') {
                    this.messages.push({ type: 'system', content: `❌ ${e.message}`, time: new Date().toISOString() });
                }
            } finally {
                appStore.abortContention = null;
            }
        },

        async startContention() {
            if (!this.currentConv || this.currentConv.type !== 'group') return;
            this.contending = true;
            await this.streamScene('');
            this.contending = false;
        },

        stopContention() {
            if (appStore.abortContention) {
                appStore.abortContention.abort();
                appStore.abortContention = null;
            }
            this.contending = false;
        },

        deleteConv() {
            if (!this.currentConv) return;
            if (!confirm('删除此对话？聊天记录将丢失。')) return;
            const convId = this.currentConv.id;
            removeConversation(convId);
            this.currentConv = null;
            this.messages = [];
            appStore.currentConvId = null;
            appStore.currentConv = null;
        },

        scrollToBottom() {
            this.$nextTick(() => {
                const el = this.$refs.msgContainer;
                if (el) el.scrollTop = el.scrollHeight;
            });
        },

        // Called externally by polling for NPC-NPC chat messages
        receiveNpcNpcMessages(chat) {
            if (!chat.npc_a || !chat.npc_b) return null;

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
            }

            const existing = loadMessages(convId) || [];
            const existingKeys = new Set(existing.map(m => `${m.sender}::${m.content}`));

            let newCount = 0;
            for (const msg of chat.messages || []) {
                if (!msg.speaker || !msg.content) continue;
                const dedupeKey = `${msg.speaker}::${msg.content}`;
                if (existingKeys.has(dedupeKey)) continue;
                existingKeys.add(dedupeKey);
                newCount++;
                appendMessage(convId, { sender: msg.speaker, content: msg.content, time: new Date().toISOString() });
            }

            if (newCount > 0) {
                const lastMsg = chat.messages[chat.messages.length - 1];
                addToast(`NPC 对话: ${chat.npc_a} ↔ ${chat.npc_b}`, (lastMsg?.content || '').substring(0, 60), 'npcnpc', convId);
                if (convId === appStore.currentConvId) markRead(convId);
            }

            if (appStore.currentConvId === convId) {
                this.messages = loadMessages(convId);
                this.scrollToBottom();
            }

            return convId;
        }
    }
};
