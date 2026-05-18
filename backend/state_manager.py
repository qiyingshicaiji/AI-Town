"""NPC状态管理器 - 定时批量更新NPC对话 + NPC间聊天调度"""

import asyncio
from datetime import datetime
from typing import Dict, Optional
from batch_generator import get_batch_generator
from npc_npc_chat import NPCNPCChatEngine
from autonomous_thinker import AutonomousThinker
from group_chat_engine import GroupChatEngine
from scene_generator import SceneGenerator
from agents import get_npc_manager
from timeline_manager import get_timeline_manager

class NPCStateManager:
    """NPC状态管理器
    
    功能:
    1. 定时批量生成NPC对话(降低API成本)
    2. 缓存当前NPC状态
    3. 提供状态查询接口
    """
    
    def __init__(self, update_interval: int = 30):
        """初始化状态管理器

        Args:
            update_interval: 更新间隔(秒),默认30秒
        """
        self.update_interval = update_interval
        self.batch_generator = get_batch_generator()

        # 当前状态
        self.current_dialogues: Dict[str, str] = {}
        self.last_update: Optional[datetime] = None
        self.next_update_time: Optional[datetime] = None

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

        # 后台任务
        self._update_task: Optional[asyncio.Task] = None
        self._npc_chat_task: Optional[asyncio.Task] = None
        self._think_task: Optional[asyncio.Task] = None
        self._running = False

        print(f"📊 NPC状态管理器初始化完成 (更新间隔: {update_interval}秒)")
    
    async def start(self):
        """启动后台更新任务"""
        if self._running:
            print("⚠️  状态管理器已在运行")
            return

        self._running = True
        print("🚀 启动NPC状态自动更新...")

        # 立即执行一次更新
        await self._update_npc_states()

        # 启动定时更新任务（独白）
        self._update_task = asyncio.create_task(self._auto_update_loop())

        # 启动 NPC 间聊天检查任务
        self._npc_chat_task = asyncio.create_task(self._npc_chat_loop())

        # 启动自主思考循环
        self._think_task = asyncio.create_task(self._think_loop())

    async def stop(self):
        """停止后台更新任务"""
        if not self._running:
            return

        self._running = False

        for task in [self._update_task, self._npc_chat_task, self._think_task]:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        print("🛑 NPC状态自动更新已停止")

    async def _auto_update_loop(self):
        """自动更新循环（独白生成）"""
        while self._running:
            try:
                await asyncio.sleep(self.update_interval)
                await self._update_npc_states()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ 自动更新失败: {e}")

    async def _npc_chat_loop(self):
        """NPC 间聊天检查循环"""
        check_interval = 15  # 每 15 秒检查一次
        while self._running:
            try:
                await asyncio.sleep(check_interval)
                chat_id = await self.npc_chat_engine.check_and_trigger()
                if chat_id:
                    print(f"💬 NPC间对话已触发: {chat_id}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ NPC聊天检查失败: {e}")
    
    async def _think_loop(self):
        """NPC 自主思考循环"""
        think_interval = 45
        while self._running:
            try:
                await asyncio.sleep(think_interval)
                await self.autonomous_thinker.think_all()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ 自主思考失败: {e}")

    async def _update_npc_states(self):
        """更新NPC状态"""
        try:
            print(f"\n🔄 [{datetime.now().strftime('%H:%M:%S')}] 开始批量更新NPC对话...")
            
            # 批量生成对话
            new_dialogues = self.batch_generator.generate_batch_dialogues()
            
            # 更新状态
            self.current_dialogues = new_dialogues
            self.last_update = datetime.now()
            self.next_update_time = datetime.now()
            
            # 打印更新结果
            print("📝 NPC对话已更新:")
            for npc_name, dialogue in new_dialogues.items():
                print(f"   - {npc_name}: {dialogue}")
            
        except Exception as e:
            print(f"❌ 更新NPC状态失败: {e}")
    
    def get_current_state(self) -> Dict:
        """获取当前状态"""
        # 计算下次更新倒计时
        if self.last_update:
            elapsed = (datetime.now() - self.last_update).total_seconds()
            next_update_in = max(0, int(self.update_interval - elapsed))
        else:
            next_update_in = self.update_interval
        
        return {
            "dialogues": self.current_dialogues,
            "last_update": self.last_update,
            "next_update_in": next_update_in
        }
    
    def get_npc_dialogue(self, npc_name: str) -> Optional[str]:
        """获取指定NPC的当前对话"""
        return self.current_dialogues.get(npc_name)
    
    async def force_update(self):
        """强制立即更新"""
        print("⚡ 强制更新NPC状态...")
        await self._update_npc_states()

# 全局单例
_state_manager = None

def get_state_manager(update_interval: int = 30) -> NPCStateManager:
    """获取状态管理器单例"""
    global _state_manager
    if _state_manager is None:
        _state_manager = NPCStateManager(update_interval)
    return _state_manager

