'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useRouter } from 'next/navigation';

import { useResumeStore } from '@/store/resume';
import { useAIStore } from '@/store/ai';
import { useAIJobsStore, type AIJob } from '@/store/ai-jobs';
import { applyAIResult } from '@/lib/ai-apply';
import { ResumeEditor, type ResumeEditorRef } from './ResumeEditor';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { AIPanel } from '@/components/ai/AIPanel';
import type { Resume } from '@/lib/types';

interface Props {
  resumeId: string;
}

const RESUME_EXPORT_SELECTOR = '.resume-print-root';
const PDF_EXPORT_CLASS = 'is-pdf-exporting';
const PDF_FILE_EXTENSION = 'pdf';
const PDF_IMAGE_FORMAT = 'PNG';
const PDF_IMAGE_COMPRESSION = 'FAST';
const PDF_EXPORT_PIXEL_RATIO = 2;
const PDF_PAGE_WIDTH_MM = 210;
const PDF_PAGE_HEIGHT_MM = 297;
const FILE_NAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]+/g;

function getExportFileName(title: string | undefined) {
  const name = (title?.trim() || 'resume')
    .replace(FILE_NAME_FORBIDDEN_CHARS, '-')
    .replace(/\s+/g, '-');
  return `${name}.${PDF_FILE_EXTENSION}`;
}

function shouldRenderPdfNode(node: HTMLElement) {
  if (!(node instanceof Element)) return true;
  return !node.closest('.no-print, .rich-text-toolbar');
}

function waitForExportStyles() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('PDF 이미지를 만들지 못했습니다.'));
    image.src = src;
  });
}

async function downloadElementAsPdf(element: HTMLElement, fileName: string) {
  document.documentElement.classList.add(PDF_EXPORT_CLASS);

  try {
    await document.fonts.ready;
    await waitForExportStyles();

    const imageData = await toPng(element, {
      backgroundColor: '#ffffff',
      cacheBust: true,
      pixelRatio: PDF_EXPORT_PIXEL_RATIO,
      filter: shouldRenderPdfNode,
    });
    const image = await loadImage(imageData);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imageHeightMm =
      (image.height * PDF_PAGE_WIDTH_MM) / image.width;
    let y = 0;

    pdf.addImage(
      imageData,
      PDF_IMAGE_FORMAT,
      0,
      y,
      PDF_PAGE_WIDTH_MM,
      imageHeightMm,
      undefined,
      PDF_IMAGE_COMPRESSION
    );

    while (Math.abs(y) + PDF_PAGE_HEIGHT_MM < imageHeightMm) {
      y -= PDF_PAGE_HEIGHT_MM;
      pdf.addPage();
      pdf.addImage(
        imageData,
        PDF_IMAGE_FORMAT,
        0,
        y,
        PDF_PAGE_WIDTH_MM,
        imageHeightMm,
        undefined,
        PDF_IMAGE_COMPRESSION
      );
    }

    pdf.save(fileName);
  } finally {
    document.documentElement.classList.remove(PDF_EXPORT_CLASS);
  }
}

export function ResumeEditorPage({ resumeId }: Props) {
  const router = useRouter();
  const {
    resumes,
    setResumes,
    setCurrentResume,
    setSections,
    currentResume,
    sections,
    isSaving,
    history,
    updateResumeTitle,
    undo,
    setIsSaving,
    updateSectionContent,
  } = useResumeStore();
  const { autoSave } = useAIStore();
  const { jobs, removeJob, clearCompleted } = useAIJobsStore();

  const [loading, setLoading] = useState(true);
  const [aiJobPanelOpen, setAiJobPanelOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<AIJob | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasPendingEditorChanges, setHasPendingEditorChanges] = useState(false);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<'list' | 'history'>('list');
  const [isManuallySaving, setIsManuallySaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

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
              body: JSON.stringify({
                content: s.content,
                layout: s.layout,
                order_index: s.order_index,
              }),
            })
          )
      );
    } finally {
      setIsSaving(false);
    }
  }, [undo, resumeId, setIsSaving, autoSave]);

  const saveTitle = useCallback(
    async (title: string) => {
      await fetch(`/api/resumes/${resumeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setSavedTitle(title);
    },
    [resumeId]
  );

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
      window.history.pushState(
        { unsavedGuard: true },
        '',
        window.location.href
      );
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

  const handlePdfExport = useCallback(async () => {
    const target = document.querySelector(RESUME_EXPORT_SELECTOR);
    if (!(target instanceof HTMLElement)) return;

    setIsExportingPdf(true);
    try {
      await downloadElementAsPdf(
        target,
        getExportFileName(pendingTitle ?? currentResume?.title)
      );
    } finally {
      setIsExportingPdf(false);
    }
  }, [currentResume?.title, pendingTitle]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="resume-editor-shell min-h-screen bg-gray-100">
      {/* Toolbar */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3">
          <button
            type="button"
            onClick={handleBackClick}
            className="flex shrink-0 items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            ← <span className="hidden sm:inline">목록</span>
          </button>

          <div className="h-4 w-px shrink-0 bg-gray-200" />

          {editingTitle ? (
            <input
              ref={titleRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              className="min-w-0 flex-1 border-b-2 border-blue-400 bg-transparent text-sm font-semibold text-gray-900 outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="max-w-25 truncate text-sm font-semibold text-gray-900 transition-colors hover:text-blue-600 sm:max-w-xs"
            >
              {currentResume?.title ?? '이력서'}
              <span className="ml-1 text-xs text-gray-300">✏️</span>
            </button>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            {/* AI jobs status indicator */}
            {jobs.length > 0 && (
              <button
                type="button"
                onClick={() => setAiJobPanelOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                title="AI 작업 현황"
              >
                {jobs.some((j) => j.status === 'running') ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                    <span className="hidden sm:inline">AI 처리 중</span>
                  </>
                ) : (
                  <>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">✓</span>
                    <span className="hidden sm:inline">AI 완료</span>
                  </>
                )}
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500">
                  {jobs.length}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="설정"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {/* Save status indicator */}
            {autoSave ? (
              isSaving || hasPendingEditorChanges ? (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                  <span className="hidden sm:inline">저장 중...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                  <span className="hidden sm:inline">저장됨</span>
                </span>
              )
            ) : hasUnsavedChanges ? (
              <span className="flex items-center gap-1 text-xs text-orange-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
                <span className="hidden sm:inline">저장 안 됨</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                <span className="hidden sm:inline">저장됨</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              title="실행 취소 (⌘Z)"
              className="hidden rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30 sm:block"
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
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 sm:px-4 sm:text-sm"
              >
                {isManuallySaving ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    저장 중
                  </>
                ) : (
                  '저장'
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                void handlePdfExport();
              }}
              disabled={isExportingPdf}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 sm:px-4 sm:text-sm"
            >
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">
                {isExportingPdf ? 'PDF 생성 중' : 'PDF 저장'}
              </span>
            </button>
          </div>
        </div>
        {!autoSave && hasUnsavedChanges && (
          <div className="border-t border-orange-100 bg-orange-50 px-3 py-2 text-center text-xs text-orange-700 sm:px-6">
            저장하지 않고 브라우저를 닫거나 이전으로 이동하면 변경사항이
            사라집니다.
          </div>
        )}
      </header>

      {/* Editor area */}
      <main className="overflow-x-auto px-2 py-4 sm:px-4 sm:py-10 print:bg-white print:p-0">
        <ResumeEditor
          ref={editorRef}
          resumeId={resumeId}
          autoSave={autoSave}
          onPendingChange={setHasPendingEditorChanges}
        />
      </main>

      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} />
      )}

      {/* AI jobs modal */}
      {aiJobPanelOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="flex w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
              <span className="text-base font-semibold text-gray-900">AI 작업 현황</span>
              <div className="flex items-center gap-2">
                {jobs.some((j) => j.status !== 'running') && (
                  <button
                    type="button"
                    onClick={clearCompleted}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    완료 삭제
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAiJobPanelOpen(false)}
                  className="rounded p-1 text-lg leading-none text-gray-400 transition-colors hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Job list */}
            <ul className="flex-1 overflow-y-auto divide-y divide-gray-50 px-5 py-2">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center gap-3 py-3">
                  {/* Status icon */}
                  {job.status === 'running' && (
                    <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                  )}
                  {job.status === 'completed' && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">✓</span>
                  )}
                  {job.status === 'error' && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs text-red-500">✕</span>
                  )}

                  {/* Job info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{job.sectionLabel}</p>
                    <p className="text-xs text-gray-400">
                      {job.mode === 'generate' ? 'AI 생성' : 'AI 수정'}
                      {job.status === 'running' && ' · 진행 중...'}
                      {job.status === 'error' && ' · 실패'}
                    </p>
                  </div>

                  {/* Action button */}
                  {job.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedJob(job);
                        setAiJobPanelOpen(false);
                      }}
                      className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700"
                    >
                      적용하기
                    </button>
                  )}
                  {job.status === 'error' && (
                    <button
                      type="button"
                      onClick={() => removeJob(job.id)}
                      className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50"
                    >
                      삭제
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="shrink-0 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setAiJobPanelOpen(false)}
                className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI panel reopened from navbar for a completed job */}
      {selectedJob && (() => {
        const section = sections.find((s) => s.id === selectedJob.sectionId);
        if (!section) return null;
        return (
          <AIPanel
            sectionId={selectedJob.sectionId}
            mode={selectedJob.mode}
            sectionType={selectedJob.sectionType}
            currentContent={section.content}
            preloadedResult={selectedJob.result}
            onApply={(text) => {
              const content = applyAIResult(selectedJob.sectionType, text);
              if (content !== null) updateSectionContent(selectedJob.sectionId, content);
              removeJob(selectedJob.id);
              setSelectedJob(null);
            }}
            onClose={() => setSelectedJob(null)}
          />
        );
      })()}

      {/* Leave confirmation modal */}
      {showLeaveConfirm && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-semibold text-gray-900">
                저장하지 않고 나가시겠어요?
              </h2>
              <p className="text-sm text-gray-500">
                저장되지 않은 변경사항이 있습니다. 지금 나가면 변경사항이
                사라집니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={continueEditing}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                계속 편집
              </button>
              <button
                type="button"
                onClick={saveAndLeave}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                저장 후 나가기
              </button>
              <button
                type="button"
                onClick={leavePage}
                className="flex-1 rounded-lg bg-red-50 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
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
