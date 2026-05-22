"""赛博小镇 FastAPI 后端主程序"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import List
from contextlib import asynccontextmanager
import uvicorn
import time
import json
from datetime import datetime

from config import settings
from models import (
    ChatRequest, ChatResponse,
    NPCListResponse, NPCInfo,
    # NPC 状态机
    NPCStateInfo, NPCStateListResponse, NPCState,
    # 时间线系统
    TimelineCreate, TimelineResponse, TimelineListResponse,
    EventSetRequest, EventResponse, EventListResponse,
    DayAdvanceResponse, TodayEventResponse,
    # 群聊
    GroupChatRequest, GroupChatResponse,
    # NPC 间聊天
    NPCNPCChatRecord, NPCNPCChatStatusResponse,
    # 主动消息
    PendingMessagesResponse, AckPendingRequest
)
from agents import get_npc_manager
from state_manager import get_state_manager
from timeline_manager import get_timeline_manager
from scene_generator import SceneGenerator

# 全局场景生成器
_scene_generator = None

def get_scene_generator():
    global _scene_generator
    if _scene_generator is None:
        npc_mgr = get_npc_manager()
        tm_mgr = get_timeline_manager()
        _scene_generator = SceneGenerator(
            npc_manager=npc_mgr,
            timeline_manager=tm_mgr,
            llm=npc_mgr.llm if npc_mgr.llm else None
        )
    return _scene_generator

# 生命周期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    print("\n" + "="*60)
    print("🎮 赛博小镇后端服务启动中...")
    print("="*60)
    
    # 验证配置
    settings.validate()
    
    # 初始化NPC管理器
    npc_manager = get_npc_manager()

    # 初始化时间线管理器
    timeline_manager = get_timeline_manager()
    timeline_manager.validate_on_startup()

    # 初始化并启动状态管理器
    state_manager = get_state_manager(settings.NPC_UPDATE_INTERVAL)
    await state_manager.start()
    
    print("\n✅ 所有服务已启动!")
    print(f"📡 API地址: http://{settings.API_HOST}:{settings.API_PORT}")
    print(f"📚 API文档: http://{settings.API_HOST}:{settings.API_PORT}/docs")
    print("="*60 + "\n")
    
    yield
    
    # 关闭时
    print("\n🛑 正在关闭服务...")
    await state_manager.stop()
    print("✅ 服务已关闭\n")

# 创建FastAPI应用
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="赛博小镇 - 基于HelloAgents的AI NPC对话系统",
    lifespan=lifespan
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 获取全局实例
npc_manager = None
state_manager = None
timeline_manager = None

def get_managers():
    """获取管理器实例"""
    global npc_manager, state_manager, timeline_manager
    if npc_manager is None:
        npc_manager = get_npc_manager()
    if state_manager is None:
        state_manager = get_state_manager()
    if timeline_manager is None:
        timeline_manager = get_timeline_manager()
    return npc_manager, state_manager, timeline_manager

# ==================== API路由 ====================

@app.get("/")
async def root():
    """根路径 - API信息"""
    return {
        "service": settings.API_TITLE,
        "version": settings.API_VERSION,
        "status": "running",
        "features": ["AI对话", "NPC记忆系统", "好感度系统", "批量状态更新", "NPC状态机", "时间线系统", "群聊", "NPC间对话"],
        "endpoints": {
            "docs": "/docs",
            "chat": "/api/chat",
            "npcs": "/api/npcs",
            "npcs_status": "/api/npcs/status",
            "npc_states": "/api/npcs/states",
            "npc_memories": "/api/npcs/{npc_name}/memories",
            "npc_affinity": "/api/npcs/{npc_name}/affinity",
            "all_affinities": "/api/affinities",
            "timelines": "/api/timelines",
            "group_chat": "/api/group-chat",
            "npc_npc_chat": "/api/npc-npc-chat/status"
        }
    }

@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "timestamp": "now"}

@app.post("/chat", response_model=ChatResponse)
async def chat_with_npc(request: ChatRequest):
    """与NPC对话接口"""
    npc_mgr, _, _ = get_managers()

    npc_info = npc_mgr.get_npc_info(request.npc_name)
    if not npc_info:
        raise HTTPException(status_code=404, detail=f"NPC '{request.npc_name}' 不存在")

    try:
        response_text = npc_mgr.chat(request.npc_name, request.message)
        return ChatResponse(
            npc_name=request.npc_name,
            npc_title=npc_info["title"],
            message=response_text,
            success=True
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"对话处理失败: {str(e)}")

@app.get("/npcs", response_model=NPCListResponse)
async def list_npcs():
    """获取所有NPC列表"""
    npc_mgr, _, _ = get_managers()
    
    npcs_data = npc_mgr.get_all_npcs()
    npcs = [NPCInfo(**npc) for npc in npcs_data]
    
    return NPCListResponse(
        npcs=npcs,
        total=len(npcs)
    )

# ⚠️ 具体路由必须在 /npcs/{npc_name} 通配路由之前
@app.get("/npcs/states", response_model=NPCStateListResponse)
async def get_npc_states():
    """获取所有 NPC 的当前状态"""
    npc_mgr, _, tm_mgr = get_managers()
    states = npc_mgr.get_all_npc_states()
    active_tl = tm_mgr._active_timeline_id
    tl = tm_mgr.get_active_timeline()
    current_day = tl["current_day"] if tl else 0
    return NPCStateListResponse(
        states=[NPCStateInfo(**s) for s in states],
        active_timeline=active_tl,
        current_day=current_day
    )

@app.post("/npcs/states/reset")
async def reset_npc_states():
    """强制重置所有 NPC 状态为 IDLE"""
    npc_mgr, _, _ = get_managers()
    for name in ["张三", "李四", "王五"]:
        npc_mgr.set_npc_state(name, "idle")
    return {"message": "所有NPC状态已重置为IDLE"}

@app.get("/npcs/npc-affinities")
async def get_npc_npc_affinities():
    """获取 NPC 间好感度矩阵"""
    npc_mgr, _, _ = get_managers()
    if not npc_mgr.relationship_manager:
        return {"matrix": {}, "message": "好感度系统未初始化"}
    matrix = {}
    npcs = list(npc_mgr.agents.keys())
    for i, a in enumerate(npcs):
        matrix[a] = {}
        for j, b in enumerate(npcs):
            if i < j:
                aff = npc_mgr.relationship_manager.get_npc_npc_affinity(a, b)
                level = npc_mgr.relationship_manager.get_affinity_level(aff)
                matrix[a][b] = {"affinity": aff, "level": level}
            elif i == j:
                matrix[a][b] = {"affinity": 100, "level": "自己"}
    return {"matrix": matrix}

# ⚠️ 通配路由 /npcs/{npc_name} 必须在所有具体路由之后

@app.get("/npcs/pending-messages", response_model=PendingMessagesResponse)
async def get_pending_messages(npc_name: str = None):
    """获取 NPC 主动发起的待处理消息"""
    _, state_mgr, _ = get_managers()
    thinker = getattr(state_mgr, 'autonomous_thinker', None)
    if not thinker:
        return PendingMessagesResponse(messages=[])
    msgs = thinker.get_pending(npc_name)
    return PendingMessagesResponse(messages=msgs)

@app.post("/npcs/pending-messages/ack")
async def ack_pending_messages(req: AckPendingRequest = None):
    """前端确认已处理待发送消息（支持指定消息 key 避免误删新消息）

    Body:
        npc_name: 如果指定，仅确认该 NPC 的消息
        message_keys: 要确认的具体消息 key 列表（格式: "npc_name::timestamp"）
    """
    _, state_mgr, _ = get_managers()
    thinker = getattr(state_mgr, 'autonomous_thinker', None)
    if not thinker:
        return {"ack": False}
    npc_name = req.npc_name if req else None
    message_keys = req.message_keys if req else None
    thinker.ack_pending(npc_name, message_keys)
    return {"ack": True}

@app.get("/npcs/{npc_name}")
async def get_npc_info(npc_name: str):
    """获取指定NPC的详细信息"""
    npc_mgr, state_mgr, _ = get_managers()

    npc_info = npc_mgr.get_npc_info(npc_name)
    if not npc_info:
        raise HTTPException(
            status_code=404,
            detail=f"NPC '{npc_name}' 不存在"
        )

    return npc_info

@app.get("/npcs/{npc_name}/perceptions")
async def get_npc_perceptions(npc_name: str, limit: int = 10):
    """获取NPC的感知记忆（对环境和其他NPC的观察）"""
    npc_mgr, state_mgr, _ = get_managers()

    npc_info = npc_mgr.get_npc_info(npc_name)
    if not npc_info:
        raise HTTPException(status_code=404, detail=f"NPC '{npc_name}' 不存在")

    perception_engine = getattr(state_mgr, 'perception_engine', None)
    if not perception_engine:
        return {"npc_name": npc_name, "perceptions": [], "total": 0}

    observations = perception_engine.get_observations(npc_name, limit=limit)
    return {
        "npc_name": npc_name,
        "perceptions": observations,
        "total": len(observations)
    }


@app.get("/npcs/{npc_name}/memories")
async def get_npc_memories(npc_name: str, limit: int = 10):
    """获取NPC的记忆列表

    Args:
        npc_name: NPC名称
        limit: 返回的记忆数量限制 (默认10条)

    Returns:
        NPC的记忆列表
    """
    npc_mgr, _, _ = get_managers()

    # 验证NPC是否存在
    npc_info = npc_mgr.get_npc_info(npc_name)
    if not npc_info:
        raise HTTPException(
            status_code=404,
            detail=f"NPC '{npc_name}' 不存在"
        )

    try:
        memories = npc_mgr.get_npc_memories(npc_name, limit=limit)

        return {
            "npc_name": npc_name,
            "memories": memories,
            "total": len(memories)
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取记忆失败: {str(e)}"
        )

@app.delete("/npcs/{npc_name}/memories")
async def clear_npc_memories(npc_name: str, memory_type: str = None):
    """清空NPC的记忆 (用于测试)

    Args:
        npc_name: NPC名称
        memory_type: 记忆类型 (working/episodic), 不指定则清空所有

    Returns:
        操作结果
    """
    npc_mgr, _, _ = get_managers()

    # 验证NPC是否存在
    npc_info = npc_mgr.get_npc_info(npc_name)
    if not npc_info:
        raise HTTPException(
            status_code=404,
            detail=f"NPC '{npc_name}' 不存在"
        )

    try:
        npc_mgr.clear_npc_memory(npc_name, memory_type)

        return {
            "message": f"已清空{npc_name}的记忆",
            "npc_name": npc_name,
            "memory_type": memory_type or "all"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"清空记忆失败: {str(e)}"
        )

@app.get("/npcs/{npc_name}/affinity")
async def get_npc_affinity(npc_name: str, player_id: str = "player"):
    """获取NPC对玩家的好感度

    Args:
        npc_name: NPC名称
        player_id: 玩家ID (默认为"player")

    Returns:
        好感度信息
    """
    npc_mgr, _, _ = get_managers()

    # 验证NPC是否存在
    npc_info = npc_mgr.get_npc_info(npc_name)
    if not npc_info:
        raise HTTPException(
            status_code=404,
            detail=f"NPC '{npc_name}' 不存在"
        )

    try:
        affinity_info = npc_mgr.get_npc_affinity(npc_name, player_id)

        return {
            "npc_name": npc_name,
            "player_id": player_id,
            **affinity_info
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取好感度失败: {str(e)}"
        )

@app.get("/affinities")
async def get_all_affinities(player_id: str = "player"):
    """获取所有NPC对玩家的好感度

    Args:
        player_id: 玩家ID (默认为"player")

    Returns:
        所有NPC的好感度信息
    """
    npc_mgr, _, _ = get_managers()

    try:
        affinities = npc_mgr.get_all_affinities(player_id)

        return {
            "player_id": player_id,
            "affinities": affinities
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取好感度失败: {str(e)}"
        )

@app.put("/npcs/{npc_name}/affinity")
async def set_npc_affinity(npc_name: str, affinity: float, player_id: str = "player"):
    """设置NPC对玩家的好感度 (用于测试)

    Args:
        npc_name: NPC名称
        affinity: 好感度值 (0-100)
        player_id: 玩家ID (默认为"player")

    Returns:
        操作结果
    """
    npc_mgr, _, _ = get_managers()

    # 验证NPC是否存在
    npc_info = npc_mgr.get_npc_info(npc_name)
    if not npc_info:
        raise HTTPException(
            status_code=404,
            detail=f"NPC '{npc_name}' 不存在"
        )

    # 验证好感度范围
    if affinity < 0 or affinity > 100:
        raise HTTPException(
            status_code=400,
            detail="好感度必须在0-100之间"
        )

    try:
        npc_mgr.set_npc_affinity(npc_name, affinity, player_id)
        affinity_info = npc_mgr.get_npc_affinity(npc_name, player_id)

        return {
            "message": f"已设置{npc_name}对玩家的好感度",
            "npc_name": npc_name,
            "player_id": player_id,
            **affinity_info
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"设置好感度失败: {str(e)}"
        )

# ==================== 时间线系统路由 ====================

@app.get("/timelines", response_model=TimelineListResponse)
async def list_timelines():
    """获取所有时间线列表"""
    _, _, tm_mgr = get_managers()
    timelines = tm_mgr.list_timelines()
    return TimelineListResponse(
        timelines=[TimelineResponse(**t) for t in timelines],
        active_id=tm_mgr._active_timeline_id
    )


@app.post("/timelines", response_model=TimelineResponse)
async def create_timeline(req: TimelineCreate):
    """创建新时间线"""
    _, _, tm_mgr = get_managers()
    tl = tm_mgr.create_timeline(req.name)
    return TimelineResponse(
        id=tl["id"], name=tl["name"],
        current_day=tl["current_day"], created_at=tl["created_at"],
        event_count=len(tl.get("events", {}))
    )


@app.get("/timelines/{timeline_id}", response_model=TimelineResponse)
async def get_timeline(timeline_id: str):
    """获取时间线详情"""
    _, _, tm_mgr = get_managers()
    tl = tm_mgr.get_timeline(timeline_id)
    if not tl:
        raise HTTPException(status_code=404, detail=f"时间线 '{timeline_id}' 不存在")
    return TimelineResponse(
        id=tl["id"], name=tl["name"],
        current_day=tl["current_day"], created_at=tl["created_at"],
        event_count=len(tl.get("events", {}))
    )


@app.get("/timelines/{timeline_id}/events", response_model=EventListResponse)
async def get_timeline_events(timeline_id: str):
    """获取时间线所有事件"""
    _, _, tm_mgr = get_managers()
    tl = tm_mgr.get_timeline(timeline_id)
    if not tl:
        raise HTTPException(status_code=404, detail=f"时间线 '{timeline_id}' 不存在")
    events = tm_mgr.get_all_events(timeline_id)
    return EventListResponse(
        timeline_id=tl["id"], current_day=tl["current_day"],
        events=[EventResponse(**e) for e in events]
    )


@app.get("/timelines/{timeline_id}/today", response_model=TodayEventResponse)
async def get_today_event(timeline_id: str):
    """获取今日事件"""
    _, _, tm_mgr = get_managers()
    tl = tm_mgr.get_timeline(timeline_id)
    if not tl:
        raise HTTPException(status_code=404, detail=f"时间线 '{timeline_id}' 不存在")
    event = tm_mgr.get_today_event(timeline_id)
    return TodayEventResponse(
        timeline_id=tl["id"], day=tl["current_day"],
        event=EventResponse(
            day=tl["current_day"],
            content=event["content"],
            updated_at=event["updated_at"],
            update_count=event.get("update_count", 1)
        ) if event else None
    )


@app.put("/timelines/{timeline_id}/events/today", response_model=EventResponse)
async def set_today_event(timeline_id: str, req: EventSetRequest):
    """设置/覆盖今日事件（只能编辑当前天）"""
    _, _, tm_mgr = get_managers()
    tl = tm_mgr.get_timeline(timeline_id)
    if not tl:
        raise HTTPException(status_code=404, detail=f"时间线 '{timeline_id}' 不存在")

    try:
        event = tm_mgr.set_today_event(timeline_id, req.content)
        # 事件好感度：根据事件关键词自动调整NPC间好感度
        npc_mgr, _, _ = get_managers()
        if npc_mgr.relationship_manager:
            npc_mgr.relationship_manager.on_timeline_event(
                req.content, list(npc_mgr.agents.keys())
            )
        return EventResponse(
            day=tl["current_day"],
            content=event["content"],
            updated_at=event["updated_at"],
            update_count=event.get("update_count", 1)
        )
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.post("/timelines/{timeline_id}/advance", response_model=DayAdvanceResponse)
async def advance_timeline_day(timeline_id: str):
    """推进时间线到下一天"""
    _, _, tm_mgr = get_managers()
    try:
        result = tm_mgr.advance_day(timeline_id)
        # 推进天数后，如果有事件，触发好感度变化
        npc_mgr, _, _ = get_managers()
        if npc_mgr.relationship_manager:
            event_text = tm_mgr.get_event_context(timeline_id)
            if event_text:
                npc_mgr.relationship_manager.on_timeline_event(
                    event_text, list(npc_mgr.agents.keys())
                )
        return DayAdvanceResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.put("/timelines/{timeline_id}/active")
async def set_active_timeline(timeline_id: str):
    """切换活跃时间线"""
    _, _, tm_mgr = get_managers()
    ok = tm_mgr.set_active_timeline(timeline_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"时间线 '{timeline_id}' 不存在")
    return {"message": f"已切换到时间线 '{timeline_id}'", "active_id": timeline_id}


# ==================== 群聊路由 ====================

import asyncio as _asyncio, random as _random

class SceneRequest(BaseModel):
    npc_names: List[str] = Field(..., min_length=1, max_length=5)
    message: str = Field(default="")
    conversation_id: str = Field(default="")
    history: List[dict] = Field(default_factory=list)

@app.post("/chat/scene")
async def chat_scene(request: SceneRequest):
    """统一场景生成 + SSE 流式返回

    支持: 1v1聊天 / 群聊 / NPC间对话
    """
    npc_mgr, _, _ = get_managers()
    scene_gen = get_scene_generator()

    for name in request.npc_names:
        if not npc_mgr.get_npc_info(name):
            raise HTTPException(status_code=404, detail=f"NPC '{name}' 不存在")

    # 获取好感度
    affinities = {}
    if npc_mgr.relationship_manager:
        for name in request.npc_names:
            affinities[name] = npc_mgr.relationship_manager.get_affinity(name)

    is_group = len(request.npc_names) > 1
    player_message = request.message or ""

    async def generate():
        scene = await scene_gen.generate_scene(
            npc_names=request.npc_names,
            trigger_message=player_message,
            history=request.history,
            affinity_context=affinities,
            max_messages=10 if is_group else 4,
            is_group=is_group,
        )
        for msg in scene:
            yield f"data: {json.dumps(msg, ensure_ascii=False)}\n\n"
            await _asyncio.sleep(_random.uniform(0.6, 1.3))

        # 好感度分析：玩家消息存在时，对每个发言NPC做情感分析
        affinity_updates = {}
        if player_message and npc_mgr.relationship_manager:
            for name in request.npc_names:
                # 收集该NPC在场景中的回复
                npc_texts = [m.get("content", "") for m in scene if m.get("speaker") == name]
                npc_response = " ".join(npc_texts) if npc_texts else ""
                if not npc_response:
                    continue
                try:
                    result = npc_mgr.relationship_manager.analyze_and_update_affinity(
                        npc_name=name,
                        player_message=player_message,
                        npc_response=npc_response,
                    )
                    if result.get("changed"):
                        affinity_updates[name] = {
                            "affinity": result["new_affinity"],
                            "change": result["change_amount"],
                            "level": result.get("new_level", ""),
                            "reason": result.get("reason", ""),
                        }
                except Exception:
                    pass

        # 感知引擎：其他NPC观察玩家与当前NPC的对话
        if hasattr(npc_mgr, 'perception_engine') and npc_mgr.perception_engine:
            for name in request.npc_names:
                try:
                    npc_mgr.perception_engine.observe_player_chat(name, player_message)
                except Exception:
                    pass

        # 自主思考引擎：记录互动时间
        state_mgr = get_state_manager()
        if getattr(state_mgr, 'autonomous_thinker', None):
            for name in request.npc_names:
                try:
                    state_mgr.autonomous_thinker.record_interaction(name)
                except Exception:
                    pass

        yield f"data: {json.dumps({'type': 'done', 'affinity_updates': affinity_updates}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

@app.post("/group-chat", response_model=GroupChatResponse)
async def group_chat(request: GroupChatRequest):
    """群聊接口 - 同时与多个 NPC 对话"""
    npc_mgr, _, _ = get_managers()

    for name in request.npc_names:
        if not npc_mgr.get_npc_info(name):
            raise HTTPException(status_code=404, detail=f"NPC '{name}' 不存在")

    try:
        result = await npc_mgr.group_chat(request.npc_names, request.message)
        return GroupChatResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"群聊处理失败: {str(e)}")


# ==================== 自主思考路由 ====================


# ==================== 群聊抢话路由 ====================

@app.post("/group-chat/contention")
async def group_chat_contention(request: GroupChatRequest):
    """群聊抢话 - NPC 自主竞争发言（全量返回）"""
    _, state_mgr, _ = get_managers()
    engine = getattr(state_mgr, 'group_chat_engine', None)
    if not engine:
        raise HTTPException(status_code=503, detail="群聊抢话引擎未初始化")

    npc_mgr, _, _ = get_managers()
    for name in request.npc_names:
        if not npc_mgr.get_npc_info(name):
            raise HTTPException(status_code=404, detail=f"NPC '{name}' 不存在")

    try:
        result = await engine.run_contention(request.npc_names, request.message)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"抢话失败: {str(e)}")


@app.post("/group-chat/contention/stream")
async def group_chat_contention_stream(request: GroupChatRequest):
    """群聊抢话 - SSE 流式返回每轮结果"""
    from fastapi.responses import StreamingResponse
    _, state_mgr, _ = get_managers()
    engine = getattr(state_mgr, 'group_chat_engine', None)
    if not engine:
        raise HTTPException(status_code=503, detail="群聊抢话引擎未初始化")

    npc_mgr, _, _ = get_managers()
    for name in request.npc_names:
        if not npc_mgr.get_npc_info(name):
            raise HTTPException(status_code=404, detail=f"NPC '{name}' 不存在")

    async def generate():
        async for event in engine.run_contention_streaming(request.npc_names, request.message):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


# ==================== NPC 间聊天路由 ====================

@app.get("/npc-npc-chat/status", response_model=NPCNPCChatStatusResponse)
async def get_npc_npc_chat_status():
    """获取 NPC 间聊天状态"""
    _, state_mgr, _ = get_managers()
    chat_engine = getattr(state_mgr, 'npc_chat_engine', None)
    if not chat_engine:
        return NPCNPCChatStatusResponse(active_chats=[], history=[], cooldowns={})

    active = []
    for chat in chat_engine.active_chats.values():
        active.append(NPCNPCChatRecord(
            id=chat.get("id", ""),
            npc_a=chat.get("npc_a", ""),
            npc_b=chat.get("npc_b", ""),
            messages=chat.get("messages", []),
            started_at=chat.get("started_at", "").isoformat() if hasattr(chat.get("started_at", ""), 'isoformat') else str(chat.get("started_at", "")),
            trigger_reason=chat.get("trigger_reason", "auto")
        ))

    history = []
    for chat in chat_engine.chat_history[-20:]:
        started = chat.get("started_at", "")
        ended = chat.get("ended_at", "")
        history.append(NPCNPCChatRecord(
            id=chat.get("id", ""),
            npc_a=chat.get("npc_a", ""),
            npc_b=chat.get("npc_b", ""),
            messages=chat.get("messages", []),
            started_at=started.isoformat() if hasattr(started, 'isoformat') else str(started),
            ended_at=ended.isoformat() if hasattr(ended, 'isoformat') else (str(ended) if ended else ""),
            trigger_reason=chat.get("trigger_reason", "auto")
        ))

    cooldowns = {}
    now = datetime.now()
    for pair, dt in chat_engine.cooldowns.items():
        remaining = max(0, int(chat_engine.COOLDOWN - (now - dt).total_seconds()))
        cooldowns[f"{pair[0]}-{pair[1]}"] = remaining

    return NPCNPCChatStatusResponse(active_chats=active, history=history, cooldowns=cooldowns)


@app.get("/npc-npc-chat/history")
async def get_npc_npc_chat_history(limit: int = Query(default=50, le=100)):
    """获取 NPC 间聊天历史"""
    _, state_mgr, _ = get_managers()
    chat_engine = getattr(state_mgr, 'npc_chat_engine', None)
    if not chat_engine:
        return {"history": []}

    # 使用与 /status 相同的序列化方式，确保 datetime 正确转换
    from datetime import datetime as dt
    serialized = []
    for chat in chat_engine.chat_history[-limit:]:
        started = chat.get("started_at", "")
        ended = chat.get("ended_at", "")
        serialized.append({
            "id": chat.get("id", ""),
            "npc_a": chat.get("npc_a", ""),
            "npc_b": chat.get("npc_b", ""),
            "messages": chat.get("messages", []),
            "started_at": started.isoformat() if hasattr(started, 'isoformat') else str(started),
            "ended_at": ended.isoformat() if hasattr(ended, 'isoformat') else (str(ended) if ended else ""),
            "trigger_reason": chat.get("trigger_reason", "auto"),
        })
    return {"history": serialized}


@app.post("/npc-npc-chat/trigger")
async def trigger_npc_npc_chat(npc_a: str = Query(...), npc_b: str = Query(...)):
    """手动触发 NPC 间对话（测试用）"""
    _, state_mgr, _ = get_managers()
    chat_engine = getattr(state_mgr, 'npc_chat_engine', None)
    if not chat_engine:
        raise HTTPException(status_code=503, detail="NPC聊天引擎未初始化")

    npc_mgr, _, _ = get_managers()
    if npc_a not in npc_mgr.agents or npc_b not in npc_mgr.agents:
        raise HTTPException(status_code=404, detail="NPC不存在")

    success = await chat_engine.trigger_chat(npc_a, npc_b, reason="manual")
    if not success:
        raise HTTPException(status_code=409, detail="无法触发对话（状态/冷却/好感度不满足）")

    return {"message": f"已触发 {npc_a} 与 {npc_b} 的对话"}


# ==================== 主程序入口 ====================

if __name__ == "__main__":
    print("\n🚀 启动赛博小镇后端服务...")
    print(f"📍 监听地址: {settings.API_HOST}:{settings.API_PORT}")
    print(f"📖 访问文档: http://localhost:{settings.API_PORT}/docs\n")
    
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=False,  # 生产环境关闭自动重载
        log_level="info"
    )

