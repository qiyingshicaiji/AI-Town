/* ================================
   App Entry — Vue 3 应用组装 + 挂载
   ================================ */

import { AppShell } from './components/AppShell.js';

const app = Vue.createApp({
    template: `<app-shell></app-shell>`,
    components: { AppShell }
});

app.mount('#app');
