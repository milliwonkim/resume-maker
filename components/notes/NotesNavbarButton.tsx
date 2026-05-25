'use client';

import { useNotesUIStore } from '@/store/notes-ui';

interface NotesNavbarButtonProps {
  resumeId?: string;
}

export function NotesNavbarButton({ resumeId }: NotesNavbarButtonProps) {
  const open = useNotesUIStore((state) => state.open);

  return (
    <button
      type="button"
      onClick={() => open(resumeId)}
      title="메모장"
      className="flex h-8 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:px-3"
    >
      <svg
        className="h-4 w-4 shrink-0 text-gray-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
        />
      </svg>
      <span className="hidden sm:inline">메모장</span>
    </button>
  );
}
