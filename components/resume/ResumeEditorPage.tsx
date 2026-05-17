'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useResumeStore } from '@/store/resume';
import { useAIStore } from '@/store/ai';
import { ResumeEditor, type ResumeEditorRef } from './ResumeEditor';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import type { Resume } from '@/lib/types';

interface Props {
  resumeId: string;
}

export function ResumeEditorPage({ resumeId }: Props) {
  const router = useRouter();
  const { resumes, setResumes, setCurrentResume, setSections, currentResume, isSaving, history, updateResumeTitle, undo, setIsSaving } =
    useResumeStore();
  const { autoSave } = useAIStore();

  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasPendingEditorChanges, setHasPendingEditorChanges] = useState(false);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<'list' | 'history'>('list');
  const [isManuallySaving, setIsManuallySaving] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<ResumeEditorRef>(null);
  const shouldAllowHistoryLeave = useRef(false);
  const canUndo = history.length > 0;
  const hasUnsavedChanges = hasPendingEditorChanges || pendingTitle !== null;

  useEffect(() => {
    async function load() {
      try {
        if (resumes.length === 0) {
          const r = await fetch('/api/resumes');
          const data: Resume[] = await r.json();
          setResumes(data);
          const found = data.find((res) => res.id === resumeId);
          if (found) {
            setCurrentResume(found);
            setTitleValue(found.title);
            setSavedTitle(found.title);
          }
        } else {
          const found = resumes.find((r) => r.id === resumeId);
          if (found) {
            setCurrentResume(found);
            setTitleValue(found.title);
            setSavedTitle(found.title);
          }
        }

        const r = await fetch(`/api/resumes/${resumeId}`);
        const data = await r.json();
        setSections(data.sections ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  // Warn on browser close/refresh when there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    window.history.pushState({ unsavedGuard: true }, '', window.location.href);

    const handlePopState = () => {
      if (shouldAllowHistoryLeave.current) return;
      setLeaveTarget('history');
      setShowLeaveConfirm(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasUnsavedChanges]);

  const handleUndo = useCallback(async () => {
    const previous = undo();
    if (!previous) return;

    if (!autoSave) {
      editorRef.current?.markAllDirty();
      return;
    }

    setIsSaving(true);
    try {
      await Promise.all(
        previous
          .filter((s) => s.id)
          .map((s) =>
            fetch(`/api/resumes/${resumeId}/sections/${s.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: s.content, layout: s.layout, order_index: s.order_index }),
            })
          )
      );
    } finally {
      setIsSaving(false);
    }
  }, [undo, resumeId, setIsSaving, autoSave]);

  const saveTitle = useCallback(async (title: string) => {
    await fetch(`/api/resumes/${resumeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setSavedTitle(title);
  }, [resumeId]);

  const handleManualSave = useCallback(async () => {
    setIsManuallySaving(true);
    try {
      await editorRef.current?.save();
      if (pendingTitle !== null) {
        await saveTitle(pendingTitle);
        setPendingTitle(null);
      }
      setHasPendingEditorChanges(false);
    } finally {
      setIsManuallySaving(false);
    }
  }, [pendingTitle, saveTitle]);

  useEffect(() => {
    if (!autoSave || !hasUnsavedChanges) return;
    const timer = window.setTimeout(() => {
      void handleManualSave();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoSave, handleManualSave, hasUnsavedChanges]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!autoSave && hasUnsavedChanges) void handleManualSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, autoSave, hasUnsavedChanges, handleManualSave]);

  const handleTitleSave = async () => {
    const trimmed = titleValue.trim() || '새 이력서';
    setEditingTitle(false);
    setTitleValue(trimmed);
    updateResumeTitle(resumeId, trimmed);
    if (trimmed === savedTitle) {
      setPendingTitle(null);
      return;
    }
    if (autoSave) {
      await saveTitle(trimmed);
      return;
    }
    setPendingTitle(trimmed);
  };

  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setLeaveTarget('list');
      setShowLeaveConfirm(true);
    } else {
      router.push('/');
    }
  };

  const continueEditing = () => {
    setShowLeaveConfirm(false);
    if (leaveTarget === 'history') {
      window.history.pushState({ unsavedGuard: true }, '', window.location.href);
    }
  };

  const leavePage = () => {
    shouldAllowHistoryLeave.current = true;
    if (leaveTarget === 'history') {
      window.history.back();
      return;
    }
    router.push('/');
  };

  const saveAndLeave = async () => {
    await handleManualSave();
    leavePage();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="resume-editor-shell min-h-screen bg-gray-100">
      {/* Toolbar */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 sm:py-3 flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={handleBackClick}
            className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 shrink-0"
          >
            ← <span className="hidden sm:inline">목록</span>
          </button>

          <div className="h-4 w-px bg-gray-200 shrink-0" />

          {editingTitle ? (
            <input
              ref={titleRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              className="text-sm font-semibold text-gray-900 border-b-2 border-blue-400 outline-none bg-transparent min-w-0 flex-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors truncate max-w-25 sm:max-w-xs"
            >
              {currentResume?.title ?? '이력서'}
              <span className="ml-1 text-gray-300 text-xs">✏️</span>
            </button>
          )}

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="설정"
              className="text-gray-400 hover:text-gray-700 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>

            {/* Save status indicator */}
            {autoSave ? (
              isSaving || hasPendingEditorChanges ? (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
                  <span className="hidden sm:inline">저장 중...</span>
                </span>
              ) : (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  <span className="hidden sm:inline">저장됨</span>
                </span>
              )
            ) : hasUnsavedChanges ? (
              <span className="text-xs text-orange-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                <span className="hidden sm:inline">저장 안 됨</span>
              </span>
            ) : (
              <span className="text-xs text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                <span className="hidden sm:inline">저장됨</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              title="실행 취소 (⌘Z)"
              className="hidden sm:block text-sm border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↩ 실행취소
            </button>

            {/* Manual save button — only visible in manual save mode */}
            {!autoSave && (
              <button
                type="button"
                onClick={handleManualSave}
                disabled={!hasUnsavedChanges || isManuallySaving}
                title="저장 (⌘S)"
                className="text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white px-3 sm:px-4 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
              >
                {isManuallySaving ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />저장 중</>
                ) : '저장'}
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="text-xs sm:text-sm bg-gray-900 hover:bg-gray-700 text-white px-3 sm:px-4 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">인쇄 / PDF</span>
            </button>
          </div>
        </div>
        {!autoSave && hasUnsavedChanges && (
          <div className="border-t border-orange-100 bg-orange-50 px-3 sm:px-6 py-2 text-center text-xs text-orange-700">
            저장하지 않고 브라우저를 닫거나 이전으로 이동하면 변경사항이 사라집니다.
          </div>
        )}
      </header>

      {/* Editor area */}
      <main className="py-4 sm:py-10 px-2 sm:px-4 print:p-0 print:bg-white overflow-x-auto">
        <ResumeEditor
          ref={editorRef}
          resumeId={resumeId}
          autoSave={autoSave}
          onPendingChange={setHasPendingEditorChanges}
        />
      </main>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}

      {/* Leave confirmation modal */}
      {showLeaveConfirm && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-semibold text-gray-900">저장하지 않고 나가시겠어요?</h2>
              <p className="text-sm text-gray-500">
                저장되지 않은 변경사항이 있습니다. 지금 나가면 변경사항이 사라집니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={continueEditing}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                계속 편집
              </button>
              <button
                type="button"
                onClick={saveAndLeave}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                저장 후 나가기
              </button>
              <button
                type="button"
                onClick={leavePage}
                className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                저장 안 함
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
