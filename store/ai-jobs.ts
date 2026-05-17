'use client';

import { create } from 'zustand';
import type { SectionType } from '@/lib/types';

export type AIJobStatus = 'running' | 'completed' | 'error';

export interface AIJob {
  id: string;
  sectionId: string;
  sectionType: SectionType;
  sectionLabel: string;
  mode: 'generate' | 'edit';
  status: AIJobStatus;
  result?: string;
  errorMessage?: string;
  startedAt: number;
}

interface AIJobsStore {
  jobs: AIJob[];
  pendingOpenJobId: string | null;
  addJob: (job: AIJob) => void;
  updateJob: (id: string, patch: Partial<AIJob>) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  requestOpenJob: (jobId: string) => void;
  clearPendingOpen: () => void;
}

export const useAIJobsStore = create<AIJobsStore>((set) => ({
  jobs: [],
  pendingOpenJobId: null,
  addJob: (job) => set((state) => ({ jobs: [...state.jobs, job] })),
  updateJob: (id, patch) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    })),
  removeJob: (id) =>
    set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) })),
  clearCompleted: () =>
    set((state) => ({
      jobs: state.jobs.filter((j) => j.status === 'running'),
    })),
  requestOpenJob: (jobId) => set({ pendingOpenJobId: jobId }),
  clearPendingOpen: () => set({ pendingOpenJobId: null }),
}));
