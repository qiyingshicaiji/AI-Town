import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.senderType === 'user';
  const isSystem = message.senderType === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[11px] text-gray-400 bg-gray-100 px-3 py-0.5 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  const initial = message.sender.charAt(0);

  return (
    <div className={`flex gap-2 px-3 py-1 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        isUser ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-700'
      }`}>
        {initial}
      </div>

      {/* Bubble */}
      <div className={`max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        <span className="text-[10px] text-gray-400 mb-0.5 block">
          {isUser ? '你' : message.sender}
        </span>
        <div className={`px-3 py-1.5 rounded-lg text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-blue-500 text-white rounded-tr-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
        }`}>
          {message.content}
        </div>
      </div>
    </div>
  );
}

export function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[11px] text-gray-400 shrink-0">{date}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}
