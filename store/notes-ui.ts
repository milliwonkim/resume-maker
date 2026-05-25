import { create } from 'zustand';

interface NotesUIState {
  isOpen: boolean;
  resumeId: string | null;
  open: (resumeId?: string) => void;
  close: () => void;
}

export const useNotesUIStore = create<NotesUIState>((set) => ({
  isOpen: false,
  resumeId: null,
  open: (resumeId) =>
    set({
      isOpen: true,
      resumeId: resumeId ?? null,
    }),
  close: () => set({ isOpen: false }),
}));
