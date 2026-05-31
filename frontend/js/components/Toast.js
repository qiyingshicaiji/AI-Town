/* ================================
   Toast — 通知提示组件
   ================================ */

import { toastBus } from './toastBus.js';
import { appStore } from '../stores/appStore.js';

export const Toast = {
    name: 'Toast',
    template: `
        <div class="toast-container" id="toastContainer">
            <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type" @click="handleClick(t)">
                <span class="toast-icon">{{ t.type === 'npcnpc' ? '💬' : '📩' }}</span>
                <div class="toast-body">
                    <div class="toast-title">{{ t.title }}</div>
                    <div class="toast-text">{{ t.text }}</div>
                </div>
            </div>
        </div>`,
    setup() {
        return { toasts: toastBus };
    },
    methods: {
        handleClick(t) {
            if (t.convId) {
                appStore.currentConvId = t.convId;
            }
            const idx = toastBus.findIndex(x => x.id === t.id);
            if (idx >= 0) toastBus.splice(idx, 1);
        }
    }
};
