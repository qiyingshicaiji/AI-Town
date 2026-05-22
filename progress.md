# Progress Log

## Session 2026-05-22

### Round 1: 降低刷屏频率 ✅
- 修改 npc_npc_chat.py: COOLDOWN 120→300s, GLOBAL_COOLDOWN 60s, TRIGGER_PROBABILITY 0.50→0.15
- 添加 _pair_content_history 去重机制
- 添加 _build_recent_chat_context 注入 prompt

### Round 2: 增强记忆检索 (当前)
- 分析根因：记忆保存了但 NPC-NPC 场景检索不到
- 修复 scene_generator 的 _build_history_text
- 修复 npc_npc_chat 传递上次对话上下文
