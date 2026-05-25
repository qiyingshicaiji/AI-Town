"""数据模型定义"""

from pydantic import BaseModel, Field
from typing import Dict, List, Optional
from datetime import datetime

class ChatRequest(BaseModel):
    """单个NPC对话请求"""
    npc_name: str = Field(..., description="NPC名称")
    message: str = Field(..., description="玩家消息")
    
    class Config:
        json_schema_extra = {
            "example": {
                "npc_name": "张三",
                "message": "你好,你在做什么?"
            }
        }

class ChatResponse(BaseModel):
    """单个NPC对话响应"""
    npc_name: str = Field(..., description="NPC名称")
    npc_title: str = Field(..., description="NPC职位")
    message: str = Field(..., description="NPC回复")
    success: bool = Field(default=True, description="是否成功")
    timestamp: Optional[datetime] = Field(default_factory=datetime.now, description="时间戳")
    
    class Config:
        json_schema_extra = {
            "example": {
                "npc_name": "张三",
                "npc_title": "Python工程师",
                "message": "你好!我正在写代码,调试一个多智能体系统的bug。",
                "success": True
            }
        }

class NPCInfo(BaseModel):
    """NPC信息"""
    name: str = Field(..., description="NPC名称")
    title: str = Field(..., description="NPC职位")
    location: str = Field(..., description="NPC位置")
    activity: str = Field(..., description="当前活动")
    available: bool = Field(default=True, description="是否可对话")

class NPCListResponse(BaseModel):
    """NPC列表响应"""
    npcs: List[NPCInfo] = Field(..., description="NPC列表")
    total: int = Field(..., description="NPC总数")

# ==================== NPC 状态机模型 ====================

from enum import Enum

class NPCState(str, Enum):
    """NPC 状态枚举"""
    IDLE = "idle"           # 空闲
    CHATTING = "chatting"   # 与玩家对话中
    BUSY = "busy"           # NPC 间对话中


class NPCStateInfo(BaseModel):
    """NPC 状态信息"""
    name: str = Field(..., description="NPC名称")
    state: NPCState = Field(..., description="当前状态")
    state_since: Optional[datetime] = Field(None, description="状态进入时间")
    remaining_timeout: int = Field(0, description="剩余超时秒数")


class NPCStateListResponse(BaseModel):
    """NPC 状态列表响应"""
    states: List[NPCStateInfo] = Field(..., description="NPC状态列表")
    active_timeline: Optional[str] = Field(None, description="活跃时间线ID")
    current_day: int = Field(0, description="当前天数")

# ==================== 时间线系统模型 ====================

class TimelineCreate(BaseModel):
    """创建时间线请求"""
    name: str = Field(..., min_length=1, max_length=50, description="时间线名称")


class TimelineResponse(BaseModel):
    """时间线详情响应"""
    id: str = Field(..., description="时间线ID")
    name: str = Field(..., description="时间线名称")
    current_day: int = Field(..., description="当前天数")
    created_at: str = Field(..., description="创建时间")
    event_count: int = Field(0, description="事件数量")


class TimelineListResponse(BaseModel):
    """时间线列表响应"""
    timelines: List[TimelineResponse] = Field(..., description="时间线列表")
    active_id: Optional[str] = Field(None, description="活跃时间线ID")


class EventSetRequest(BaseModel):
    """设置事件请求"""
    content: str = Field(..., min_length=1, max_length=200, description="事件内容（最多200字）")


class EventResponse(BaseModel):
    """事件响应"""
    day: int = Field(..., description="天数")
    content: str = Field(..., description="事件内容")
    updated_at: str = Field(..., description="最后修改时间")
    update_count: int = Field(1, description="修改次数")


class EventListResponse(BaseModel):
    """事件列表响应"""
    timeline_id: str = Field(..., description="时间线ID")
    current_day: int = Field(..., description="当前天数")
    events: List[EventResponse] = Field(default_factory=list, description="事件列表")


class DayAdvanceResponse(BaseModel):
    """推进天数响应"""
    timeline_id: str = Field(..., description="时间线ID")
    new_day: int = Field(..., description="新天数")
    old_day: int = Field(..., description="旧天数")
    message: str = Field(..., description="提示信息")


class TodayEventResponse(BaseModel):
    """今日事件响应"""
    timeline_id: str = Field(..., description="时间线ID")
    day: int = Field(..., description="当前天数")
    event: Optional[EventResponse] = Field(None, description="今日事件（可能为空）")

# ==================== 群聊模型 ====================

class GroupChatRequest(BaseModel):
    """群聊请求"""
    npc_names: List[str] = Field(..., min_length=2, max_length=5, description="NPC名称列表")
    message: str = Field(..., min_length=1, description="玩家消息")


class GroupChatResponse(BaseModel):
    """群聊响应"""
    responses: Dict[str, ChatResponse] = Field(..., description="NPC回复映射")
    failed: List[str] = Field(default_factory=list, description="失败的NPC列表")
    meta: dict = Field(default_factory=dict, description="元数据（处理时间等）")

# ==================== NPC 间聊天模型 ====================

class NPCNPCChatRecord(BaseModel):
    """NPC 间对话记录"""
    id: str = Field(..., description="记录ID")
    npc_a: str = Field(..., description="NPC A 名称")
    npc_b: str = Field(..., description="NPC B 名称")
    messages: List[dict] = Field(default_factory=list, description="对话消息列表")
    started_at: str = Field(..., description="开始时间")
    ended_at: Optional[str] = Field(None, description="结束时间")
    trigger_reason: str = Field("auto", description="触发原因 (auto/manual)")


class NPCNPCChatStatusResponse(BaseModel):
    """NPC 间聊天状态响应"""
    active_chats: List[NPCNPCChatRecord] = Field(default_factory=list, description="活跃对话")
    history: List[NPCNPCChatRecord] = Field(default_factory=list, description="历史对话")
    cooldowns: Dict[str, int] = Field(default_factory=dict, description="冷却剩余秒数")


class PendingMessage(BaseModel):
    """待处理的主动消息"""
    npc_name: str = Field(..., description="NPC名称")
    content: str = Field(..., description="消息内容")
    timestamp: str = Field(..., description="时间戳")


class PendingMessagesResponse(BaseModel):
    """待处理消息响应"""
    messages: List[dict] = Field(default_factory=list, description="待处理消息列表")


class AckPendingRequest(BaseModel):
    """确认处理消息请求"""
    npc_name: Optional[str] = Field(None, description="如果指定，仅确认该NPC的消息")
    message_keys: Optional[List[str]] = Field(None, description="要确认的特定消息key列表")

