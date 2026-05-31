/* ================================
   NpcWizard — NPC 创建/编辑 4 步向导
   ================================ */

import * as api from '../api.js';
import { npcStore } from '../stores/npcStore.js';
import { initDefaultConversations } from '../storage.js';

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

const TEXTAREA_FIELDS = ['core_personality', 'speaking_style', 'quirks', 'emotional_triggers_positive',
    'emotional_triggers_negative', 'pet_peeves', 'work_context'];

export const NpcWizard = {
    name: 'NpcWizard',
    props: {
        editName: { type: String, default: null }
    },
    emits: ['close', 'saved'],
    template: `
        <div v-if="visible" class="modal-overlay" style="display:flex;" @click.self="$emit('close')">
            <div class="modal modal-wizard">
                <h3>{{ wizardMode === 'edit' ? '编辑NPC: ' + editName : '创建新NPC' }}</h3>
                <div class="wizard-steps">
                    <span v-for="s in [1,2,3,4]" :key="s" class="wizard-step" :class="{ active: step === s }">
                        {{ ['① 基本信息','② 性格说话','③ 习惯情绪','④ 背景专长'][s-1] }}
                    </span>
                </div>
                <div v-if="step === 1 && wizardMode === 'create'" class="ai-generate-bar" style="display:flex;">
                    <input type="text" v-model="aiDesc" placeholder="✨ 一句话描述你想创建的NPC...（如：喜欢摇滚的暴躁设计师）" maxlength="200">
                    <button class="btn btn-primary btn-sm" :disabled="aiGenerating" @click="aiGenerate">{{ aiGenerating ? '生成中...' : 'AI生成' }}</button>
                </div>
                <div class="wizard-content">
                    <div v-for="f in currentFields" :key="f" class="wizard-field">
                        <label>{{ WIZARD_LABELS[f] }}</label>
                        <textarea v-if="isTextarea(f)" :id="'wiz_' + f" :rows="f === 'core_personality' ? 6 : 3"
                                  v-model="formData[f]" :disabled="wizardMode === 'edit' && f === 'name'"></textarea>
                        <input v-else :id="'wiz_' + f" v-model="formData[f]"
                               :disabled="wizardMode === 'edit' && f === 'name'">
                    </div>
                </div>
                <div class="modal-buttons">
                    <button class="btn" @click="$emit('close')">取消</button>
                    <button v-if="step > 1" class="btn" @click="navigate(-1)">上一步</button>
                    <button v-if="step < 4" class="btn btn-primary" @click="navigate(1)">下一步</button>
                    <button v-if="step === 4" class="btn btn-primary" @click="save">保存NPC</button>
                </div>
            </div>
        </div>`,
    data() {
        return {
            visible: false,
            step: 1,
            wizardMode: 'create',
            formData: {},
            aiDesc: '',
            aiGenerating: false,
        };
    },
    computed: {
        currentFields() {
            return WIZARD_FIELDS[this.step] || [];
        }
    },
    methods: {
        WIZARD_LABELS, // expose constant to template

        isTextarea(f) {
            return TEXTAREA_FIELDS.includes(f);
        },

        async open(editName) {
            this.step = 1;
            this.formData = {};
            this.wizardMode = editName ? 'edit' : 'create';

            if (editName) {
                try {
                    const data = await api.fetchNpcConfig(editName);
                    this.formData = {
                        name: editName, title: data.title || '', location: data.location || '',
                        activity: data.activity || '', core_personality: data.core_personality || '',
                        personality: data.personality || '', speaking_style: data.speaking_style || '',
                        style: data.style || '', quirks: (data.quirks || []).join('\n'),
                        emotional_triggers_positive: ((data.emotional_triggers || {}).positive || []).join('\n'),
                        emotional_triggers_negative: ((data.emotional_triggers || {}).negative || []).join('\n'),
                        pet_peeves: data.pet_peeves || '', work_context: data.work_context || '',
                        expertise: data.expertise || '', hobbies: data.hobbies || ''
                    };
                } catch (e) {
                    console.error('加载NPC配置失败:', e);
                }
            }

            this.visible = true;
        },

        navigate(delta) {
            this.step += delta;
            if (this.step < 1) this.step = 1;
            if (this.step > 4) this.step = 4;
        },

        async aiGenerate() {
            const desc = this.aiDesc.trim();
            if (!desc) return;
            this.aiGenerating = true;
            try {
                const result = await api.generateNpcConfig(desc);
                const c = result.config || {};
                this.formData = {
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
                this.aiDesc = '';
            } catch (e) {
                alert(`AI生成失败: ${e.message}`);
            } finally {
                this.aiGenerating = false;
            }
        },

        async save() {
            const d = this.formData;
            if (!d.title || !d.core_personality) {
                alert('职位和核心性格为必填字段');
                return;
            }

            const config = {
                title: d.title || '',
                location: d.location || '',
                activity: d.activity || '',
                core_personality: d.core_personality || '',
                personality: d.personality || '',
                speaking_style: d.speaking_style || '',
                style: d.style || '',
                quirks: (d.quirks || '').split('\n').filter(s => s.trim()),
                emotional_triggers: {
                    positive: (d.emotional_triggers_positive || '').split('\n').filter(s => s.trim()),
                    negative: (d.emotional_triggers_negative || '').split('\n').filter(s => s.trim())
                },
                pet_peeves: d.pet_peeves || '',
                work_context: d.work_context || '',
                expertise: d.expertise || '',
                hobbies: d.hobbies || ''
            };

            try {
                if (this.wizardMode === 'create') {
                    if (!d.name) { alert('NPC名称为必填'); return; }
                    await api.createNpcConfig({ name: d.name, ...config });
                    initDefaultConversations([d.name]);
                } else {
                    await api.updateNpcConfig(this.editName, config);
                }
                this.visible = false;
                this.$emit('saved');
            } catch (e) {
                alert(`${this.wizardMode === 'create' ? '创建' : '更新'}失败: ${e.message}`);
            }
        }
    }
};
