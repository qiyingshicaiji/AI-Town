import type { NpcConfigSummary } from '../../types';
import { Button } from '../ui/Button';

interface NpcCardProps {
  npc: NpcConfigSummary;
  state?: string;
  onChat?: () => void;
  onDetail?: () => void;
  onDelete?: () => void;
}

const stateColors: Record<string, string> = {
  idle: 'bg-green-400',
  chatting: 'bg-yellow-400',
  busy: 'bg-red-400',
};

const stateLabels: Record<string, string> = {
  idle: '空闲',
  chatting: '对话中',
  busy: '忙碌',
};

export function NpcCard({ npc, state = 'idle', onChat, onDetail, onDelete }: NpcCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${stateColors[state] || 'bg-gray-300'}`} />
        <span className="font-medium text-sm flex-1 truncate">{npc.name}</span>
        <span className="text-[10px] text-gray-400">{stateLabels[state] || state}</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">{npc.title}</p>
      <p className="text-xs text-gray-400 mb-3 line-clamp-2">{npc.personality}</p>
      <div className="flex gap-1">
        {onChat && <Button size="sm" variant="primary" onClick={onChat}>对话</Button>}
        {onDetail && <Button size="sm" variant="secondary" onClick={onDetail}>详情</Button>}
        {onDelete && !npc.is_builtin && (
          <Button size="sm" variant="danger" onClick={onDelete}>删除</Button>
        )}
      </div>
    </div>
  );
}
