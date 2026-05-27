import { useNpcStore } from '../../stores/npcStore';

export function StatusBar() {
  const { npcStates } = useNpcStore();

  const idle = npcStates.filter((s) => s.state === 'idle').length;
  const total = npcStates.length;
  const avgAffinity = 50; // Placeholder — calculated from backend affinity data

  return (
    <footer className="h-7 bg-gray-100 border-t border-gray-200 flex items-center px-3 gap-4 text-[11px] text-gray-500 shrink-0 select-none">
      <span>NPC: {total} 位</span>
      <span>可对话: {idle} 位</span>
      <span>平均好感度: {avgAffinity}</span>
    </footer>
  );
}
