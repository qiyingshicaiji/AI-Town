"""场景生成器 - 一次 LLM 调用生成完整多人对话"""

import json
import re
import random
from typing import List, Dict, Optional


class SceneGenerator:
    """统一场景生成引擎

    一次 LLM 调用生成完整对话场景：
    - 群聊：玩家消息 + 所有 NPC 互动
    - 1v1：NPC 可能连发多条
    - NPC间：两个 NPC 的自然对话
    - 主动消息：NPC 向玩家发起对话
    """

    def __init__(self, npc_manager, timeline_manager, llm=None):
        self.npc_manager = npc_manager
        self.timeline_manager = timeline_manager
        self.llm = llm
        try:
            from character_evolution import CharacterEvolution
            self.evolution = CharacterEvolution(npc_manager)
        except Exception:
            self.evolution = None
        print("🎬 场景生成器已初始化")

    async def generate_scene(
        self,
        npc_names: List[str],
        trigger_message: str = "",
        history: List[dict] = None,
        affinity_context: Dict[str, float] = None,
        max_messages: int = 8,
        is_group: bool = False,
        is_npc_npc: bool = False,
        extra_context: str = "",
    ) -> List[dict]:
        """生成对话场景

        Returns: [{"speaker": "张三", "content": "..."}, ...]
        """
        if not self.llm:
            return self._fallback_scene(npc_names, is_group, is_npc_npc, trigger_message)

        # 获取事件
        event_text = self.timeline_manager.get_event_context() or "办公室日常工作"

        # 构建角色描述
        roles_text = self._build_roles_text(npc_names, affinity_context)

        # 构建历史（含跨场景记忆查询）
        # ✅ 传入 is_npc_npc 和 extra_context，确保 NPC-NPC 场景能检索到相关记忆
        history_text = await self._build_history_text(
            npc_names, history,
            is_npc_npc=is_npc_npc,
            extra_context=extra_context
        )

        # 构建规则
        rules = self._build_rules(npc_names, is_group, is_npc_npc, trigger_message, max_messages)

        # 触发文本
        if is_npc_npc:
            trigger_text = f"【场景】{npc_names[0]}和{npc_names[1]}正在办公室里聊天。"
        elif trigger_message:
            trigger_text = f"【触发消息】玩家说：{trigger_message}"
        else:
            trigger_text = "【场景】角色们正在办公室闲聊。"

        # 额外上下文（如最近对话历史，用于避免重复）
        extra_text = f"\n{extra_context}" if extra_context else ""

        prompt = f"""你是一个对话生成器。根据角色和背景，生成一段自然的聊天对话。

{roles_text}

【今日事件】{event_text}

{history_text}
{extra_text}
{trigger_text}

{rules}

只输出纯 JSON 数组，不要任何解释、markdown或代码块标记:
[{{"speaker":"角色名","content":"对话内容"}},{{"speaker":"角色名","content":"对话内容"}},...]"""

        try:
            from hello_agents import SimpleAgent
            agent = SimpleAgent(
                name="SceneWriter",
                llm=self.llm,
                system_prompt="你是对话编剧。只输出JSON数组，每元素有speaker和content字段。"
            )
            response = agent.run(prompt, temperature=0.9)
            scene = self._parse_json_response(response, npc_names)

            # 保存到记忆
            conv_type = "群聊" if is_group else ("NPC间对话" if is_npc_npc else "1v1聊天")
            self._save_scene_to_memory(scene, npc_names, trigger_message, conv_type)

            # 检查人物成长
            if self.evolution:
                for name in npc_names:
                    self.evolution.check_and_evolve(name)

            return scene
        except Exception as e:
            print(f"⚠️ 场景生成失败: {e}")
            return self._fallback_scene(npc_names, is_group, is_npc_npc, trigger_message)

    # ==================== Prompt Builders ====================

    def _build_roles_text(self, npc_names, affinities):
        """构建角色描述 — 性格优先，工作为背景"""
        parts = []
        for name in npc_names:
            info = self.npc_manager.get_npc_info(name)
            if not info:
                continue

            # 从完整 NPC_ROLES 获取深度信息
            from agents import NPC_ROLES
            full_role = NPC_ROLES.get(name, {})

            cp = full_role.get("core_personality", info.get("personality", ""))
            work = full_role.get("work_context", info.get("expertise", ""))
            speak = full_role.get("speaking_style", info.get("style", ""))
            quirks = full_role.get("quirks", [])
            triggers = full_role.get("emotional_triggers", {})
            pos_t = "、".join(triggers.get("positive", [])[:3])
            neg_t = "、".join(triggers.get("negative", [])[:3])
            pet = full_role.get("pet_peeves", "")

            aff = affinities.get(name, 50) if affinities else 50
            if aff >= 80:
                mood = "【挚友级·好感度{:.0f}】非常热情，像对待最好的老朋友。主动关心对方，语气温暖信任，愿意分享私事。".format(aff)
            elif aff >= 60:
                mood = "【亲密级·好感度{:.0f}】友好热情，话多放松，会主动找话题和关心对方。".format(aff)
            elif aff >= 40:
                mood = "【友好级·好感度{:.0f}】礼貌友善，保持正常同事距离，不过分热情也不冷淡。".format(aff)
            elif aff >= 20:
                mood = "【熟悉级·好感度{:.0f}】略显生疏，回答简洁，不太想扩展话题，保持礼貌但疏远。".format(aff)
            else:
                mood = "【冷淡级·好感度{:.0f}】冷淡疏离，回答极其简短（≤10字），语气客气但想尽快结束对话。".format(aff)

            parts.append(f"""【{name}】
{cp}

工作背景: {work}
说话风格: {speak}
小习惯: {'; '.join(quirks) if quirks else '无特殊习惯'}
开心的事: {pos_t}
不爽的事: {neg_t}
雷区: {pet}
对玩家的态度: {mood}（好感度 {aff:.0f}）

{self._get_evolution_text(name)}""")

        return "\n---\n".join(parts)

    async def _build_history_text(self, npc_names, history, is_npc_npc=False, extra_context=""):
        """构建上下文 — 当前对话历史 + 跨场景记忆"""
        parts = []

        # 1. 当前对话历史
        if history and len(history) > 0:
            recent = history[-6:]
            lines = []
            for m in recent:
                sender = m.get("speaker") or m.get("sender", "unknown")
                content = m.get("content", "")
                lines.append(f"{sender}: {content}")
            parts.append("【当前对话】\n" + "\n".join(lines))
        else:
            parts.append("【当前对话】（这是对话的开头）")

        # 2. 跨场景记忆：查询每个 NPC 的记忆（按时间线过滤）
        timeline_id = getattr(self.timeline_manager, '_active_timeline_id', None)
        memory_lines = []
        for name in npc_names:
            mem_mgr = self.npc_manager.memories.get(name)
            if not mem_mgr:
                continue
            try:
                # 构建查询文本
                # ✅ 核心修复：NPC-NPC 对话时，用对方名字作为查询词
                if is_npc_npc and len(npc_names) >= 2:
                    # 找到「对方」的名字
                    other_name = npc_names[0] if name == npc_names[1] else npc_names[1]
                    query = f"{other_name} 对话 聊天 讨论"
                elif history:
                    query_parts = [h.get("content", "") for h in history[-3:]]
                    query = " ".join(query_parts)
                else:
                    query = ""

                # NPC-NPC 对话需要更积极的记忆检索
                mem_limit = 6 if is_npc_npc else 4
                mem_threshold = 0.2 if is_npc_npc else 0.3

                memories = mem_mgr.retrieve_memories(
                    query=query,
                    memory_types=["working", "episodic"],
                    limit=mem_limit,
                    min_importance=mem_threshold
                )
                # 按时间线过滤
                if timeline_id and memories:
                    memories = [
                        m for m in memories
                        if m.metadata.get("timeline_id") is None or m.metadata.get("timeline_id") == timeline_id
                    ]
                if memories:
                    mem_strs = [f"  - {m.content[:120]}" for m in memories[:mem_limit]]
                    memory_lines.append(f"{name}的相关记忆:\n" + "\n".join(mem_strs))
            except Exception as e:
                pass  # 记忆查询失败不影响对话生成

        if memory_lines:
            label = (
                "【跨场景记忆 — 以下是 NPC 最近聊过的话题和互动，"
                "可以自然延续旧话题，但⚠️注意不要重复讨论已经充分聊过的内容】"
            )
            parts.append(label + "\n" + "\n".join(memory_lines))

        return "\n\n".join(parts)

    def _build_rules(self, npc_names, is_group, is_npc_npc, trigger, max_messages):
        """构建规则 — 性格驱动"""
        if is_npc_npc:
            char_rule = f"只有{npc_names[0]}和{npc_names[1]}两人对话"
            # ✅ NPC-NPC 对话连续性指导
            continuity_rule = (
                "如果「跨场景记忆」或「上一次对话」中有两人之前的互动内容，"
                "请自然地延续或提及之前的话题，就像真人同事之间的日常聊天一样——"
                "可以接着上次没说完的话继续，也可以基于记忆里的内容发展新话题。"
                "对话应该有「时间感」：上次聊过的这次可以追问进展、补充细节、或者岔开到相关话题。"
            )
        elif is_group or len(npc_names) > 1:
            char_rule = f"参与: {'、'.join(npc_names)}。感兴趣的多说，不感兴趣的少说或不说。可以连续发2-3条"
            continuity_rule = ""
        else:
            char_rule = f"只有{npc_names[0]}说话。如果话题让其兴奋，可以连续发2-3条消息"
            continuity_rule = ""

        trigger_rule = "需要先回应玩家的消息，然后自然展开对话" if trigger else "角色们自由展开闲聊"

        continuity_section = f"\n11. {continuity_rule}" if continuity_rule else ""

        topic_avoid = (
            "\n12. ⚠️ 避開最近已討論的話題。如果「跨场景记忆」中顯示之前聊過某個話題，"
            "請主動發展新話題，不要重複討論相同內容。像真人一樣——聊過的事不會反覆提起。"
        ) if is_npc_npc else ""

        return f"""【规则】
1. {char_rule}
2. 性格是最核心的驱动力——工作只是背景，不是谈话目的
3. 不要说教、不要回到"我们还是谈谈工作吧"——除非角色确实只关心工作
4. 允许跑题、闲聊、吐槽、开玩笑——这才是正常人之间的对话
5. 开心的事让角色话多，不开心的事让角色沉默、冷淡或转移话题
6. 好感度影响说话的语气和深度（高=随意亲切，低=客气疏离）
7. 过往记忆会被不经意提起——像真人的回忆那样自然
8. 每句话15-40字，微信聊天风格，口语化
9. {trigger_rule}
10. 总共约{max_messages}条消息{continuity_section}{topic_avoid}"""

    def _get_evolution_text(self, npc_name):
        if not self.evolution:
            return ""
        ctx = self.evolution.get_evolution_context(npc_name)
        return ctx + "\n" if ctx else ""

    # ==================== Memory Saving ====================

    def _save_scene_to_memory(self, scene: List[dict], npc_names: List[str], trigger: str, conv_type: str):
        """將場景消息通過統一的 record_npc_speech() 寫入記憶系統"""
        # 確定聽眾列表（場景中的所有 NPC 都是聽眾）
        all_listeners = list(npc_names)

        for msg in scene:
            speaker = msg.get("speaker", "")
            content = msg.get("content", "")
            if not speaker or speaker not in npc_names:
                continue

            # 說話者以外的 NPC 都是聽眾
            listeners = [n for n in all_listeners if n != speaker]

            # ✅ 使用統一的記憶寫入入口
            imp = 0.7 if conv_type == "NPC间对话" else 0.5
            self.npc_manager.record_npc_speech(
                npc_name=speaker,
                content=content,
                listeners=listeners,
                context_type=conv_type,
                importance=imp
            )

        # 玩家消息也保存到所有參與 NPC 的記憶中
        if trigger:
            current_time = __import__('datetime').datetime.now()
            timeline_id = getattr(self.timeline_manager, '_active_timeline_id', None)
            for name in npc_names:
                mem_mgr = self.npc_manager.memories.get(name)
                if not mem_mgr:
                    continue
                try:
                    mem_mgr.add_memory(
                        content=f"玩家在{conv_type}中说: {trigger}",
                        memory_type="working",
                        importance=0.6,
                        metadata={
                            "speaker": "玩家",
                            "context": conv_type,
                            "participants": npc_names,
                            "timestamp": current_time.isoformat(),
                            "timeline_id": timeline_id,
                        }
                    )
                except Exception:
                    pass
            # 觸發整合檢查
            for name in npc_names:
                self.npc_manager._check_and_consolidate(name)

    # ==================== JSON Parser ====================

    def _parse_json_response(self, response: str, valid_names: List[str]) -> List[dict]:
        """解析 LLM 返回的 JSON，鲁棒处理各种格式"""
        # 清理
        text = response.strip()

        # 移除 markdown 代码块
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)

        # 尝试直接解析
        try:
            messages = json.loads(text)
            if isinstance(messages, list):
                return self._validate_messages(messages, valid_names)
        except json.JSONDecodeError:
            pass

        # 尝试提取 JSON 数组
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                messages = json.loads(text[start:end])
                if isinstance(messages, list):
                    return self._validate_messages(messages, valid_names)
            except json.JSONDecodeError:
                pass

        # 最后手段：逐行解析
        print("⚠️ JSON解析失败，尝试逐行提取...")
        messages = []
        for line in text.split("\n"):
            line = line.strip().strip('",')
            match = re.match(r'^(.+?)[:：]\s*(.+)$', line)
            if match:
                speaker = match.group(1).strip().rstrip('说')
                content = match.group(2).strip().strip('"\'＂＇')
                if speaker in valid_names and content:
                    messages.append({"speaker": speaker, "content": content})

        return messages if messages else self._fallback_scene(valid_names, False, False, "")

    def _validate_messages(self, messages: List[dict], valid_names: List[str]) -> List[dict]:
        """验证并清理消息"""
        result = []
        for m in messages:
            if not isinstance(m, dict):
                continue
            speaker = m.get("speaker", "")
            content = m.get("content", "")
            if speaker in valid_names and content:
                content = content.strip().strip('"\'＂＇')
                if len(content) > 5:
                    result.append({"speaker": speaker, "content": content})
        return result

    # ==================== Fallback ====================

    def _fallback_scene(self, npc_names, is_group, is_npc_npc, trigger):
        """无 LLM 时的备用场景"""
        if is_npc_npc and len(npc_names) >= 2:
            return [
                {"speaker": npc_names[0], "content": f"最近工作怎么样？"},
                {"speaker": npc_names[1], "content": "还行吧，每天都有新挑战。你呢？"},
                {"speaker": npc_names[0], "content": "我也差不多，今天事情特别多。"},
            ]

        if trigger:
            name = npc_names[0] if npc_names else "张三"
            return [
                {"speaker": name, "content": f"好的,我理解了。关于'{trigger[:15]}...'这个问题,我觉得可以从几个方面来看。"},
            ]

        name = npc_names[0] if npc_names else "张三"
        return [{"speaker": name, "content": "嗯，这个话题挺有意思的。"}]
