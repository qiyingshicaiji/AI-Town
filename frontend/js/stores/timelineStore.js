/* ================================
   Timeline Store — 时间线、当前天数、事件
   ================================ */

export const timelineStore = Vue.reactive({
    timelines: [],
    activeTimelineId: null,
    currentDay: 0,
    events: [],
});
