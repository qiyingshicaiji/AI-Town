# Findings: NPC Config Module

## Current NPC Architecture

### NPC_ROLES Structure (agents.py:29-104)
- Module-level `dict` with 3 hardcoded NPCs: 张三, 李四, 王五
- 13 fields per NPC: title, location, activity, core_personality, personality, work_context, speaking_style, style, quirks(array), emotional_triggers({positive, negative}), pet_peeves, expertise, hobbies
- `create_system_prompt(name, role)` assembles these fields into the agent's system prompt

### Code that references NPC_ROLES directly
- `agents.py:178` — iterate NPC_ROLES for state init
- `agents.py:193` — `_create_agents()` iterates NPC_ROLES
- `agents.py:295` — `get_all_npc_states()` uses NPC_ROLES
- `agents.py:329` — `group_chat()` reads NPC_ROLES
- `agents.py:774` — `generate_npc_speech()` reads NPC_ROLES
- `agents.py:854` — memory consolidation reads NPC_ROLES
- `agents.py:1045` — `get_npc_info()` reads NPC_ROLES
- `agents.py:1059` — `get_all_npcs()` uses NPC_ROLES.keys()
- `main.py:201` — reset states uses NPC name list
- `scene_generator.py:126` — `_build_roles_text()` reads full NPC_ROLES
- `npc_npc_chat.py:360` — `_generate_conversation()` calls `get_npc_info()`

### Agent Lifecycle
- `_create_agents()`: for each NPC in NPC_ROLES → `create_system_prompt()` → `SimpleAgent()` → `_create_memory_manager()`
- Memory stored in `backend/memory_data/{npc_name}/`
- No existing mechanism to rebuild an agent without full restart

### Key Design Decisions
- Keep NPC_ROLES as module-level dynamic dict (no DB, no complex serialization)
- JSON file for persistence (simple, git-friendly, zero-dependency)
- Agent rebuild preserves MemoryManager (memories survive NPC edits)
- Built-in NPCs (张三/李四/王五) protected from deletion
- AI generation uses existing SimpleAgent with a structured prompt

## Frontend Patterns to Follow
- Drawer panel: mirror god-panel (`.god-panel` / `.god-backdrop` pattern)
- Modal wizard: extend existing modal pattern
- Card list: new component, similar to conversation list items
- Tags: similar to `.readonly-tag` in god panel
