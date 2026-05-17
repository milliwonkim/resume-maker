'use client';

import { create } from 'zustand';
import type { Resume, ResumeSection, SectionContent } from '@/lib/types';

const MAX_HISTORY = 20;

function appendHistory(history: ResumeSection[][], current: ResumeSection[]): ResumeSection[][] {
  const next = [...history, current];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

interface ResumeStore {
  resumes: Resume[];
  currentResume: Resume | null;
  sections: ResumeSection[];
  history: ResumeSection[][];
  isSaving: boolean;

  setResumes: (resumes: Resume[]) => void;
  addResume: (resume: Resume) => void;
  removeResume: (id: string) => void;
  updateResumeTitle: (id: string, title: string) => void;

  setCurrentResume: (resume: Resume | null) => void;
  setSections: (sections: ResumeSection[]) => void;
  addSection: (section: ResumeSection) => void;
  removeSection: (id: string) => void;
  updateSectionLayout: (id: string, layout: string) => void;
  updateSectionContent: (id: string, content: SectionContent) => void;
  moveSectionUp: (id: string) => void;
  moveSectionDown: (id: string) => void;
  reorderSection: (draggedId: string, targetId: string) => void;
  undo: () => ResumeSection[] | null;
  setIsSaving: (value: boolean) => void;
}

export const useResumeStore = create<ResumeStore>((set, get) => ({
  resumes: [],
  currentResume: null,
  sections: [],
  history: [],
  isSaving: false,

  setResumes: (resumes) => set({ resumes }),
  addResume: (resume) => set((s) => ({ resumes: [resume, ...s.resumes] })),
  removeResume: (id) =>
    set((s) => ({ resumes: s.resumes.filter((r) => r.id !== id) })),
  updateResumeTitle: (id, title) =>
    set((s) => ({
      resumes: s.resumes.map((r) => (r.id === id ? { ...r, title } : r)),
      currentResume:
        s.currentResume?.id === id ? { ...s.currentResume, title } : s.currentResume,
    })),

  setCurrentResume: (resume) => set({ currentResume: resume }),
  setSections: (sections) => set({ sections, history: [] }),
  addSection: (section) =>
    set((s) => ({
      history: appendHistory(s.history, s.sections),
      sections: [...s.sections, section],
    })),
  removeSection: (id) =>
    set((s) => ({
      history: appendHistory(s.history, s.sections),
      sections: s.sections.filter((sec) => sec.id !== id),
    })),
  updateSectionLayout: (id, layout) =>
    set((s) => ({
      history: appendHistory(s.history, s.sections),
      sections: s.sections.map((sec) => (sec.id === id ? { ...sec, layout } : sec)),
    })),
  updateSectionContent: (id, content) =>
    set((s) => ({
      history: appendHistory(s.history, s.sections),
      sections: s.sections.map((sec) => (sec.id === id ? { ...sec, content } : sec)),
    })),
  moveSectionUp: (id) =>
    set((s) => {
      const idx = s.sections.findIndex((sec) => sec.id === id);
      if (idx <= 0) return s;
      const next = [...s.sections];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return {
        history: appendHistory(s.history, s.sections),
        sections: next.map((sec, i) => ({ ...sec, order_index: i })),
      };
    }),
  moveSectionDown: (id) =>
    set((s) => {
      const idx = s.sections.findIndex((sec) => sec.id === id);
      if (idx < 0 || idx >= s.sections.length - 1) return s;
      const next = [...s.sections];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return {
        history: appendHistory(s.history, s.sections),
        sections: next.map((sec, i) => ({ ...sec, order_index: i })),
      };
    }),
  reorderSection: (draggedId, targetId) =>
    set((s) => {
      if (draggedId === targetId) return s;

      const fromIndex = s.sections.findIndex((sec) => sec.id === draggedId);
      const toIndex = s.sections.findIndex((sec) => sec.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return s;

      const next = [...s.sections];
      const [dragged] = next.splice(fromIndex, 1);
      const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      next.splice(insertIndex, 0, dragged);

      return {
        history: appendHistory(s.history, s.sections),
        sections: next.map((sec, i) => ({ ...sec, order_index: i })),
      };
    }),
  undo: () => {
    const { history } = get();
    if (history.length === 0) return null;
    const previous = history[history.length - 1];
    set((s) => ({ sections: previous, history: s.history.slice(0, -1) }));
    return previous;
  },
  setIsSaving: (value) => set({ isSaving: value }),
}));
