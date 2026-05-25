# NPC 人物档案注入 — 解决 NPC 对新同事"瞎编"问题

## 问题

NPC 在新创建角色尚未对话时，不认识新同事，询问相关信息会杜撰虚假内容。
原方案使用 RAG 检索式查询，存在三个缺陷：

1. RAG 只在用户消息触发时查询（`trigger_message` 非空），NPC 间对话和自主思考不查
2. 关键词回退检索是字符级匹配，中文下基本无效
3. 新 NPC 的感知记忆是一次性的，可能被遗忘机制淘汰

## 方案

**核心思路：把 RAG"检索然后可能找到"换成"直接注入全员名册"。**

新增 `SceneGenerator._build_colleague_context()` 方法，生成办公室全员名册直接写入 prompt。
NPC 认不认识同事不再依赖检索运气。

### 注入范围（按参与度分层）

| 角色 | 注入内容 |
|------|----------|
| 对话参与者 | 完整档案：性格、说话风格、习惯、情绪触发、好感度 |
| 其他 NPC | 简要信息：姓名 + 职位 + 一句话性格 |

### 改动清单

#### 1. SceneGenerator — 新增 `_build_colleague_context()`（~30行）

```
输入: participant_names (参与者名列表)
输出: "【办公室同事名册 — 你认识的所有人】\n- 张三：Python工程师，内向技术宅\n- ..."
```

- 参与者跳过（由 `_build_roles_text()` 提供完整档案）
- 其他 NPC：姓名 + title + personality（截取前30字）

#### 2. SceneGenerator.generate_scene() — 注入名册

在 prompt 构建流程中，`roles_text` 之后插入 `colleague_context`。

同时修改知识检索逻辑：
- **删除** LoreManager 中对 NPC 识别的依赖：`knowledge_text` 中的反编造规则改为引用名册
- LoreManager 保留世界知识检索（办公室文化、历史、规则），但只在用户提问时检索

#### 3. Agent.generate_npc_speech() — 注入名册

NPC 间对话、群聊抢话、主动搭话的 `generate_npc_speech()` 中添加 `_build_colleague_context()`。
该方法目前完全不查知识库，导致 NPC-NPC 聊到新同事时必然瞎编。

#### 4. LoreManager — 职责收窄

- 删除 `_strip_npc_section()` 和 `_generate_npc_section()` 中对 NPC 人物部分的自动生成
- LoreManager 仅服务世界知识（办公室概况、文化、规则等）
- `ai_town.md` 中的 `## 人物` 部分不再需要

#### 5. 防编造规则加强

prompt 中添加：
```
【重要规则 — 关于你不认识的人】
如果被问到你不了解的人或事，先参考【办公室同事名册】。
如果名册里也没有相关信息，就说"我不太清楚"或"我没听说过"，绝对不要编造任何信息。
```

### 不改动

- `_build_roles_text()` 保持现有逻辑不变
- `_generate_fact()` 双调用机制保留，仅用于世界知识检索
- `_notify_new_colleague()` 感知记忆注册保留，作为辅助信息来源
- 前端无需改动

### 影响评估

- **Token 消耗**：3 个 NPC 时名册约 150 tokens，10 个 NPC 约 400 tokens，可接受
- **准确性**：名册内容来自 `NPC_ROLES`，保证信息来源可靠
- **可维护性**：NPC 增删改后，下一次对话自动反映最新名册
