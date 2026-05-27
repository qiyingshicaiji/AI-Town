import { create } from 'zustand';
import type { NPCInfo, NPCStateInfo, NpcConfigSummary } from '../types';

interface NpcState {
  npcs: NPCInfo[];
  npcStates: NPCStateInfo[];
  configs: NpcConfigSummary[];
  expandedNpc: string | null;
  wizardOpen: boolean;

  setNpcs: (npcs: NPCInfo[]) => void;
  setNpcStates: (states: NPCStateInfo[]) => void;
  setConfigs: (configs: NpcConfigSummary[]) => void;
  setExpandedNpc: (name: string | null) => void;
  setWizardOpen: (open: boolean) => void;
}

export const useNpcStore = create<NpcState>((set) => ({
  npcs: [],
  npcStates: [],
  configs: [],
  expandedNpc: null,
  wizardOpen: false,

  setNpcs: (npcs) => set({ npcs }),
  setNpcStates: (states) => set({ npcStates: states }),
  setConfigs: (configs) => set({ configs }),
  setExpandedNpc: (name) => set({ expandedNpc: name }),
  setWizardOpen: (open) => set({ wizardOpen: open }),
}));
