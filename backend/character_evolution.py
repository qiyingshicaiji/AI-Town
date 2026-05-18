"""人物成长追踪 — 记忆积累塑造性格变化"""

from datetime import datetime
from typing import Dict, List, Optional


class CharacterEvolution:
    """追踪 NPC 与玩家的关系成长

    定期检查记忆积累量，生成"人物成长提示"注入 prompt，
    让 NPC 随着对话增多变得更立体。
    """

    CHECK_INTERVAL = 20  # 每 20 条记忆检查一次

    def __init__(self, npc_manager):
        self.npc_manager = npc_manager
        self._last_check: Dict[str, int] = {}  # npc_name -> 上次检查时的记忆数
        self._evolution_notes: Dict[str, List[str]] = {}  # npc_name -> 成长提示

        print("🌱 人物成长追踪已初始化")

    def check_and_evolve(self, npc_name: str) -> Optional[str]:
        """检查是否需要生成成长提示

        Returns: 成长提示字符串，或 None
        """
        mem_mgr = self.npc_manager.memories.get(npc_name)
        if not mem_mgr:
            return None

        try:
            memories = mem_mgr.retrieve_memories(
                query="", memory_types=["working"], limit=50
            )
            current_count = len(memories)
        except Exception:
            return None

        last = self._last_check.get(npc_name, 0)
        if current_count - last < self.CHECK_INTERVAL:
            return None

        self._last_check[npc_name] = current_count

        # 分析记忆生成成长提示
        note = self._analyze_growth(npc_name, memories)
        if note:
            if npc_name not in self._evolution_notes:
                self._evolution_notes[npc_name] = []
            self._evolution_notes[npc_name].append(note)
            print(f"🌱 {npc_name} 人物成长: {note}")

        return note

    def _analyze_growth(self, npc_name: str, memories: list) -> Optional[str]:
        """分析记忆生成人物成长提示"""
        if not memories:
            return None

        # 统计互动频率和内容
        player_interactions = 0
        positive_interactions = 0
        mentioned_by_others = 0

        for m in memories:
            content = getattr(m, 'content', '') if hasattr(m, 'content') else str(m)
            if '玩家' in content:
                player_interactions += 1
            if any(w in content for w in ['谢谢', '好', '有趣', '喜欢', '棒', '不错', '哈哈']):
                positive_interactions += 1
            if npc_name in content and '玩家' not in content:
                mentioned_by_others += 1

        # 生成成长提示
        if player_interactions >= 20:
            if positive_interactions >= 15:
                return "和玩家聊了很多，开始觉得这个人是可以信任的朋友"
            elif player_interactions >= 10:
                return "和玩家逐渐熟悉起来，不再那么拘谨了"

        if mentioned_by_others >= 5:
            return "注意到其他同事经常提到自己，开始更关注办公室的人际关系"

        if positive_interactions >= 10 and player_interactions >= 8:
            return "最近的互动大多很愉快，心情不错"

        return None

    def get_evolution_context(self, npc_name: str) -> str:
        """获取人物成长上下文，用于 prompt 注入"""
        notes = self._evolution_notes.get(npc_name, [])
        if not notes:
            return ""

        # 只取最近 2 条
        recent = notes[-2:]
        lines = [f"- {n}" for n in recent]
        return "【最近的成长变化】\n" + "\n".join(lines)

    def get_all_evolution(self) -> Dict[str, List[str]]:
        return dict(self._evolution_notes)
