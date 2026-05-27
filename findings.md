# Findings

## 2026-05-25 — NPC 瞎编问题根因 (Updated)

### 根因 1: 同事信息是提示词"数据附录"而非"角色认知"
- 之前的 `_build_colleague_context()` 把同事名册作为独立段落插入 prompt
- LLM 扮演"编剧"时，数据附录不一定被当作角色自己的知识使用
- **修复**：同事信息直接嵌入 `_build_roles_text()` 中每个 NPC 的档案，作为"你认识的其他同事"

### 根因 2: NPC 持久化 — `_load_npc_configs()` 会覆写已有文件
- 如果 JSON 文件存在但解析失败（Docker 把路径变成目录、文件损坏等），函数会直接覆写为3个默认NPC
- Docker bind mount 的源文件不存在时，Docker 会创建空目录而非空文件
- **修复**：路径为目录时自动重命名；JSON 解析失败时备份原文件；永不复写已有数据

### 嵌入配置
- .env 配置实际上正确：`dashscope` + OpenAI 兼容 REST 模式 → 智谱 API
- 已添加注释说明
