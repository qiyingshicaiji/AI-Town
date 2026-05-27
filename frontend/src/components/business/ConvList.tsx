import { useState, useMemo } from 'react';
import { useChatStore, make1v1ConvId, makeGroupConvId, makeNpcNpcConvId } from '../../stores/chatStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useNpcStore } from '../../stores/npcStore';
import { useToast } from '../ui/Toast';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import type { Conversation } from '../../types';
import { checkHealth } from '../../api/client';

export function ConvList() {
  const { conversations, activeConvId, npcNpcActiveChats, npcNpcHistory, pendingMessages, setActiveConv, addConversation } = useChatStore();
  const { npcStates } = useNpcStore();
  const { connected } = useSimulationStore();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');

  // Build synthesized conversation list: combine stored convs + NPC-NPC chats + pending messages
  const allConvs = useMemo<Conversation[]>(() => {
    const result: Conversation[] = [...conversations];

    // Add system notifications for pending messages
    if (pendingMessages.length > 0) {
      const sysConv: Conversation = {
        id: 'system_pending',
        type: 'system',
        title: '系统通知',
        participants: [],
        lastMessage: `${pendingMessages.length} 条NPC主动消息`,
        lastTime: new Date().toISOString(),
        unread: true,
      };
      result.unshift(sysConv);
    }

    // Add NPC-NPC active chats as conv entries
    for (const chat of npcNpcActiveChats) {
      const convId = makeNpcNpcConvId(chat.id);
      if (!result.find((c) => c.id === convId)) {
        result.unshift({
          id: convId,
          type: 'npcnpc',
          title: `${chat.npc_a} ↔ ${chat.npc_b}`,
          participants: [chat.npc_a, chat.npc_b],
          lastMessage: chat.messages.slice(-1)[0]?.content || '对话中...',
          lastTime: chat.started_at,
          unread: true,
        });
      }
    }

    return result;
  }, [conversations, pendingMessages, npcNpcActiveChats]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allConvs;
    const q = search.toLowerCase();
    return allConvs.filter((c) =>
      c.title.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
    );
  }, [allConvs, search]);

  async function start1v1Chat() {
    try {
      await checkHealth();
      const npc = npcStates[0];
      if (!npc) {
        addToast('没有可用的 NPC', 'error');
        return;
      }
      const convId = make1v1ConvId(npc.name);
      const existing = allConvs.find((c) => c.id === convId);
      if (!existing) {
        const conv: Conversation = {
          id: convId,
          type: '1v1',
          title: `${npc.name} · ${getNpcTitle(npc.name)}`,
          participants: [npc.name],
          lastMessage: '点击开始对话',
          lastTime: new Date().toISOString(),
          unread: false,
        };
        addConversation(conv);
      }
      setActiveConv(convId);
    } catch {
      addToast('服务连接失败', 'error');
    }
  }

  // Check if NPC is online
  function getNpcTitle(name: string): string {
    const state = npcStates.find((s) => s.name === name);
    return state?.state || '离线';
  }

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
      {/* Search */}
      <div className="p-2">
        <Input
          placeholder="搜索对话..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs"
        />
      </div>

      {/* Action buttons */}
      <div className="px-2 pb-2 flex gap-1">
        <Button size="sm" variant="primary" onClick={start1v1Chat} className="flex-1 text-xs">
          新对话
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const { npcs } = useNpcStore.getState();
            if (npcs.length < 2) {
              addToast('需要至少 2 个 NPC 才能开始群聊', 'error');
              return;
            }
            /* Open group chat modal — handled by feature module */
            addToast('选择 NPC 开始群聊', 'info');
          }}
          className="flex-1 text-xs"
        >
          群聊
        </Button>
      </div>

      {/* Connection warning */}
      {!connected && (
        <div className="mx-2 mb-2 px-2 py-1 bg-red-100 text-red-600 text-[10px] rounded text-center">
          ● 未连接到服务器
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((conv) => (
          <div
            key={conv.id}
            onClick={() => setActiveConv(conv.id)}
            className={`px-3 py-2.5 cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-100 ${
              activeConvId === conv.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
            } ${conv.unread ? 'font-semibold' : ''}`}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs px-1 py-0 rounded ${
                conv.type === '1v1' ? 'bg-blue-100 text-blue-700' :
                conv.type === 'group' ? 'bg-purple-100 text-purple-700' :
                conv.type === 'npcnpc' ? 'bg-orange-100 text-orange-700' :
                'bg-gray-200 text-gray-600'
              }`}>
                {conv.type === '1v1' ? '1v1' : conv.type === 'group' ? '群' : conv.type === 'npcnpc' ? 'NPC' : '系统'}
              </span>
              <span className="text-sm truncate flex-1">{conv.title}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{formatTime(conv.lastTime)}</span>
            </div>
            <p className="text-xs text-gray-500 truncate ml-1">{conv.lastMessage}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8">暂无对话</p>
        )}
      </div>
    </aside>
  );
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '';
  }
}
