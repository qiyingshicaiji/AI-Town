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
        self.scene_generator = None  # 由 state_manager 注入

        # ✅ 最近一场抢话的完整记录（用于连续性上下文）
        self._last_contention: Optional[List[dict]] = None

        print("🎯 群聊抢话引擎 v3 已初始化 (統ㄧ記憶寫入 + 内容去重)")

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
        # ✅ 记录本场抢话，供下次使用做连续性参考
        self._record_contention_session(rounds)

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

        # 因素6: 随机因子 (模拟真实对话的不确定性，扩大范围避免总是同一人发言)
        score += random.randint(-3, 5)

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
        """生成单个 NPC 的抢话发言（v3：含记忆检索 + 个性化 + 去重）"""
        info = self.npc_manager.get_npc_info(npc_name)
        if not info:
            return None

        # 1. 今日事件
        event = self.timeline_manager.get_event_context()
        event_text = f"【今日事件】{event}\n" if event else ""

        # 2. 最近发言上下文（当前抢话轮次）
        recent = ""
        if history:
            recent = "【当前群聊记录】\n" + "\n".join(
                f"  {r['speaker']}: {r['content']}" for r in history[-10:]
            ) + "\n"

        # 3. ✅ 记忆检索：查该 NPC 关于当前话题和其他参与者的记忆
        memory_text = ""
        try:
            mem_mgr = self.npc_manager.memories.get(npc_name)
            if mem_mgr:
                # 从当前上下文提取查询关键词
                query_words = []
                if history:
                    for h in history[-3:]:
                        query_words.append(h.get("content", "")[:40])
                query = " ".join(query_words) if query_words else ""
                memories = mem_mgr.retrieve_memories(
                    query=query,
                    memory_types=["working", "episodic"],
                    limit=4,
                    min_importance=0.2
                )
                if memories:
                    mem_lines = [f"  - {m.content[:100]}" for m in memories]
                    memory_text = "【你的相关记忆 — 可以自然地提及或延续这些内容】\n" + "\n".join(mem_lines) + "\n"
        except Exception:
            pass

        # 4. ✅ 人格上下文
        from agents import NPC_ROLES
        full_role = NPC_ROLES.get(npc_name, {})
        personality = full_role.get("core_personality", info.get("personality", ""))
        speak_style = full_role.get("speaking_style", "")
        quirks = full_role.get("quirks", [])

        personality_text = f"【你的性格】{personality}\n【说话风格】{speak_style}"
        if quirks:
            personality_text += f"\n【小习惯】{'; '.join(quirks[:3])}"

        # 5. ✅ 去重：從記憶系統中檢索該 NPC 最近的發言（而非手動維護 history）
        anti_repeat = ""
        try:
            mem_mgr = self.npc_manager.memories.get(npc_name)
            if mem_mgr:
                # 檢索最近關於「我說」的工作記憶
                recent_speeches = mem_mgr.retrieve_memories(
                    query="我说",
                    memory_types=["working"],
                    limit=5,
                    min_importance=0.1
                )
                if recent_speeches:
                    speech_lines = [f"  - {m.content[:80]}" for m in recent_speeches[:3]]
                    anti_repeat = "【⚠️ 你最近的发言 — 避免重复说过的话】\n" + "\n".join(speech_lines) + "\n"
        except Exception:
            pass

        # 6. ✅ 上次抢话记录（连续性）
        last_session = ""
        if self._last_contention:
            last_lines = []
            for r in self._last_contention[-4:]:  # 最近 4 条
                last_lines.append(f"  {r['speaker']}: {r['content']}")
            if last_lines:
                last_session = "【上次群聊的结尾 — 可以自然延续或提及，像真人聚会一样】\n" + "\n".join(last_lines) + "\n"

        # 构建 prompt
        prompt = f"""{event_text}{last_session}{memory_text}{personality_text}

{recent}{anti_repeat}
请用你的性格和风格，说一句自然的发言（20-40字）。
不要重复自己或他人已经说过的话，每次发言要有新观点或新角度。
如果记忆中有相关的内容，可以自然地提及——像真人聊天一样。
不要引号，直接用日常聊天语气："""

        if self.llm:
            try:
                # 复用持久化 Agent（包含完整角色系统提示词 + 记忆）
                agent = self.npc_manager.agents.get(npc_name)
                if agent:
                    response = await asyncio.to_thread(agent.run, prompt, temperature=1.0)
                else:
                    from hello_agents import SimpleAgent
                    agent = SimpleAgent(
                        name=f"Speaker_{npc_name}", llm=self.llm,
                        system_prompt="你是群聊参与者。根据上下文说一句自然的发言，20-40字。不要重复已说过的话，每次发言要有新内容。"
                    )
                    response = agent.run(prompt)
                content = response.strip()
                content = re.sub(r'^["\'\`＂＇]|["\'\`＂＇]$', '', content)
                content = re.sub(r'^(我说的?[:：]?\s*)|(我说[:：]?\s*)', '', content)
                content = content[:100] or f"嗯，有道理。"

                # ✅ 去重检查：与记忆中最近发言的 Jaccard 相似度
                if self._is_speech_duplicate(npc_name, content):
                    print(f"  🚫 抢话去重 [{npc_name}]: 与最近发言高度相似，跳过")
                    fallback = self._get_fallback_speech(npc_name, info, history)
                    if fallback and not self._is_speech_duplicate(npc_name, fallback):
                        content = fallback
                        print(f"     → 使用备选发言")
                    else:
                        return None

                # ✅ 統ㄧ記憶寫入：發言寫入說話者 + 其他 NPC 聽眾的工作記憶
                if content:
                    listeners = [n for n in self.npc_manager.agents.keys() if n != npc_name]
                    self.npc_manager.record_npc_speech(
                        npc_name=npc_name,
                        content=content,
                        listeners=listeners,
                        context_type="群聊抢话",
                        importance=0.5
                    )

                return content
            except Exception as e:
                print(f"  ⚠️  {npc_name} 发言生成失败: {e}")

        return random.choice([
            "嗯，我觉得有道理。", "是的，我也是这么想的。",
            "这个话题挺有意思的。", f"从{info.get('title', '')}的角度看，确实如此。",
        ])

    def _is_speech_duplicate(self, npc_name: str, new_content: str) -> bool:
        """檢查新發言是否與記憶中最近的發言高度重複"""
        try:
            mem_mgr = self.npc_manager.memories.get(npc_name)
            if not mem_mgr:
                return False
            recent = mem_mgr.retrieve_memories(
                query="我说",
                memory_types=["working"],
                limit=5,
                min_importance=0.1
            )
            for mem in recent:
                # 從記憶內容中提取實際發言文字
                old_content = mem.content
                # 移除 "我说: " 前綴
                if old_content.startswith("我说: "):
                    old_content = old_content[4:]
                if self._jaccard_similarity(old_content, new_content) > 0.55:
                    return True
        except Exception:
            pass
        return False

    def _jaccard_similarity(self, text_a: str, text_b: str) -> float:
        """2-gram Jaccard 相似度"""
        def get_2grams(s):
            return set(s[i:i+2] for i in range(len(s)-1))
        grams_a = get_2grams(text_a)
        grams_b = get_2grams(text_b)
        if not grams_a or not grams_b:
            return 0.0
        intersection = grams_a & grams_b
        union = grams_a | grams_b
        return len(intersection) / len(union) if union else 0.0

    def _get_fallback_speech(self, npc_name: str, info: dict, history: list) -> str:
        """生成备用发言（不使用 LLM）"""
        if history:
            templates = [
                "嗯，有道理。",
                "我觉得也是。",
                f"从{info.get('title', '')}的角度来看，确实如此。",
                "这个话题挺有意思的。",
                "对，我同意这个观点。",
            ]
            return random.choice(templates)
        return random.choice([
            "大家说得对。", "确实。", "我也有同感。",
        ])

    def _record_contention_session(self, rounds: List[dict]):
        """记录整场抢话，供下次抢话作为连续性参考"""
        if rounds:
            self._last_contention = list(rounds)  # 深拷贝
