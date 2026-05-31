/* ================================
   App Store — 全局应用状态
   ================================ */

export const appStore = Vue.reactive({
    connected: false,
    polling: false,
    currentConvId: null,
    currentConv: null,
    abortContention: null,
});
