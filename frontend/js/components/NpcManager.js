/* ================================
   NpcManager — NPC 角色管理面板
   ================================ */

import { npcStore } from '../stores/npcStore.js';
import * as api from '../api.js';

export const NpcManager = {
    name: 'NpcManager',
    props: {
        open: Boolean
    },
    emits: ['close', 'openWizard', 'openDetail'],
    setup() {
        return { npcStore };
    },
    template: `
        <aside class="npc-manager-panel" :class="{ collapsed: !open }" id="npcManagerPanel">
                <div class="npc-manager-header">
                    <h2>⚙ NPC角色管理</h2>
                    <button class="btn btn-sm" @click="$emit('close')">✕</button>
                </div>
                <div class="npc-manager-body">
                    <div class="npc-manager-toolbar">
                        <button class="btn btn-primary" @click="$emit('openWizard', null)">+ 创建新NPC</button>
                    </div>
                    <div v-if="!configs.length" class="npc-list"><p class="god-hint">加载中...</p></div>
                    <div v-else class="npc-list" id="npcList">
                        <div v-for="n in configs" :key="n.name" class="npc-card" @click="$emit('openDetail', n.name)">
                            <div class="npc-card-avatar">{{ n.name[0] }}</div>
                            <div class="npc-card-info">
                                <div class="npc-card-name">{{ n.name }} <span v-if="n.is_builtin" class="npc-badge-builtin">内置</span></div>
                                <div class="npc-card-title">{{ n.title }}</div>
                                <div class="npc-card-personality">{{ n.personality || '' }}</div>
                            </div>
                            <div class="npc-card-actions" @click.stop>
                                <button class="btn btn-sm" @click="$emit('openWizard', n.name)">✏️</button>
                                <button v-if="!n.is_builtin" class="btn btn-sm" style="color:var(--danger)" @click="deleteNpc(n.name)">🗑</button>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        <div class="npc-manager-backdrop" :class="{ open: open }" @click="$emit('close')"></div>`,
    computed: {
        configs() {
            return npcStore.configs || [];
        }
    },
    watch: {
        open(val) {
            if (val) this.loadConfigs();
        }
    },
    methods: {
        async loadConfigs() {
            try {
                const data = await api.fetchNpcConfigs();
                npcStore.configs = data.npcs || [];
            } catch (e) {
                console.error('加载NPC配置失败:', e);
            }
        },
        async deleteNpc(name) {
            if (!confirm(`确定删除NPC "${name}" 吗？`)) return;
            try {
                await api.deleteNpcConfig(name);
                this.loadConfigs();
            } catch (e) {
                alert(`删除失败: ${e.message}`);
            }
        }
    }
};
