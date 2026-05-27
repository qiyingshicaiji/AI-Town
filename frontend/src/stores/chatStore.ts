import { create } from 'zustand';
import type { Conversation, Message, ConvType, NPCNPCChatRecord, PendingMessage } from '../types';

interface ChatState {
  // Conversations
  conversations: Conversation[];
  activeConvId: string | null;
  // Messages indexed by conversation ID
  messages: Record<string, Message[]>;
  // NPC-NPC active chats
  npcNpcActiveChats: NPCNPCChatRecord[];
  npcNpcHistory: NPCNPCChatRecord[];
  // Pending NPC initiate messages
  pendingMessages: PendingMessage[];

  // Actions
  setConversations: (convs: Conversation[]) => void;
  addConversation: (conv: Conversation) => void;
  upsertConversation: (conv: Conversation) => void;
  setActiveConv: (id: string | null) => void;
  setMessages: (convId: string, msgs: Message[]) => void;
  addMessage: (convId: string, msg: Message) => void;
  appendToLastMessage: (convId: string, content: string) => void;
  setNpcNpcData: (active: NPCNPCChatRecord[], history: NPCNPCChatRecord[]) => void;
  setPendingMessages: (msgs: PendingMessage[]) => void;
  removePendingMessage: (npcName: string) => void;
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem('aitown_conversations');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  localStorage.setItem('aitown_conversations', JSON.stringify(convs));
}

function loadMessages(): Record<string, Message[]> {
  try {
    const result: Record<string, Message[]> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('aitown_msgs_')) {
        const convId = key.replace('aitown_msgs_', '');
        const raw = localStorage.getItem(key);
        if (raw) result[convId] = JSON.parse(raw).slice(-200);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveMessages(convId: string, msgs: Message[]) {
  const trimmed = msgs.slice(-200);
  localStorage.setItem(`aitown_msgs_${convId}`, JSON.stringify(trimmed));
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: loadConversations(),
  activeConvId: null,
  messages: loadMessages(),
  npcNpcActiveChats: [],
  npcNpcHistory: [],
  pendingMessages: [],

  setConversations: (convs) => {
    saveConversations(convs);
    set({ conversations: convs });
  },

  addConversation: (conv) => {
    const convs = [...get().conversations, conv];
    saveConversations(convs);
    set({ conversations: convs });
  },

  upsertConversation: (conv) => {
    const convs = get().conversations;
    const idx = convs.findIndex((c) => c.id === conv.id);
    const updated = idx >= 0
      ? [...convs.slice(0, idx), { ...convs[idx], ...conv }, ...convs.slice(idx + 1)]
      : [conv, ...convs];
    saveConversations(updated);
    set({ conversations: updated });
  },

  setActiveConv: (id) => set({ activeConvId: id }),

  setMessages: (convId, msgs) => {
    saveMessages(convId, msgs);
    set({ messages: { ...get().messages, [convId]: msgs } });
  },

  addMessage: (convId, msg) => {
    const msgs = [...(get().messages[convId] || []), msg];
    saveMessages(convId, msgs);
    set({ messages: { ...get().messages, [convId]: msgs } });
  },

  appendToLastMessage: (convId, content) => {
    const state = get();
    const msgs = state.messages[convId] || [];
    if (msgs.length === 0) return;
    const updated = [...msgs.slice(0, -1), { ...msgs[msgs.length - 1], content: msgs[msgs.length - 1].content + content }];
    saveMessages(convId, updated);
    set({ messages: { ...state.messages, [convId]: updated } });
  },

  setNpcNpcData: (active, history) => set({ npcNpcActiveChats: active, npcNpcHistory: history }),

  setPendingMessages: (msgs) => set({ pendingMessages: msgs }),

  removePendingMessage: (npcName) => {
    set({ pendingMessages: get().pendingMessages.filter((m) => m.npc_name !== npcName) });
  },
}));

// LocalStorage-backed helpers for conversation management
export function make1v1ConvId(npcName: string): string {
  return `1v1_${npcName}`;
}

export function makeGroupConvId(npcs: string[]): string {
  return `group_${npcs.sort().join('_')}`;
}

export function makeNpcNpcConvId(chatId: string): string {
  return `npcnpc_${chatId}`;
}
