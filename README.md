# AI-Town — 多智能体 NPC 社交模拟框架

基于 HelloAgents 框架的 AI NPC 办公室模拟系统。3 个性格各异的 NPC 在同一个办公空间中自主社交、形成关系、观察环境，与玩家自然互动。

## 核心特性

### 拟人化 NPC 角色系统
每个 NPC 拥有独立的 **性格画像**、**说话风格**、**情绪触发点** 和 **雷区**，而非简单的角色标签。

| NPC | 职位 | 性格核心 | 说话风格 |
|-----|------|---------|---------|
| **张三** | Python 工程师 | 内向技术宅，社恐但有深度，对代码有偏执热爱 | 语速慢，句子短，用技术类比解释生活 |
| **李四** | 产品经理 | 表面社交达人实则怕冷场，擅长读人 | 语速快，爱用网络热梗 |
| **王五** | UI 设计师 | 内心丰富但表达克制，追求"好看"二字 | 画面感强，经常说"这个感觉不对" |

### 多层记忆系统（4 通道）
- **工作记忆 (Working)**：短期对话，容量 10 条，含 TTL 自动过期
- **情景记忆 (Episodic)**：长期持久化（SQLite + Qdrant 向量检索），容量 150 条，支持遗忘机制
- **感知记忆 (Perceptual)**：NPC 观察环境/他人对话的感知记录
- **自动整合**：工作记忆 → 情景记忆自动迁移；情景记忆满时 LLM 压缩为角色印象

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

### 感知引擎（新增）
NPC 通过三个通道观察世界，不再只依赖群聊上下文认识彼此：
- **时间线事件观察**：所有 NPC 感知到办公室发生的事件
- **NPC 间对话观察**：未参与对话的 NPC 作为旁观者记录感知
- **感知注入 Prompt**：NPC 对话时会引用自己观察到的内容

### 场景生成器
一次 LLM 调用生成完整多人对话场景，支持 1v1 聊天、群聊、NPC 间对话、NPC 主动消息四种模式。相比逐 NPC 调用，大幅降低 API 成本。

### 其他特性
- **角色成长系统**：累计 20 条新记忆后自动分析并生成角色成长提示
- **批量独白生成**：每 30 秒更新 NPC 状态独白（在想什么/做什么）
- **SSE 流式对话**：前端实时流式展示 NPC 回复
- **完整日志系统**：对话、好感度变化、记忆操作全程可追溯
- **配置化参数**：所有可调参数集中在 `config.py`

---

## 项目结构

```
AI-Town/
├── backend/
│   ├── main.py                  # FastAPI 应用 & 全部 API 路由
│   ├── agents.py                # NPC Agent 管理 & 核心对话流程
│   ├── relationship_manager.py  # 好感度系统（玩家 & NPC 间）
│   ├── scene_generator.py       # 统一场景生成引擎
│   ├── state_manager.py         # 后台定时循环调度
│   ├── autonomous_thinker.py    # NPC 主动发起对话引擎
│   ├── npc_npc_chat.py          # NPC 间聊天触发 & 管理
│   ├── group_chat_engine.py     # 抢话/群聊竞争引擎
│   ├── perception_engine.py     # NPC 感知引擎（环境观察）
│   ├── character_evolution.py   # 角色成长追踪
│   ├── batch_generator.py       # 批量 NPC 独白生成
│   ├── timeline_manager.py      # 时间线/天数/事件管理
│   ├── logger.py                # 日志系统
│   ├── config.py                # 全局配置
│   ├── models.py                # Pydantic 数据模型
│   └── memory_data/             # 每个 NPC 的记忆数据（SQLite）
├── frontend/
│   ├── index.html               # 主页面
│   ├── css/                     # 样式文件
│   └── js/
│       ├── app.js               # 主应用逻辑（对话渲染、状态轮询）
│       ├── api.js               # API 调用封装
│       ├── state.js             # 前端全局状态管理
│       ├── storage.js            # 浏览器 localStorage 持久化
│       └── god.js               # 上帝模式面板（时间线管理）
├── AFFINITY_SYSTEM_GUIDE.md     # 好感度系统详细文档
├── MEMORY_SYSTEM_GUIDE.md       # 记忆系统详细文档
├── DIALOGUE_LOG_GUIDE.md        # 对话日志文档
├── SETUP_GUIDE.md               # 安装配置指南
└── README.md
```

---

## 后台调度架构

```
asyncio 事件循环
├── _auto_update_loop()    30s ──→ 批量 NPC 独白生成
├── _npc_chat_loop()       15s ──→ NPC 间聊天触发检查 + 感知观察
├── _think_loop()          15s ──→ NPC 主动向玩家发起对话
├── _perception_loop()     60s ──→ 时间线事件感知扫描
└── _state_timeout_checker 10s ──→ NPC 状态超时释放
```

前端每 5 秒轮询 NPC 状态、待处理消息和 NPC 间聊天状态。

---

## API 概览

### 核心对话
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat` | 1v1 NPC 对话（基础） |
| POST | `/chat/scene` | 场景化对话（SSE 流式） |
| POST | `/chat/scene?mode=group` | 群聊场景 |

### 好感度
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/npcs/{name}/affinity` | 获取 NPC 对玩家好感度 |
| GET | `/affinities` | 获取所有 NPC 好感度 |
| PUT | `/npcs/{name}/affinity` | 手动设置好感度（测试用） |
| GET | `/npcs/npc-affinities` | 获取 NPC 间好感度矩阵 |

### 记忆 & 感知
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/npcs/{name}/memories` | 获取 NPC 记忆列表 |
| DELETE | `/npcs/{name}/memories` | 清空 NPC 记忆 |
| GET | `/npcs/{name}/perceptions` | 获取 NPC 感知观察 |

### 时间线
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/timelines` | 列出所有时间线 |
| POST | `/timelines` | 创建时间线 |
| PUT | `/timelines/{id}/events/today` | 设置今日事件 |
| POST | `/timelines/{id}/advance` | 推进天数 |
| PUT | `/timelines/{id}/active` | 切换活跃时间线 |

### NPC 间聊天
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/npc-npc-chat/status` | 获取聊天状态（活跃+历史） |
| POST | `/npc-npc-chat/trigger` | 手动触发 NPC 间对话 |
| GET | `/npc-npc-chat/history` | 获取聊天历史 |

### NPC 状态
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/npcs/status` | 获取所有 NPC 状态 & 独白 |
| GET | `/npcs/pending-messages` | 获取 NPC 主动消息 |

### 群聊/抢话
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/group-chat/contention/stream` | 群聊抢话（SSE 流式） |

---

## 快速开始

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env 设置 LLM_API_KEY

# 3. 启动后端
cd backend
python main.py

# 4. 打开前端
# 浏览器访问 http://localhost:8000
# 或在 frontend/ 目录用 Live Server 打开 index.html
```

---

## 技术栈

- **后端框架**：FastAPI + Python 3.10+
- **AI 框架**：HelloAgents（SimpleAgent + MemoryManager）
- **LLM**：可配置（OpenAI / DeepSeek / 本地模型）
- **记忆存储**：SQLite（权威存储） + Qdrant（向量检索）
- **前端**：原生 HTML/CSS/JS，SSE 流式渲染
- **异步**：asyncio 后台任务调度

---

## 本迭代改进（v3.2）

相比基础多智能体对话系统，本版本做了以下关键改进：

1. **记忆时间线隔离**：不同时间线的记忆独立存储和检索，不再跨线互通
2. **自动记忆整合**：工作记忆 → 情景记忆自动迁移，防止上下文溢出
3. **好感度强化**：对话风格从描述性改为强指令式，好感度变化切实影响 NPC 行为
4. **事件驱动好感度**：时间线事件中的关键词（争吵/合作等）自动调整 NPC 间关系
5. **感知引擎**：NPC 新增"观察"能力，能看到其他 NPC 的对话和时间线事件
6. **主动性提升**：主动发问概率从 20% 提升至 30%，冷却缩短，新增感知触发因子
7. **NPC 间聊天降门槛**：初始好感度 30→45，触发阈值 60→50，增加 NPC 间自发互动
