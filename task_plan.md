# Task Plan: NPC 人物档案注入 + 知识库 RAGTool 替换

**目标**: 解决 NPC 瞎编问题 + 用 hello_agents 内置 RAGTool 替代自定义 LoreManager

## Phase A: 同事名册嵌入角色档案 (done)
- _build_roles_text() 嵌入 "你认识的其他同事"
- generate_npc_speech() 嵌入同事信息
- _load_npc_configs() 防止数据丢失
Status: complete

## Phase B: RAGTool 替换 LoreManager (done)

### Phase B1: 新建 knowledge_manager.py (done)
- RAGTool 薄适配层，~130 行
- query() / sync_npc_info() / reload()

### Phase B2: 修改 scene_generator.py (done)
- lore_manager → knowledge_manager
- 删除 expertise_hints 领域过滤

### Phase B3: 修改 main.py (done)
- 导入 KnowledgeManager 替代 LoreManager
- 更新 lifespan 初始化逻辑

### Phase B4: 修改 agents.py (done)
- 新增 _sync_knowledge() 辅助方法
- add_npc / update_npc / delete_npc 调用同步

### Phase B5: 清理 (done)
- 删除 lore_manager.py (~230 行 → 删除)
- 新增 knowledge_manager.py (~130 行)
- Net: -100 行代码，+MarkItDown 多格式支持

## 验证
Status: pending
