# AI-Town 多智能体 NPC 社交模拟系统

AI-Town 是基于 HelloAgents 框架的多智能体社交模拟平台，支持复杂的 NPC 角色建模、记忆管理、情感演化和自主行为。项目采用前后端分离架构，后端基于 FastAPI，前端为原生 HTML/JS，支持一键 Docker Compose 启动。

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

### 场景生成器

一次 LLM 调用生成完整多人对话场景，支持 1v1 聊天、群聊、NPC 间对话、NPC 主动消息四种模式。相比逐 NPC 调用，大幅降低 API 成本。

### 知识库 RAG 与反幻觉机制

- **LoreManager**：Markdown 知识库 → 按 `##` 标题分块 → 向量嵌入 → 余弦相似度检索
- **嵌入回退链**：DashScope API（REST 模式兼容 OpenAI）→ 本地 sentence-transformers → TF-IDF（scikit-learn）
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
│   ├── main.py                  # FastAPI 应用 & 全部 41 个 API 路由
│   ├── agents.py                # NPC Agent 管理、CRUD、核心对话流程、防重复发言
│   ├── relationship_manager.py  # 好感度系统（玩家 & NPC 间）
│   ├── scene_generator.py       # 统一场景生成引擎（含同事名册注入、防编造规则）
│   ├── lore_manager.py          # 知识库 RAG 管理器（向量检索 + 关键词回退）
│   ├── state_manager.py         # 后台定时循环调度 + 暂停控制
│   ├── autonomous_thinker.py    # NPC 主动发起对话引擎
│   ├── npc_npc_chat.py          # NPC 间聊天触发 & 管理
│   ├── group_chat_engine.py     # 抢话/群聊竞争引擎
│   ├── perception_engine.py     # NPC 感知引擎（环境观察）
│   ├── character_evolution.py   # 角色成长追踪
│   ├── timeline_manager.py      # 时间线/天数/事件管理
│   ├── logger.py                # 日志系统
│   ├── config.py                # 全局配置（含嵌入模型参数）
│   ├── models.py                # Pydantic 数据模型
│   ├── npc_configs.json         # NPC 配置持久化文件
│   ├── knowledge/               # 知识库 Markdown 文件
│   │   └── ai_town.md           # 办公室背景设定（可手动编辑扩展）
│   ├── memory_data/             # 每个 NPC 的记忆数据（SQLite）
│   ├── timeline_data/           # 时间线持久化
│   └── logs/                    # 日志文件
├── frontend/
│   ├── index.html               # 主页面
│   ├── css/
│   │   └── style.css            # 完整样式（响应式布局，4 断点）
│   └── js/
│       ├── app.js               # 主应用逻辑（对话渲染、SSE、向导、NPC管理、轮询）
│       ├── api.js               # API 封装（22 端点，请求去重+缓存+重试）
│       ├── state.js             # 前端全局状态管理（发布/订阅模式）
│       ├── storage.js           # localStorage 持久化（对话列表+消息）
│       └── god.js               # 上帝模式面板（时间线管理）
├── docker-compose.yml           # Docker 编排（backend + frontend + 可选 Qdrant/Neo4j）
├── Dockerfile.backend           # 后端镜像（Python 3.11）
├── Dockerfile.frontend          # 前端镜像（nginx）
├── docs/
│   └── superpowers/
│       └── specs/               # 设计文档
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

### 用户 → NPC 对话流程

```
前端 sendMessage()
  → POST /chat/scene (SSE)
    → SceneGenerator.generate_scene()
      → _build_roles_text()          # 角色档案（嵌入同事名册）
      → _build_history_text()        # 历史 + 跨场景记忆检索
      → LoreManager.query()          # 知识库 RAG（用户消息触发）
      → _generate_fact()             # 低温事实提取（如有RAG结果）
      → LLM 生成 JSON 对话           # 高温角色演绎
      → _save_scene_to_memory()      # 记忆持久化
      → record_npc_speech()          # 统一记忆写入入口
    ← SSE 流式返回 [{speaker, content}, ...]
```

### NPC 间对话 / 主动搭话 / 群聊抢话流程

```
后台循环触发
  → NPCAgentManager.generate_npc_speech()
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
| POST | `/chat/scene` | 场景化对话（SSE 流式，含好感度分析） |
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
EMBED_MODEL_TYPE="openai"          # hello_agents 的类型名（兼容 OpenAI REST 模式）
EMBED_MODEL_NAME="embedding-2"     # 智谱 embedding-2
EMBED_BASE_URL="https://open.bigmodel.cn/api/paas/v4/"
```

回退链：REST API（智谱）→ 本地 sentence-transformers → TF-IDF（scikit-learn）

如果三层全部失败，LoreManager 自动回退到关键词匹配模式，不影响系统运行。

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
| Frontend | 8090 | Nginx 静态文件 + API 代理 |
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
| AI 框架 | HelloAgents（SimpleAgent + MemoryManager） |
| LLM | 可配置（智谱 GLM / OpenAI / DeepSeek / 本地模型） |
| 记忆存储 | SQLite（权威存储） + Qdrant（向量检索） |
| 嵌入模型 | 智谱 embedding-2（OpenAI 兼容 REST）→ local → TF-IDF |
| 前端 | 原生 HTML/CSS/JS，SSE 流式渲染，localStorage 持久化 |
| 异步 | asyncio 后台任务调度 |
| 容器化 | Docker Compose，Nginx 反向代理，健康检查 |
