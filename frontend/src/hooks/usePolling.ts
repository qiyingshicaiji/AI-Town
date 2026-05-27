import { useEffect, useRef } from 'react';
import { useSimulationStore } from '../stores/simulationStore';
import { useChatStore } from '../stores/chatStore';
import { useNpcStore } from '../stores/npcStore';
import { fetchNpcStates, fetchNpcNpcChatStatus, fetchPendingMessages, ackPendingMessages } from '../api/client';

/**
 * 轮询 Hook — 定期拉取 NPC 状态、NPC-NPC 聊天、主动消息。
 * 对应旧 app.js 中 5 秒间隔的 startPolling / processPollData 逻辑。
 */
export function usePolling(intervalMs = 5000) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const affinityCycleRef = useRef(0);

  useEffect(() => {
    async function poll() {
      try {
        const store = useSimulationStore.getState();
        store.setPolling(true);

        // 1. NPC states
        const states = await fetchNpcStates();
        useNpcStore.getState().setNpcStates(states.states);
        store.setActiveTimeline(states.active_timeline);
        store.setCurrentDay(states.current_day);

        // 2. NPC-NPC chat status
        const npcNpcStatus = await fetchNpcNpcChatStatus();
        useChatStore.getState().setNpcNpcData(
          npcNpcStatus.active_chats,
          npcNpcStatus.history,
        );

        // 3. Pending initiate messages
        const pending = await fetchPendingMessages();
        if (pending.messages.length > 0) {
          useChatStore.getState().setPendingMessages(pending.messages);
        }

        // 4. Affinity every 6 cycles (~30s)
        affinityCycleRef.current += 1;
        if (affinityCycleRef.current >= 6) {
          affinityCycleRef.current = 0;
          // Affinity is polled implicitly via npcNpcStatus / states
        }

        store.setPolling(false);
      } catch {
        useSimulationStore.getState().setPolling(false);
      }
    }

    poll(); // Initial
    timerRef.current = setInterval(poll, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [intervalMs]);

  return {
    ackMessages: (npcName?: string) => {
      ackPendingMessages(npcName);
      if (npcName) {
        useChatStore.getState().removePendingMessage(npcName);
      }
    },
  };
}
