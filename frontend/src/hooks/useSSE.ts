import { useState, useCallback, useRef } from 'react';
import type { SSEEvent } from '../types';

/**
 * SSE 流式通信 Hook。
 * 对应旧的 app.js 中手动 fetch + ReadableStream 的模式，
 * React 化为可复用的 hook。
 */
export function useSSE() {
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (
    path: string,
    body: unknown,
    onEvent: (event: SSEEvent) => void,
  ): Promise<void> => {
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`/api${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `SSE HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as SSEEvent;
              onEvent(event);
            } catch {
              // Skip malformed SSE
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', error: (err as Error).message });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { streaming, startStream, abort };
}
