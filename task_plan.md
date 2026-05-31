# Task Plan: RAG 知识库查询注入对话 Prompt

**日期**: 2026-05-30

## 问题
`knowledge_manager.query()` 已定义，但 `agents.py chat()` 中从未调用。
只在 `scene_generator.py` (SSE流路径) 中调用了。

## 修复
在 `agents.py` 的 `chat()` 方法中，在记忆检索之后、构建 enhanced_message 之前，
插入知识库查询，格式参考 `scene_generator.py:80-93` 的写法。

**文件**: `backend/agents.py`
- Line 660: `enhanced_message = event_context + affinity_context + ...`
- 在这行之前添加 knowledge query 和 knowledge_context
- 将 knowledge_context 注入 enhanced_message

## Phase 1: 实现 RAG 注入 (in_progress)
## Phase 2: 重建验证 (pending)
