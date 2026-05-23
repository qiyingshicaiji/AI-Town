# Progress Log

## Session 2026-05-23

### Brainstorming (done)
- 诊断出三类重复问题：主动消息循环 / 群聊抢话循环 / NPC-NPC 跨批次重复
- 确定根因：Jaccard 2-gram 对短消息无效 + 记忆检索 query 无用 + retry 只生成问候变体
- 确定不改 scene_generator 批量生成模式

### Plan written (done)
- 五层修复方案：L1 去重增强 / L2 主动消息沉默 / L3 话题避开 / L4 检索修复 / L5 retry 种子
- 计划文件：C:\Users\colorful\.claude\plans\npc-npc-llm-cuddly-pixel.md
