import { create } from 'zustand';
import type { TimelineResponse } from '../types';

interface SimulationState {
  connected: boolean;
  running: boolean;
  timelines: TimelineResponse[];
  activeTimelineId: string | null;
  currentDay: number;
  polling: boolean;

  setConnected: (v: boolean) => void;
  setRunning: (v: boolean) => void;
  setTimelines: (t: TimelineResponse[]) => void;
  setActiveTimeline: (id: string | null) => void;
  setCurrentDay: (day: number) => void;
  setPolling: (v: boolean) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  connected: false,
  running: true,
  timelines: [],
  activeTimelineId: null,
  currentDay: 0,
  polling: false,

  setConnected: (v) => set({ connected: v }),
  setRunning: (v) => set({ running: v }),
  setTimelines: (t) => set({ timelines: t }),
  setActiveTimeline: (id) => set({ activeTimelineId: id }),
  setCurrentDay: (day) => set({ currentDay: day }),
  setPolling: (v) => set({ polling: v }),
}));
