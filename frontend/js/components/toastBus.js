/* ================================
   Toast 事件总线 — 全局通知
   ================================ */

export const toastBus = Vue.reactive([]);

export function addToast(title, text, type, convId) {
    const toast = { id: Date.now() + Math.random(), title, text, type, convId };
    toastBus.push(toast);
    if (toastBus.length > 5) toastBus.shift();
    setTimeout(() => {
        const idx = toastBus.findIndex(t => t.id === toast.id);
        if (idx >= 0) toastBus.splice(idx, 1);
    }, 5000);
}
