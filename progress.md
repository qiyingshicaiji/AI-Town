# Progress Log

## Session: 2026-05-25 — NPC 人物档案注入 v2（修复版）

### Round 1 — 初次实施 (done, 但不够)
- scene_generator.py: _build_colleague_context() + generate_scene() 注入
- agents.py: generate_npc_speech() 注入
- 问题：同事信息作为独立附录，LLM 不一定当作角色认知使用

### Round 2 — 强化修复 (done)
- **scene_generator.py**: 同事信息直接嵌入 _build_roles_text() 每个 NPC 的档案
  - 格式："你认识的其他同事：\n  - 李四：产品经理，外向健谈..."
  - 删除 _build_colleague_context() 方法
  - 防编造规则改为引用"上方角色档案中列出的同事信息"
- **agents.py**: _load_npc_configs() 防止数据丢失
  - 检测目录路径（Docker 挂载不当）→ 自动重命名
  - JSON 损坏 → 备份到 .corrupted_* 文件
  - 永不复写已有文件，只在文件不存在时创建默认值
- **agents.py**: generate_npc_speech() 同事信息标题改为"你認識的其他同事"
- **.env**: 嵌入配置注释说明

### 待验证
- Docker rebuild + 创建 NPC + 重启 → 确认持久化
- 问张三"你认识新同事吗？" → 确认基于档案回答
