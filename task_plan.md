# Task Plan: NPC 对话连续性与记忆演化

## Phase 1-3: NPC-NPC 对话修复 ✅
(详见之前记录)

## Phase 4: 群聊抢话连续性修复 ✅

### 问题
群聊抢话中 NPC 同样重复发言、无法自然延续对话。

### 根因
`_generate_speech_fast` 的 prompt 过于简单：
- 只有事件文本 + 最近发言 + 一句话指令
- 没有记忆检索
- 没有 NPC 人格上下文
- 没有跨场次连续性
- 没有去重机制

### 修复 (group_chat_engine.py v3)
1. **记忆检索**：每次生成发言前，用当前对话上下文查询 NPC 记忆
2. **人格注入**：prompt 包含 NPC 的 core_personality、speaking_style、quirks
3. **跨场次连续性**：`_last_contention` 记录上轮抢话，下次抢话时注入 prompt
4. **发言去重**：`_speech_history` 跟踪每个 NPC 的历史发言，prompt 中展示"你之前说过的话"
5. **后生成去重**：Jaccard 相似度检查，高度重复时使用备选发言
6. **注入 scene_generator**：state_manager 将 scene_generator 注入 group_chat_engine
