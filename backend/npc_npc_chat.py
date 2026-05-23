"""NPC 间聊天引擎 - 事件驱动 + 条件触发 + 防刷屏"""

import sys
import os
import random
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import uuid4

# 添加HelloAgents到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'HelloAgents'))

from config import settings


# ==================== Fallback 对话模板 ====================

FALLBACK_DIALOGUES = [
    {
        "trigger": "default",
        "rounds": [
            ("最近工作怎么样？", "还行吧，每天都有新挑战。"),
            ("是啊，这个项目挺有意思的。", "对，我觉得我们可以做得更好。"),
        ]
    },
    {
        "trigger": "暴雨|下雨|漏水|淹水|台风",
        "rounds": [
            ("今天这天气真是糟糕啊。", "是啊，希望不要影响到工作。"),
            ("你看外面的雨，感觉一时半会停不了。", "嗯，注意安全吧。"),
        ]
    },
    {
        "trigger": "争吵|吵架|冲突|打架|矛盾",
        "rounds": [
            ("我觉得我们需要好好谈谈。", "你说得对，之前的误会应该解开了。"),
            ("我也反思了一下自己。", "大家各退一步，都是为了工作好。"),
        ]
    },
    {
        "trigger": "合作|项目|任务|需求",
        "rounds": [
            ("关于这个需求，你有什么想法？", "我觉得可以从用户体验的角度重新考虑。"),
            ("好主意，我们找李四一起讨论一下吧。", "行，我约个会议室。"),
        ]
    },
    {
        "trigger": "团建|聚餐|聚会|活动",
        "rounds": [
            ("听说要搞团建了？", "是啊，据说这周五下午。"),
            ("希望这次活动有趣一点。", "我也期待，上次的烧烤就挺好的。"),
        ]
    },
]


class NPCNPCChatEngine:
    """NPC 间聊天引擎

    触发条件:
    1. NPC 间好感度 >= AFFINITY_THRESHOLD (50)
    2. 双方都是 IDLE 状态
    3. 随机概率 TRIGGER_PROBABILITY (30%)
    4. 冷却时间已过 (120s)

    防刷屏:
    - 每次最多 3 轮对话
    - 单次最长 60 秒
    - 同一对冷却 120 秒
    - 同时最多 1 组
    - 每日最多 50 次 LLM 调用
    """

    MAX_ROUNDS = 3
    MAX_DURATION = settings.NPC_STATE_TIMEOUT_BUSY  # 60s
    COOLDOWN = 300000         # 同一对冷却 5 分钟
    GLOBAL_COOLDOWN = 60000   # 全局冷却：任意对话结束后 60s 才允许下一场
    TRIGGER_PROBABILITY = 0.15  # 每次检查 15% 概率
    AFFINITY_THRESHOLD = 50
    MAX_DAILY_CALLS = settings.NPC_NPC_CHAT_MAX_DAILY
    DEDUP_LOOKBACK = 8     # 去重时回溯最近 5 场对话
    DEDUP_SIMILARITY_THRESHOLD = 0.65  # Jaccard 相似度阈值

    def __init__(self, npc_manager, timeline_manager, llm=None):
        self.npc_manager = npc_manager
        self.timeline_manager = timeline_manager
        self.llm = llm
        self.scene_generator = None  # 由 state_manager 注入

        # 冷却追踪: {(npc_a, npc_b): datetime}
        self.cooldowns: Dict[tuple, datetime] = {}

        # 全局冷却：任何对话结束后才开始计时
        self._global_cooldown_until: Optional[datetime] = None

        # 活跃对话: {chat_id: ActiveChat}
        self.active_chats: Dict[str, dict] = {}

        # 对话历史
        self.chat_history: List[dict] = []

        # 当日调用计数
        self.daily_call_count = 0
        self._last_daily_reset = datetime.now().date()

        print("💬 NPC聊天引擎已初始化")
        print(f"   触发条件: 好感度≥{self.AFFINITY_THRESHOLD} + 双IDLE + {self.TRIGGER_PROBABILITY*100:.0f}%概率")
        print(f"   防刷屏: 最多{self.MAX_ROUNDS}轮 + {self.MAX_DURATION}s超时 + {self.COOLDOWN}s冷却 + {self.GLOBAL_COOLDOWN}s全局冷却")
        print(f"   内容去重: 基於記憶系統 + 相似度阈值{self.DEDUP_SIMILARITY_THRESHOLD}")
        print(f"   每日上限: {self.MAX_DAILY_CALLS}次LLM调用")

    def _reset_daily_counter(self):
        """每日重置调用计数"""
        today = datetime.now().date()
        if today != self._last_daily_reset:
            self.daily_call_count = 0
            self._last_daily_reset = today

    def _is_cooling_down(self, npc_a: str, npc_b: str) -> bool:
        """检查一对 NPC 是否在冷却中"""
        key = (npc_a, npc_b) if npc_a < npc_b else (npc_b, npc_a)
        if key in self.cooldowns:
            elapsed = (datetime.now() - self.cooldowns[key]).total_seconds()
            if elapsed < self.COOLDOWN:
                return True
        return False

    def _set_cooldown(self, npc_a: str, npc_b: str):
        """设置冷却"""
        key = (npc_a, npc_b) if npc_a < npc_b else (npc_b, npc_a)
        self.cooldowns[key] = datetime.now()
        # 同时设置全局冷却
        self._global_cooldown_until = datetime.now() + timedelta(seconds=self.GLOBAL_COOLDOWN)

    def _is_globally_cooling_down(self) -> bool:
        """全局冷却：任何对话结束后 GLOBAL_COOLDOWN 秒内不允许新对话"""
        if self._global_cooldown_until is None:
            return False
        return datetime.now() < self._global_cooldown_until

    def _would_be_duplicate(self, npc_a: str, npc_b: str, new_content: str) -> bool:
        """檢查新對話內容是否與記憶中最近的對話高度重複（使用記憶系統）"""
        # 從 NPC 的記憶中檢索最近的 NPC-NPC 對話內容
        for npc_name in [npc_a, npc_b]:
            try:
                mem_mgr = self.npc_manager.memories.get(npc_name)
                if not mem_mgr:
                    continue
                # 檢索最近的 NPC 間對話記憶
                recent = mem_mgr.retrieve_memories(
                    query=f"{npc_a if npc_name == npc_b else npc_b} 对话",
                    memory_types=["working", "episodic"],
                    limit=5,
                    min_importance=0.1
                )
                for mem in recent:
                    old_content = mem.content
                    # 移除 "我说: " 或 "XXX说: " 前綴
                    if ": " in old_content:
                        old_content = old_content.split(": ", 1)[1]
                    if self.npc_manager._jaccard_similarity(old_content, new_content) > self.DEDUP_SIMILARITY_THRESHOLD:
                        return True
            except Exception:
                pass
        return False

    async def check_and_trigger(self) -> Optional[str]:
        """检查触发条件，如果满足则触发 NPC 间对话

        Returns:
            chat_id 如果触发成功，否则 None
        """
        self._reset_daily_counter()

        # 清理已完成超过 15 秒的活跃对话
        now = datetime.now()
        stale_ids = []
        for cid, chat in self.active_chats.items():
            if chat.get("ended_at") and (now - chat["ended_at"]).total_seconds() > 15:
                stale_ids.append(cid)
        for cid in stale_ids:
            del self.active_chats[cid]

        # 检查每日上限
        if self.daily_call_count >= self.MAX_DAILY_CALLS:
            return None

        # 检查全局冷却
        if self._is_globally_cooling_down():
            return None

        # 检查是否还有正在进行（未结束）的活跃对话
        active_count = sum(1 for c in self.active_chats.values() if not c.get("ended_at"))
        if active_count > 0:
            return None

        # 获取所有 NPC
        npc_names = list(self.npc_manager.agents.keys())
        if len(npc_names) < 2:
            return None

        # 遍历所有 NPC 对
        candidates = []
        for i, a in enumerate(npc_names):
            for b in npc_names[i + 1:]:
                # 条件 1: 好感度
                aff = self.npc_manager.relationship_manager.get_npc_npc_affinity(a, b)
                if aff < self.AFFINITY_THRESHOLD:
                    continue

                # 条件 2: 双方空闲
                state_a = self.npc_manager.get_npc_state(a)
                state_b = self.npc_manager.get_npc_state(b)
                if state_a["state"] != "idle" or state_b["state"] != "idle":
                    continue

                # 条件 3: 冷却
                if self._is_cooling_down(a, b):
                    continue

                candidates.append((a, b, aff))

        if not candidates:
            return None

        # 条件 4: 概率触发
        if random.random() >= self.TRIGGER_PROBABILITY:
            return None

        # 随机选择一对
        a, b, aff = random.choice(candidates)
        return await self.trigger_chat(a, b, reason="auto")

    async def trigger_chat(self, npc_a: str, npc_b: str, reason: str = "auto") -> bool:
        """手动触发 NPC 间对话

        Args:
            npc_a: NPC A 名称
            npc_b: NPC B 名称
            reason: 触发原因 (auto/manual)

        Returns:
            是否成功触发
        """
        # 检查状态
        state_a = self.npc_manager.get_npc_state(npc_a)
        state_b = self.npc_manager.get_npc_state(npc_b)

        if reason == "auto":
            if state_a["state"] != "idle" or state_b["state"] != "idle":
                return False
            if self._is_cooling_down(npc_a, npc_b):
                return False
        else:
            # 手动触发可以覆盖一些限制
            pass

        # 检查是否有活跃（未结束的）对话
        active_count = sum(1 for c in self.active_chats.values() if not c.get("ended_at"))
        if active_count > 0:
            return False

        chat_id = uuid4().hex[:8]
        chat = {
            "id": chat_id,
            "npc_a": npc_a,
            "npc_b": npc_b,
            "messages": [],
            "started_at": datetime.now(),
            "ended_at": None,
            "trigger_reason": reason
        }
        self.active_chats[chat_id] = chat

        # 设置双方为 BUSY
        self.npc_manager.set_npc_state(npc_a, "busy")
        self.npc_manager.set_npc_state(npc_b, "busy")

        try:
            # 生成对话
            messages = await asyncio.wait_for(
                self._generate_conversation(npc_a, npc_b),
                timeout=self.MAX_DURATION
            )
            chat["messages"] = messages

        except asyncio.TimeoutError:
            chat["messages"] = [{
                "speaker": npc_a,
                "content": "啊，我得去忙了，下次再聊！"
            }]
        except Exception as e:
            print(f"❌ NPC对话生成失败 ({npc_a}↔{npc_b}): {e}")
            chat["messages"] = [{
                "speaker": npc_a,
                "content": "不好意思，我现在有点忙..."
            }]

        finally:
            # 结束对话 — 保留在 active_chats 15秒供前端轮询捕获
            chat["ended_at"] = datetime.now()
            self.chat_history.append(chat)
            if len(self.chat_history) > 200:
                self.chat_history = self.chat_history[-200:]

            # 恢复状态
            self.npc_manager.set_npc_state(npc_a, "idle")
            self.npc_manager.set_npc_state(npc_b, "idle")

            # 设置冷却
            self._set_cooldown(npc_a, npc_b)

            # ⚠️ 不立即删除 active_chats — check_and_trigger() 会清理超过15秒的已完成对话

        # 更新好感度
        self._update_affinity_from_chat(npc_a, npc_b, chat["messages"])

        return chat_id

    async def _generate_conversation(self, npc_a: str, npc_b: str) -> List[dict]:
        """生成 NPC 间对话（优先用场景生成器）"""
        self.daily_call_count += 1

        # 构建「最近已聊过」上下文 — 供 LLM 避开重复话题
        recent_context = self._build_recent_chat_context(npc_a, npc_b)

        # 优先使用场景生成器
        if self.scene_generator:
            try:
                scene = await self.scene_generator.generate_scene(
                    npc_names=[npc_a, npc_b],
                    trigger_message="",
                    max_messages=6,
                    is_npc_npc=True,
                    extra_context=recent_context,  # 告诉 LLM 最近聊了什么
                )
                if scene:
                    content_str = "|".join(m.get("content", "") for m in scene)
                    # 先做去重检查
                    if self._would_be_duplicate(npc_a, npc_b, content_str):
                        print(f"  🚫 内容去重拦截 [{npc_a}↔{npc_b}]: 与最近对话高度相似")
                        return self._generate_fallback(npc_a, npc_b, "", recent_context)
                    # ✅ 記憶寫入由 scene_generator._save_scene_to_memory 統一處理
                    return scene
            except Exception as e:
                print(f"⚠️ 场景生成器NPC对话失败: {e}")

        # 获取事件背景
        event_context = ""
        try:
            event_text = self.timeline_manager.get_event_context()
            if event_text:
                event_context = f"【今日事件】{event_text}\n"
        except Exception:
            pass

        # 获取 NPC 信息
        info_a = self.npc_manager.get_npc_info(npc_a)
        info_b = self.npc_manager.get_npc_info(npc_b)
        aff = self.npc_manager.relationship_manager.get_npc_npc_affinity(npc_a, npc_b)
        aff_level = self.npc_manager.relationship_manager.get_affinity_level(aff)

        # 优先使用 LLM
        if self.llm:
            try:
                return await self._generate_with_llm(npc_a, npc_b, info_a, info_b, aff_level, event_context, recent_context)
            except Exception as e:
                print(f"⚠️  LLM生成NPC对话失败: {e}，使用fallback")

        # Fallback
        return self._generate_fallback(npc_a, npc_b, event_context, recent_context)

    def _build_recent_chat_context(self, npc_a: str, npc_b: str) -> str:
        """構建「最近已聊過」上下文 — 從記憶系統中檢索（而非手動維護 history）"""
        parts = []

        # 1. ✅ 從 chat_history 提取上一次完整對話（用於連續性）
        last_chat = None
        for chat in reversed(self.chat_history):
            chat_a = chat.get("npc_a", "")
            chat_b = chat.get("npc_b", "")
            pair = (chat_a, chat_b) if chat_a < chat_b else (chat_b, chat_a)
            current_pair = (npc_a, npc_b) if npc_a < npc_b else (npc_b, npc_a)
            if pair == current_pair and chat.get("messages"):
                last_chat = chat
                break

        if last_chat:
            msgs = last_chat["messages"]
            lines = []
            for m in msgs[-6:]:
                speaker = m.get("speaker", "?")
                content = m.get("content", "")
                lines.append(f"  {speaker}: {content}")
            parts.append(f"【上一次 {npc_a} 和 {npc_b} 的对话 — 这是你们上次聊的内容，请自然延续或发展话题】\n"
                         + "\n".join(lines))

        # 2. ✅ 從記憶系統檢索最近的相關對話（用於去重提示）
        dedup_lines = []
        for npc_name in [npc_a, npc_b]:
            try:
                mem_mgr = self.npc_manager.memories.get(npc_name)
                if not mem_mgr:
                    continue
                recent = mem_mgr.retrieve_memories(
                    query=f"{npc_a if npc_name == npc_b else npc_b}",
                    memory_types=["working"],
                    limit=3,
                    min_importance=0.1
                )
                for mem in recent:
                    short = mem.content[:80] + ("..." if len(mem.content) > 80 else "")
                    dedup_lines.append(f"  {short}")
            except Exception:
                pass

        if dedup_lines:
            seen = set()
            unique = []
            for line in dedup_lines:
                if line not in seen:
                    seen.add(line)
                    unique.append(line)
            parts.append("【⚠️ 以下是从记忆中检索到的最近互动 — 避免完全重复】\n"
                         + "\n".join(unique[:4]))

        return "\n\n".join(parts) if parts else ""

    async def _generate_with_llm(self, npc_a, npc_b, info_a, info_b, aff_level, event_context, recent_context="") -> List[dict]:
        """使用 LLM 生成对话"""
        # ✅ 连续性指导：如果提供了上次对话内容，要求自然延续
        continuity_instruction = ""
        if recent_context and "上一次" in recent_context:
            continuity_instruction = (
                "- **重要**：上面提供了上一次的对话内容。请自然延续话题——"
                "可以追问上次提到的事、补充新进展、或者顺着话题深入。"
                "像真人同事之间的日常交谈，不要像第一次见面。\n"
            )

        prompt = f"""生成两个同事之间的简短对话。

{event_context}
【角色A】{npc_a}（{info_a.get('title', '')}）: {info_a.get('personality', '')}
【角色B】{npc_b}（{info_b.get('title', '')}）: {info_b.get('personality', '')}
【关系】好感度等级: {aff_level}
{recent_context}
【要求】
- 请根据近期的上下文，自然地回复玩家/其他NPC。不要重复你已经说过的话。如果话题可以延续，请继续深入；如果话题结束，可以提出新话题
- 每次发言 20-40 字
- 角色保持一致的说话风格
- 如有事件背景请围绕展开
- {continuity_instruction}- 输出纯 JSON 数组格式，不要有任何其他文字

【输出格式示例】
[
  {{"speaker": "{npc_a}", "content": "今天天气真好啊。"}},
  {{"speaker": "{npc_b}", "content": "是啊，适合出去走走。"}},
  {{"speaker": "{npc_a}", "content": "午休的时候一起去楼下吧。"}}
]
"""

        try:
            from hello_agents import SimpleAgent
            agent = SimpleAgent(name="NPCChatGen", llm=self.llm, system_prompt="你是对话生成器，只输出JSON数组。")
            response = agent.run(prompt)

            # 解析 JSON
            response = response.strip()
            if response.startswith("```"):
                response = response.split("\n", 1)[1]
                if response.endswith("```"):
                    response = response[:-3]
                response = response.strip()
                if response.startswith("json"):
                    response = response[4:].strip()

            messages = json.loads(response)
            if not isinstance(messages, list):
                raise ValueError("非数组格式")

            # 限制轮数
            max_msgs = self.MAX_ROUNDS * 2
            if len(messages) > max_msgs:
                messages = messages[:max_msgs]

            # 去重检查
            content_str = "|".join(m.get("content", "") for m in messages)
            if self._would_be_duplicate(npc_a, npc_b, content_str):
                print(f"  🚫 LLM生成内容去重拦截 [{npc_a}↔{npc_b}]: 与最近对话高度相似")
                messages = self._generate_fallback(npc_a, npc_b, event_context, recent_context)
                content_str = "|".join(m.get("content", "") for m in messages)

            # ✅ 記憶寫入由 scene_generator._save_scene_to_memory 統一處理
            return messages

        except Exception as e:
            print(f"  LLM对话解析失败: {e}")
            raise

    def _generate_fallback(self, npc_a: str, npc_b: str, event_context: str = "", recent_context: str = "") -> List[dict]:
        """使用预设模板生成对话，优先选择没用过的模板"""
        import re

        # 根据事件关键词选择模板
        best_template = FALLBACK_DIALOGUES[0]  # default
        best_score = 0

        for template in FALLBACK_DIALOGUES:
            trigger = template["trigger"]
            if trigger == "default":
                continue
            matches = re.findall(trigger, event_context)
            score = len(matches)
            if score > best_score:
                best_score = score
                best_template = template

        # ✅ 嘗試選一個與記憶中最近內容不重複的模板
        recent_contents = []
        for npc_name in [npc_a, npc_b]:
            try:
                mem_mgr = self.npc_manager.memories.get(npc_name)
                if mem_mgr:
                    recent = mem_mgr.retrieve_memories(
                        query=f"{npc_a if npc_name == npc_b else npc_b}",
                        memory_types=["working"],
                        limit=3,
                        min_importance=0.1
                    )
                    recent_contents.extend([m.content for m in recent])
            except Exception:
                pass

        if recent_contents and len(FALLBACK_DIALOGUES) > 1:
            unused = []
            for template in FALLBACK_DIALOGUES:
                if template["trigger"] == "default":
                    continue
                template_content = "|".join(
                    f"{a}{b}" for a, b in template["rounds"]
                )
                is_dup = False
                for old in recent_contents[-3:]:
                    if self.npc_manager._jaccard_similarity(old, template_content) > 0.4:
                        is_dup = True
                        break
                if not is_dup:
                    unused.append(template)
            if unused:
                best_template = random.choice(unused)

        # 取 1-2 轮
        rounds = best_template["rounds"]
        num_rounds = min(random.randint(1, 2), len(rounds))

        messages = []
        for i in range(num_rounds):
            msg_a, msg_b = rounds[i]
            messages.append({"speaker": npc_a, "content": msg_a})
            messages.append({"speaker": npc_b, "content": msg_b})

        content_str = "|".join(m.get("content", "") for m in messages)
        # ✅ 記憶寫入由 scene_generator._save_scene_to_memory 統一處理
        return messages

    # _jaccard_similarity 已移至 NPCAgentManager（agents.py），此處改用 self.npc_manager._jaccard_similarity()

    def _update_affinity_from_chat(self, npc_a: str, npc_b: str, messages: List[dict]):
        """根据对话内容更新 NPC 间好感度"""
        # 简单规则：有对话就有小幅提升
        num_rounds = len(messages) // 2
        delta = min(num_rounds * 2, 5)  # 每轮 +2，最多 +5

        # 随机波动
        delta += random.uniform(-1, 1)

        self.npc_manager.relationship_manager.update_npc_npc_affinity(
            npc_a, npc_b, round(delta, 1)
        )

    def get_status(self) -> dict:
        """获取当前状态"""
        self._reset_daily_counter()

        cooldowns_remaining = {}
        now = datetime.now()
        for pair, dt in self.cooldowns.items():
            elapsed = (now - dt).total_seconds()
            remaining = max(0, int(self.COOLDOWN - elapsed))
            if remaining > 0:
                cooldowns_remaining[f"{pair[0]}-{pair[1]}"] = remaining

        return {
            "active_chats": list(self.active_chats.values()),
            "history": self.chat_history[-20:],
            "cooldowns": cooldowns_remaining,
            "daily_calls_remaining": max(0, self.MAX_DAILY_CALLS - self.daily_call_count),
            "daily_call_count": self.daily_call_count
        }
