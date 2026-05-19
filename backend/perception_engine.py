"""NPC感知引擎 - 让NPC观察环境、其他NPC和事件，形成印象和知识"""

import hashlib
from datetime import datetime
from typing import Dict, List, Optional, Set


class PerceptionEngine:
    """NPC感知引擎

    功能:
    1. 监听时间线事件 → 为所有NPC创建感知记忆
    2. 监听NPC间对话 → 为非参与NPC创建观察记录
    3. 监听玩家-NPC对话 → 为其他NPC创建观察记录
    4. 提供查询接口: "NPC X最近观察到了什么?"
    """

    SCAN_INTERVAL = 60  # 感知扫描间隔（秒）

    def __init__(self, npc_manager, timeline_manager, llm=None):
        self.npc_manager = npc_manager
        self.timeline_manager = timeline_manager
        self.llm = llm

        # 去重追踪
        self._observed_events: Set[str] = set()
        self._observed_chats: Set[str] = set()

        print("👁️  感知引擎已初始化")

    # ==================== 观察接口 ====================

    def scan_and_observe(self):
        """周期性扫描：检查新时间线事件并创建感知记忆"""
        self._observe_timeline_event()

    def observe_npc_chat(self, npc_a: str, npc_b: str, messages: List[dict]):
        """NPC间对话完成后调用：非参与NPC观察这场对话"""
        observers = [n for n in self.npc_manager.agents if n not in (npc_a, npc_b)]

        # 构建对话摘要
        chat_summary = "; ".join(
            f"{m.get('speaker', '?')}: {m.get('content', '')}"
            for m in (messages or [])[:3]
        )
        if not chat_summary:
            return

        # 去重
        chat_key = f"{npc_a}:{npc_b}:{chat_summary[:60]}"
        chat_hash = hashlib.md5(chat_key.encode()).hexdigest()
        if chat_hash in self._observed_chats:
            return
        self._observed_chats.add(chat_hash)

        timeline_id = getattr(self.timeline_manager, '_active_timeline_id', None)

        for observer in observers:
            mem_mgr = self.npc_manager.memories.get(observer)
            if not mem_mgr:
                continue
            try:
                mem_mgr.add_memory(
                    content=f"我看到{npc_a}和{npc_b}在聊天: {chat_summary[:120]}",
                    memory_type="perceptual",
                    importance=0.5,
                    metadata={
                        "observation_type": "npc_chat_observation",
                        "observed_npcs": [npc_a, npc_b],
                        "timeline_id": timeline_id,
                        "timestamp": datetime.now().isoformat(),
                        "modality": "text",
                    }
                )
            except Exception:
                pass

            # 观察他人积极互动 → NPC间好感度轻微上升
            if hasattr(self.npc_manager, 'relationship_manager') and self.npc_manager.relationship_manager:
                try:
                    self.npc_manager.relationship_manager.update_npc_npc_affinity(observer, npc_a, 0.5)
                    self.npc_manager.relationship_manager.update_npc_npc_affinity(observer, npc_b, 0.5)
                except Exception:
                    pass

    def observe_player_chat(self, npc_name: str, player_message: str):
        """玩家与NPC对话时调用：其他NPC观察"""
        observers = [n for n in self.npc_manager.agents if n != npc_name]
        timeline_id = getattr(self.timeline_manager, '_active_timeline_id', None)

        for observer in observers:
            mem_mgr = self.npc_manager.memories.get(observer)
            if not mem_mgr:
                continue
            try:
                mem_mgr.add_memory(
                    content=f"我看到{npc_name}在和玩家聊天，聊到了: {player_message[:60]}",
                    memory_type="perceptual",
                    importance=0.4,
                    metadata={
                        "observation_type": "player_chat_observation",
                        "observed_npc": npc_name,
                        "timeline_id": timeline_id,
                        "timestamp": datetime.now().isoformat(),
                        "modality": "text",
                    }
                )
            except Exception:
                pass

    def get_observations(self, npc_name: str, limit: int = 5) -> List[str]:
        """获取NPC的近期感知观察（用于prompt注入）"""
        mem_mgr = self.npc_manager.memories.get(npc_name)
        if not mem_mgr:
            return []

        try:
            perceptions = mem_mgr.retrieve_memories(
                query="看到 注意到 观察",
                memory_types=["perceptual"],
                limit=limit,
                min_importance=0.3
            )
            return [p.content for p in perceptions]
        except Exception:
            return []

    # ==================== 内部方法 ====================

    def _observe_timeline_event(self):
        """将时间线事件存储为所有NPC的感知记忆"""
        event_text = self.timeline_manager.get_event_context()
        if not event_text:
            return

        # 去重
        event_hash = hashlib.md5(event_text.encode()).hexdigest()
        if event_hash in self._observed_events:
            return
        self._observed_events.add(event_hash)

        timeline_id = getattr(self.timeline_manager, '_active_timeline_id', None)

        for npc_name in self.npc_manager.agents:
            mem_mgr = self.npc_manager.memories.get(npc_name)
            if not mem_mgr:
                continue
            try:
                mem_mgr.add_memory(
                    content=f"今天我注意到办公室发生了一件事: {event_text}",
                    memory_type="perceptual",
                    importance=0.7,
                    metadata={
                        "observation_type": "timeline_event",
                        "timeline_id": timeline_id,
                        "timestamp": datetime.now().isoformat(),
                        "modality": "text",
                    }
                )
            except Exception:
                pass
