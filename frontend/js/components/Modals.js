/* ================================
   Modals — 弹窗集合 (群聊/NPC对话/详情/推进确认)
   ================================ */

import { npcStore } from '../stores/npcStore.js';
import { timelineStore } from '../stores/timelineStore.js';
import * as api from '../api.js';
import { makeGroupConvId, makeNpcNpcConvId, upsertConversation, getConversation } from '../storage.js';
import { addToast } from './toastBus.js';

export const Modals = {
    name: 'Modals',
    emits: ['openConv', 'advanceDay'],
    setup() {
        return { npcStore, timelineStore };
    },
    template: `
        <!-- 群聊弹窗 -->
            <div class="modal-overlay" v-if="showGroup" style="display:flex;" @click.self="showGroup = false">
                <div class="modal">
                    <h3>👥 新建群聊</h3>
                    <p>选择要加入群聊的 NPC：</p>
                    <div class="checkbox-group">
                        <label v-for="n in npcStore.npcs" :key="n.name" class="checkbox-label">
                            <input type="checkbox" :value="n.name" v-model="groupSelected"> {{ n.name }} ({{ n.title }})
                        </label>
                    </div>
                    <div class="modal-buttons">
                        <button class="btn" @click="showGroup = false">取消</button>
                        <button class="btn btn-primary" @click="createGroupChat">创建并开始抢话</button>
                    </div>
                </div>
            </div>

            <!-- NPC对话弹窗 -->
            <div class="modal-overlay" v-if="showNpcChat" style="display:flex;" @click.self="showNpcChat = false">
                <div class="modal">
                    <h3>💬 NPC 对话</h3>
                    <p>选择两个 NPC 开始自然对话：</p>
                    <div class="npc-chat-selects">
                        <select v-model="npcChatA"><option value="">-- 选择NPC A --</option>
                            <option v-for="n in npcStore.npcs" :key="n.name" :value="n.name">{{ n.name }} ({{ n.title || '' }})</option>
                        </select>
                        <span class="npc-chat-vs">↔</span>
                        <select v-model="npcChatB"><option value="">-- 选择NPC B --</option>
                            <option v-for="n in npcStore.npcs" :key="n.name" :value="n.name">{{ n.name }} ({{ n.title || '' }})</option>
                        </select>
                    </div>
                    <p class="modal-hint" style="color:#e74c3c">{{ npcChatHint }}</p>
                    <div class="modal-buttons">
                        <button class="btn" @click="showNpcChat = false">取消</button>
                        <button class="btn btn-primary" @click="createNpcChat">开始对话</button>
                    </div>
                </div>
            </div>

            <!-- NPC详情弹窗 -->
            <div class="modal-overlay" v-if="showDetail" style="display:flex;" @click.self="showDetail = false">
                <div class="modal">
                    <h3>{{ detailName }} · {{ detailData.title || '' }}</h3>
                    <div class="npc-detail-card">
                        <div class="detail-section"><span class="detail-label">📍</span> {{ detailData.location || '' }} · {{ detailData.activity || '' }}</div>
                        <div class="detail-section"><strong>核心性格</strong><p>{{ detailData.core_personality || '' }}</p></div>
                        <div class="detail-section"><strong>说话风格</strong><p>{{ detailData.speaking_style || '' }}</p></div>
                        <div class="detail-section"><strong>习惯</strong><div><span v-for="q in (detailData.quirks || [])" :key="q" class="npc-tag">{{ q }}</span></div></div>
                        <div class="detail-section"><strong>开心的事</strong><div><span v-for="q in (detailData.emotional_triggers?.positive || [])" :key="q" class="npc-tag positive">{{ q }}</span></div></div>
                        <div class="detail-section"><strong>不爽的事</strong><div><span v-for="q in (detailData.emotional_triggers?.negative || [])" :key="q" class="npc-tag negative">{{ q }}</span></div></div>
                        <div class="detail-section"><strong>雷区</strong><p>{{ detailData.pet_peeves || '' }}</p></div>
                        <div class="detail-section"><strong>专长</strong><p>{{ detailData.expertise || '' }}</p></div>
                        <div class="detail-section"><strong>爱好</strong><p>{{ detailData.hobbies || '' }}</p></div>
                    </div>
                    <div class="modal-buttons">
                        <button class="btn btn-primary" @click="editFromDetail">✏️ 编辑</button>
                        <button class="btn" style="color:var(--danger)" @click="deleteFromDetail">🗑 删除</button>
                        <button class="btn" @click="showDetail = false">关闭</button>
                    </div>
                </div>
            </div>

            <!-- 推进确认弹窗 -->
            <div class="modal-overlay" v-if="showAdvance" style="display:flex;" @click.self="showAdvance = false">
                <div class="modal">
                    <h3>⚡ 推进时间线</h3>
                    <p>确定要推进到第 <strong>{{ timelineStore.currentDay + 1 }}</strong> 天吗？</p>
                    <p class="modal-warning">⚠️ 此操作不可撤销</p>
                    <div class="modal-buttons">
                        <button class="btn" @click="showAdvance = false">取消</button>
                        <button class="btn btn-primary" @click="confirmAdvance">确定推进</button>
                    </div>
                </div>
        </div>`,
    data() {
        return {
            showGroup: false,
            showNpcChat: false,
            showDetail: false,
            showAdvance: false,

            groupSelected: [],
            npcChatA: '',
            npcChatB: '',
            npcChatHint: '',

            detailName: '',
            detailData: {},
        };
    },
    methods: {
        openGroupModal() { this.showGroup = true; this.groupSelected = []; },
        openNpcChatModal() {
            this.showNpcChat = true;
            this.npcChatA = '';
            this.npcChatB = '';
            this.npcChatHint = '';
        },
        openNpcDetail(name) {
            this.showDetail = true;
            this.loadDetail(name);
        },
        openAdvanceModal() { this.showAdvance = true; },

        async createGroupChat() {
            const names = this.groupSelected;
            if (names.length < 2) { alert('请至少选择 2 个 NPC'); return; }
            this.showGroup = false;
            const convId = makeGroupConvId();
            const conv = {
                id: convId, type: 'group',
                name: '群聊 (' + names.join(', ') + ')',
                participants: names,
                lastMsg: '', lastTime: new Date().toISOString(), unread: 0
            };
            upsertConversation(conv);
            this.$emit('openConv', convId);
            setTimeout(() => this.$emit('startContention'), 500);
        },

        async createNpcChat() {
            const a = this.npcChatA, b = this.npcChatB;
            if (!a || !b) { this.npcChatHint = '请选择两个NPC'; return; }
            if (a === b) { this.npcChatHint = '请选择两个不同的NPC'; return; }
            this.showNpcChat = false;
            try {
                await api.triggerNpcNpcChat(a, b);
                const convId = makeNpcNpcConvId(a, b);
                if (!getConversation(convId)) {
                    upsertConversation({
                        id: convId, type: 'npcnpc',
                        name: `${a} ↔ ${b}`,
                        participants: [a, b],
                        lastMsg: '', lastTime: new Date().toISOString(), unread: 0
                    });
                }
                this.$emit('openConv', convId);
            } catch (e) {
                if (e.status === 409) {
                    alert('已有对话正在进行，请等待结束后再试');
                } else {
                    alert(`触发失败: ${e.message || '未知错误'}`);
                }
            }
        },

        async loadDetail(name) {
            this.detailName = name;
            try {
                const data = await api.fetchNpcConfig(name);
                this.detailData = data;
            } catch (e) {
                console.error('获取NPC详情失败:', e);
            }
        },

        editFromDetail() {
            this.showDetail = false;
            if (this.detailName) {
                this.$parent.$refs.wizard.open(this.detailName);
            }
        },

        async deleteFromDetail() {
            if (!this.detailName) return;
            if (!confirm(`确定删除NPC "${this.detailName}" 吗？此操作不可恢复。`)) return;
            try {
                await api.deleteNpcConfig(this.detailName);
                this.showDetail = false;
                this.$parent.$refs.npcManager.loadConfigs();
            } catch (e) {
                if (e.status === 403) alert('内置NPC不能删除');
                else alert(`删除失败: ${e.message}`);
            }
        },

        async confirmAdvance() {
            this.showAdvance = false;
            try {
                const result = await api.advanceDay(timelineStore.activeTimelineId);
                timelineStore.currentDay = result.new_day;
                this.$emit('advanceDay', result.new_day);
            } catch (e) {
                alert('推进失败: ' + (e.detail || e.message));
            }
        }
    }
};
