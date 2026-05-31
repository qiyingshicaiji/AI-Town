/* ================================
   API Client - 后端通信封装
   ================================ */

export const API_BASE = (function() {
    // Docker环境: 同源代理 /api/ -> backend
    if (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file')) {
        return window.location.origin + '/api';
    }
    // 直接打开 HTML 文件或开发环境: 直连后端
    return 'http://localhost:8000';
})();

// Request dedup cache
const _pendingRequests = {};
const _cache = {};

export async function apiRequest(method, path, body = null, options = {}) {
    const { useCache = false, cacheTTL = 2000, maxRetries = 2 } = options;
    const url = API_BASE + path;
    const cacheKey = `${method}:${url}`;

    // Dedup: same request in flight
    if (_pendingRequests[cacheKey]) {
        return _pendingRequests[cacheKey];
    }

    // Cache: return cached response
    if (useCache && _cache[cacheKey] && (Date.now() - _cache[cacheKey].time) < cacheTTL) {
        return _cache[cacheKey].data;
    }

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const fetchOptions = {
                method,
                headers: { 'Content-Type': 'application/json' },
            };
            if (body) {
                fetchOptions.body = JSON.stringify(body);
            }

            const controller = new AbortController();
            fetchOptions.signal = controller.signal;
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const promise = fetch(url, fetchOptions).then(async response => {
                clearTimeout(timeoutId);
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const error = new Error(errData.detail || `HTTP ${response.status}`);
                    error.status = response.status;
                    throw error;
                }
                return response.json();
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
            lastError = err;
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
            }
        }
    }
    throw lastError;
}

export function invalidateCache(pattern = '') {
    for (const key of Object.keys(_cache)) {
        if (key.includes(pattern)) delete _cache[key];
    }
}

/* ==================== Chat APIs ==================== */

export async function sendChat(npcName, message) {
    return apiRequest('POST', '/chat', { npc_name: npcName, message });
}

export async function sendGroupChat(npcNames, message) {
    return apiRequest('POST', '/group-chat', { npc_names: npcNames, message });
}

/* ==================== NPC APIs ==================== */

export async function fetchNpcList() {
    return apiRequest('GET', '/npcs', null, { useCache: true, cacheTTL: 10000 });
}

export async function fetchNpcStates() {
    return apiRequest('GET', '/npcs/states', null, { useCache: false });
}

export async function fetchNpcAffinity(npcName) {
    return apiRequest('GET', `/npcs/${npcName}/affinity`, null, { useCache: true, cacheTTL: 5000 });
}

export async function fetchNpcNpcAffinities() {
    return apiRequest('GET', '/npcs/npc-affinities', null, { useCache: true, cacheTTL: 30000 });
}

export async function resetNpcStates() {
    return apiRequest('POST', '/npcs/states/reset');
}

/* ==================== Timeline APIs ==================== */

export async function fetchTimelines() {
    return apiRequest('GET', '/timelines', null, { useCache: true, cacheTTL: 5000 });
}

export async function createTimeline(name) {
    invalidateCache('/timelines');
    return apiRequest('POST', '/timelines', { name });
}

export async function fetchTimeline(id) {
    return apiRequest('GET', `/timelines/${id}`, null, { useCache: false });
}

export async function fetchTimelineEvents(id) {
    return apiRequest('GET', `/timelines/${id}/events`, null, { useCache: false });
}

export async function fetchTodayEvent(id) {
    return apiRequest('GET', `/timelines/${id}/today`, null, { useCache: false });
}

export async function setTodayEvent(id, content) {
    invalidateCache('/timelines');
    return apiRequest('PUT', `/timelines/${id}/events/today`, { content });
}

export async function advanceDay(id) {
    invalidateCache('/timelines');
    return apiRequest('POST', `/timelines/${id}/advance`);
}

export async function setActiveTimeline(id) {
    invalidateCache('/timelines');
    return apiRequest('PUT', `/timelines/${id}/active`);
}

/* ==================== NPC-NPC Chat APIs ==================== */

export async function fetchNpcNpcChatStatus() {
    return apiRequest('GET', '/npc-npc-chat/status', null, { useCache: false });
}

export async function fetchNpcNpcChatHistory(limit = 50) {
    return apiRequest('GET', `/npc-npc-chat/history?limit=${limit}`, null, { useCache: false });
}

export async function triggerNpcNpcChat(npcA, npcB) {
    return apiRequest('POST', `/npc-npc-chat/trigger?npc_a=${encodeURIComponent(npcA)}&npc_b=${encodeURIComponent(npcB)}`);
}

/* ==================== Simulation Control APIs ==================== */

export async function getSimulationStatus() {
    return apiRequest('GET', '/simulation/status', null, { useCache: false });
}

export async function pauseSimulation() {
    invalidateCache('/simulation');
    return apiRequest('POST', '/simulation/pause');
}

export async function resumeSimulation() {
    invalidateCache('/simulation');
    return apiRequest('POST', '/simulation/resume');
}

export async function initiateNpcChat(npcName) {
    return apiRequest('POST', `/npc/${encodeURIComponent(npcName)}/initiate`);
}

/* ==================== NPC Config APIs ==================== */

export async function fetchNpcConfigs() {
    return apiRequest('GET', '/npc-configs', null, { useCache: false });
}

export async function fetchNpcConfig(name) {
    return apiRequest('GET', `/npc-configs/${encodeURIComponent(name)}`, null, { useCache: false });
}

export async function createNpcConfig(data) {
    invalidateCache('/npc-configs');
    return apiRequest('POST', '/npc-configs', data);
}

export async function updateNpcConfig(name, data) {
    invalidateCache('/npc-configs');
    return apiRequest('PUT', `/npc-configs/${encodeURIComponent(name)}`, data);
}

export async function deleteNpcConfig(name) {
    invalidateCache('/npc-configs');
    return apiRequest('DELETE', `/npc-configs/${encodeURIComponent(name)}`);
}

export async function generateNpcConfig(description) {
    return apiRequest('POST', '/npc-configs/generate', { description });
}
