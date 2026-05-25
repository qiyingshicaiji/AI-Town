/* ================================
   API Client - 后端通信封装
   ================================ */

const API_BASE = (function() {
    // Docker环境: 同源 nginx 代理 /api/ -> backend
    if (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file')) {
        return window.location.origin + '/api';
    }
    // 直接打开 HTML 文件或开发环境: 直连后端
    return 'http://localhost:8000';
})();

// Request dedup cache
const _pendingRequests = {};
const _cache = {};

async function apiRequest(method, path, body = null, options = {}) {
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
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

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

            // Cache successful GET responses
            if (method === 'GET' && useCache) {
                _cache[cacheKey] = { data, time: Date.now() };
            }

            return data;
        } catch (err) {
            delete _pendingRequests[cacheKey];
            lastError = err;
            if (attempt < maxRetries) {
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
            }
        }
    }
    throw lastError;
}

// Clear cache for specific patterns (useful after mutations)
function invalidateCache(pattern = '') {
    for (const key of Object.keys(_cache)) {
        if (key.includes(pattern)) delete _cache[key];
    }
}

/* ==================== Chat APIs ==================== */

async function sendChat(npcName, message) {
    return apiRequest('POST', '/chat', { npc_name: npcName, message });
}

async function sendGroupChat(npcNames, message) {
    return apiRequest('POST', '/group-chat', { npc_names: npcNames, message });
}

/* ==================== NPC APIs ==================== */

async function fetchNpcList() {
    return apiRequest('GET', '/npcs', null, { useCache: true, cacheTTL: 10000 });
}

async function fetchNpcStates() {
    return apiRequest('GET', '/npcs/states', null, { useCache: false });
}

async function fetchNpcAffinity(npcName) {
    return apiRequest('GET', `/npcs/${npcName}/affinity`, null, { useCache: true, cacheTTL: 5000 });
}

async function fetchNpcNpcAffinities() {
    return apiRequest('GET', '/npcs/npc-affinities', null, { useCache: true, cacheTTL: 30000 });
}

async function resetNpcStates() {
    return apiRequest('POST', '/npcs/states/reset');
}

/* ==================== Timeline APIs ==================== */

async function fetchTimelines() {
    return apiRequest('GET', '/timelines', null, { useCache: true, cacheTTL: 5000 });
}

async function createTimeline(name) {
    invalidateCache('/timelines');
    return apiRequest('POST', '/timelines', { name });
}

async function fetchTimeline(id) {
    return apiRequest('GET', `/timelines/${id}`, null, { useCache: false });
}

async function fetchTimelineEvents(id) {
    return apiRequest('GET', `/timelines/${id}/events`, null, { useCache: false });
}

async function fetchTodayEvent(id) {
    return apiRequest('GET', `/timelines/${id}/today`, null, { useCache: false });
}

async function setTodayEvent(id, content) {
    invalidateCache('/timelines');
    return apiRequest('PUT', `/timelines/${id}/events/today`, { content });
}

async function advanceDay(id) {
    invalidateCache('/timelines');
    return apiRequest('POST', `/timelines/${id}/advance`);
}

async function setActiveTimeline(id) {
    invalidateCache('/timelines');
    return apiRequest('PUT', `/timelines/${id}/active`);
}

/* ==================== NPC-NPC Chat APIs ==================== */

async function fetchNpcNpcChatStatus() {
    return apiRequest('GET', '/npc-npc-chat/status', null, { useCache: false });
}

async function fetchNpcNpcChatHistory(limit = 50) {
    return apiRequest('GET', `/npc-npc-chat/history?limit=${limit}`, null, { useCache: false });
}

async function triggerNpcNpcChat(npcA, npcB) {
    return apiRequest('POST', `/npc-npc-chat/trigger?npc_a=${encodeURIComponent(npcA)}&npc_b=${encodeURIComponent(npcB)}`);
}

/* ==================== Simulation Control APIs ==================== */

async function getSimulationStatus() {
    return apiRequest('GET', '/simulation/status', null, { useCache: false });
}

async function pauseSimulation() {
    invalidateCache('/simulation');
    return apiRequest('POST', '/simulation/pause');
}

async function resumeSimulation() {
    invalidateCache('/simulation');
    return apiRequest('POST', '/simulation/resume');
}

async function initiateNpcChat(npcName) {
    return apiRequest('POST', `/npc/${encodeURIComponent(npcName)}/initiate`);
}
