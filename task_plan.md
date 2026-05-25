# Task Plan: NPC 发言防重复增强 (v3)

**目标**: 修复同一运行内 NPC 发言重复问题（主动消息循环 / 群聊抢话循环 / NPC-NPC 跨批次重复）

## Phase 1: L1 + L4 + L5 — agents.py 核心增强

### L1: 强化 _is_speech_duplicate()
- 加语义向量余弦相似度检测（通过 episodic memory 的 embedder）
- 加关键词指纹检测（实词集合重叠率）
- 三取一命中即拦截（Jaccard / 语义 / 关键词）

### L4: 修复记忆检索 query
- context_type 驱动检索模板（"主动发起"→话题词，"群聊抢话"→最近上下文）
- 替换无意义的 `context[:60]`

### L5: retry 话题种子
- 从事件/性格/话题池随机抽取种子词注入 retry prompt
- retry 仍重复则返回 None

Status: pending

## Phase 2: L2 — autonomous_thinker.py 沉默机制

- `__init__` 加 `_silence_counters` 和 `_had_player_interaction`
- `think()` 沉默检查：连续 2 次被拦截 → 跳过
- `record_interaction()` 重置计数器

Status: pending

## Phase 3: L3 — scene_generator.py 话题避开

- `_build_rules()` 加话题避开规则
- `_build_history_text()` 记忆标签提示

Status: pending

## Phase 4: 验证

- 启动后端观察主动消息日志
- 触发群聊抢话 3 轮
- 等待 NPC-NPC 对话 2 场
- 确认去重拦截日志中出现新维度标记

Status: pending
