/* ================================
   TypeScript 类型定义
   对应 backend/models.py 的 Pydantic 模型
   ================================ */

// ---- NPC ----
export interface NPCInfo {
  name: string;
  title: string;
  location: string;
  activity: string;
  available: boolean;
}

export type NPCState = 'idle' | 'chatting' | 'busy';

export interface NPCStateInfo {
  name: string;
  state: NPCState;
  state_since: string | null;
  remaining_timeout: number;
}

export interface NPCStateListResponse {
  states: NPCStateInfo[];
  active_timeline: string | null;
  current_day: number;
}

export interface NpcConfigSummary {
  name: string;
  title: string;
  personality: string;
  is_builtin: boolean;
}

export interface NpcConfigCreate {
  name: string;
  title: string;
  location?: string;
  activity?: string;
  core_personality: string;
  personality?: string;
  work_context?: string;
  speaking_style?: string;
  style?: string;
  quirks?: string[];
  emotional_triggers?: Record<string, string>;
  pet_peeves?: string;
  expertise?: string;
  hobbies?: string;
}

export interface NpcConfigUpdate {
  title?: string;
  location?: string;
  activity?: string;
  core_personality?: string;
  personality?: string;
  work_context?: string;
  speaking_style?: string;
  style?: string;
  quirks?: string[];
  emotional_triggers?: Record<string, string>;
  pet_peeves?: string;
  expertise?: string;
  hobbies?: string;
}

// ---- Chat ----
export interface ChatRequest {
  npc_name: string;
  message: string;
}

export interface ChatResponse {
  npc_name: string;
  npc_title: string;
  message: string;
  success: boolean;
  timestamp: string | null;
}

export interface GroupChatRequest {
  npc_names: string[];
  message: string;
}

export interface GroupChatResponse {
  responses: Record<string, ChatResponse>;
  failed: string[];
  meta: Record<string, unknown>;
}

// ---- Messages ----
export interface Message {
  id: string;
  sender: string;
  senderType: 'user' | 'npc' | 'system';
  content: string;
  timestamp: string;
  npcAvatar?: string;
}

// ---- Conversations ----
export type ConvType = '1v1' | 'group' | 'npcnpc' | 'system';

export interface Conversation {
  id: string;
  type: ConvType;
  title: string;
  participants: string[];
  lastMessage: string;
  lastTime: string;
  unread: boolean;
}

// ---- NPC-NPC Chat ----
export interface NPCNPCChatRecord {
  id: string;
  npc_a: string;
  npc_b: string;
  messages: Array<{ sender: string; content: string; timestamp: string }>;
  started_at: string;
  ended_at: string | null;
  trigger_reason: string;
}

export interface NPCNPCChatStatusResponse {
  active_chats: NPCNPCChatRecord[];
  history: NPCNPCChatRecord[];
  cooldowns: Record<string, number>;
}

// ---- Pending Messages ----
export interface PendingMessage {
  npc_name: string;
  content: string;
  timestamp: string;
}

// ---- Timeline ----
export interface TimelineResponse {
  id: string;
  name: string;
  current_day: number;
  created_at: string;
  event_count: number;
}

export interface EventResponse {
  day: number;
  content: string;
  updated_at: string;
  update_count: number;
}

// ---- Simulation ----
export interface SimulationStatus {
  running: boolean;
  active_timeline_id: string | null;
  npc_count: number;
}

// ---- Scene (SSE) ----
export interface SceneRequest {
  npc_name?: string;
  npc_names?: string[];
  message: string;
  conversation_type: '1v1' | 'group';
}

export interface SSEEvent {
  type: 'npc_message' | 'done' | 'error';
  npc_name?: string;
  content?: string;
  affinity_updates?: Record<string, number>;
  error?: string;
}
