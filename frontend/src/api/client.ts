/* ================================
   API Client — fetch 封装 + 缓存 + 重试
   对应旧 frontend/js/api.js
   ================================ */

const API_BASE = '/api';

interface RequestOptions {
  useCache?: boolean;
  cacheTTL?: number;
  maxRetries?: number;
}

const _pendingRequests: Record<string, Promise<unknown> | undefined> = {};
const _cache: Record<string, { data: unknown; time: number } | undefined> = {};

export function invalidateCache(pattern = '') {
  for (const key of Object.keys(_cache)) {
    if (key.includes(pattern)) delete _cache[key];
  }
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body: unknown = null,
  options: RequestOptions = {}
): Promise<T> {
  const { useCache = false, cacheTTL = 2000, maxRetries = 2 } = options;
  const url = API_BASE + path;
  const cacheKey = `${method}:${url}`;

  if (_pendingRequests[cacheKey]) {
    return _pendingRequests[cacheKey] as Promise<T>;
  }

  if (useCache && _cache[cacheKey] && (Date.now() - _cache[cacheKey].time) < cacheTTL) {
    return _cache[cacheKey].data as T;
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const fetchOptions: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      };
      if (body) {
        fetchOptions.body = JSON.stringify(body);
      }

      const promise = fetch(url, fetchOptions).then(async (response) => {
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const error = new Error((errData as { detail?: string }).detail || `HTTP ${response.status}`);
          (error as unknown as Record<string, unknown>).status = response.status;
          throw error;
        }
        return response.json() as Promise<T>;
      });

      _pendingRequests[cacheKey] = promise;
      const data = await promise;
      delete _pendingRequests[cacheKey];

      if (method === 'GET' && useCache) {
        _cache[cacheKey] = { data, time: Date.now() };
      }

      return data;
    } catch (err) {
      delete _pendingRequests[cacheKey];
      lastError = err as Error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastError;
}

// ---- Chat APIs ----
export function sendChat(npcName: string, message: string) {
  return apiRequest<{ npc_name: string; npc_title: string; message: string; success: boolean; timestamp: string | null }>(
    'POST', '/chat', { npc_name: npcName, message }
  );
}

export function sendGroupChat(npcNames: string[], message: string) {
  return apiRequest<{ responses: Record<string, unknown>; failed: string[]; meta: Record<string, unknown> }>(
    'POST', '/group-chat', { npc_names: npcNames, message }
  );
}

// ---- NPC APIs ----
export function fetchNpcList() {
  return apiRequest<{ npcs: import('../types').NPCInfo[]; total: number }>(
    'GET', '/npcs', null, { useCache: true, cacheTTL: 10000 }
  );
}

export function fetchNpcStates() {
  return apiRequest<import('../types').NPCStateListResponse>(
    'GET', '/npcs/states', null, { useCache: false }
  );
}

export function fetchNpcAffinity(npcName: string) {
  return apiRequest<Record<string, number>>(
    'GET', `/npcs/${encodeURIComponent(npcName)}/affinity`, null, { useCache: true, cacheTTL: 5000 }
  );
}

// ---- Timeline APIs ----
export function fetchTimelines() {
  return apiRequest<{ timelines: import('../types').TimelineResponse[]; active_id: string | null }>(
    'GET', '/timelines', null, { useCache: true, cacheTTL: 5000 }
  );
}

export function createTimeline(name: string) {
  invalidateCache('/timelines');
  return apiRequest<import('../types').TimelineResponse>('POST', '/timelines', { name });
}

export function setActiveTimeline(id: string) {
  invalidateCache('/timelines');
  return apiRequest<object>('PUT', `/timelines/${encodeURIComponent(id)}/active`);
}

export function setTodayEvent(id: string, content: string) {
  invalidateCache('/timelines');
  return apiRequest<object>('PUT', `/timelines/${encodeURIComponent(id)}/events/today`, { content });
}

export function advanceDay(id: string) {
  invalidateCache('/timelines');
  return apiRequest<{ new_day: number; old_day: number; message: string }>(
    'POST', `/timelines/${encodeURIComponent(id)}/advance`
  );
}

export function fetchTodayEvent(id: string) {
  return apiRequest<{ day: number; event: import('../types').EventResponse | null }>(
    'GET', `/timelines/${encodeURIComponent(id)}/today`, null, { useCache: false }
  );
}

// ---- NPC-NPC Chat APIs ----
export function fetchNpcNpcChatStatus() {
  return apiRequest<import('../types').NPCNPCChatStatusResponse>(
    'GET', '/npc-npc-chat/status', null, { useCache: false }
  );
}

export function triggerNpcNpcChat(npcA: string, npcB: string) {
  return apiRequest<object>(
    'POST', `/npc-npc-chat/trigger?npc_a=${encodeURIComponent(npcA)}&npc_b=${encodeURIComponent(npcB)}`
  );
}

// ---- Simulation APIs ----
export function getSimulationStatus() {
  return apiRequest<import('../types').SimulationStatus>(
    'GET', '/simulation/status', null, { useCache: false }
  );
}

export function pauseSimulation() {
  invalidateCache('/simulation');
  return apiRequest<object>('POST', '/simulation/pause');
}

export function resumeSimulation() {
  invalidateCache('/simulation');
  return apiRequest<object>('POST', '/simulation/resume');
}

export function initiateNpcChat(npcName: string) {
  return apiRequest<object>(
    'POST', `/npc/${encodeURIComponent(npcName)}/initiate`
  );
}

// ---- NPC Config APIs ----
export function fetchNpcConfigs() {
  return apiRequest<{ npcs: import('../types').NpcConfigSummary[]; total: number }>(
    'GET', '/npc-configs', null, { useCache: false }
  );
}

export function generateNpcConfig(description: string) {
  return apiRequest<object>('POST', '/npc-configs/generate', { description });
}

export function createNpcConfig(data: import('../types').NpcConfigCreate) {
  invalidateCache('/npc-configs');
  return apiRequest<object>('POST', '/npc-configs', data);
}

export function deleteNpcConfig(name: string) {
  invalidateCache('/npc-configs');
  return apiRequest<object>('DELETE', `/npc-configs/${encodeURIComponent(name)}`);
}

// ---- Pending Messages ----
export function fetchPendingMessages() {
  return apiRequest<{ messages: import('../types').PendingMessage[] }>(
    'GET', '/npc/pending-messages', null, { useCache: false }
  );
}

export function ackPendingMessages(npcName?: string, messageKeys?: string[]) {
  return apiRequest<object>('POST', '/npc/ack-pending', {
    npc_name: npcName ?? null,
    message_keys: messageKeys ?? null,
  });
}

// ---- Health ----
export function checkHealth() {
  return apiRequest<{ status: string }>('GET', '/health');
}
