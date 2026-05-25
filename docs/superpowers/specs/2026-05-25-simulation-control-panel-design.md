# Simulation Control Panel & Chat Timestamps — Design Spec

**Date:** 2026-05-25
**Status:** Approved
**Scope:** Sub-project A of AI-Town enhancements

## Overview

Add user-facing controls to manage the simulation (pause/resume, force NPC interactions) and improve chat UX with message timestamps.

This is sub-project A. Sub-project B (NPC character configuration module) will be spec'd separately.

---

## Backend Changes

### 1. state_manager.py — Pause Mechanism

Add a `_paused` flag that all three background loops respect:

```
NPCStateManager:
  _paused: bool = False

  pause():
    _paused = True
    log "⏸️ 模拟已暂停"

  resume():
    _paused = False
    log "▶️ 模拟已恢复"

  is_paused() -> bool

Loop guards (added at top of each loop body):
  _npc_chat_loop()     → if self._paused: continue
  _think_loop()        → if self._paused: continue
  _perception_loop()   → if self._paused: continue
```

When paused:
- All automatic NPC-NPC conversations stop triggering
- All autonomous thinking (NPC initiating to player) stops
- All perception scanning stops
- Manual actions (player sending messages, force-initiate, manual NPC-NPC trigger) still work
- Frontend polling continues to respond normally
- NPC states are NOT forcibly reset (they stay as-is)

### 2. main.py — New & Modified API Endpoints

**New endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/simulation/status` | Returns `{ paused, active_chats_count, daily_calls_remaining }` |
| POST | `/simulation/pause` | Calls `state_mgr.pause()` |
| POST | `/simulation/resume` | Calls `state_mgr.resume()` |
| POST | `/npc/{npc_name}/initiate` | Calls `autonomous_thinker.force_initiate(npc_name)`, returns generated message |

**Modified endpoints:**

| Method | Path | Change |
|--------|------|--------|
| POST | `/npc-npc-chat/trigger` | Manual mode now properly bypasses state/cooldown/affinity/active_count checks |

### 3. autonomous_thinker.py — Force Initiate

New method that bypasses all gates:

```
force_initiate(npc_name: str) -> dict:
  - Does NOT check NPC state (works even if busy)
  - Does NOT check probability
  - Does NOT check cooldown
  - Does NOT check silence counter
  - Calls _generate_initiation() directly
  - Adds message to pending_messages queue
  - Returns { "content": ..., "npc_name": ..., "timestamp": ... }
```

### 4. npc_npc_chat.py — Manual Trigger Enhancement

In `trigger_chat()`, the `reason="manual"` branch currently has `pass`. Complete it:

```
if reason == "manual":
    # Skip: idle state check, cooldown check, affinity threshold
    # Still check: both NPCs exist
    # Still enforce: max 1 active conversation (return error with clear message)
```

---

## Frontend Changes

### 1. index.html — New UI Elements

**Top bar** — add pause button right of god panel toggle:
```html
<button id="pauseBtn" class="btn btn-sm">⏸ 暂停</button>
```

**Sidebar actions** — add NPC-NPC chat button next to group chat:
```html
<button id="newNpcChatBtn" class="btn btn-sm">💬 NPC对话</button>
```

**Conversation list items** — add initiate button per NPC row (only for 1v1 convs):
```html
<button class="btn btn-xs btn-initiate" data-npc="张三">🔔</button>
```

**New modal** — NPC conversation selector (similar to group chat modal):
```html
<div class="modal-overlay" id="newNpcChatModal">
  <div class="modal">
    <h3>💬 NPC 对话</h3>
    <p>选择两个 NPC 开始自然对话：</p>
    <select id="npcChatSelectA">...</select>
    <span> ↔ </span>
    <select id="npcChatSelectB">...</select>
    <p class="modal-hint" id="npcChatHint"></p>
    <button id="newNpcChatCancel">取消</button>
    <button id="newNpcChatConfirm">开始对话</button>
  </div>
</div>
```

### 2. app.js — New Logic

**Pause/Resume:**
- `pauseBtn` click → call API, toggle button text/icon (⏸/▶)
- On page load, check `/simulation/status` to sync initial button state

**Force NPC Initiate:**
- `.btn-initiate` click → call `POST /npc/{name}/initiate`
- Create or open 1v1 conversation with that NPC
- Display the generated message in the chat window

**NPC-NPC Conversation Trigger:**
- `newNpcChatBtn` click → open modal, populate two dropdowns with NPC names
- Validate two different NPCs selected
- Call `POST /npc-npc-chat/trigger?npc_a=X&npc_b=Y`
- Create a new NPC-NPC conversation in the sidebar (type `npcnpc_{a}_{b}`)
- Open it as a read-only chat window
- Poll for messages (reuse existing NPC-NPC status polling)

**Message Timestamps (Mixed Mode):**
- Each message object gains a `timestamp` field on creation
- Display rules:
  - Today: show `HH:MM` (e.g., `14:32`)
  - Yesterday: show `昨天 HH:MM` (e.g., `昨天 14:32`)
  - Earlier this year: show `M月D日 HH:MM` (e.g., `5月23日 09:15`)
  - Different year: show `YYYY年M月D日 HH:MM`
- Date separator: when messages cross a day boundary, insert a date divider:
  ```
  ──── 5月25日 ────
  ```
- Timestamps shown inline next to each message bubble, right-aligned

**Message timestamp data flow:**
- Backend generates `timestamp` on each message in scene_generator and autonomous_thinker
- Frontend stores it in localStorage with the message
- Render logic in `renderMessages()` applies the mixed-mode formatting

### 3. api.js — New API Calls

```
pauseSimulation()       → POST /simulation/pause
resumeSimulation()      → POST /simulation/resume
getSimulationStatus()   → GET  /simulation/status
initiateNpcChat(name)   → POST /npc/{name}/initiate
triggerNpcNpcChat(a, b) → POST /npc-npc-chat/trigger?npc_a=X&npc_b=Y
```

---

## Data Flow

```
Pause:
  User clicks [⏸] → api.pauseSimulation() → state_mgr.pause()
  → _paused=True → 3 loop guards skip LLM calls
  → Polling continues, UI shows "已暂停"

Force Initiate:
  User clicks [🔔] on NPC row
  → api.initiateNpcChat("张三")
  → thinker.force_initiate("张三") → bypass all gates → generate message
  → Returns message → frontend creates/opens 1v1 conv → displays message

NPC-NPC Manual Conversation:
  User clicks [💬 NPC对话] → modal opens
  → Selects 张三 + 李四 → clicks "开始对话"
  → api.triggerNpcNpcChat("张三", "李四")
  → chat_engine.trigger_chat("张三", "李四", reason="manual")
  → Bypass cooldown/state checks → generate via scene_generator
  → Returns chat_id → frontend creates npcnpc conv → polls for messages

Chat Timestamps:
  Message created (any source) → includes timestamp
  → Stored in localStorage with conv data
  → renderMessages() formats per mixed-mode rules
  → Cross-day detection inserts date separators
```

---

## API Contract

### POST /simulation/pause
Response: `{ "status": "paused", "message": "模拟已暂停" }`

### POST /simulation/resume
Response: `{ "status": "running", "message": "模拟已恢复" }`

### GET /simulation/status
Response:
```json
{
  "paused": false,
  "active_npc_chats": 0,
  "daily_calls_remaining": 95
}
```

### POST /npc/{npc_name}/initiate
Response:
```json
{
  "npc_name": "张三",
  "content": "嘿，今天天气不错啊！",
  "timestamp": "2026-05-25T14:32:00"
}
```
Error (NPC busy/silent): `409` with detail message

### POST /npc-npc-chat/trigger (modified)
Query params: `npc_a`, `npc_b`
Response (success): `{ "message": "已触发 张三 与 李四 的对话", "chat_id": "abc123" }`
Response (concurrent conflict): `409` — "已有对话正在进行，请等待结束后再试"

---

## Files Modified

| File | Type | Summary |
|------|------|---------|
| `backend/state_manager.py` | Modify | Add pause/resume + loop guards |
| `backend/main.py` | Modify | 4 new endpoints, 1 modified |
| `backend/autonomous_thinker.py` | Modify | Add force_initiate() |
| `backend/npc_npc_chat.py` | Modify | Complete manual trigger bypass |
| `frontend/index.html` | Modify | Add buttons, modal |
| `frontend/js/app.js` | Modify | New event handlers, timestamp rendering |
| `frontend/js/api.js` | Modify | 5 new API functions |

## Out of Scope

- NPC character configuration module (sub-project B)
- Any changes to group chat mechanics
- Any changes to timeline/day-advance logic
- NPC state auto-reset on pause (states preserved as-is)
- Persisting pause state across server restarts (always starts running)
