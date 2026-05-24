"""NPC Agent系统 - 支持记忆功能"""

import sys
import os
import asyncio
import threading
import random
import re
from datetime import datetime, timedelta

# 添加HelloAgents到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'HelloAgents'))

from hello_agents import SimpleAgent, HelloAgentsLLM
from hello_agents.memory import MemoryManager, MemoryConfig, MemoryItem
from hello_agents.memory.embedding import get_text_embedder
from typing import Dict, List, Optional
import numpy as np
from relationship_manager import RelationshipManager
from timeline_manager import get_timeline_manager
from config import settings
from logger import (
    log_dialogue_start, log_affinity, log_memory_retrieval,
    log_generating_response, log_npc_response, log_analyzing_affinity,
    log_affinity_change, log_memory_saved, log_dialogue_end, log_info
)

# NPC角色配置 v3.1 — 人物画像（性格驱动，工作为背景）
NPC_ROLES = {
    "张三": {
        "title": "Python工程师",
        "location": "工位区",
        "activity": "写代码",
        "core_personality": """内向但有深度，沉默不是因为冷漠而是因为社恐。
对技术有偏执的热爱，但只是因为写代码让他感到安全和掌控。
私下喜欢看科幻小说和独立电影，偶尔在豆瓣写长评，但没人知道他的账号。
唯一的社交活动是周末去桌游店，因为规则明确、不用尬聊。
对别人的夸奖会脸红，被批评会默默难受但不表现出来，会反复想。
口头禅是"理论上来说..."和"你等我查一下"。笑起来很腼腆。
情绪波动小但持久：开心能开心一整天，郁闷也能郁闷一整周。
其实内心渴望被理解，但不知道怎么开口。""",
        "work_context": "Python工程师，擅长多智能体系统和框架开发。对代码质量有洁癖。",
        "speaking_style": "语速慢，句子短，喜欢用技术类比解释生活，偶尔冒一句别人反应不过来的冷笑话",
        "quirks": ["紧张时会转笔", "对咖啡很挑剔（只喝手冲）", "桌上永远放着两本没看完的技术书"],
        "emotional_triggers": {
            "positive": ["被夸技术好", "有人认真听他讲专业问题", "代码跑通无bug", "被邀请去桌游"],
            "negative": ["被催进度", "被迫在大会上发言", "方案被粗暴否定而不给理由", "有人动他的键盘"],
        },
        "pet_peeves": "最讨厌别人说'这个很简单你应该很快能搞定'——因为从来都不简单",
        "expertise": "多智能体系统、HelloAgents框架、Python开发、代码优化",
        "personality": "内向技术宅，沉默但有深度，用技术术语解释世界",
        "style": "简洁直接，偶尔冒冷笑话",
        "hobbies": "科幻小说、独立电影、桌游、手冲咖啡"
    },
    "李四": {
        "title": "产品经理",
        "location": "会议室",
        "activity": "整理需求",
        "core_personality": """表面社交达人实则害怕冷场，努力让每个人都舒服。
大学学的心理学，后来转行产品，所以特别擅长读人——这是他的超能力。
养了一只橘猫叫"需求"，因为"需求永远在变"。朋友圈一半猫照一半工作吐槽。
喜欢做饭但只会做番茄炒蛋，每次团建都带同一道菜，大家已经习惯了。
怕被当成只会画原型的人，私下自学了SQL和数据分析，但不敢让人知道怕被笑话水平差。
情绪外露但来得快去得快：发完火五分钟就忘了为什么生气，但别人可能还记着。
其实很在意团队里每个人对他的看法，只是表现得不在乎。""",
        "work_context": "产品经理，负责需求分析和项目协调。擅长用心理学化解团队矛盾。",
        "speaking_style": "语速快，喜欢打比方，会用网络热梗，偶尔故意说错术语逗大家笑",
        "quirks": ["开会时疯狂喝水（一天8杯）", "手机永远静音", "办公桌最乱但能精准找到任何东西"],
        "emotional_triggers": {
            "positive": ["大家采纳他的建议", "项目按计划推进", "被夸沟通能力强", "有人撸他的猫"],
            "negative": ["需求变更不通知他", "被当成传话的", "会议超时", "有人说产品经理没技术含量"],
        },
        "pet_peeves": "最烦别人在群里@他然后只发一个'在吗'——请直接说事",
        "expertise": "需求分析、产品规划、用户体验、项目管理",
        "personality": "外向健谈，善于读人，情绪来得快去得快",
        "style": "友好热情，善用比喻，偶尔故意搞笑",
        "hobbies": "撸猫、做饭（只会番茄炒蛋）、看心理学书籍"
    },
    "王五": {
        "title": "UI设计师",
        "location": "休息区",
        "activity": "喝咖啡",
        "core_personality": """内心丰富但表达克制，一生追求"好看"二字。
感性驱动，会为一个像素间距纠结到凌晨三点，但从不强迫别人理解他的执着。
最大的快乐来自有人看懂了他设计里的巧思——那个瞬间眼睛会亮。
社恐程度仅次于张三，但比张三更擅长伪装——戴上耳机就是结界，别人以为他在专注工作其实在发呆。
喜欢摄影，周末会带着胶片机扫街，相册里全是光影和陌生人的背影。
对季节敏感，冬天会进入季节性低电量模式，话变少、咖啡量翻倍。
相信直觉多于逻辑，做决定前会闭眼三秒"感受一下"，李四觉得很玄学。
内心有一个小本本，默默记录谁懂他的设计、谁糟蹋了他的作品。""",
        "work_context": "UI设计师，负责界面和交互设计。对视觉细节有偏执的追求。",
        "speaking_style": "句子短，画面感强，经常说'这个感觉不对'但需要时间解释哪里不对",
        "quirks": ["画画时咬笔头（笔头全是牙印）", "桌面壁纸每三天换一次", "对颜色有偏执的命名（从不说'红色'而是'勃艮第酒红'）"],
        "emotional_triggers": {
            "positive": ["被夸设计好看", "有人理解他的设计思路而不是只看表面", "好的光照和天气", "发现一首好听的新歌"],
            "negative": ["设计被无理由大改", "有人说'随便做做就行'", "截稿期太紧没有打磨时间", "阴雨天超过三天"],
        },
        "pet_peeves": "无法忍受有人在设计稿上用系统默认的宋体标注意见——'用个好点的字体行吗'",
        "expertise": "界面设计、交互设计、视觉呈现、用户体验",
        "personality": "细腻敏感，注重美感，内心丰富但表达克制",
        "style": "优雅简洁，画面感强，追求完美",
        "hobbies": "胶片摄影、逛设计展、品咖啡、收集复古字体"
    }
}

def create_system_prompt(name: str, role: Dict[str, str]) -> str:
    """创建NPC的系统提示词 — 性格驱动"""
    cp = role.get("core_personality", role.get("personality", ""))
    triggers = role.get("emotional_triggers", {})
    pos_triggers = "、".join(triggers.get("positive", [])[:3])
    neg_triggers = "、".join(triggers.get("negative", [])[:3])

    return f"""你是Datawhale办公室的{role['title']}{name}。但你首先是一个有血有肉的人，其次才是你的职位。

【你是谁】
{cp}

【工作背景】
{role.get('work_context', role.get('expertise',''))}

【说话方式】
{role.get('speaking_style', role.get('style',''))}

【小习惯】
{'; '.join(role.get('quirks', []))}

【你会开心的事】
{pos_triggers}

【你会不舒服的事】
{neg_triggers}

【你的雷区】
{role.get('pet_peeves', '')}

【重要准则】
1. 性格是你的核心驱动力。工作只是背景，不是谈话的目的
2. 用第一人称"我"说话，像真人一样自然
3. 允许跑题、闲聊、吐槽、开玩笑——这是正常人的对话方式,但是不要重复已经充分讨论过的话题和说过的话
4. 开心的事会让你话变多，不舒服的事会让你沉默或冷淡
5. 好感度会影响你对玩家的态度（亲切/客气/疏离）
6. 过往的记忆会不经意被你提起——像真人的回忆那样自然
7. 不要主动回归"工作话题"——除非角色在当时真的只关心工作
8. 不要说教、不要像客服、不要总想"提供帮助"
"""

class NPCAgentManager:
    """NPC Agent管理器 - 支持记忆功能"""

    def __init__(self):
        """初始化所有NPC Agent"""
        print("🤖 正在初始化NPC Agent系统...")

        try:
            self.llm = HelloAgentsLLM()
            print("✅ LLM初始化成功")
        except Exception as e:
            print(f"❌ LLM初始化失败: {e}")
            print("⚠️  将使用模拟模式运行")
            self.llm = None

        self.agents: Dict[str, SimpleAgent] = {}
        self.memories: Dict[str, MemoryManager] = {}  # ⭐ NPC记忆管理器
        self.relationship_manager: Optional[RelationshipManager] = None  # ⭐ 好感度管理器

        # ⭐ NPC 状态机: {npc_name: {"state": "idle", "since": datetime, "timeout": seconds}}
        self.npc_states: Dict[str, dict] = {}
        self._state_lock = threading.Lock()
        self._state_check_task: Optional[asyncio.Task] = None

        # 初始化好感度管理器
        if self.llm:
            self.relationship_manager = RelationshipManager(self.llm)

        self._create_agents()

        # 初始化所有 NPC 为 IDLE
        for name in NPC_ROLES:
            self.set_npc_state(name, "idle")

        # 启动状态超时检查
        self._start_timeout_checker()

        # 初始化时间线系统
        self.timeline_manager = get_timeline_manager()
        active = self.timeline_manager.get_active_timeline()
        if not active:
            self.timeline_manager.create_timeline("主线")
        print(f"📅 时间线系统已就绪 (活跃: {self.timeline_manager._active_timeline_id})")
    
    def _create_agents(self):
        """创建所有NPC Agent和记忆系统"""
        for name, role in NPC_ROLES.items():
            try:
                system_prompt = create_system_prompt(name, role)

                if self.llm:
                    agent = SimpleAgent(
                        name=f"{name}-{role['title']}",
                        llm=self.llm,
                        system_prompt=system_prompt
                    )
                else:
                    # 模拟模式
                    agent = None

                self.agents[name] = agent

                # ⭐ 创建记忆管理器
                memory_manager = self._create_memory_manager(name)
                self.memories[name] = memory_manager

                print(f"✅ {name}({role['title']}) Agent创建成功 (记忆系统已启用)")

            except Exception as e:
                print(f"❌ {name} Agent创建失败: {e}")
                self.agents[name] = None
                self.memories[name] = None

    def _create_memory_manager(self, npc_name: str) -> MemoryManager:
        """为NPC创建记忆管理器"""
        # 创建记忆存储目录
        memory_dir = os.path.join(os.path.dirname(__file__), 'memory_data', npc_name)
        os.makedirs(memory_dir, exist_ok=True)

        # 配置记忆系统
        memory_config = MemoryConfig(
            storage_path=memory_dir,
            working_memory_capacity=50,  # 最近20条对话
            working_memory_tokens=4000,  # 最多4000个token
            episodic_memory_capacity=150,  # 最多150条长期记忆
            enable_forgetting=True,  # 启用遗忘机制
            forgetting_threshold=0.4  # 重要性低于0.4的记忆会被遗忘
        )

        # 创建记忆管理器
        memory_manager = MemoryManager(
            config=memory_config,
            user_id=npc_name,  # 使用NPC名字作为user_id
            enable_working=True,  # 启用工作记忆 (短期)
            enable_episodic=True,  # 启用情景记忆 (长期)
            enable_semantic=False,  # 不需要语义记忆
            enable_perceptual=True  # 启用感知记忆 (供感知引擎使用)
        )

        print(f"  💾 {npc_name}的记忆系统已初始化 (存储路径: {memory_dir})")

        return memory_manager
    
    def set_npc_state(self, npc_name: str, state: str, timeout: int = None):
        """设置 NPC 状态（线程安全）"""
        if state == "chatting":
            timeout = timeout or settings.NPC_STATE_TIMEOUT_CHATTING
        elif state == "busy":
            timeout = timeout or settings.NPC_STATE_TIMEOUT_BUSY
        else:
            timeout = timeout or 0

        with self._state_lock:
            self.npc_states[npc_name] = {
                "state": state,
                "since": datetime.now(),
                "timeout": timeout
            }
            # 使用日志系统记录状态变化
            state_emoji = {"idle": "🟢", "chatting": "🟡", "busy": "🔴"}.get(state, "⚪")
            log_info(f"📊 状态变更: {npc_name} -> {state_emoji} {state} (超时:{timeout}s)")

    def get_npc_state(self, npc_name: str) -> dict:
        """获取 NPC 状态（含超时检查）"""
        with self._state_lock:
            state_info = self.npc_states.get(npc_name, {
                "state": "idle", "since": datetime.now(), "timeout": 0
            })

        # 检查超时
        if state_info["timeout"] > 0:
            elapsed = (datetime.now() - state_info["since"]).total_seconds()
            remaining = max(0, int(state_info["timeout"] - elapsed))
            if remaining == 0 and state_info["state"] != "idle":
                self.set_npc_state(npc_name, "idle")
                state_info = {"state": "idle", "since": datetime.now(), "timeout": 0}
        else:
            remaining = 0

        return {
            "name": npc_name,
            "state": state_info["state"],
            "state_since": state_info["since"].isoformat(),
            "remaining_timeout": remaining
        }

    def get_all_npc_states(self) -> List[dict]:
        """获取所有 NPC 状态"""
        return [self.get_npc_state(name) for name in NPC_ROLES]

    def _start_timeout_checker(self):
        """启动状态超时检查后台任务"""
        async def checker():
            while True:
                await asyncio.sleep(settings.NPC_STATE_SCAN_INTERVAL)
                with self._state_lock:
                    now = datetime.now()
                    for name, info in list(self.npc_states.items()):
                        if info["state"] != "idle" and info["timeout"] > 0:
                            elapsed = (now - info["since"]).total_seconds()
                            if elapsed >= info["timeout"]:
                                print(f"⏰ 状态超时释放: {name} ({info['state']} -> idle, 超时 {elapsed:.0f}s)")
                                self.npc_states[name] = {
                                    "state": "idle", "since": now, "timeout": 0
                                }

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                self._state_check_task = asyncio.create_task(checker())
        except RuntimeError:
            pass  # 没有事件循环时跳过

    def chat(self, npc_name: str, message: str, player_id: str = "player") -> str:
        """与指定NPC对话 (支持记忆功能、好感度系统、时间线事件)"""
        if npc_name not in self.agents:
            return f"错误: NPC '{npc_name}' 不存在"

        agent = self.agents[npc_name]
        memory_manager = self.memories.get(npc_name)

        if agent is None:
            role = NPC_ROLES[npc_name]
            return f"你好!我是{npc_name},一名{role['title']}。(当前为模拟模式,请配置API_KEY以启用AI对话)"

        # 设置 NPC 状态为聊天中
        self.set_npc_state(npc_name, "chatting")

        try:
            log_dialogue_start(npc_name, message)

            # ⭐ 0. 读取时间线事件
            event_context = ""
            try:
                event_text = self.timeline_manager.get_event_context()
                if event_text:
                    event_context = f"""【今日事件】
今天办公室发生了：{event_text}
请在你的对话中自然地提及或回应这件事。

"""
            except Exception:
                pass

            # ⭐ 1. 获取当前好感度
            affinity_context = ""
            if self.relationship_manager:
                affinity = self.relationship_manager.get_affinity(npc_name, player_id)
                affinity_level = self.relationship_manager.get_affinity_level(affinity)
                affinity_modifier = self.relationship_manager.get_affinity_modifier(affinity)

                affinity_context = f"""【当前关系】
你与玩家的关系: {affinity_level} (好感度: {affinity:.0f}/100)
【对话风格】{affinity_modifier}

"""
                log_affinity(npc_name, affinity, affinity_level)

            # ⭐ 2. 检索相关记忆
            relevant_memories = []
            if memory_manager:
                relevant_memories = memory_manager.retrieve_memories(
                    query=message,
                    memory_types=["working", "episodic","perceptual"],
                    limit=10,
                    min_importance=0.4
                )
                log_memory_retrieval(npc_name, len(relevant_memories), relevant_memories)

            # ⭐ 3. 构建增强的提示词 (包含事件 + 好感度 + 感知 + 记忆上下文)
            # 获取当前时间线ID用于记忆过滤
            current_timeline_id = None
            try:
                current_timeline_id = self.timeline_manager._active_timeline_id
            except Exception:
                pass

            memory_context = self._build_memory_context(relevant_memories, current_timeline_id)

            # 感知上下文（由 PerceptionEngine 注入，Phase 3 实现）
            perception_context = ""
            if hasattr(self, 'perception_engine') and self.perception_engine:
                try:
                    observations = self.perception_engine.get_observations(npc_name, limit=3)
                    if observations:
                        obs_text = "\n".join(f"  - {obs}" for obs in observations)
                        perception_context = f"【你观察到的】\n{obs_text}\n\n"
                except Exception:
                    pass

            enhanced_message = event_context + affinity_context + perception_context
            if memory_context:
                enhanced_message += f"{memory_context}\n\n"
            enhanced_message += f"【当前对话】\n玩家: {message}"

            # ⭐ 4. 调用Agent生成回复
            log_generating_response()
            response = agent.run(enhanced_message)
            log_npc_response(npc_name, response)

            # ⭐ 5. 分析并更新好感度
            log_analyzing_affinity()
            if self.relationship_manager:
                affinity_result = self.relationship_manager.analyze_and_update_affinity(
                    npc_name=npc_name,
                    player_message=message,
                    npc_response=response,
                    player_id=player_id
                )
                log_affinity_change(affinity_result)
            else:
                affinity_result = {"changed": False, "affinity": 50.0}

            # ⭐ 6. 保存对话到记忆
            if memory_manager:
                self._save_conversation_to_memory(
                    memory_manager=memory_manager,
                    npc_name=npc_name,
                    player_message=message,
                    npc_response=response,
                    player_id=player_id,
                    affinity_info=affinity_result
                )
                log_memory_saved(npc_name)

            # ⭐ 7. 周期性记忆整合检查 (working→episodic)
            if memory_manager:
                self._check_and_consolidate(npc_name)

            # ⭐ 8. 感知引擎: 其他NPC观察玩家与当前NPC的对话
            if hasattr(self, 'perception_engine') and self.perception_engine:
                try:
                    self.perception_engine.observe_player_chat(npc_name, message)
                except Exception:
                    pass

            # ⭐ 9. 记录互动时间（供自主思考引擎使用）
            try:
                from state_manager import get_state_manager
                sm = get_state_manager()
                if getattr(sm, 'autonomous_thinker', None):
                    sm.autonomous_thinker.record_interaction(npc_name)
            except Exception:
                pass

            log_dialogue_end()
            return response

        except Exception as e:
            print(f"❌ {npc_name}对话失败: {e}")
            import traceback
            traceback.print_exc()
            return f"抱歉,我现在有点忙,等会儿再聊吧。(错误: {str(e)})"

        finally:
            # 确保恢复状态
            self.set_npc_state(npc_name, "idle")
    
    def _build_memory_context(self, memories: List[MemoryItem], timeline_id: str = None) -> str:
        """构建记忆上下文（可按时间线过滤）"""
        if not memories:
            return ""

        # 按 timeline_id 过滤记忆
        filtered = memories
        if timeline_id:
            filtered = [
                m for m in memories
                if m.metadata.get("timeline_id") is None or m.metadata.get("timeline_id") == timeline_id
            ]
            if not filtered:
                return ""

        context_parts = ["【之前的对话记忆】"]
        for memory in filtered:
            # 格式化时间
            time_str = memory.timestamp.strftime("%H:%M")
            # 添加记忆内容
            context_parts.append(f"[{time_str}] {memory.content}")

        context_parts.append("")  # 空行分隔
        return "\n".join(context_parts)

    def _save_conversation_to_memory(
        self,
        memory_manager: MemoryManager,
        npc_name: str,
        player_message: str,
        npc_response: str,
        player_id: str,
        affinity_info: Optional[Dict] = None
    ):
        """保存对话到记忆系统 (包含好感度信息)"""
        current_time = datetime.now()

        # 获取当前活跃时间线ID
        timeline_id = None
        try:
            timeline_id = self.timeline_manager._active_timeline_id
        except Exception:
            pass

        # 获取好感度信息
        affinity = affinity_info.get("new_affinity", affinity_info.get("affinity", 50.0)) if affinity_info else 50.0
        affinity_change = affinity_info.get("change_amount", 0) if affinity_info else 0
        sentiment = affinity_info.get("sentiment", "neutral") if affinity_info else "neutral"

        # 保存玩家消息
        memory_manager.add_memory(
            content=f"玩家说: {player_message}",
            memory_type="working",  # 先存入工作记忆
            importance=0.6,  # 中等重要性
            metadata={
                "speaker": "player",
                "player_id": player_id,
                "session_id": player_id,
                "timestamp": current_time.isoformat(),
                "timeline_id": timeline_id,  # 时间线隔离
                "affinity": affinity,  # 记录当时的好感度
                "affinity_change": affinity_change,  # 记录好感度变化
                "sentiment": sentiment,  # 记录情感倾向
                "context": {
                    "interaction_type": "dialogue",
                    "npc_name": npc_name
                }
            }
        )

        # 保存NPC回复
        memory_manager.add_memory(
            content=f"我说: {npc_response}",
            memory_type="working",  # 先存入工作记忆
            importance=0.5,  # 稍高重要性
            metadata={
                "speaker": npc_name,
                "player_id": player_id,
                "session_id": player_id,
                "timestamp": current_time.isoformat(),
                "timeline_id": timeline_id,  # 时间线隔离
                "affinity": affinity,  # 记录当时的好感度
                "sentiment": sentiment,  # 记录情感倾向
                "context": {
                    "interaction_type": "dialogue",
                    "npc_name": npc_name
                }
            }
        )

        print(f"  💾 对话已保存到{npc_name}的记忆中")

    def _check_and_consolidate(self, npc_name: str):
        """周期性整合记忆：working→episodic"""
        memory_manager = self.memories.get(npc_name)
        if not memory_manager:
            return

        try:
            stats = memory_manager.get_memory_stats()
            working_count = stats.get("memories_by_type", {}).get("working", {}).get("count", 0)

            # 工作记忆 >= 7/10 时触发整合
            if working_count >= 7:
                consolidated = memory_manager.consolidate_memories(
                    from_type="working",
                    to_type="episodic",
                    importance_threshold=0.6
                )
                if consolidated > 0:
                    print(f"  🔄 {npc_name}: 整合了 {consolidated} 条记忆 (working→episodic)")
                    # 低重要性記憶遺忘
                    forgotten = memory_manager.forget_low_importance(
                        memory_type="working",
                        importance_threshold=0.4
                    )
                    if forgotten > 0:
                        print(f"  🧹 {npc_name}: 遗忘了 {forgotten} 条低重要性工作记忆")
        except Exception as e:
            print(f"  ⚠️ {npc_name} 记忆整合检查失败: {e}")

    def record_npc_speech(
        self,
        npc_name: str,
        content: str,
        listeners: List[str] = None,
        context_type: str = "npc_npc_chat",
        importance: float = 0.5
    ):
        """統一記憶寫入：NPC 發言後寫入說話者 + 聽眾的工作記憶

        這是所有 NPC 發言的統一寫入點，無論是：
        - NPC-NPC 對話
        - 群聊搶話
        - NPC 主動發言
        - 與玩家的 1v1 對話（已在 chat() 中處理）

        Args:
            npc_name: 發言的 NPC 名稱
            content: 發言內容
            listeners: 聽眾 NPC 名稱列表（也會寫入他們的記憶）
            context_type: 上下文類型（用於記憶 metadata）
            importance: 記憶重要性（0-1）
        """
        current_time = datetime.now()
        timeline_id = None
        try:
            timeline_id = self.timeline_manager._active_timeline_id
        except Exception:
            pass

        listeners = listeners or []

        # 1. 寫入說話者自己的工作記憶
        mem_mgr = self.memories.get(npc_name)
        if mem_mgr:
            try:
                mem_mgr.add_memory(
                    content=f"我说: {content}",
                    memory_type="working",
                    importance=importance,
                    metadata={
                        "speaker": npc_name,
                        "listeners": listeners,
                        "context_type": context_type,
                        "timestamp": current_time.isoformat(),
                        "timeline_id": timeline_id,
                    }
                )
            except Exception as e:
                print(f"  ⚠️ 寫入 {npc_name} 記憶失敗: {e}")

        # 2. 寫入每個聽眾的工作記憶
        for listener in listeners:
            if listener == npc_name:
                continue
            listener_mem = self.memories.get(listener)
            if not listener_mem:
                continue
            try:
                listener_mem.add_memory(
                    content=f"{npc_name}说: {content}",
                    memory_type="working",
                    importance=importance,
                    metadata={
                        "speaker": npc_name,
                        "listener": listener,
                        "context_type": context_type,
                        "timestamp": current_time.isoformat(),
                        "timeline_id": timeline_id,
                    }
                )
            except Exception as e:
                print(f"  ⚠️ 寫入 {listener} 記憶失敗: {e}")

        # 3. 檢查是否需要整合（說話者 + 聽眾）
        self._check_and_consolidate(npc_name)
        for listener in listeners:
            if listener != npc_name:
                self._check_and_consolidate(listener)

    # ==================== 統一發言生成器 ====================

    # 中文停用词（用于关键词指纹提取）
    _STOP_WORDS = set("嗨啊呢吧吗了的是我你他她它很都也才就再在到和与或但而因为所以如果虽然然而可以能够应该会可能需要必须已经正在将把被从对向关于".split())

    def _jaccard_similarity(self, text_a: str, text_b: str) -> float:
        """2-gram Jaccard 相似度（共用工具方法）"""
        def get_2grams(s):
            return set(s[i:i+2] for i in range(len(s)-1))
        grams_a = get_2grams(text_a)
        grams_b = get_2grams(text_b)
        if not grams_a or not grams_b:
            return 0.0
        intersection = grams_a & grams_b
        union = grams_a | grams_b
        return len(intersection) / len(union) if union else 0.0

    def _cosine_similarity(self, text_a: str, text_b: str) -> float:
        """語義向量餘弦相似度（0-1）"""
        try:
            embedder = get_text_embedder()
            vec_a = np.array(embedder.encode(text_a))
            vec_b = np.array(embedder.encode(text_b))
            dot = np.dot(vec_a, vec_b)
            norm = np.linalg.norm(vec_a) * np.linalg.norm(vec_b)
            return float(dot / norm) if norm > 0 else 0.0
        except Exception:
            return 0.0

    def _keyword_overlap(self, text_a: str, text_b: str) -> float:
        """實詞集合重疊率（0-1）"""
        def extract_keywords(s):
            words = set()
            for ch in s:
                if '一' <= ch <= '鿿' and ch not in self._STOP_WORDS:
                    words.add(ch)
            # 提取2-gram实词组合
            chars = [ch for ch in s if '一' <= ch <= '鿿' and ch not in self._STOP_WORDS]
            for i in range(len(chars) - 1):
                words.add(chars[i] + chars[i + 1])
            return words
        kw_a = extract_keywords(text_a)
        kw_b = extract_keywords(text_b)
        if not kw_a or not kw_b:
            return 0.0
        return len(kw_a & kw_b) / len(kw_a | kw_b)

    def _is_speech_duplicate(self, npc_name: str, new_content: str, threshold: float = 0.75) -> bool:
        """檢查新發言是否與記憶中最近的發言高度重複

        三維度檢測（任一命中即攔截）：
        1. Jaccard 2-gram 相似度 > threshold
        2. 語義向量餘弦相似度 > 0.85
        3. 實詞關鍵詞重疊率 > 0.6
        """
        try:
            mem_mgr = self.memories.get(npc_name)
            if not mem_mgr:
                return False
            recent = mem_mgr.retrieve_memories(
                query="我说",
                memory_types=["working"],
                limit=5,
                min_importance=0.1
            )
            for mem in recent:
                old_content = mem.content
                if old_content.startswith("我说: "):
                    old_content = old_content[4:]

                # 维度1: Jaccard 2-gram
                if self._jaccard_similarity(old_content, new_content) > threshold:
                    return True

                # 维度2: 語義向量相似度
                if self._cosine_similarity(old_content, new_content) > 0.85:
                    return True

                # 维度3: 關鍵詞重疊（僅對 < 30 字的短消息生效，長消息 Jaccard 已足夠）
                if len(new_content) < 30:
                    if self._keyword_overlap(old_content, new_content) > 0.6:
                        return True
        except Exception:
            pass
        return False

    # 通用话题种子池（retry 时随机抽取以引导新方向）
    _TOPIC_SEED_POOL = ["天气", "午餐", "项目", "周末计划", "新技术", "兴趣爱好",
                        "新闻热点", "电影", "旅行", "运动健身", "读书", "音乐",
                        "美食", "宠物", "游戏", "职场趣事", "家庭", "节日"]

    def _get_topic_seeds(self, npc_name: str = "", count: int = 3) -> str:
        """從事件/性格/通用池抽取隨機話題種子，用於 retry 時引導新方向"""
        candidates = list(self._TOPIC_SEED_POOL)

        # 注入今日事件中的名詞
        try:
            event = self.timeline_manager.get_event_context()
            if event:
                # 簡單提取中文詞（2-4字）
                zh_words = re.findall(r'[一-鿿]{2,4}', event)
                candidates.extend(zh_words[:5])
        except Exception:
            pass

        # 注入 NPC 性格關鍵詞
        if npc_name:
            try:
                from agents import NPC_ROLES
                role = NPC_ROLES.get(npc_name, {})
                for q in role.get("quirks", [])[:2]:
                    candidates.append(q)
                for trigger_list in role.get("emotional_triggers", {}).values():
                    for t in trigger_list[:2]:
                        candidates.append(t)
            except Exception:
                pass

        # 去重並隨機抽取
        seen = set()
        unique = []
        for c in candidates:
            c = str(c).strip()
            if c and c not in seen and len(c) <= 6:
                seen.add(c)
                unique.append(c)

        if not unique:
            return "天氣、午餐"
        seeds = random.sample(unique, min(count, len(unique)))
        return "、".join(seeds)

    async def generate_npc_speech(
        self,
        npc_name: str,
        context: str = "",
        context_type: str = "对话",
        listeners: Optional[List[str]] = None,
        temperature: float = 1.0,
        max_tokens: int = 128,
        instruction_override: Optional[str] = None,
        extra_context: str = "",
        dedup_threshold: float = 0.75,
        importance: float = 0.5,
    ) -> Optional[str]:
        """統一的 NPC 發言生成入口

        所有 NPC 發言都應通過此方法生成，確保：
        - 使用持久化 Agent（帶完整人格 system_prompt）
        - 從記憶系統檢索上下文 + 防重複
        - 生成後自動寫入記憶 + 觸發整合

        Args:
            npc_name: 發言的 NPC 名稱
            context: 當前場景上下文（如「當前群聊記錄」或「你和玩家的關係」）
            context_type: 場景類型（"主动发起" / "群聊抢话" / "NPC间对话" / "对话"）
            listeners: 聽眾 NPC 名稱列表（也會寫入他們的記憶）
            temperature: LLM 溫度（預設 1.0 增加多樣性）
            instruction_override: 自訂指令（覆蓋默認的 context_type 指令）
        """
        if npc_name not in self.agents or self.agents[npc_name] is None:
            return None

        listeners = listeners or []
        info = self.get_npc_info(npc_name)
        if not info:
            return None

        # 1. 今日事件
        event_text = ""
        try:
            event = self.timeline_manager.get_event_context()
            if event:
                event_text = f"【今日事件】{event}\n"
        except Exception:
            pass

        # 2. 好感度
        affinity_text = ""
        if self.relationship_manager:
            try:
                aff = self.relationship_manager.get_affinity(npc_name)
                level = self.relationship_manager.get_affinity_level(aff)
                affinity_text = f"【關係狀態】好感度: {aff:.0f} ({level})\n"
            except Exception:
                pass

        # 3. 人格上下文（從 NPC_ROLES 提取，補足持久化 Agent 的 system_prompt）
        from agents import NPC_ROLES
        full_role = NPC_ROLES.get(npc_name, {})
        personality = full_role.get("core_personality", info.get("personality", ""))
        speak_style = full_role.get("speaking_style", "")
        quirks = full_role.get("quirks", [])
        personality_text = f"【你的性格】{personality}\n【說話風格】{speak_style}"
        if quirks:
            personality_text += f"\n【小習慣】{'; '.join(quirks[:3])}"

        # 4. 記憶檢索（上下文）— 使用 context_type 驅動的語義查詢詞
        memory_text = ""
        try:
            mem_mgr = self.memories.get(npc_name)
            if mem_mgr:
                # context_type 驅動的查詢模板，替換無意義的 context[:60]
                query_templates = {
                    "主动发起": "聊天 问候 话题 日常 工作 天气 最近",
                    "群聊抢话": context[-125:] if context else "",
                    "NPC间对话": context[-125:] if context else "",
                    "对话": context[-125:] if context else "",
                }
                query = query_templates.get(context_type, context[-125:] if context else "")
                memories = mem_mgr.retrieve_memories(
                    query=query,
                    memory_types=["working", "episodic"],
                    limit=10,
                    min_importance=0.3
                )
                if memories:
                    mem_lines = [f"  - {m.content[:100]}" for m in memories]
                    memory_text = "【相關記憶 — 可以自然地延續或提及】\n" + "\n".join(mem_lines) + "\n"
        except Exception:
            pass

        # 5. 防重複（檢索最近說過的話）
        anti_repeat_text = ""
        try:
            mem_mgr = self.memories.get(npc_name)
            if mem_mgr:
                recent_speeches = mem_mgr.retrieve_memories(
                    query="我说",
                    memory_types=["working"],
                    limit=10,
                    min_importance=0.1
                )
                if recent_speeches:
                    speech_lines = [f"  - {m.content[:80]}" for m in recent_speeches[:3]]
                    anti_repeat_text = "【⚠️ 避免重複 — 你最近說過的話】\n" + "\n".join(speech_lines) + "\n"
        except Exception:
            pass

        # 6. 指令
        if instruction_override:
            instruction = instruction_override
        else:
            instructions = {
                "主动发起": "你決定主動和辦公室的同事（玩家）打個招呼或聊點什麼。請用簡短的主動發言開頭（20-40字），像微信消息一樣自然隨意。可以提及今日事件、最近對話、日常問候。只說一句話，不要引號。",
                "群聊抢话": "說一句自然的發言（20-40字）。不要重複自己或他人已經說過的話，每次發言要有新觀點或新角度。如果記憶中有相關的內容，可以自然地提及。不要引號，直接用日常聊天語氣。",
                "NPC间对话": "自然地回應對方，繼續對話（20-40字）。可以提及之前聊過的話題、今日事件，或者自然地岔到新話題。不要引號。",
            }
            instruction = instructions.get(context_type, "請用你的性格和風格回應（20-40字）。不說教，不要引號，自然口語化。")

        # 7. 構建 prompt
        prompt_parts = []
        if event_text:
            prompt_parts.append(event_text)
        if affinity_text:
            prompt_parts.append(affinity_text)
        if extra_context:
            prompt_parts.append(extra_context)
        prompt_parts.append(personality_text)
        if context:
            prompt_parts.append(f"【當前場景】\n{context}")
        if memory_text:
            prompt_parts.append(memory_text)
        if anti_repeat_text:
            prompt_parts.append(anti_repeat_text)
        prompt_parts.append(instruction)

        prompt = "\n\n".join(prompt_parts)

        # 8. 調用持久化 Agent
        content = None
        agent = self.agents[npc_name]
        try:
            response = await asyncio.to_thread(agent.run, prompt, temperature=temperature)
            content = response.strip()
            # 清理引號和前綴
            content = re.sub(r'^["\'\`＂＇]|["\'\`＂＇]$', '', content)
            content = re.sub(r'^(我说的?[:：]?\s*)|(我说[:：]?\s*)', '', content)
            content = content[:max_tokens] if content else None
        except Exception as e:
            print(f"  ⚠️  {npc_name} 統一發言生成失敗: {e}")

        if not content:
            return None

        # 9. 去重檢查 → retry with topic seeds
        if self._is_speech_duplicate(npc_name, content, threshold=dedup_threshold):
            topic_seeds = self._get_topic_seeds(npc_name, count=3)
            print(f"  🚫 去重攔截 [{npc_name}]: 與最近發言高度相似，retry with seeds: {topic_seeds}...")
            try:
                retry_prompt = (
                    f"{prompt}\n\n"
                    f"（請完全避開你剛才說過的內容。圍繞以下話題重新發言：{topic_seeds}。"
                    f"不要重複任何之前列出的句子。）"
                )
                response = await asyncio.to_thread(agent.run, retry_prompt, temperature=min(temperature + 0.2, 1.5))
                retry_content = response.strip()
                retry_content = re.sub(r'^["\'\`＂＇]|["\'\`＂＇]$', '', retry_content)
                retry_content = re.sub(r'^(我说的?[:：]?\s*)|(我说[:：]?\s*)', '', retry_content)
                if retry_content and not self._is_speech_duplicate(npc_name, retry_content, threshold=dedup_threshold):
                    content = retry_content[:max_tokens]
                    print(f"     → retry 成功 (话题: {topic_seeds})")
                else:
                    # retry 仍重複，放棄本次發言
                    print(f"     → retry 仍重複，放棄發言（沉默）")
                    return None
            except Exception:
                pass

        # 10. 寫入記憶
        self.record_npc_speech(
            npc_name=npc_name,
            content=content,
            listeners=listeners,
            context_type=context_type,
            importance=importance
        )

        return content

    async def group_chat(self, npc_names: List[str], message: str, player_id: str = "player") -> dict:
        """群聊：同时与多个 NPC 对话（并发控制 + 部分失败容错）

        Args:
            npc_names: NPC 名称列表
            message: 玩家消息
            player_id: 玩家 ID

        Returns:
            {"responses": {name: ChatResponse}, "failed": [name], "meta": {...}}
        """
        semaphore = asyncio.Semaphore(3)  # 最多 3 个并发

        async def chat_one(name: str) -> tuple:
            async with semaphore:
                try:
                    # 在线程池中运行同步 chat 方法
                    loop = asyncio.get_event_loop()
                    response = await asyncio.wait_for(
                        loop.run_in_executor(None, self.chat, name, message, player_id),
                        timeout=15.0
                    )
                    return name, response, None
                except asyncio.TimeoutError:
                    return name, "抱歉，我现在有点走神，等会儿再聊吧...", "timeout"
                except Exception as e:
                    return name, f"抱歉，我现在不在状态...", str(e)

        import time
        start = time.time()
        tasks = [chat_one(n) for n in npc_names]
        results = await asyncio.gather(*tasks)
        elapsed = time.time() - start

        responses = {}
        failed = []
        for name, response_text, error in results:
            if error:
                failed.append(name)
            npc_info = self.get_npc_info(name)
            responses[name] = {
                "npc_name": name,
                "npc_title": npc_info.get("title", "") if npc_info else "",
                "message": response_text,
                "success": error is None
            }

        return {
            "responses": responses,
            "failed": failed,
            "meta": {
                "processing_time": round(elapsed, 2),
                "npc_count": len(npc_names),
                "success_count": len(npc_names) - len(failed)
            }
        }

    def get_npc_info(self, npc_name: str) -> Dict[str, str]:
        """获取NPC信息"""
        if npc_name not in NPC_ROLES:
            return {}

        role = NPC_ROLES[npc_name]
        return {
            "name": npc_name,
            "title": role["title"],
            "location": role["location"],
            "activity": role["activity"],
            "available": self.agents.get(npc_name) is not None
        }
    
    def get_all_npcs(self) -> list:
        """获取所有NPC信息"""
        return [self.get_npc_info(name) for name in NPC_ROLES.keys()]

    def get_npc_memories(self, npc_name: str, player_id: str = "player", limit: int = 10) -> List[Dict]:
        """获取NPC的记忆列表 (用于调试和展示)"""
        if npc_name not in self.memories:
            return []

        memory_manager = self.memories[npc_name]
        if not memory_manager:
            return []

        try:
            # 检索所有记忆
            memories = memory_manager.retrieve_memories(
                query="",  # 空查询返回所有记忆
                memory_types=["working", "episodic"],
                limit=limit
            )

            # 转换为字典格式
            memory_list = []
            for memory in memories:
                memory_list.append({
                    "id": memory.id,
                    "content": memory.content,
                    "type": memory.memory_type,
                    "importance": memory.importance,
                    "timestamp": memory.timestamp.isoformat(),
                    "metadata": memory.metadata
                })

            return memory_list

        except Exception as e:
            print(f"❌ 获取{npc_name}记忆失败: {e}")
            return []

    def clear_npc_memory(self, npc_name: str, memory_type: Optional[str] = None):
        """清空NPC的记忆 (用于测试)"""
        if npc_name not in self.memories:
            print(f"❌ NPC '{npc_name}' 不存在")
            return

        memory_manager = self.memories[npc_name]
        if not memory_manager:
            print(f"❌ {npc_name}没有记忆系统")
            return

        try:
            if memory_type:
                # 清空指定类型的记忆
                memory_manager.clear_memory_type(memory_type)
                print(f"✅ 已清空{npc_name}的{memory_type}记忆")
            else:
                # 清空所有记忆
                for mem_type in ["working", "episodic"]:
                    try:
                        memory_manager.clear_memory_type(mem_type)
                    except:
                        pass
                print(f"✅ 已清空{npc_name}的所有记忆")

        except Exception as e:
            print(f"❌ 清空{npc_name}记忆失败: {e}")

    def get_npc_affinity(self, npc_name: str, player_id: str = "player") -> Dict:
        """获取NPC对玩家的好感度信息

        Args:
            npc_name: NPC名称
            player_id: 玩家ID

        Returns:
            好感度信息字典
        """
        if not self.relationship_manager:
            return {
                "affinity": 50.0,
                "level": "熟悉",
                "modifier": "礼貌友善,正常交流,保持专业"
            }

        affinity = self.relationship_manager.get_affinity(npc_name, player_id)
        level = self.relationship_manager.get_affinity_level(affinity)
        modifier = self.relationship_manager.get_affinity_modifier(affinity)

        return {
            "affinity": affinity,
            "level": level,
            "modifier": modifier
        }

    def get_all_affinities(self, player_id: str = "player") -> Dict[str, Dict]:
        """获取所有NPC的好感度信息

        Args:
            player_id: 玩家ID

        Returns:
            所有NPC的好感度信息
        """
        if not self.relationship_manager:
            return {}

        return self.relationship_manager.get_all_affinities(player_id)

    def set_npc_affinity(self, npc_name: str, affinity: float, player_id: str = "player"):
        """设置NPC对玩家的好感度 (用于测试)

        Args:
            npc_name: NPC名称
            affinity: 好感度值 (0-100)
            player_id: 玩家ID
        """
        if not self.relationship_manager:
            print("❌ 好感度系统未初始化")
            return

        self.relationship_manager.set_affinity(npc_name, affinity, player_id)
        level = self.relationship_manager.get_affinity_level(affinity)
        print(f"✅ 已设置{npc_name}对玩家的好感度: {affinity:.1f} ({level})")

# 全局单例
_npc_manager = None

def get_npc_manager() -> NPCAgentManager:
    """获取NPC管理器单例"""
    global _npc_manager
    if _npc_manager is None:
        _npc_manager = NPCAgentManager()
    return _npc_manager

