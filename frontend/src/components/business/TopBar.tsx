import { useSimulationStore } from '../../stores/simulationStore';
import { useNpcStore } from '../../stores/npcStore';
import { pauseSimulation, resumeSimulation } from '../../api/client';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

export function TopBar() {
  const { connected, running, polling, activeTimelineId } = useSimulationStore();
  const { npcStates } = useNpcStore();
  const { addToast } = useToast();

  const idleCount = npcStates.filter((s) => s.state === 'idle').length;
  const chattingCount = npcStates.filter((s) => s.state === 'chatting').length;
  const busyCount = npcStates.filter((s) => s.state === 'busy').length;

  async function toggleSimulation() {
    try {
      if (running) {
        await pauseSimulation();
        useSimulationStore.getState().setRunning(false);
        addToast('仿真已暂停', 'info');
      } else {
        await resumeSimulation();
        useSimulationStore.getState().setRunning(true);
        addToast('仿真已恢复', 'success');
      }
    } catch {
      addToast('操作失败', 'error');
    }
  }

  return (
    <header className="h-12 bg-gray-900 text-gray-200 flex items-center px-4 gap-3 shrink-0 select-none">
      {/* Connection status */}
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
      <span className="text-sm font-medium">赛博小镇</span>

      {/* Polling indicator */}
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${polling ? 'bg-blue-500/30 text-blue-300' : 'bg-gray-700 text-gray-500'}`}>
        {polling ? '轮询中' : '空闲'}
      </span>

      <div className="flex-1" />

      {/* NPC status summary */}
      <span className="text-xs text-gray-400">
        空闲<span className="text-green-400 ml-0.5">{idleCount}</span>
        {' '}对话<span className="text-yellow-400 ml-0.5">{chattingCount}</span>
        {' '}忙碌<span className="text-red-400 ml-0.5">{busyCount}</span>
      </span>

      {activeTimelineId && (
        <span className="text-[10px] bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">
          {activeTimelineId.slice(0, 8)}...
        </span>
      )}

      <Button variant="ghost" size="sm" onClick={toggleSimulation} className="text-gray-300 hover:text-white">
        {running ? '⏸ 暂停' : '▶ 恢复'}
      </Button>
    </header>
  );
}
