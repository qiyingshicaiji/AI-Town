"""NPC 自主思考循环 - 根据近期记忆/事件/关系主动发起对话"""

import random
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional


class AutonomousThinker:
    """NPC 自主思考引擎

    定时检查条件，决定是否主动向玩家发起对话。
    """

    THINK_INTERVAL = 15       # 思考间隔（秒）
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

        print("🧠 NPC 自主思考引擎已初始化")
        print(f"   思考间隔: {self.THINK_INTERVAL}s, 基础概率: {self.BASE_PROBABILITY}, 冷却: 90s")

    def record_interaction(self, npc_name: str):
        """记录 NPC 与玩家的互动时间"""
        self.last_interactions[npc_name] = datetime.now()

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
            if elapsed < 90:
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
                probability = 0.7  # 每天第一次高概率打招呼

        # 随机判断
        if random.random() >= probability:
            return None

        # 生成主动消息
        content = await self._generate_initiation(npc_name)
        if not content:
            return None

        # 加入 pending 队列
        if npc_name not in self.pending_messages:
            self.pending_messages[npc_name] = []

        msg = {
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "npc_name": npc_name
        }
        self.pending_messages[npc_name].append(msg)

        # 设置冷却
        self.greet_cooldown[npc_name] = datetime.now()
        self.last_interactions[npc_name] = datetime.now()

        print(f"🧠 {npc_name} 主动发起对话: {content[:40]}... (概率: {probability:.2%})")
        return content

    async def _generate_initiation(self, npc_name: str) -> Optional[str]:
        """生成主动发起的对话内容"""
        info = self.npc_manager.get_npc_info(npc_name)
        if not info:
            return None

        # 获取事件和好感度上下文
        event = self.timeline_manager.get_event_context()
        affinity = 50
        if self.npc_manager.relationship_manager:
            affinity = self.npc_manager.relationship_manager.get_affinity(npc_name)

        # 获取近期记忆
        memories = []
        mem_mgr = self.npc_manager.memories.get(npc_name)
        if mem_mgr:
            try:
                memories = mem_mgr.retrieve_memories("", memory_types=["working"], limit=3)
            except Exception:
                pass

        # 获取近期感知观察
        perception_text = ""
        if mem_mgr:
            try:
                perceptions = mem_mgr.retrieve_memories(
                    query="看到 注意到", memory_types=["perceptual"], limit=2, min_importance=0.3
                )
                if perceptions:
                    perception_text = "【你最近观察到的】\n" + "\n".join(
                        f"- {p.content[:80]}" for p in perceptions
                    ) + "\n\n"
            except Exception:
                pass

        # 构建 prompt
        affinity_desc = "老朋友" if affinity >= 80 else "比较熟悉" if affinity >= 60 else "普通同事" if affinity >= 40 else "不太熟"
        memory_text = ""
        if memories:
            memory_text = "【近期对话】\n" + "\n".join(
                f"- {m.content[:80]}" for m in memories[:3]
            ) + "\n"

        event_text = f"【今日事件】{event}\n" if event else ""

        prompt = f"""你是{info['title']}{npc_name}。你决定主动和办公室里的同事（玩家）打个招呼或聊点什么。

{event_text}{perception_text}{memory_text}
【当前关系】{affinity_desc}（好感度: {affinity:.0f}）
【你的性格】{info.get('personality', '')}

请用一个简短的主动发言开头（20-40字），像微信消息一样自然随意。
可以提及今日事件、最近对话、或者日常问候。
只说一句话即可，不要加引号。

你的主动发言："""

        if self.scene_generator and self.llm:
            try:
                scene = await self.scene_generator.generate_scene(
                    npc_names=[npc_name],
                    trigger_message="主动发起",
                    max_messages=1,
                    is_group=False,
                )
                if scene and len(scene) > 0:
                    return scene[0].get("content", "")[:100]
            except Exception as e:
                print(f"  ⚠️  场景生成主动消息失败: {e}")

        if self.llm:
            try:
                from hello_agents import SimpleAgent
                agent = SimpleAgent(name=f"Thinker_{npc_name}", llm=self.llm, system_prompt="你是一个主动发起对话的角色。只说一句话。")
                response = agent.run(prompt)
                return response.strip()[:100]
            except Exception as e:
                print(f"  ⚠️  LLM生成主动消息失败: {e}")

        # Fallback
        fallbacks = [
            "嗨，今天怎么样？",
            "在忙什么呢？",
        ]
        if event:
            fallbacks.insert(0, f"你听说了吗？{event[:30]}...")
        return random.choice(fallbacks)

    def get_pending(self, npc_name: str = None) -> List[dict]:
        """获取待发送的主动消息"""
        if npc_name:
            msgs = self.pending_messages.pop(npc_name, [])
            return msgs

        all_msgs = []
        for name in list(self.pending_messages.keys()):
            msgs = self.pending_messages.pop(name, [])
            all_msgs.extend(msgs)
        return all_msgs

    async def think_all(self):
        """对所有 IDLE NPC 执行思考"""
        npc_names = list(self.npc_manager.agents.keys())
        for name in npc_names:
            try:
                await self.think(name)
            except Exception as e:
                print(f"❌ {name} 自主思考失败: {e}")
