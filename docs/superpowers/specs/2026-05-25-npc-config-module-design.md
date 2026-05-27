# NPC Character Configuration Module — Design Spec

**Date:** 2026-05-25
**Status:** Approved
**Scope:** Sub-project B of AI-Town enhancements

## Overview

Replace the hardcoded `NPC_ROLES` dictionary with a dynamic, user-manageable NPC configuration system. Users can create, edit, delete NPC characters from the frontend, with AI-assisted generation and preset templates.

---

## Backend Changes

### 1. Storage: `backend/npc_configs.json`

Flat JSON file storing all NPC configurations:

```json
{
  "npcs": {
    "张三": { "title": "Python工程师", "location": "工位区", ... },
    "李四": { ... },
    "王五": { ... }
  }
}
```

**Startup logic** (in `agents.py`):
- On module load, check if `npc_configs.json` exists
- If yes → load into module-level `NPC_ROLES` dict
- If no → seed from hardcoded defaults (current 3 NPCs) → write JSON

### 2. agents.py — Dynamic NPC Management

`NPC_ROLES` becomes a module-level `dict` that is read from JSON on startup.

New methods in `NPCAgentManager`:

```
_load_npc_configs():
  - Load npc_configs.json → NPC_ROLES
  - If file missing, seed from hardcoded defaults, write JSON

_save_npc_configs():
  - Write current NPC_ROLES to npc_configs.json

_create_single_agent(name, role):
  - Build system_prompt → create SimpleAgent → create MemoryManager
  - Used by both init and add_npc

_rebuild_agent(name, role):
  - Replace SimpleAgent with new system_prompt
  - Preserve existing MemoryManager (memories survive edits)

add_npc(name: str, config: dict):
  - Validate name (not empty, not duplicate)
  - Validate required fields (title, core_personality, personality, speaking_style)
  - NPC_ROLES[name] = config
  - _create_single_agent(name, config)
  - _save_npc_configs()
  - set state to idle

update_npc(name: str, config: dict):
  - NPC must exist
  - Merge provided fields (partial update allowed)
  - NPC_ROLES[name] = merged config
  - _rebuild_agent(name, merged config)
  - _save_npc_configs()

delete_npc(name: str):
  - NPC must exist
  - Cannot delete built-in NPCs (张三, 李四, 王五) — return 403
  - Remove from NPC_ROLES, self.agents, self.memories, self.npc_states
  - Clean up memory_data/{name}/ directory
  - _save_npc_configs()
```

### 3. main.py — New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/npc-configs` | List all NPC configs (summary: name, title, personality) |
| GET | `/npc-configs/{name}` | Get full NPC config (all 13 fields) |
| POST | `/npc-configs` | Create new NPC (body: {name, ...fields}) |
| PUT | `/npc-configs/{name}` | Update NPC (partial merge, body: {...fields}) |
| DELETE | `/npc-configs/{name}` | Delete NPC (403 for built-in) |
| POST | `/npc-configs/generate` | AI one-sentence generation (body: {description}) → returns full config |

**AI Generation endpoint** (`POST /npc-configs/generate`):
```
Input:  {"description": "一个喜欢摇滚乐的暴躁UI设计师"}
Output: {"name": "赵六", "title": "UI设计师", "core_personality": "...", ...}
```
- Uses existing LLM (via SimpleAgent) to generate all 13 fields from the description
- Calls `SimpleAgent.run(prompt, temperature=1.0)` with a structured prompt
- Parses JSON response, falls back to error if malformed

---

## Frontend Changes

### 1. index.html — New UI Elements

**Top bar** — add NPC management toggle button:
```html
<button id="npcManagerToggle" class="btn btn-sm">⚙ NPC管理</button>
```

**New drawer panel** (right side, similar to god panel):
```html
<aside class="npc-manager-panel collapsed" id="npcManagerPanel">
  <div class="npc-manager-header">
    <h2>⚙ NPC角色管理</h2>
    <button id="npcManagerClose">✕</button>
  </div>
  <div class="npc-manager-body">
    <div class="npc-manager-toolbar">
      <button id="createNpcBtn">+ 创建新NPC</button>
    </div>
    <div class="npc-list" id="npcList"></div>
  </div>
</aside>
<div class="npc-manager-backdrop" id="npcManagerBackdrop"></div>
```

**NPC Creation/Edit Wizard** (modal, multi-step):
```html
<div class="modal-overlay" id="npcWizardModal">
  <div class="modal modal-wizard">
    <!-- Step indicators -->
    <div class="wizard-steps">
      <span class="wizard-step active" data-step="1">① 基本信息</span>
      <span class="wizard-step" data-step="2">② 性格说话</span>
      <span class="wizard-step" data-step="3">③ 习惯情绪</span>
      <span class="wizard-step" data-step="4">④ 背景专长</span>
    </div>
    <!-- AI generation at step 1 -->
    <div class="ai-generate-bar">
      <input type="text" id="aiGenInput" placeholder="一句话描述你想创建的NPC...">
      <button id="aiGenBtn">✨ AI生成</button>
    </div>
    <!-- Step content (dynamically rendered) -->
    <div class="wizard-content" id="wizardContent"></div>
    <!-- Navigation -->
    <div class="modal-buttons">
      <button id="wizardPrev" style="display:none">上一步</button>
      <button id="wizardNext">下一步</button>
      <button id="wizardSave" style="display:none">保存NPC</button>
    </div>
  </div>
</div>
```

**NPC Detail Card** (view mode, replaces wizard when clicking an NPC card):
```html
<div class="npc-detail-card" id="npcDetailCard">
  <!-- Rendered dynamically with all fields in readable layout -->
</div>
```

### 2. app.js — New Logic

**NPC Manager Panel:**
- `npcManagerToggle` click → toggle drawer open/closed
- `npcManagerClose` / backdrop click → close
- Load NPC list from `GET /npc-configs`
- Render NPC cards with name, title, personality snippet, edit/delete buttons
- Built-in NPCs: show "内置" badge, hide delete button

**AI Generation:**
- `aiGenBtn` click → call `POST /npc-configs/generate` with description
- On success → pre-fill all wizard fields with generated data
- User can modify any field before saving

**Creation Wizard (4 steps):**
- Step 1: name, title, location, activity + AI generation bar
- Step 2: core_personality (textarea), personality (short), speaking_style (textarea), style (short)
- Step 3: quirks (add/remove list), emotional_triggers (positive/negative textareas), pet_peeves
- Step 4: work_context, expertise, hobbies
- Validation: name required, not duplicate; core_personality required
- On save: `POST /npc-configs` or `PUT /npc-configs/{name}`

**Edit Flow:**
- Click ✏️ on NPC card → open wizard pre-filled with current values
- All 4 steps populated from existing data
- Save calls PUT

**Delete Flow:**
- Click 🗑 on NPC card → confirm dialog → `DELETE /npc-configs/{name}`
- On success → remove from list, re-render
- On 403 (built-in) → show "内置NPC不能删除"

### 3. api.js — New API Calls

```
fetchNpcConfigs()         → GET  /npc-configs
fetchNpcConfig(name)      → GET  /npc-configs/{name}
createNpcConfig(data)     → POST /npc-configs
updateNpcConfig(name, data) → PUT /npc-configs/{name}
deleteNpcConfig(name)     → DELETE /npc-configs/{name}
generateNpcConfig(desc)   → POST /npc-configs/generate
```

### 4. style.css — New Styles

- `.npc-manager-panel` / `.npc-manager-backdrop` (consistent with god-panel)
- `.npc-card` (role card in list)
- `.wizard-steps` / `.wizard-step` (step indicators)
- `.ai-generate-bar` (AI generation input row)
- `.npc-detail-card` (readable role display)
- `.npc-tag` (quirk/trigger tags)

---

## AI Generation Prompt

```
你是一个角色设计师。根据用户的一句话描述，生成一个完整的虚拟角色。

用户描述: {description}

请输出严格的JSON格式，包含以下字段:
- name: 角色中文名（2-3字）
- title: 职位名称
- location: 在办公室常待的位置（如"工位区"、"会议室"、"休息区"）
- activity: 典型活动（如"写代码"、"喝咖啡"）
- core_personality: 核心性格描述（150-300字，生动有细节，像小说人物简介）
- personality: 性格简短总结（20-40字）
- work_context: 工作背景描述
- speaking_style: 说话风格描述（包含语速、口头禅、表达特点）
- style: 说话风格简短总结（10-20字）
- quirks: 3-4个小习惯（数组）
- emotional_triggers: {{positive: [3个], negative: [3个]}}
- pet_peeves: 雷区/最讨厌的事
- expertise: 专长技能（用顿号分隔）
- hobbies: 爱好（用顿号分隔）

只输出JSON，不要任何解释。
```

---

## Files Modified

| File | Type | Summary |
|------|------|---------|
| `backend/agents.py` | Modify | Dynamic NPC_ROLES, CRUD methods, JSON persistence |
| `backend/main.py` | Modify | 6 new API endpoints |
| `backend/npc_configs.json` | New | NPC configuration persistence (auto-generated) |
| `frontend/index.html` | Modify | NPC manager drawer, wizard modal |
| `frontend/js/app.js` | Modify | Drawer, wizard, card, AI-gen logic |
| `frontend/js/api.js` | Modify | 6 new API functions |
| `frontend/css/style.css` | Modify | New component styles |

## Out of Scope

- NPC avatar images (text-based avatars only)
- NPC import/export
- NPC version history / rollback
- Bulk NPC operations
