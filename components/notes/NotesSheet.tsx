'use client';

import { useEffect } from 'react';

import { useNotesUIStore } from '@/store/notes-ui';

import { NotesPanel } from './NotesPanel';

export function NotesSheet() {
  const isOpen = useNotesUIStore((state) => state.isOpen);
  const resumeId = useNotesUIStore((state) => state.resumeId);
  const close = useNotesUIStore((state) => state.close);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [close, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="메모장 닫기"
        onClick={close}
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl sm:max-w-lg">
        <NotesPanel
          resumeId={resumeId ?? undefined}
          onClose={close}
          className="h-full max-h-none rounded-none border-0 shadow-none"
        />
      </div>
    </div>
  );
}
