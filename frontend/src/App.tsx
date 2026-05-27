import { useEffect, useCallback, useRef, useState } from 'react';
import { useChatStore } from './stores/chatStore';
import { useNpcStore } from './stores/npcStore';
import { useSimulationStore } from './stores/simulationStore';
import { usePolling } from './hooks/usePolling';
import { useSSE } from './hooks/useSSE';
import { useToast, ToastProvider } from './components/ui/Toast';
import { TopBar } from './components/business/TopBar';
import { StatusBar } from './components/business/StatusBar';
import { ConvList } from './components/business/ConvList';
import { MessageBubble, DateSeparator } from './components/business/MessageBubble';
import { ChatInput } from './components/business/ChatInput';
import { NpcCard } from './components/business/NpcCard';
import { Drawer } from './components/ui/Drawer';
import { Modal } from './components/ui/Modal';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import {
  checkHealth,
  fetchNpcList,
  fetchTimelines,
  getSimulationStatus,
  fetchNpcConfigs,
  generateNpcConfig,
  createNpcConfig,
  deleteNpcConfig,
  advanceDay,
  setTodayEvent,
  fetchTodayEvent,
  createTimeline,
  setActiveTimeline,
  triggerNpcNpcChat,
  initiateNpcChat,
} from './api/client';
import type { Message, Conversation, NpcConfigCreate, NpcConfigSummary, TimelineResponse, NPCInfo } from './types';

function AppInner() {
  const { addToast } = useToast();
  const { activeConvId, messages, addMessage, setMessages, appendToLastMessage } = useChatStore();
  const { npcs, configs, wizardOpen, setNpcs, setConfigs, setWizardOpen, expandedNpc } = useNpcStore();
  const { setConnected, setRunning } = useSimulationStore();

  const { startStream, streaming } = useSSE();
  const { ackMessages } = usePolling(5000);

  // Panel state
  const [npcPanelOpen, setNpcPanelOpen] = useState(false);
  const [godPanelOpen, setGodPanelOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupNpcSelection, setGroupNpcSelection] = useState<string[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailNpc, setDetailNpc] = useState<NpcConfigSummary | null>(null);

  // Wizard state
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardForm, setWizardForm] = useState<Partial<NpcConfigCreate>>({});
  const [wizardDesc, setWizardDesc] = useState('');

  // God panel state
  const [godTimelines, setGodTimelines] = useState<TimelineResponse[]>([]);
  const [newTimelineName, setNewTimelineName] = useState('');
  const [todayEventContent, setTodayEventContent] = useState('');

  // Connect on mount
  useEffect(() => {
    async function connect() {
      try {
        await checkHealth();
        setConnected(true);
        const [npcData, timelineData, simStatus, configData] = await Promise.all([
          fetchNpcList(),
          fetchTimelines(),
          getSimulationStatus(),
          fetchNpcConfigs(),
        ]);
        setNpcs(npcData.npcs);
        useSimulationStore.getState().setTimelines(timelineData.timelines);
        useSimulationStore.getState().setActiveTimeline(timelineData.active_id);
        setRunning(simStatus.running);
        setConfigs(configData.npcs);
        setGodTimelines(timelineData.timelines);
      } catch {
        setConnected(false);
        addToast('服务连接失败', 'error');
      }
    }
    connect();
  }, []);

  // Chat handlers
  const handleSend1v1 = useCallback(async (content: string) => {
    if (!activeConvId) return;
    const npcName = activeConvId.replace('1v1_', '');
    const msg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      senderType: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    addMessage(activeConvId, msg);

    // Start SSE stream for NPC reply
    const replyMsg: Message = {
      id: (Date.now() + 1).toString(),
      sender: npcName,
      senderType: 'npc',
      content: '',
      timestamp: new Date().toISOString(),
    };
    addMessage(activeConvId, replyMsg);

    await startStream('/chat/scene', {
      npc_name: npcName,
      message: content,
      conversation_type: '1v1',
    }, (event) => {
      if (event.type === 'npc_message' && event.content) {
        appendToLastMessage(activeConvId, event.content);
      } else if (event.type === 'done') {
        // Stream complete
      } else if (event.type === 'error') {
        addToast(`回复失败: ${event.error}`, 'error');
      }
    });
  }, [activeConvId, addMessage, appendToLastMessage, startStream, addToast]);

  const handleSendGroup = useCallback(async (content: string) => {
    if (!activeConvId) return;
    const msg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      senderType: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    addMessage(activeConvId, msg);

    const npcNames = activeConvId.replace('group_', '').split('_');

    for (const npcName of npcNames) {
      const replyMsg: Message = {
        id: (Date.now() + Math.random()).toString(),
        sender: npcName,
        senderType: 'npc',
        content: '',
        timestamp: new Date().toISOString(),
      };
      addMessage(activeConvId, replyMsg);
    }

    await startStream('/chat/scene', {
      npc_names: npcNames,
      message: content,
      conversation_type: 'group',
    }, (event) => {
      if (event.type === 'npc_message' && event.content && event.npc_name) {
        // In a real app we'd match to the right message; for simplicity append to the matching NPC's last msg
        // This is a simplified version — actual mapping would be more precise
        appendToLastMessage(activeConvId, `[${event.npc_name}]: ${event.content}`);
      } else if (event.type === 'done') {
        // Stream complete
      } else if (event.type === 'error') {
        addToast(`群聊失败: ${event.error}`, 'error');
      }
    });
  }, [activeConvId, addMessage, appendToLastMessage, startStream, addToast]);

  // Get active conversation data
  const activeConv = activeConvId ? useChatStore.getState().conversations.find(c => c.id === activeConvId) : null;
  const activeMsgs = activeConvId ? messages[activeConvId] || [] : [];
  const isReadonly = activeConv?.type === 'npcnpc' || activeConv?.type === 'system';

  // Group messages by date for separators
  const dateGroups = groupMessagesByDate(activeMsgs);

  // NPC Manager handlers
  async function handleCreateNpc() {
    try {
      await createNpcConfig(wizardForm as NpcConfigCreate);
      addToast('NPC 创建成功', 'success');
      setWizardOpen(false);
      setWizardStep(0);
      setWizardForm({});
      // Refresh configs
      const configData = await fetchNpcConfigs();
      setConfigs(configData.npcs);
    } catch {
      addToast('NPC 创建失败', 'error');
    }
  }

  async function handleGenerateNpc() {
    try {
      const result = await generateNpcConfig(wizardDesc) as Record<string, unknown>;
      setWizardForm(result as unknown as Partial<NpcConfigCreate>);
      setWizardStep(3); // Jump to review step
      addToast('AI 生成完成，请检查并保存', 'success');
    } catch {
      addToast('AI 生成失败', 'error');
    }
  }

  async function handleDeleteNpc(name: string) {
    try {
      await deleteNpcConfig(name);
      addToast(`${name} 已删除`, 'success');
      const configData = await fetchNpcConfigs();
      setConfigs(configData.npcs);
    } catch {
      addToast('删除失败', 'error');
    }
  }

  // God Panel handlers
  async function handleCreateTimeline() {
    if (!newTimelineName.trim()) return;
    try {
      const timeline = await createTimeline(newTimelineName);
      addToast('时间线创建成功', 'success');
      setNewTimelineName('');
      const td = await fetchTimelines();
      useSimulationStore.getState().setTimelines(td.timelines);
      setGodTimelines(td.timelines);
    } catch {
      addToast('创建时间线失败', 'error');
    }
  }

  async function handleAdvanceDay() {
    const { activeTimelineId } = useSimulationStore.getState();
    if (!activeTimelineId) { addToast('无活跃时间线', 'error'); return; }
    try {
      const result = await advanceDay(activeTimelineId);
      addToast(result.message, 'success');
      const td = await fetchTimelines();
      useSimulationStore.getState().setTimelines(td.timelines);
      setGodTimelines(td.timelines);
    } catch {
      addToast('推进天数失败', 'error');
    }
  }

  async function handleSetTodayEvent() {
    const { activeTimelineId } = useSimulationStore.getState();
    if (!activeTimelineId || !todayEventContent.trim()) return;
    try {
      await setTodayEvent(activeTimelineId, todayEventContent);
      addToast('今日事件已设置', 'success');
      setTodayEventContent('');
    } catch {
      addToast('设置事件失败', 'error');
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <TopBar />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list */}
        <ConvList />

        {/* Chat area */}
        <main className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
          {activeConvId ? (
            <>
              {/* Header */}
              <div className="h-11 border-b border-gray-200 flex items-center px-3 gap-2 bg-white shrink-0">
                <span className="font-medium text-sm truncate flex-1">
                  {activeConv?.title || '对话'}
                </span>
                {activeConv?.type === '1v1' && activeConv.participants[0] && (
                  <Button size="sm" variant="secondary"
                    onClick={() => {
                      const npc = npcs.find((n: NPCInfo) => n.name === activeConv.participants[0]);
                      if (npc) initiateNpcChat(npc.name).catch(() => addToast('发起对话失败', 'error'));
                    }}>
                    发起对话
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setNpcPanelOpen(true)}>
                  NPC 管理
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setGodPanelOpen(true)}>
                  上帝模式
                </Button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto py-2">
                {dateGroups.map(([date, msgs]) => (
                  <div key={date}>
                    <DateSeparator date={date} />
                    {msgs.map((m) => (
                      <MessageBubble key={m.id} message={m} />
                    ))}
                  </div>
                ))}
                {activeMsgs.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">
                    {isReadonly ? '暂无消息记录' : '发送消息开始对话'}
                  </p>
                )}
                {streaming && (
                  <div className="px-3 py-1 text-xs text-blue-500 animate-pulse">
                    NPC 正在输入...
                  </div>
                )}
              </div>

              {/* Input */}
              <ChatInput
                disabled={isReadonly || streaming}
                placeholder={isReadonly ? '仅可查看' : '输入消息 (Enter 发送, Shift+Enter 换行)'}
                onSend={activeConv?.type === 'group' ? handleSendGroup : handleSend1v1}
              />
            </>
          ) : (
            <div className="flex-1 flex-center text-gray-400 text-sm">
              选择一个对话开始聊天
            </div>
          )}
        </main>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* NPC Manager Drawer */}
      <Drawer open={npcPanelOpen} onClose={() => setNpcPanelOpen(false)} title="NPC 管理" width="w-80">
        <div className="p-3 flex flex-col gap-2">
          <Button variant="primary" size="sm" onClick={() => { setWizardOpen(true); setWizardStep(0); setWizardForm({}); }}>
            + 创建 NPC
          </Button>
          <div className="flex flex-wrap gap-2">
            {configs.map((npc: NpcConfigSummary) => (
              <NpcCard
                key={npc.name}
                npc={npc}
                state={npcs.find((n: NPCInfo) => n.name === npc.name)?.available ? 'idle' : 'busy'}
                onChat={() => {
                  const convId = `1v1_${npc.name}`;
                  const { conversations, addConversation } = useChatStore.getState();
                  if (!conversations.find((c: Conversation) => c.id === convId)) {
                    addConversation({
                      id: convId, type: '1v1', title: `${npc.name} · ${npc.title}`,
                      participants: [npc.name], lastMessage: '', lastTime: new Date().toISOString(), unread: false,
                    });
                  }
                  useChatStore.getState().setActiveConv(convId);
                  setNpcPanelOpen(false);
                }}
                onDetail={() => { setDetailNpc(npc); setDetailModalOpen(true); }}
                onDelete={() => handleDeleteNpc(npc.name)}
              />
            ))}
          </div>
        </div>
      </Drawer>

      {/* NPC Detail Modal */}
      <Modal open={detailModalOpen} onClose={() => setDetailModalOpen(false)} title={detailNpc?.name}>
        {detailNpc && (
          <div className="text-sm space-y-2">
            <p><span className="text-gray-400">职位:</span> {detailNpc.title}</p>
            <p><span className="text-gray-400">性格:</span> {detailNpc.personality}</p>
            <p><span className="text-gray-400">类型:</span> {detailNpc.is_builtin ? '内置' : '自定义'}</p>
          </div>
        )}
      </Modal>

      {/* NPC Wizard Modal */}
      <Modal open={wizardOpen} onClose={() => { setWizardOpen(false); setWizardStep(0); }} title="创建 NPC" width="max-w-md">
        <div className="space-y-3">
          {/* Step indicator */}
          <div className="flex gap-1 justify-center mb-4">
            {['角色', '性格', '背景', '确认'].map((label, i) => (
              <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${
                i === wizardStep ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>{label}</span>
            ))}
          </div>

          {wizardStep === 0 && (
            <div className="space-y-2">
              <Input label="NPC 名称" value={wizardForm.name || ''} onChange={(e) => setWizardForm({ ...wizardForm, name: e.target.value })} />
              <Input label="职位" value={wizardForm.title || ''} onChange={(e) => setWizardForm({ ...wizardForm, title: e.target.value })} />
              <Input label="位置" value={wizardForm.location || ''} onChange={(e) => setWizardForm({ ...wizardForm, location: e.target.value })} />
              <Input label="活动" value={wizardForm.activity || ''} onChange={(e) => setWizardForm({ ...wizardForm, activity: e.target.value })} />
              <div className="text-center text-xs text-gray-400 py-2">或使用 AI 一键生成</div>
              <Input label="一句话描述" placeholder="例如: 一个爱喝咖啡的Python工程师"
                value={wizardDesc} onChange={(e) => setWizardDesc(e.target.value)} />
              <Button variant="secondary" size="sm" onClick={handleGenerateNpc} className="w-full">
                AI 生成
              </Button>
            </div>
          )}

          {wizardStep === 1 && (
            <div className="space-y-2">
              <Input label="核心性格" value={wizardForm.core_personality || ''} onChange={(e) => setWizardForm({ ...wizardForm, core_personality: e.target.value })} />
              <Input label="性格简述" value={wizardForm.personality || ''} onChange={(e) => setWizardForm({ ...wizardForm, personality: e.target.value })} />
              <Input label="专长" value={wizardForm.expertise || ''} onChange={(e) => setWizardForm({ ...wizardForm, expertise: e.target.value })} />
              <Input label="爱好" value={wizardForm.hobbies || ''} onChange={(e) => setWizardForm({ ...wizardForm, hobbies: e.target.value })} />
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-2">
              <Input label="工作背景" value={wizardForm.work_context || ''} onChange={(e) => setWizardForm({ ...wizardForm, work_context: e.target.value })} />
              <Input label="说话风格" value={wizardForm.speaking_style || ''} onChange={(e) => setWizardForm({ ...wizardForm, speaking_style: e.target.value })} />
              <Input label="雷区" value={wizardForm.pet_peeves || ''} onChange={(e) => setWizardForm({ ...wizardForm, pet_peeves: e.target.value })} />
            </div>
          )}

          {wizardStep === 3 && (
            <div className="text-sm space-y-1 text-gray-600">
              <p><b>名称:</b> {wizardForm.name}</p>
              <p><b>职位:</b> {wizardForm.title}</p>
              <p><b>核心性格:</b> {wizardForm.core_personality}</p>
              <p><b>专长:</b> {wizardForm.expertise}</p>
              <Button variant="primary" onClick={handleCreateNpc} className="w-full mt-3">确认创建</Button>
            </div>
          )}

          {/* Step navigation */}
          <div className="flex gap-2 justify-between mt-4">
            <Button variant="ghost" size="sm" onClick={() => setWizardStep(Math.max(0, wizardStep - 1))} disabled={wizardStep === 0}>
              上一步
            </Button>
            {wizardStep < 3 && (
              <Button variant="primary" size="sm" onClick={() => setWizardStep(Math.min(3, wizardStep + 1))}>
                下一步
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* God Panel Drawer */}
      <Drawer open={godPanelOpen} onClose={() => setGodPanelOpen(false)} title="上帝模式" side="right" width="w-80">
        <div className="p-3 space-y-4">
          {/* Create timeline */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">创建时间线</h4>
            <div className="flex gap-1">
              <Input placeholder="时间线名称" value={newTimelineName} onChange={(e) => setNewTimelineName(e.target.value)} className="text-xs flex-1" />
              <Button size="sm" onClick={handleCreateTimeline}>创建</Button>
            </div>
          </div>

          {/* Timeline list */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">时间线列表</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {godTimelines.map((t) => (
                <div key={t.id}
                  onClick={() => setActiveTimeline(t.id).then(() => {
                    useSimulationStore.getState().setActiveTimeline(t.id);
                    addToast(`已切换到: ${t.name}`, 'info');
                  })}
                  className={`px-2 py-1.5 rounded text-xs cursor-pointer ${
                    useSimulationStore.getState().activeTimelineId === t.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}>
                  {t.name} <span className="text-gray-400">Day {t.current_day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Today's event */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">今日事件</h4>
            <div className="flex flex-col gap-1">
              <Input placeholder="事件内容 (最多200字)" value={todayEventContent} onChange={(e) => setTodayEventContent(e.target.value)} className="text-xs" />
              <Button size="sm" onClick={handleSetTodayEvent}>设置事件</Button>
            </div>
          </div>

          {/* Advance day */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">推进天数</h4>
            <Button variant="primary" size="sm" onClick={handleAdvanceDay} className="w-full">
              推进到下一天
            </Button>
          </div>

          {/* NPC-NPC trigger */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">触发 NPC 对话</h4>
            <div className="flex flex-wrap gap-1">
              {npcs.slice(0, 6).map((n: NPCInfo) => (
                <button key={n.name}
                  onClick={() => {
                    const others = npcs.filter((o: NPCInfo) => o.name !== n.name);
                    if (others.length > 0) {
                      const random = others[Math.floor(Math.random() * others.length)];
                      triggerNpcNpcChat(n.name, random.name).then(() => addToast(`${n.name} ↔ ${random.name} 对话已触发`, 'info'));
                    }
                  }}
                  className="text-[10px] bg-gray-100 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                  {n.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

// Group messages by date for DateSeparator display
function groupMessagesByDate(msgs: Message[]): [string, Message[]][] {
  const groups = new Map<string, Message[]>();
  for (const msg of msgs) {
    try {
      const d = new Date(msg.timestamp);
      const key = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(msg);
    } catch {
      const key = '---';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(msg);
    }
  }
  return [...groups.entries()];
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
