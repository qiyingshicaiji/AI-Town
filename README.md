# AI-Town 多智能体 NPC 社交模拟系统

AI-Town 是基于 HelloAgents 框架的多智能体社交模拟平台，支持复杂的 NPC 角色建模、记忆管理、情感演化和自主行为。项目采用前后端分离架构，后端基于 FastAPI，前端为 Vue 3（CDN 全局构建）+ 原生 JS 模块，支持一键 Docker Compose 启动。

## 核心特性

### 拟人化 NPC 角色系统

每个 NPC 拥有独立的 **性格画像**、**说话风格**、**情绪触发点** 和 **雷区**，而非简单的角色标签。NPC 可以通过前端向导动态创建/编辑/删除，支持 AI 一句话生成完整角色配置。

| NPC | 职位 | 性格核心 | 说话风格 |
|-----|------|---------|---------|
| **张三** | Python 工程师 | 内向技术宅，社恐但有深度，对代码有偏执热爱 | 语速慢，句子短，用技术类比解释生活 |
| **李四** | 产品经理 | 表面社交达人实则怕冷场，擅长读人 | 语速快，爱用网络热梗 |
| **王五** | UI 设计师 | 内心丰富但表达克制，追求"好看"二字 | 画面感强，经常说"这个感觉不对" |

### 多层记忆系统（4 通道）

- **工作记忆 (Working)**：短期对话，容量 50 条，最多 4000 tokens
- **情景记忆 (Episodic)**：长期持久化（SQLite + Qdrant 向量检索），容量 150 条，支持遗忘机制
- **感知记忆 (Perceptual)**：NPC 观察环境/他人对话的感知记录
- **自动整合**：工作记忆 → 情景记忆自动迁移；低重要性记忆自动遗忘

### 时间线系统

- 支持多条独立时间线并行，每条有独立的事件历史和天数
- 记忆按时间线隔离，切换时间线后 NPC 只记得当前时间线的经历
- 每日事件驱动 NPC 间关系变化

### 5 级好感度系统

- **挚友 (80-100)**：非常热情，主动关心，分享私事
- **亲密 (60-79)**：友好热情，愿意多聊
- **友好 (40-59)**：礼貌友善，保持专业距离
- **熟悉 (20-39)**：略显生疏，回答简洁
- **陌生 (0-19)**：冷淡疏离，回答极其简短

好感度通过 **LLM 情感分析** 自动调整，影响 NPC 的对话风格和态度。**NPC 之间也有对称好感度矩阵**，事件关键词自动触发关系变化。

### NPC 主动行为系统

- **自主思考**：NPC 根据好感度、时间线事件、感知观察和空闲时长自动决定是否主动发起对话
- **NPC 间自主聊天**：好感度 ≥ 阈值时，两个空闲 NPC 自动触发对话（概率 + 冷却控制）
- **抢话/群聊**：启发式意愿评分竞争发言权，NPC 根据话题相关性、点名、专业匹配度抢话
- **防重复发言**：三维度检测（Jaccard 2-gram / 语义向量余弦 / 实词关键词重叠），retry 时自动换话题种子

### 感知引擎

NPC 通过三个通道观察世界，不再只依赖群聊上下文认识彼此：

- **时间线事件观察**：所有 NPC 感知到办公室发生的事件
- **NPC 间对话观察**：未参与对话的 NPC 作为旁观者记录感知
- **新同事入职通知**：创建新 NPC 时自动向所有现有 NPC 注入感知记忆

### 统一对话流（自动多轮）

所有 NPC 对话统一走 `generate_npc_speech()`（单次发言生成 + 三维度去重 + 自动记忆写入），通过 `generate_conversation_flow()` 包装实现自动多轮循环：

- **1v1**：NPC 连续回复多轮，自然展开对话
- **群聊**：启发式评分竞争发言权，得分最高者抢话，直到没人想发言或达上限
- **NPC 间**：两个 NPC 交替发言，记忆系统驱动话题连续性

相比旧的批量场景生成，统一架构保留了实时动态性（用户可随时打断插话），消除了代码冗余。

### 知识库 RAG 与反幻觉机制

- **KnowledgeManager**：基于 hello_agents RAGTool，MarkItDown 多格式文档转换（PDF/Word/图片等 45+ 格式），自动分块 + 向量嵌入 + Qdrant 存储
- **嵌入模型**：通过 hello_agents 的 `EMBED_MODEL_TYPE` 环境变量配置，支持 DashScope（OpenAI 兼容 REST）→ local（sentence-transformers）→ TF-IDF 三级回退
- **双 LLM 调用**：低温（0.1）提取事实 → 高温（0.9）角色演绎，兼顾准确性与人格表现力
- **同事名册注入**：所有对话 prompt 的角色档案中动态嵌入全员名册，NPC"认识"所有同事，名册外的就说"不太清楚"

### NPC 配置管理

- **前端向导**：4 步表单（基本信息 / 性格说话 / 情绪习惯 / 工作爱好），支持创建和编辑
- **AI 一句话生成**：输入自然语言描述自动生成完整角色 JSON
- **角色卡片**：查看/编辑/删除，内置 NPC 受保护不可删除
- **JSON 持久化**：npc_configs.json，支持 Docker 卷挂载，重启不丢数据

### 仿真控制

- **暂停/恢复**：一键停止/恢复所有后台 LLM 调用（NPC 对话、自主思考、感知扫描），节省 API 配额
- **手动触发 NPC 间对话**：从侧边栏选择两个 NPC 即可触发自然对话
- **强制 NPC 主动搭话**：每个 NPC 行可强制其主动发起消息给玩家

### 其他特性

- **角色成长系统**：累计 20 条新记忆后自动分析并生成角色成长提示
- **消息时间戳**：混合模式（当天仅显示时间 / 昨天 / 日期+时间），日期分隔条
- **SSE 流式对话**：前端实时流式展示 NPC 回复，支持中止
- **Toast 通知**：NPC 主动消息、NPC 间对话弹窗提醒，最多 5 条
- **完整日志系统**：对话、好感度变化、记忆操作全程可追溯
- **配置化参数**：所有可调参数集中在 `config.py`，环境变量支持 `.env`

---

## 项目结构

```
AI-Town/
├── backend/
│   ├── main.py                  # FastAPI 应用 & 全部 API 路由
│   ├── agents.py                # NPC Agent 管理、CRUD、统一对话流、防重复发言、记忆写入
│   ├── relationship_manager.py  # 好感度系统（玩家 & NPC 间）
│   ├── knowledge_manager.py     # 知识库 RAG 管理器（基于 hello_agents RAGTool）
│   ├── state_manager.py         # 后台定时循环调度 + 暂停控制
│   ├── autonomous_thinker.py    # NPC 主动发起对话引擎
│   ├── npc_npc_chat.py          # NPC 间聊天触发 & 管理
│   ├── group_chat_engine.py     # 抢话/群聊竞争引擎
│   ├── perception_engine.py     # NPC 感知引擎（环境观察）
│   ├── character_evolution.py   # 角色成长追踪
│   ├── timeline_manager.py      # 时间线/天数/事件管理
│   ├── logger.py                # 日志系统
│   ├── config.py                # 全局配置
│   ├── models.py                # Pydantic 数据模型
│   ├── npc_configs.json         # NPC 配置持久化文件
│   ├── knowledge/               # 知识库 Markdown 文件
│   │   └── ai_town.md           # 办公室背景设定
│   ├── memory_data/             # 每个 NPC 的记忆数据（SQLite）
│   ├── timeline_data/           # 时间线持久化
│   └── logs/                    # 日志文件
├── bff/                         # Express BFF 层（安全 + API 代理 + 静态文件）
│   ├── src/index.ts             # Express 入口
│   ├── src/routes/api.ts        # /api/* → FastAPI 代理（含 SSE 流式穿透）
│   ├── src/routes/health.ts     # 聚合健康检查
│   └── src/middleware/          # helmet + CORS + 限流 + 日志
├── frontend/                    # Vue 3（CDN 全局构建）+ 原生 JS 前端
│   ├── index.html               # 入口 HTML
│   ├── css/style.css            # 全局样式
│   └── js/
│       ├── app.js               # Vue 应用入口
│       ├── api.js               # API 客户端
│       ├── storage.js           # 本地存储封装
│       ├── vue.global.prod.js   # Vue 3 生产环境 CDN 构建
│       ├── components/          # Vue 组件
│       │   ├── AppShell.js      # 应用外壳（三栏布局）
│       │   ├── ChatArea.js      # 聊天消息区（SSE 流式渲染）
│       │   ├── ConvList.js      # 对话列表
│       │   ├── GodPanel.js      # 上帝面板（时间线/事件）
│       │   ├── Modals.js        # 模态框集合
│       │   ├── NpcManager.js    # NPC 管理面板
│       │   ├── NpcWizard.js     # NPC 创建向导
│       │   ├── Toast.js         # Toast 通知组件
│       │   ├── toastBus.js      # Toast 事件总线
│       │   └── TopBar.js        # 顶栏
│       └── stores/              # Vue 响应式 stores
│           ├── appStore.js      # 应用全局状态
│           ├── npcStore.js      # NPC 列表/状态
│           └── timelineStore.js # 时间线状态
├── docker-compose.yml           # Docker 编排（backend + BFF + 可选 Qdrant/Neo4j）
├── Dockerfile.backend           # 后端镜像（Python 3.11）
├── Dockerfile.bff               # BFF 镜像（Node 20 Alpine）
└── README.md
```

---

## 后台调度架构

```
asyncio 事件循环
├── _npc_chat_loop()       15s ──→ NPC 间聊天触发检查
│    └── 成功后通知感知引擎观察
├── _think_loop()          15s ──→ NPC 主动向玩家发起对话
├── _perception_loop()     60s ──→ 时间线事件感知扫描
└── 暂停控制  ──→ POST /simulation/pause → 停止所有后台 LLM 调用
    恢复控制  ──→ POST /simulation/resume
```

前端轮询（5 秒间隔）：NPC 状态、待处理主动消息、NPC 间聊天状态与历史、好感度（30 秒间隔）。

---

## 对话架构

### 用户 → NPC 对话流程（自动多轮）

```
前端 sendMessage()
  → POST /chat/scene (SSE)
    → generate_conversation_flow()
      → _retrieve_knowledge()        # RAG 知识检索（用户消息触发）
      → 循环每轮：
        → 评分选发言人（群聊用 GroupChatEngine._score_npc 抢话）
        → generate_npc_speech()      # 统一发言生成
          → 人格上下文 + 同事名册 + 记忆检索 + 防重复
          → record_npc_speech()      # 自动写入自己 + 听众记忆
      → SSE 逐条推送 [{speaker, content}, ...]
      → 事后：好感度分析 + 感知引擎观察 + 自主思考记录
```

### NPC 间对话 / 主动搭话 / 群聊抢话流程

```
后台循环触发
  → generate_conversation_flow() 或 generate_npc_speech()
    → 人格上下文 + 同事名册 + 记忆检索 + 防重复
    → 防重复检测（三维度）→ 重复则 retry with topic seeds
    → record_npc_speech() → 写入自己 + 听众记忆
```

---

## API 概览（41 个端点）

### 对话（5）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat` | 1v1 NPC 对话 |
| POST | `/chat/scene` | 统一对话（SSE 流式自动多轮，含好感度分析） |
| POST | `/group-chat` | 群聊 |
| POST | `/group-chat/contention` | 群聊抢话（全量） |
| POST | `/group-chat/contention/stream` | 群聊抢话（SSE 流式） |

### NPC 信息 & 状态（4）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/npcs` | NPC 列表 |
| GET | `/npcs/{name}` | NPC 详情 |
| GET | `/npcs/states` | 状态机（idle/chatting/busy） |
| POST | `/npcs/states/reset` | 强制重置状态 |
| GET | `/` | API 根信息 |
| GET | `/health` | 健康检查 |

### 记忆 & 感知（3）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/npcs/{name}/memories` | 记忆列表 |
| DELETE | `/npcs/{name}/memories` | 清空记忆 |
| GET | `/npcs/{name}/perceptions` | 感知观察 |

### 好感度（4）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/npcs/{name}/affinity` | NPC 对玩家好感度 |
| GET | `/affinities` | 所有 NPC 好感度 |
| PUT | `/npcs/{name}/affinity` | 手动设置（测试用） |
| GET | `/npcs/npc-affinities` | NPC 间好感度矩阵 |

### 时间线（8）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/timelines` | 列出所有时间线 |
| POST | `/timelines` | 创建时间线 |
| GET | `/timelines/{id}` | 时间线详情 |
| GET | `/timelines/{id}/events` | 所有事件 |
| GET | `/timelines/{id}/today` | 今日事件 |
| PUT | `/timelines/{id}/events/today` | 设置今日事件 |
| POST | `/timelines/{id}/advance` | 推进天数 |
| PUT | `/timelines/{id}/active` | 切换活跃时间线 |

### NPC 配置管理（6）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/npc-configs` | 所有配置摘要 |
| GET | `/npc-configs/{name}` | 单个完整配置 |
| POST | `/npc-configs` | 创建新 NPC |
| PUT | `/npc-configs/{name}` | 更新配置（部分合并） |
| DELETE | `/npc-configs/{name}` | 删除（内置保护） |
| POST | `/npc-configs/generate` | AI 生成 |

### 仿真控制（3）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/simulation/status` | 仿真状态 |
| POST | `/simulation/pause` | 暂停后台循环 |
| POST | `/simulation/resume` | 恢复后台循环 |

### NPC 间聊天 & 主动消息（6）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/npc-npc-chat/status` | 状态（活跃+历史+冷却） |
| GET | `/npc-npc-chat/history` | 聊天历史 |
| POST | `/npc-npc-chat/trigger` | 手动触发 NPC 对话 |
| POST | `/npc/{name}/initiate` | 强制 NPC 主动搭话 |
| GET | `/npcs/pending-messages` | 待处理主动消息 |
| POST | `/npcs/pending-messages/ack` | 确认已处理 |

---

## 前端架构

Vue 3（CDN 全局构建）+ 原生 JS 模块，Vue 响应式 stores，SSE 流式对话渲染。

### 布局示意

```
┌──────────────────────────────────────────────────┐
│  Top Bar: ☰ 标题 时间线▾ Day 3 ⏸暂停 📋NPC管理  │
├────────────┬───────────────────┬─────────────────┤
│ 🔍搜索     │                   │   NPC管理面板     │
│ +新群聊    │   聊天消息区       │   ┌──────────┐   │
│ +NPC对话   │   · 日期分隔条    │   │ 角色卡片   │   │
│            │   · 头像+气泡     │   │ ✏️ 🗑    │   │
│ 对话列表    │   · 行内时间戳    │   └──────────┘   │
│ ┌────────┐ │                   │                 │
│ │张三 🔔 │ │                   │   上帝面板       │
│ │李四    │ │                   │   · 时间线切换   │
│ │王五    │ │                   │   · 事件编辑     │
│ │群聊    │ │   ─────────────── │   · 历史记录     │
│ └────────┘ │   输入框    [发送] │                 │
│            │                   │                 │
│ 🟢2 🟡0 🔴0 │                   │                 │
│ ❤️ 52      │                   │                 │
├────────────┴───────────────────┴─────────────────┤
│              Toast通知 (NPC消息弹窗)              │
└──────────────────────────────────────────────────┘
```

### 响应式断点

| 断点 | 布局变化 |
|------|---------|
| > 1024px | 侧栏 + 聊天 + 右侧面板 三栏布局 |
| 768-1023px | 侧栏收窄，右侧面板变为覆盖抽屉 |
| 480-767px | 汉堡菜单，侧栏全高抽屉，图标化顶栏 |
| < 480px | 全宽抽屉，更紧凑控件 |

### 模态框（5 个）

| 模态框 | 用途 |
|--------|------|
| 新群聊 | 勾选 NPC 创建群聊 |
| NPC 对话 | 选择两个 NPC 触发对话 |
| NPC 向导 | 4 步创建/编辑 NPC，含 AI 生成 |
| NPC 详情 | 角色完整信息卡片 |
| 推进天数 | 确认推进时间线（不可逆） |

---

## 知识库 & 反幻觉机制

### 三个知识来源（分层互补）

| 层级 | 触发条件 | 内容 |
|------|---------|------|
| **同事名册注入** | 所有对话（始终） | 从 `NPC_ROLES` 动态生成全员名册，嵌入角色档案 |
| **知识库 RAG** | 用户消息触发 | `ai_town.md` 知识库向量检索 + 低温事实提取 |
| **感知记忆** | 创建 NPC 时 | 自动通知所有现有 NPC：新同事入职 |

### 嵌入模型配置

```env
EMBED_MODEL_TYPE=dashscope        # hello_agents 嵌入类型（支持 OpenAI 兼容 REST）
EMBED_MODEL_NAME=embedding-2      # 智谱 embedding-2（1024 维）
EMBED_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
EMBED_API_KEY=your_api_key        # 与 LLM_API_KEY 共用智谱 API Key
```

回退链：REST API（智谱）→ 本地 sentence-transformers → TF-IDF（scikit-learn）

如果全部失败，KnowledgeManager 会打印警告，不影响系统运行。

---

## Docker 部署

```bash
# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f backend

# 停止
docker compose down
```

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Backend | 8000 | FastAPI + 文档 `/docs` |
| BFF | 8090 | Express + 前端静态文件 + API 代理 |
| Qdrant（可选） | 6333/6334 | 本地向量数据库，`--profile local` |
| Neo4j（可选） | 7474/7687 | 本地图数据库，`--profile local` |

### 持久化卷挂载

| 容器路径 | 主机路径 | 用途 |
|----------|---------|------|
| `/app/timeline_data` | `./backend/timeline_data` | 时间线数据 |
| `/app/memory_data` | `./backend/memory_data` | NPC 记忆 |
| `/app/logs` | `./backend/logs` | 日志 |
| `/app/npc_configs.json` | `./backend/npc_configs.json` | NPC 配置（单文件挂载） |
| `/app/knowledge` | `./backend/knowledge` | 知识库目录 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | FastAPI + Python 3.11 |
| AI 框架 | HelloAgents（SimpleAgent + MemoryManager + RAGTool） |
| LLM | 可配置（智谱 GLM / OpenAI / DeepSeek / 本地模型） |
| 记忆存储 | SQLite（权威存储） + Qdrant（向量检索） |
| 嵌入模型 | 智谱 embedding-2（OpenAI 兼容 REST）→ local → TF-IDF |
| BFF | Express + TypeScript（helmet + CORS + 限流 + API 代理） |
| 前端 | Vue 3（CDN 全局构建）+ 原生 JS，响应式 stores，SSE 流式 |
| 异步 | asyncio 后台任务调度 |
| 容器化 | Docker Compose，健康检查，卷挂载持久化 |
