# Vue 3 CDN 前端重设计

## Context

当前 React + TypeScript + Vite 前端存在以下问题：
- 构建工具链太重（node_modules 64MB+、Vite/TypeScript 编译报错）
- 重写后原有页面功能和交互效果丢失（WeChat 风格对话列表、NPC 自由讨论、状态轮询指示器等）
- 项目规模不需要 React 级别的框架
- 开发者偏好原生 JS 的直观可控

**目标：** 基于 `frontend-old/` 备份的原生 JS 版本，用 Vue 3 CDN 模式替代手动 DOM 操作，保留所有原始功能，彻底丢掉构建工具链。

## 方案概要

**Vue 3 CDN 模式** — `<script src="unpkg.com/vue@3/dist/vue.global.prod.js">` 直接引入，零 npm 依赖。

- Vue 的 `reactive()` 替代手写的 pub/sub `STATE` + `on/emit`
- Vue 模板语法 `v-for` `v-if` `v-model` 替代 `innerHTML` 拼接
- 组件文件用纯 JS 对象定义（Options API），不需要 `.vue` 单文件编译
- 所有静态文件由 BFF 的 `express.static` 直接托管

## 架构对比

```
Before (frontend-old/)          After (frontend/)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
index.html (一切嵌在DOM里)       index.html (CDN引用Vue + <div id="app">)
css/style.css                   css/style.css (搬过来，微调)
js/state.js (pub/sub)           js/stores/appStore.js (reactive)
                                js/stores/npcStore.js
                                js/stores/timelineStore.js
js/api.js (fetch封装)           js/api.js (基本不动)
js/storage.js (localStorage)    js/storage.js (基本不动)
js/app.js (1300+行，面条代码)    js/components/AppShell.js
                                js/components/TopBar.js
                                js/components/ConvList.js
                                js/components/ChatArea.js
                                js/components/GodPanel.js
                                js/components/NpcManager.js
                                js/components/NpcWizard.js
                                js/components/Modals.js
                                js/components/Toast.js
js/god.js (260行)               ─ 合并到 GodPanel 组件 ─
                                js/app.js (createApp组装，~30行)
```

## Store 设计（3 个 reactive 单例）

### `appStore.js`
```js
{
  connected: false,       // 后端连接状态
  polling: false,         // 轮询进行中
  currentConvId: null,    // 当前打开的会话ID
  currentConv: null,      // 当前会话对象
  chatMode: '1v1',        // '1v1' | 'group' | 'npcnpc'
  abortContention: null,  // SSE AbortController
}
```

### `npcStore.js`
```js
{
  npcs: [],               // { name, title, state, affinity, level }
  npcStates: [],          // /api/npcs/states 原始返回
  configs: [],            // NPC 配置摘要列表
  affinities: {},         // { npcName: affinityValue }
  npcNpcAffinities: {},   // NPC 间好感度矩阵
}
```

### `timelineStore.js`
```js
{
  timelines: [],          // 所有时间线
  activeTimelineId: null,
  currentDay: 0,
  events: [],             // 当前时间线的事件列表
}
```

## 组件设计

### 1. AppShell.js — 顶层容器
- 职责：提供顶栏+侧栏+聊天区+抽屉的整体布局框架
- 控制 GodPanel、NpcManager 抽屉的开闭状态
- 管理群聊/NPC对话/详情/推进确认 4 个弹窗的显示

### 2. TopBar.js — 顶部导航栏
- 连接状态指示灯（绿/红）
- 时间线选择器（`<select>` 绑定 `timelineStore.timelines`）
- 当前天数显示
- +1天推进按钮
- 暂停/恢复按钮（读 `simulation/status`）
- 上帝界面、NPC管理开关按钮
- 轮询状态指示器
- 数据来源：`appStore.connected`、`timelineStore`

### 3. ConvList.js — 微信风格对话列表
- 搜索过滤输入框（按名称/参与者）
- 新建群聊、NPC对话按钮
- 对话项列表（头像、名称、最后消息预览、时间、未读角标）
- 三种类型：1v1（单字头像）、群聊（👥）、NPC间对话（💬）
- 1v1 对话项带有"强制搭话"小铃铛按钮
- 底部状态摘要：空闲🟢/聊天🟡/繁忙🔴/平均好感度❤️
- 数据来源：`storage.js` 会话列表 + `npcStore` NPC 状态
- 点击 → 设置 `appStore.currentConvId`，触发 ChatArea 刷新

### 4. ChatArea.js — 聊天核心（最复杂组件，~200行）
- 顶栏：会话名称 + 副标题（好感度/群成员/NPC间好感度）
- 群聊模式：显示"开始抢话"和删除按钮
- NPC间对话模式：只读，输入框禁用
- 消息列表：日期分隔线 + 消息气泡（自己蓝色靠右 / NPC白色靠左）
- 抢话状态条（spinner + "NPC自由讨论中..." + 停止按钮）
- 底部输入区：textarea（Enter发送，Shift+Enter换行）
- **SSE 流处理（核心逻辑，直接从 app.js 搬）：**
  1. `send()` → 本地回显 player 消息
  2. POST `/api/chat/scene` 带 `npc_names`、`message`、`history`
  3. `fetch` + `ReadableStream` 逐行解析 `data: ` SSE 事件
  4. 每个 `{ speaker, content }` 事件 push 到 messages 数组
  5. `{ type: 'done' }` 事件 → 更新好感度到 `npcStore`
  6. `{ type: 'error' }` → 显示错误消息
- 消息持久化：通过 `storage.js` 读写 localStorage
- 数据来源：`storage.js` load/save + SSE 实时流

### 5. GodPanel.js — 上帝界面抽屉（从 god.js 搬）
- 时间线管理表格：名称/天数/事件数/切换按钮
- 创建新时间线输入框
- 今日事件编辑器：textarea + 字数统计 + 覆盖保存
- Day 0 禁用编辑，提示"先推进到第1天"
- 历史事件列表（只读，按天分组，最新在前）
- 数据来源：`timelineStore` + API 调用

### 6. NpcManager.js — NPC 角色管理面板
- NPC 卡片列表（头像、名称、职位、性格简述、内置标签）
- 卡片操作按钮：编辑、删除（内置NPC不可删）
- 点击卡片 → 打开详情弹窗
- "创建新NPC"按钮 → 打开 NpcWizard

### 7. NpcWizard.js — NPC 创建/编辑 4 步向导
- Step 1: 基本信息（名称、职位、位置、典型活动）+ AI生成入口
- Step 2: 性格说话（核心性格、性格简述、说话风格、风格简述）
- Step 3: 习惯情绪（习惯、开心的事、不爽的事、雷区）
- Step 4: 背景专长（工作背景、专长技能、爱好）
- 步骤指示器（高亮当前步骤）
- 上一步/下一步/保存导航
- AI生成功能：POST `/npc-configs/generate`，返回结果填充表单
- 编辑模式：从 `/npc-configs/{name}` 加载已有数据，名称不可改
- 保存：POST `/npc-configs` 或 PUT `/npc-configs/{name}`

### 8. Modals.js — 弹窗集合
4 个子弹窗：
- **群聊弹窗**：勾选 NPC 复选框，至少选2个，确认创建
- **NPC对话弹窗**：两个下拉选择框（A/B），触发 NPC 间对话
- **NPC详情弹窗**：完整展示单个 NPC 配置（核心性格、说话风格、习惯、情绪触发、雷区、专长、爱好），含编辑和删除按钮
- **推进确认弹窗**：确认推进到第N天，显示不可撤销警告

### 9. Toast.js — 通知提示
- 右上角弹出，自动 5 秒消失，最多 5 条
- 类型：NPC主动消息📩、NPC间对话💬
- 点击跳转到对应会话

## 数据流

```
api.js  ← 不动（缓存、重试、去重逻辑完整）
  ↓
Vue 组件 methods 调用 api.xxx()
  ↓
更新 store (reactive 单例)
  ↓
Vue 自动追踪依赖，模板重新渲染
  ↓
storage.js 负责 localStorage 持久化（会话列表 + 消息）
```

### 轮询流程（从 app.js 搬过来，5秒间隔）
1. `updateNpcStates()` → `npcStore.npcs` 更新状态
2. `checkProactiveMessages()` → `storage.js` 写入消息 → Toast 通知 → ACK
3. 每 30 秒：刷新好感度 + NPC间好感度矩阵 + 同步暂停状态
4. `fetchNpcNpcChatStatus()` → `handleNpcNpcChat()` 桥接 NPC 间对话到 ConvList

## 关键兼容性

### 后端 API 完全不变
所有 24 个端点地址、请求体、响应格式保持一致，`api.js` 原样复用。

### BFF 托管
`Dockerfile.bff` 中的 `COPY frontend/dist/` 改为 `COPY frontend/`（不再需要构建产物），`bff/src/index.ts` 的 `staticDir` 指向前端根目录。

### CSS
从 `frontend-old/css/style.css` 搬过来，只修改被 Vue 组件归类后的少量选择器。

## 不需要做的

- ❌ 不引入 Vue Router（单页应用，状态驱动导航足够）
- ❌ 不引入 Pinia（3 个 reactive 足够了）
- ❌ 不写 TypeScript（纯 JS + 可选 JSDoc）
- ❌ 不改后端 API
- ❌ 不引入任何 npm 包

## 验证

1. `index.html` 在浏览器直接打开（或通过 BFF `http://localhost:8090`）
2. 验证功能：
   - 页面加载 → 连接指示器变绿 → 对话列表出现
   - 点击 NPC → 发送消息 → SSE 流式返回 → 消息气泡逐条出现
   - 群聊 → 勾选 NPC → 开始抢话 → 多条消息同时出现
   - 上帝界面 → 时间线管理 → 编辑今日事件 → 推进天数
   - NPC 管理 → 创建/编辑/详情/删除
   - 好感度数值随对话变化
   - 刷新页面 → 对话记录从 localStorage 恢复
   - Docker compose up → BFF 直接托管前端静态文件
