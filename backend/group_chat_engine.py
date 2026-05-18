"""群聊抢话引擎 v2 - 启发式意愿 + 流式返回"""

import asyncio
import random
import re
import json
from typing import Dict, List, Optional, AsyncGenerator


class GroupChatEngine:
    MAX_ROUNDS = 8
    SPEECH_COOLDOWN = 2

    EXTROVERSION = {"张三": 3, "李四": 8, "王五": 5}

    # 每个 NPC 的专长关键词（从 NPC_ROLES 提取）
    EXPERTISE_KEYWORDS = {
        "张三": ["代码", "算法", "框架", "Python", "bug", "程序", "技术", "开发", "架构", "多智能体", "编程"],
        "李四": ["需求", "产品", "用户", "项目", "会议", "规划", "体验", "评审", "客户", "功能", "方案"],
        "王五": ["设计", "界面", "配色", "美感", "交互", "UI", "视觉", "咖啡", "艺术", "风格", "审美"],
    }

    def __init__(self, npc_manager, timeline_manager, llm=None):
        self.npc_manager = npc_manager
        self.timeline_manager = timeline_manager
        self.llm = llm
        print("🎯 群聊抢话引擎 v2 已初始化 (启发式意愿 + 流式返回)")

    # ==================== Streaming API ====================

    async def run_contention_streaming(
        self, npc_names: List[str], initial_context: str = "", max_rounds: int = None
    ) -> AsyncGenerator[dict, None]:
        """流式运行抢话循环，每轮 yield 一次"""
        max_r = max_rounds or self.MAX_ROUNDS
        context = initial_context or "（群聊开始）"
        rounds = []
        cooldowns: Dict[str, int] = {}
        silent_rounds = 0

        for rnd in range(max_r):
            # 更新冷却
            for name in list(cooldowns.keys()):
                cooldowns[name] -= 1
                if cooldowns[name] <= 0:
                    del cooldowns[name]

            # 筛选可用 NPC
            available = [n for n in npc_names if n not in cooldowns]
            if not available:
                break

            # 启发式意愿评分（瞬间完成）
            scores = self._score_all_heuristic(available, context, rounds)

            # 选最高分
            best_npc, best_score = self._pick_best(scores)

            if best_score <= 5:
                silent_rounds += 1
                if silent_rounds >= 2:
                    yield {"type": "done", "reason": "无人继续发言", "rounds": rounds}
                    return
                yield {"type": "silence", "round": rnd}
                continue

            silent_rounds = 0

            # 生成发言（仅此处调用 LLM）
            yield {"type": "speaking", "speaker": best_npc, "willingness": best_score, "round": rnd}

            content = await self._generate_speech_fast(best_npc, context, rounds)

            if not content:
                break

            round_data = {"speaker": best_npc, "content": content, "willingness": best_score}
            rounds.append(round_data)
            context += f"\n{best_npc}: {content}"
            cooldowns[best_npc] = self.SPEECH_COOLDOWN

            yield {"type": "round", "data": round_data, "round": rnd}

            # 短暂延迟让前端有时间渲染
            await asyncio.sleep(0.3)

        yield {"type": "done", "reason": "达到最大轮次" if len(rounds) >= max_r else "对话结束", "rounds": rounds}

    # ==================== Non-streaming (backward compat) ====================

    async def run_contention(self, npc_names, initial_context="", max_rounds=None):
        rounds = []
        async for event in self.run_contention_streaming(npc_names, initial_context, max_rounds):
            if event.get("type") == "round":
                rounds.append(event["data"])
            elif event.get("type") == "done":
                break
        return {"rounds": rounds, "reason": "完成"}

    # ==================== Heuristic Scoring ====================

    def _score_all_heuristic(self, npc_names, context, history):
        scores = {}
        for name in npc_names:
            scores[name] = self._score_one_heuristic(name, context, history)
        return scores

    def _score_one_heuristic(self, npc_name, context, history):
        info = self.npc_manager.get_npc_info(npc_name)
        if not info:
            return 0

        # 基础分 = 性格外向度
        score = self.EXTROVERSION.get(npc_name, 5)

        # 因素1: 上下文提到相关关键词
        expertise = info.get("expertise", "")
        ctx_lower = context.lower()
        keywords = self.EXPERTISE_KEYWORDS.get(npc_name, [])
        for kw in keywords:
            if kw in context:
                score += 3
                break  # 只加一次

        # 因素2: 被提到名字
        if npc_name in context:
            score += 4

        # 因素3: 刚说过话（冷却）
        if history:
            last_speaker = history[-1].get("speaker", "")
            if last_speaker == npc_name:
                score -= 10  # 强冷却

            # 因素4: 上一句话与自己相关（关键词在自己专长里）
            last_content = history[-1].get("content", "")
            for kw in keywords:
                if kw in last_content:
                    score += 2
                    break

        # 因素5: 今日事件相关
        event = self.timeline_manager.get_event_context()
        if event and npc_name in event:
            score += 3

        # 因素6: 随机因子 (模拟真实对话的不确定性)
        score += random.randint(-1, 2)

        return max(0, min(10, score))

    def _pick_best(self, scores):
        best_npc = None
        best_score = -1
        for name, score in scores.items():
            if score > best_score:
                best_score = score
                best_npc = name
            elif score == best_score and best_npc:
                # 平局：外向优先
                if self.EXTROVERSION.get(name, 5) > self.EXTROVERSION.get(best_npc, 5):
                    best_npc = name
        return best_npc, best_score

    # ==================== Speech Generation ====================

    async def _generate_speech_fast(self, npc_name, context, history):
        info = self.npc_manager.get_npc_info(npc_name)
        if not info:
            return None

        event = self.timeline_manager.get_event_context()
        event_text = f"今日事件: {event}\n" if event else ""

        # 构建简洁 prompt
        recent = ""
        if history:
            recent = "最近发言:\n" + "\n".join(
                f"  {r['speaker']}: {r['content']}" for r in history[-3:]
            ) + "\n"

        prompt = f"""{event_text}{recent}
你是{npc_name}（{info.get('title', '')}），性格{info.get('personality', '')}。
对群聊话题说一句自然的发言（20-40字），不要引号："""

        if self.llm:
            try:
                from hello_agents import SimpleAgent
                agent = SimpleAgent(
                    name=f"Speaker_{npc_name}", llm=self.llm,
                    system_prompt="你是群聊参与者。根据上下文说一句自然的发言，20-40字，不要引号。"
                )
                response = agent.run(prompt)
                content = response.strip()
                content = re.sub(r'^["\'\`＂＇]|["\'\`＂＇]$', '', content)
                content = re.sub(r'^(我说的?[:：]?\s*)|(我说[:：]?\s*)', '', content)
                return content[:100] or f"嗯，有道理。"
            except Exception as e:
                print(f"  ⚠️  {npc_name} 发言生成失败: {e}")

        return random.choice([
            "嗯，我觉得有道理。", "是的，我也是这么想的。",
            "这个话题挺有意思的。", f"从{info.get('title', '')}的角度看，确实如此。",
        ])
