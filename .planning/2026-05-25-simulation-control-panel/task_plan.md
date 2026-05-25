# Task Plan: Simulation Control Panel & Chat Timestamps

**Spec:** docs/superpowers/specs/2026-05-25-simulation-control-panel-design.md
**Goal:** Add user-facing simulation controls (pause/resume, force NPC initiate, manual NPC-NPC chat) and chat message timestamps.

---

## Phase 1: Backend — state_manager.py Pause Mechanism

**File:** `backend/state_manager.py`

- [ ] Add `_paused: bool = False` attribute to `NPCStateManager`
- [ ] Add `pause()`, `resume()`, `is_paused()` methods
- [ ] Add `if self._paused: await asyncio.sleep(1); continue` guard at top of `_npc_chat_loop()`, `_think_loop()`, `_perception_loop()`

Status: pending

---

## Phase 2: Backend — autonomous_thinker.py Force Initiate

**File:** `backend/autonomous_thinker.py`

- [ ] Add `force_initiate(npc_name: str) -> dict` method
- [ ] Bypass all checks (state, probability, cooldown, silence counter)
- [ ] Call `_generate_initiation()` directly, push to `pending_messages`

Status: pending

---

## Phase 3: Backend — npc_npc_chat.py Manual Trigger Enhancement

**File:** `backend/npc_npc_chat.py`

- [ ] Complete `reason="manual"` branch in `trigger_chat()`
- [ ] Skip: idle state check, cooldown check, affinity threshold
- [ ] Keep: active_count limit (max 1 concurrent)
- [ ] Return `False` on conflict so caller can report error

Status: pending

---

## Phase 4: Backend — main.py API Endpoints

**File:** `backend/main.py`

- [ ] Add `GET /simulation/status` — returns `{ paused, active_npc_chats, daily_calls_remaining }`
- [ ] Add `POST /simulation/pause` — calls `state_mgr.pause()`
- [ ] Add `POST /simulation/resume` — calls `state_mgr.resume()`
- [ ] Add `POST /npc/{npc_name}/initiate` — calls `thinker.force_initiate(npc_name)`
- [ ] Modify `POST /npc-npc-chat/trigger` — return 409 on concurrent conflict
- [ ] Add message `timestamp` field in scene_generator and autonomous_thinker message dicts

Status: pending

---

## Phase 5: Frontend — api.js New API Calls

**File:** `frontend/js/api.js`

- [ ] Add `pauseSimulation()`, `resumeSimulation()`, `getSimulationStatus()`
- [ ] Add `initiateNpcChat(npcName)` → `POST /npc/{name}/initiate`
- [ ] Confirm `triggerNpcNpcChat()` (already exists) works with backend changes

Status: pending

---

## Phase 6: Frontend — index.html New UI Elements

**File:** `frontend/index.html`

- [ ] Top bar: add `<button id="pauseBtn">⏸ 暂停</button>` in `.top-bar-center`
- [ ] Sidebar: add `<button id="newNpcChatBtn">💬 NPC对话</button>` next to group chat btn
- [ ] NPC list items: add `.btn-initiate` 🔔 button per 1v1 NPC row
- [ ] New modal `#newNpcChatModal` with two `<select>` dropdowns for NPC selection

Status: pending

---

## Phase 7: Frontend — app.js Event Handlers + Timestamp Rendering

**File:** `frontend/js/app.js`

- [ ] Pause/resume button click handlers (call API, toggle icon/text)
- [ ] Page load: check `/simulation/status` to sync button state
- [ ] 🔔 initiate button click handler (call API, create/open 1v1 conv)
- [ ] NPC-NPC chat modal logic (open modal, populate dropdowns, validate, trigger)
- [ ] New `formatMessageTime(isoStr)` — mixed mode: today HH:MM, yesterday 昨天 HH:MM, older M月D日 HH:MM
- [ ] Modify `renderMessages()` — add timestamps inline per message + date separators on day boundary
- [ ] Wire poll tick to also call `getSimulationStatus` and update pause button

Status: pending

---

## Phase 8: Frontend — CSS Styles

**File:** `frontend/css/style.css`

- [ ] Style `.btn-initiate` (small 🔔 button in conv items)
- [ ] Style `.message-time-inline` (timestamp next to bubbles)
- [ ] Style `.message-date-separator` (day boundary divider)
- [ ] Style `#newNpcChatModal` (consistent with existing modal patterns)

Status: pending

---

## Phase 9: Verification

- [ ] Start backend, verify `/simulation/status` returns correct data
- [ ] Click pause → confirm no new NPC-NPC chats trigger (watch logs)
- [ ] Click resume → confirm loops resume
- [ ] Click 🔔 on NPC → confirm message appears in chat
- [ ] Create NPC-NPC conversation → confirm dialogue generates and displays
- [ ] Verify timestamps render correctly (mixed mode + date separators)
- [ ] Verify all existing functionality (1v1 chat, group chat, auto NPC-NPC) still works

Status: pending
