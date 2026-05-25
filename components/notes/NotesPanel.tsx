'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { richTextToPlainText } from '@/lib/rich-text';
import type { Note, RichTextDocument } from '@/lib/types';
import { RichTextField } from '@/components/resume/RichTextField';

interface NotesPanelProps {
  resumeId?: string;
  onClose?: () => void;
  className?: string;
}

interface ResumeNoteIdsResponse {
  noteIds: string[];
}

const NOTE_SAVE_DEBOUNCE_MS = 700;
const NOTE_PREVIEW_LENGTH = 72;
const NOTE_QUERY_KEYS = {
  all: ['notes'] as const,
  resumeLinks: (resumeId: string) => ['resume-notes', resumeId] as const,
};

function getPreview(content: RichTextDocument): string {
  const text = richTextToPlainText(content).replace(/\s+/g, ' ').trim();
  return text.length > NOTE_PREVIEW_LENGTH
    ? `${text.slice(0, NOTE_PREVIEW_LENGTH)}...`
    : text;
}

async function fetchNotes(): Promise<Note[]> {
  const response = await fetch('/api/notes');
  if (!response.ok) throw new Error('메모를 불러오지 못했습니다.');
  return (await response.json()) as Note[];
}

async function fetchLinkedNoteIds(resumeId: string): Promise<string[]> {
  const response = await fetch(`/api/resumes/${resumeId}/notes`);
  if (!response.ok) throw new Error('연결된 메모를 불러오지 못했습니다.');
  const data = (await response.json()) as ResumeNoteIdsResponse;
  return data.noteIds;
}

export function NotesPanel({
  resumeId,
  onClose,
  className = '',
}: NotesPanelProps) {
  const queryClient = useQueryClient();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [manualError, setManualError] = useState('');
  const saveTimers = useRef<Map<string, number>>(new Map());
  const notesQuery = useQuery({
    queryKey: NOTE_QUERY_KEYS.all,
    queryFn: fetchNotes,
    staleTime: 30_000,
  });
  const linkedNoteIdsQuery = useQuery({
    queryKey: resumeId
      ? NOTE_QUERY_KEYS.resumeLinks(resumeId)
      : ['resume-notes', 'none'],
    queryFn: () => fetchLinkedNoteIds(resumeId as string),
    staleTime: 30_000,
    enabled: Boolean(resumeId),
  });
  const createNoteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '새 메모' }),
      });
      if (!response.ok) throw new Error('메모를 만들지 못했습니다.');
      return (await response.json()) as Note;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTE_QUERY_KEYS.all });
      if (resumeId) {
        void queryClient.invalidateQueries({
          queryKey: NOTE_QUERY_KEYS.resumeLinks(resumeId),
        });
      }
    },
  });
  const updateNoteMutation = useMutation({
    mutationFn: async ({
      noteId,
      payload,
    }: {
      noteId: string;
      payload: { title?: string; content?: RichTextDocument };
    }) => {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('메모를 수정하지 못했습니다.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTE_QUERY_KEYS.all });
    },
  });
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('메모를 삭제하지 못했습니다.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTE_QUERY_KEYS.all });
      if (resumeId) {
        void queryClient.invalidateQueries({
          queryKey: NOTE_QUERY_KEYS.resumeLinks(resumeId),
        });
      }
    },
  });
  const linkNoteMutation = useMutation({
    mutationFn: async ({
      noteId,
      linked,
    }: {
      noteId: string;
      linked: boolean;
    }) => {
      const response = await fetch(`/api/resumes/${resumeId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId, linked }),
      });
      if (!response.ok) throw new Error('메모 연결을 변경하지 못했습니다.');
    },
    onSuccess: () => {
      if (resumeId) {
        void queryClient.invalidateQueries({
          queryKey: NOTE_QUERY_KEYS.resumeLinks(resumeId),
        });
      }
    },
  });

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  const linkedNoteIds = useMemo(
    () => new Set(linkedNoteIdsQuery.data ?? []),
    [linkedNoteIdsQuery.data]
  );
  const sortedNotes = useMemo(
    () =>
      [...notes].sort((a, b) => {
        if (resumeId) {
          const aLinked = linkedNoteIds.has(a.id);
          const bLinked = linkedNoteIds.has(b.id);
          if (aLinked !== bLinked) return aLinked ? -1 : 1;
        }
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      }),
    [linkedNoteIds, notes, resumeId]
  );
  const selectedNote =
    notes.find((note) => note.id === selectedNoteId) ?? sortedNotes[0] ?? null;
  const linkedCount = linkedNoteIds.size;

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const updateNoteLocally = useCallback(
    (noteId: string, patch: Partial<Note>) => {
      queryClient.setQueryData<Note[]>(NOTE_QUERY_KEYS.all, (currentNotes) =>
        (currentNotes ?? []).map((note) =>
          note.id === noteId
            ? { ...note, ...patch, updated_at: new Date().toISOString() }
            : note
        )
      );
    },
    [queryClient]
  );

  const scheduleSave = useCallback(
    (
      noteId: string,
      payload: { title?: string; content?: RichTextDocument }
    ) => {
      const existing = saveTimers.current.get(noteId);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(async () => {
        setSavingNoteId(noteId);
        try {
          await updateNoteMutation.mutateAsync({ noteId, payload });
        } finally {
          setSavingNoteId((current) => (current === noteId ? null : current));
          saveTimers.current.delete(noteId);
        }
      }, NOTE_SAVE_DEBOUNCE_MS);

      saveTimers.current.set(noteId, timer);
    },
    [updateNoteMutation]
  );

  const handleCreate = useCallback(async () => {
    setManualError('');
    try {
      const note = await createNoteMutation.mutateAsync();
      queryClient.setQueryData<Note[]>(NOTE_QUERY_KEYS.all, (currentNotes) => [
        note,
        ...(currentNotes ?? []),
      ]);
      setSelectedNoteId(note.id);

      if (resumeId) {
        queryClient.setQueryData<string[]>(
          NOTE_QUERY_KEYS.resumeLinks(resumeId),
          (currentNoteIds) => [...new Set([...(currentNoteIds ?? []), note.id])]
        );
        await linkNoteMutation.mutateAsync({ noteId: note.id, linked: true });
      }
    } catch {
      setManualError('메모를 만들지 못했습니다.');
    }
  }, [createNoteMutation, linkNoteMutation, queryClient, resumeId]);

  const handleDelete = useCallback(
    async (noteId: string) => {
      const nextNotes = notes.filter((note) => note.id !== noteId);
      queryClient.setQueryData<Note[]>(NOTE_QUERY_KEYS.all, nextNotes);

      if (resumeId) {
        queryClient.setQueryData<string[]>(
          NOTE_QUERY_KEYS.resumeLinks(resumeId),
          (currentNoteIds) =>
            (currentNoteIds ?? []).filter(
              (currentNoteId) => currentNoteId !== noteId
            )
        );
      }

      setSelectedNoteId((current) =>
        current === noteId ? (nextNotes[0]?.id ?? null) : current
      );
      try {
        await deleteNoteMutation.mutateAsync(noteId);
      } catch {
        setManualError('메모를 삭제하지 못했습니다.');
      }
    },
    [deleteNoteMutation, notes, queryClient, resumeId]
  );

  const handleLinkChange = useCallback(
    async (noteId: string, linked: boolean) => {
      if (!resumeId) return;

      queryClient.setQueryData<string[]>(
        NOTE_QUERY_KEYS.resumeLinks(resumeId),
        (currentNoteIds) => {
          const current = currentNoteIds ?? [];
          return linked
            ? [...new Set([...current, noteId])]
            : current.filter((currentNoteId) => currentNoteId !== noteId);
        }
      );

      try {
        await linkNoteMutation.mutateAsync({ noteId, linked });
      } catch {
        setManualError('메모 연결을 변경하지 못했습니다.');
      }
    },
    [linkNoteMutation, queryClient, resumeId]
  );

  const isLoading =
    notesQuery.isLoading || (resumeId ? linkedNoteIdsQuery.isLoading : false);
  const isCreating = createNoteMutation.isPending;
  const error =
    manualError ||
    (notesQuery.error || (resumeId && linkedNoteIdsQuery.error)
      ? '메모를 불러오지 못했습니다.'
      : '');

  return (
    <aside
      className={`no-print flex max-h-[calc(100vh-7rem)] w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">메모장</h2>
          {resumeId ? (
            <p className="mt-0.5 text-xs text-gray-400">
              연결된 메모 {linkedCount}개
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-gray-400">
              프로젝트 기록이나 성과를 자유롭게 메모하세요
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {isCreating ? '생성 중' : '새 메모'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="메모장 닫기"
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-500">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="flex min-h-48 flex-1 items-center justify-center text-sm text-gray-400">
          메모 불러오는 중...
        </div>
      ) : notes.length === 0 ? (
        <div className="flex min-h-48 flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-medium text-gray-700">메모가 없습니다</p>
          <p className="mt-1 text-xs text-gray-400">
            작성 중 참고할 프로젝트 기록이나 성과를 메모로 남겨두세요.
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 border-t border-gray-50 sm:grid-cols-[11rem_1fr]">
          <div className="min-h-0 overflow-y-auto border-b border-gray-100 sm:max-h-none sm:border-r sm:border-b-0">
            {sortedNotes.map((note) => {
              const isLinked = linkedNoteIds.has(note.id);
              const isSelected = selectedNote?.id === note.id;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`flex w-full items-start gap-2 border-b border-gray-50 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                    isSelected ? 'bg-blue-50/70' : 'bg-white'
                  }`}
                >
                  {resumeId && (
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={(event) => {
                        event.stopPropagation();
                        void handleLinkChange(note.id, event.target.checked);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-300"
                      aria-label="이력서에 메모 연결"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-gray-800">
                      {note.title || '제목 없음'}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-gray-400">
                      {getPreview(note.content) || '내용 없음'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedNote && (
            <div className="min-h-0 overflow-y-auto p-4">
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="text"
                  value={selectedNote.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    updateNoteLocally(selectedNote.id, { title });
                    scheduleSave(selectedNote.id, { title });
                  }}
                  className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-blue-300 focus:outline-none"
                  placeholder="메모 제목"
                />
                <button
                  type="button"
                  onClick={() => void handleDelete(selectedNote.id)}
                  className="rounded-md border border-red-100 px-2 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50"
                >
                  삭제
                </button>
              </div>

              {resumeId && (
                <label className="mb-3 flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={linkedNoteIds.has(selectedNote.id)}
                    onChange={(event) =>
                      void handleLinkChange(
                        selectedNote.id,
                        event.target.checked
                      )
                    }
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  이 이력서에서 참고
                </label>
              )}

              <RichTextField
                value={selectedNote.content}
                onChange={(content) => {
                  updateNoteLocally(selectedNote.id, { content });
                  scheduleSave(selectedNote.id, { content });
                }}
                placeholder="메모를 작성하세요"
                toolbarMode="fixed"
                enableTables
                editorClassName="min-h-72 rounded-md border border-gray-200 p-3 text-sm leading-6 focus-within:border-blue-300"
              />

              <p className="mt-2 text-right text-xs text-gray-400">
                {savingNoteId === selectedNote.id ? '저장 중...' : '저장됨'}
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
