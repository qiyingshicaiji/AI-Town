# Task Plan: NPC Character Configuration Module

**Spec:** docs/superpowers/specs/2026-05-25-npc-config-module-design.md
**Goal:** Make NPC character configuration dynamic — users can create/edit/delete NPCs from the frontend with AI-assisted generation.

---

## Phase 1: Backend — npc_configs.json + Dynamic NPC_ROLES

**File:** `backend/agents.py`, `backend/npc_configs.json` (new)

- [ ] Add `_load_npc_configs()` — load from JSON, seed defaults on first run
- [ ] Add `_save_npc_configs()` — write current NPC_ROLES to JSON
- [ ] Refactor `_create_agents()` → calls `_create_single_agent()` for each NPC
- [ ] Add `_create_single_agent(name, role)` — create SimpleAgent + MemoryManager
- [ ] Add `_rebuild_agent(name, role)` — replace SimpleAgent, preserve MemoryManager
- [ ] Modify `__init__` to call `_load_npc_configs()` before `_create_agents()`
- [ ] Ensure all existing code paths that read `NPC_ROLES` still work

Status: pending

---

## Phase 2: Backend — CRUD Methods in NPCAgentManager

**File:** `backend/agents.py`

- [ ] Add `add_npc(name, config)` — validate, add to NPC_ROLES, create agent, save JSON
- [ ] Add `update_npc(name, config)` — merge partial update, rebuild agent, save JSON
- [ ] Add `delete_npc(name)` — block built-in (张三/李四/王五), remove all resources, save JSON
- [ ] Validation: name not empty/duplicate, core_personality required

Status: pending

---

## Phase 3: Backend — main.py API Endpoints

**File:** `backend/main.py`

- [ ] Add `GET /npc-configs` — list all NPC configs (summary)
- [ ] Add `GET /npc-configs/{name}` — full single NPC config
- [ ] Add `POST /npc-configs` — create new NPC
- [ ] Add `PUT /npc-configs/{name}` — update NPC (partial merge)
- [ ] Add `DELETE /npc-configs/{name}` — delete NPC (403 for built-in)
- [ ] Add `POST /npc-configs/generate` — AI one-sentence generation

Status: pending

---

## Phase 4: Frontend — api.js New API Calls

**File:** `frontend/js/api.js`

- [ ] `fetchNpcConfigs()`, `fetchNpcConfig(name)`
- [ ] `createNpcConfig(data)`, `updateNpcConfig(name, data)`, `deleteNpcConfig(name)`
- [ ] `generateNpcConfig(description)`

Status: pending

---

## Phase 5: Frontend — index.html UI Elements

**File:** `frontend/index.html`

- [ ] Top bar: NPC manager toggle button
- [ ] NPC manager drawer (right side, mirrors god-panel pattern)
- [ ] NPC creation/editing wizard modal (4-step)
- [ ] AI generation input bar
- [ ] NPC detail card area

Status: pending

---

## Phase 6: Frontend — app.js NPC Manager Logic

**File:** `frontend/js/app.js`

- [ ] Drawer open/close handlers
- [ ] NPC list loading and rendering (cards with edit/delete)
- [ ] Creation wizard (step navigation, field rendering, validation)
- [ ] AI generation handler (call API → pre-fill wizard)
- [ ] Edit flow (load config → pre-fill wizard → save as PUT)
- [ ] Delete flow (confirm → API call → remove from list)
- [ ] NPC detail card view (readable role display)

Status: pending

---

## Phase 7: Frontend — style.css New Styles

**File:** `frontend/css/style.css`

- [ ] `.npc-manager-panel` / `.npc-manager-backdrop` (mirror god-panel)
- [ ] `.npc-card` (card in list with avatar, name, title, actions)
- [ ] `.wizard-steps` / `.wizard-step` (step progress indicators)
- [ ] `.ai-generate-bar` (AI input + button row)
- [ ] `.npc-detail-card` (readable role display with sections)
- [ ] `.npc-tag` (quirk/trigger tags)
- [ ] `.npc-badge-builtin` (built-in NPC indicator)

Status: pending

---

## Phase 8: Verification

- [ ] Start backend, confirm npc_configs.json auto-generated
- [ ] Create NPC via API → verify appears in GET /npc-configs
- [ ] Edit NPC via API → verify changes persist
- [ ] Delete NPC via API → verify removed
- [ ] Try delete built-in → verify 403
- [ ] AI generate → verify returns valid config
- [ ] Frontend: create NPC via wizard flow
- [ ] Frontend: edit and delete NPC
- [ ] Verify existing NPCs (张三/李四/王五) still function normally in chats

Status: pending
