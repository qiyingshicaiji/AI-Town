"""NPC 自主思考循环 - 根据近期记忆/事件/关系主动发起对话"""

import random
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional


class AutonomousThinker:
    """NPC 自主思考引擎

    定时检查条件，决定是否主动向玩家发起对话。
    """

    THINK_INTERVAL = 150       # 思考间隔（秒）
    BASE_PROBABILITY = 0.30   # 基础主动发起概率
    LAST_INTERACT_THRESHOLD = 120  # 2分钟内未互动 → 增加概率

    def __init__(self, npc_manager, timeline_manager, llm=None):
        self.npc_manager = npc_manager
        self.timeline_manager = timeline_manager
        self.llm = llm
        self.scene_generator = None  # 由 state_manager 注入

        # 每个 NPC 的上次互动时间
        self.last_interactions: Dict[str, datetime] = {}

        # pending_messages: {npc_name: [{"content": str, "timestamp": str}]}
        self.pending_messages: Dict[str, list] = {}

        # 防止重复打招呼的冷却
        self.greet_cooldown: Dict[str, datetime] = {}

        # 話題枯竭沉默：連續被去重攔截 2 次後暫停主動發言
        self._silence_counters: Dict[str, int] = {}
        # 玩家互動標記（有互動則重置沉默）
        self._had_player_interaction: Dict[str, bool] = {}

        print("🧠 NPC 自主思考引擎已初始化")
        print(f"   思考间隔: {self.THINK_INTERVAL}s, 基础概率: {self.BASE_PROBABILITY}, 冷却: 90s")
        print(f"   沉默机制: 连续2次去重拦截后暂停，等待玩家互动或新事件")

    def record_interaction(self, npc_name: str):
        """记录 NPC 与玩家的互动时间，重置沉默计数器"""
        self.last_interactions[npc_name] = datetime.now()
        self._silence_counters[npc_name] = 0
        self._had_player_interaction[npc_name] = True

    async def think(self, npc_name: str) -> Optional[str]:
        """单个 NPC 思考：是否主动发起对话

        Returns:
            主动发起的消息内容，或 None（不发起）
        """
        # 仅在 IDLE 状态下思考
        state = self.npc_manager.get_npc_state(npc_name)
        if state["state"] != "idle":
            return None

        # 冷却检查（同一 NPC 两次主动消息间隔 >= 90s）
        if npc_name in self.greet_cooldown:
            elapsed = (datetime.now() - self.greet_cooldown[npc_name]).total_seconds()
            if elapsed < 9000:
                return None

        # 计算主动发起概率
        probability = self.BASE_PROBABILITY

        # 因素 1: 好感度
        if self.npc_manager.relationship_manager:
            affinity = self.npc_manager.relationship_manager.get_affinity(npc_name)
            if affinity >= 60:
                probability *= 1.5
            if affinity >= 80:
                probability *= 1.3

        # 因素 2: 今日事件
        event = self.timeline_manager.get_event_context()
        if event:
            probability *= 2.0

        # 因素 2.5: 近期感知观察（观察到新事物 → 更想交流）
        mem_mgr = self.npc_manager.memories.get(npc_name)
        if mem_mgr:
            try:
                perceptions = mem_mgr.retrieve_memories(
                    query="看到 注意到", memory_types=["perceptual"], limit=1, min_importance=0.3
                )
                if perceptions:
                    probability *= 1.5
            except Exception:
                pass

        # 因素 3: 长时间未互动
        last = self.last_interactions.get(npc_name)
        if last is None or (datetime.now() - last).total_seconds() > self.LAST_INTERACT_THRESHOLD:
            probability *= 1.3
            if last is None:
                probability = 1.0  # 首次见面，必定打招呼

        # 因素 4: 推进天数后首次思考
        # (通过检查当前天数 > 0 且无今日互动记录)
        tl = self.timeline_manager.get_active_timeline()
        if tl and tl.get("current_day", 0) > 0:
            if last is None or last.date() < datetime.now().date():
                probability = 0.9  # 每天第一次高概率打招呼

        probability = 1.0
        # 随机判断（事件可触发强制唤醒）
        if random.random() >= probability: 
            # 有事件时重置所有沉默计数器
            if event:
                for name in list(self._silence_counters.keys()):
                    self._silence_counters[name] = 0
            return None

        # 話題枯竭檢查：連續 2 次去重攔截 → 沉默，直到玩家互動
        silence_count = self._silence_counters.get(npc_name, 0)
        if silence_count >= 2:
            # 檢查是否有復活條件
            has_event = bool(self.timeline_manager.get_event_context())
            has_interaction = self._had_player_interaction.get(npc_name, False)
            if not has_event and not has_interaction:
                return None  # 仍沉默
            # 復活：重置計數器
            self._silence_counters[npc_name] = 0
            if has_interaction:
                self._had_player_interaction[npc_name] = False

        # 生成主动消息
        content = await self._generate_initiation(npc_name)
        if not content:
            # generate_npc_speech 返回 None 表示被去重攔截且 retry 失敗
            self._silence_counters[npc_name] = silence_count + 1
            if self._silence_counters[npc_name] >= 2:
                print(f"  🔇 {npc_name} 连续{self._silence_counters[npc_name]}次被拦截，进入沉默（等待玩家互动或新事件）")
            return None

        # 成功生成，重置沉默计数器
        if silence_count > 0:
            self._silence_counters[npc_name] = 0

        # 加入 pending 队列（每个 NPC 最多保留 3 条消息）
        if npc_name not in self.pending_messages:
            self.pending_messages[npc_name] = []

        msg = {
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "npc_name": npc_name
        }
        self.pending_messages[npc_name].append(msg)
        # 限制队列长度，防止内存泄漏
        if len(self.pending_messages[npc_name]) > 3:
            self.pending_messages[npc_name] = self.pending_messages[npc_name][-3:]

        # 设置冷却
        self.greet_cooldown[npc_name] = datetime.now()
        self.last_interactions[npc_name] = datetime.now()

        print(f"🧠 {npc_name} 主动发起对话: {content[:40]}... (概率: {probability:.2%})")
        return content

    async def _generate_initiation(self, npc_name: str) -> Optional[str]:
        """生成主动发起的对话内容 — 使用统一的 generate_npc_speech"""
        info = self.npc_manager.get_npc_info(npc_name)
        if not info:
            return None

        # 構建場景上下文
        affinity = 50
        if self.npc_manager.relationship_manager:
            affinity = self.npc_manager.relationship_manager.get_affinity(npc_name)

        affinity_desc = "老朋友" if affinity >= 80 else "比较熟悉" if affinity >= 60 else "普通同事" if affinity >= 40 else "不太熟"
        context = f"你和玩家的关系: {affinity_desc}（好感度: {affinity:.0f}）"

        event = self.timeline_manager.get_event_context()
        if event:
            context = f"今日事件: {event}\n{context}"

        # ✅ 使用統一發言生成器（自動處理記憶檢索、防重複、記憶寫入）
        return await self.npc_manager.generate_npc_speech(
            npc_name=npc_name,
            context=context,
            context_type="主动发起",
            listeners=[],       # 只對玩家，不寫入其他 NPC 記憶
            temperature=1.0,
            importance=0.6,
            instruction_override=(
                "你決定主動和辦公室的同事（玩家）打個招呼或聊點什麼。"
                "請用簡短的主動發言開頭（20-40字），像微信消息一樣自然隨意。"
                "可以提及今日事件、最近對話、或者日常問候。"
                "可以说一句话或者几句话来完整表达你的意思，不要加引號。"
                "你的主動發言："
            ),
        )

    def get_pending(self, npc_name: str = None) -> List[dict]:
        """获取待发送的主动消息（非破坏性读取，消息保留在队列中）"""
        if npc_name:
            return list(self.pending_messages.get(npc_name, []))
        all_msgs = []
        for name, msgs in self.pending_messages.items():
            for msg in msgs:
                all_msgs.append(msg)
        return all_msgs

    def ack_pending(self, npc_name: str = None):
        """确认前端已处理，删除待发送消息"""
        if npc_name:
            self.pending_messages.pop(npc_name, None)
        else:
            self.pending_messages.clear()

    async def think_all(self):
        """对所有 IDLE NPC 执行思考"""
        npc_names = list(self.npc_manager.agents.keys())
        for name in npc_names:
            try:
                await self.think(name)
            except Exception as e:
                print(f"❌ {name} 自主思考失败: {e}")

    async def force_initiate(self, npc_name: str) -> dict:
        """强制指定 NPC 主动搭话 — 绕过所有检查

        Returns:
            {"npc_name": str, "content": str, "timestamp": str}
        Raises:
            Exception: NPC 不存在或无法生成消息
        """
        if npc_name not in self.npc_manager.agents:
            raise Exception(f"NPC '{npc_name}' 不存在")

        content = await self._generate_initiation(npc_name)
        if not content:
            raise Exception(f"{npc_name} 暂时无法生成主动消息")

        msg = {
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "npc_name": npc_name
        }
        if npc_name not in self.pending_messages:
            self.pending_messages[npc_name] = []
        self.pending_messages[npc_name].append(msg)

        self.greet_cooldown[npc_name] = datetime.now()
        self.last_interactions[npc_name] = datetime.now()

        print(f"🔔 强制 {npc_name} 主动搭话: {content[:40]}...")
        return msg
