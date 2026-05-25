# Findings: Simulation Control Panel

## Codebase Architecture

### Background Loops (state_manager.py)
- `_npc_chat_loop()` — 15s interval, triggers NPC-NPC conversations
- `_think_loop()` — 15s interval, NPC autonomous thinking (proactive messages)
- `_perception_loop()` — 60s interval, environment perception scanning
- All controlled by `_running` flag, no existing pause mechanism

### NPC-NPC Chat Flow
```
_npc_chat_loop() → NPCNPCChatEngine.check_and_trigger()
  → checks: daily_limit, global_cooldown, active_count, affinity>=50, both idle, pair cooldown, 40% probability
  → trigger_chat() → _generate_conversation()
    → [1st] scene_generator.generate_scene() → 1 LLM call → full dialogue
    → [2nd] _generate_with_llm() → independent LLM prompt
    → [3rd] _generate_fallback() → template matching
  → cooldown + affinity update
```

### Existing API for Manual NPC-NPC Trigger
- `POST /npc-npc-chat/trigger?npc_a=X&npc_b=Y` already exists
- `trigger_chat()` has `reason="manual"` branch but only `pass` placeholder
- Manual mode still blocked by `active_count > 0` check (line 262)

### Frontend Message Storage
- Messages stored in localStorage per conversation
- Format: `{ sender, content, time }` — time is ISO string
- Existing `formatTimeStr()` only does today vs M/D distinction
- No date separator rendering in `renderMessages()`

### Frontend Polling (app.js `startPolling()`)
- 5s tick: update NPC states, check proactive messages, check NPC-NPC status, refresh affinities (30s)
- NPC init button needs to create conv if not exists (like proactive message handling)

## Key Decisions from Brainstorming
- Pause = full stop of all 3 loops, manual actions still work, states preserved
- Force initiate = per-NPC button (🔔) in conversation list
- NPC-NPC manual = new sidebar button → modal with 2 selects → read-only chat window
- Timestamps = mixed mode (today HH:MM, yesterday, older dates)
- Sub-project B (NPC config module) deferred to separate spec
