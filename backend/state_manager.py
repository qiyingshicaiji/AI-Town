"""NPC状态管理器 - NPC间聊天调度 + 自主思考 + 感知"""

import asyncio
from typing import Optional
from npc_npc_chat import NPCNPCChatEngine
from autonomous_thinker import AutonomousThinker
from group_chat_engine import GroupChatEngine
from scene_generator import SceneGenerator
from agents import get_npc_manager
from timeline_manager import get_timeline_manager
from perception_engine import PerceptionEngine

class NPCStateManager:
    """NPC状态管理器

    功能:
    1. NPC 间聊天调度
    2. NPC 自主思考（主动发起对话）
    3. NPC 环境感知
    4. 群聊管理
    """

    def __init__(self, update_interval: int = 30):
        """初始化状态管理器

        Args:
            update_interval: 保留参数（兼容性）
        """

        # 共享实例
        npc_mgr = get_npc_manager()
        tm_mgr = get_timeline_manager()
        llm = npc_mgr.llm if npc_mgr.llm else None

        # 场景生成器（核心，被其他引擎共用）
        self.scene_generator = SceneGenerator(
            npc_manager=npc_mgr, timeline_manager=tm_mgr, llm=llm
        )

        # NPC 间聊天引擎（使用场景生成器）
        self.npc_chat_engine = NPCNPCChatEngine(
            npc_manager=npc_mgr, timeline_manager=tm_mgr, llm=llm
        )
        self.npc_chat_engine.scene_generator = self.scene_generator

        # 自主思考引擎（使用场景生成器）
        self.autonomous_thinker = AutonomousThinker(
            npc_manager=npc_mgr, timeline_manager=tm_mgr, llm=llm
        )
        self.autonomous_thinker.scene_generator = self.scene_generator

        # 群聊抢话引擎
        self.group_chat_engine = GroupChatEngine(
            npc_manager=npc_mgr, timeline_manager=tm_mgr, llm=llm
        )
        self.group_chat_engine.scene_generator = self.scene_generator

        # 感知引擎
        self.perception_engine = PerceptionEngine(
            npc_manager=npc_mgr, timeline_manager=tm_mgr, llm=llm
        )
        # 注入到 NPCAgentManager 供 chat() 使用
        npc_mgr.perception_engine = self.perception_engine

        # 后台任务
        self._npc_chat_task: Optional[asyncio.Task] = None
        self._think_task: Optional[asyncio.Task] = None
        self._perception_task: Optional[asyncio.Task] = None
        self._running = False

        print("📊 NPC状态管理器初始化完成")
    
    async def start(self):
        """启动后台更新任务"""
        if self._running:
            print("⚠️  状态管理器已在运行")
            return

        self._running = True
        print("🚀 启动NPC状态自动更新...")

        # 启动 NPC 间聊天检查任务
        self._npc_chat_task = asyncio.create_task(self._npc_chat_loop())

        # 启动自主思考循环
        self._think_task = asyncio.create_task(self._think_loop())

        # 启动感知引擎循环
        self._perception_task = asyncio.create_task(self._perception_loop())

    async def stop(self):
        """停止后台更新任务"""
        if not self._running:
            return

        self._running = False

        for task in [self._npc_chat_task, self._think_task, self._perception_task]:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        print("🛑 NPC状态自动更新已停止")

    async def _npc_chat_loop(self):
        """NPC 间聊天检查循环"""
        check_interval = 15  # 每 15 秒检查一次
        while self._running:
            try:
                await asyncio.sleep(check_interval)
                chat_id = await self.npc_chat_engine.check_and_trigger()
                if chat_id:
                    print(f"💬 NPC间对话已触发: {chat_id}")
                    # 通知感知引擎：让其他NPC观察这场对话
                    chat_data = self.npc_chat_engine.active_chats.get(chat_id)
                    if chat_data:
                        self.perception_engine.observe_npc_chat(
                            chat_data.get('npc_a', ''),
                            chat_data.get('npc_b', ''),
                            chat_data.get('messages', [])
                        )
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ NPC聊天检查失败: {e}")
    
    async def _think_loop(self):
        """NPC 自主思考循环"""
        think_interval = 15  # Phase 4: 45→15秒
        while self._running:
            try:
                await asyncio.sleep(think_interval)
                await self.autonomous_thinker.think_all()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ 自主思考失败: {e}")

    async def _perception_loop(self):
        """感知引擎扫描循环"""
        perception_interval = 60  # 每 60 秒扫描一次
        while self._running:
            try:
                await asyncio.sleep(perception_interval)
                self.perception_engine.scan_and_observe()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ 感知扫描失败: {e}")

# 全局单例
_state_manager = None

def get_state_manager(update_interval: int = 30) -> NPCStateManager:
    """获取状态管理器单例"""
    global _state_manager
    if _state_manager is None:
        _state_manager = NPCStateManager(update_interval)
    return _state_manager

