'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { useResumeStore } from '@/store/resume';
import { SectionEditor } from './SectionEditor';
import { AddSectionMenu } from './AddSectionMenu';
import type { ResumeSection, SectionContent, SectionType } from '@/lib/types';
import { SECTION_LABELS, makeDefaultContent } from '@/lib/types';

interface Props {
  resumeId: string;
  autoSave: boolean;
  onPendingChange: (hasPending: boolean) => void;
}

export interface ResumeEditorRef {
  save: () => Promise<void>;
  markAllDirty: () => void;
}

const SAVE_DEBOUNCE_MS = 800;
const TEMP_SECTION_ID_PREFIX = 'temp-section-';

function isTemporarySectionId(sectionId: string): boolean {
  return sectionId.startsWith(TEMP_SECTION_ID_PREFIX);
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div
      className="no-print relative animate-pulse rounded-lg pt-10 sm:pt-8"
      aria-live="polite"
      aria-label={`${label} 추가 중`}
    >
      <div className="mb-3 border-b border-gray-200 pb-1 text-sm font-bold tracking-widest text-gray-300 uppercase">
        {label} 추가 중...
      </div>
      <div className="space-y-3 py-2">
        <div className="h-5 w-1/3 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
        <div className="h-4 w-2/3 rounded bg-gray-100" />
      </div>
    </div>
  );
}

export const ResumeEditor = forwardRef<ResumeEditorRef, Props>(
  function ResumeEditor({ resumeId, autoSave, onPendingChange }, ref) {
    const {
      sections,
      addSection,
      removeSection,
      updateSectionLayout,
      updateSectionContent,
      moveSectionUp,
      moveSectionDown,
      reorderSection,
      setSections,
      setIsSaving,
    } = useResumeStore();

    const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
      new Map()
    );
    const pendingSaves = useRef<
      Map<string, { layout?: string; content?: SectionContent }>
    >(new Map());
    const pendingCreatedSectionIds = useRef<Set<string>>(new Set());
    const pendingDeletedSectionIds = useRef<Set<string>>(new Set());
    const hasPendingOrder = useRef(false);

    const [draggedSectionId, setDraggedSectionId] = useState<string | null>(
      null
    );
    const [dropTargetSectionId, setDropTargetSectionId] = useState<
      string | null
    >(null);
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [addingSectionType, setAddingSectionType] =
      useState<SectionType | null>(null);
    const [sectionAddError, setSectionAddError] = useState<string | null>(null);
    const visibleSections = useMemo(
      () => sections.filter((s) => s.id),
      [sections]
    );
    const isAddingSection = addingSectionType !== null;

    const saveOrder = useCallback(async () => {
      const current = useResumeStore.getState().sections;
      const savedSections = current.filter(
        (s) => s.id && !isTemporarySectionId(s.id)
      );
      for (const section of savedSections) {
        await fetch(`/api/resumes/${resumeId}/sections/${section.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_index: section.order_index }),
        });
      }
    }, [resumeId]);

    const hasPendingChanges = useCallback(() => {
      return (
        pendingSaves.current.size > 0 ||
        pendingCreatedSectionIds.current.size > 0 ||
        pendingDeletedSectionIds.current.size > 0 ||
        hasPendingOrder.current ||
        saveTimers.current.size > 0
      );
    }, []);

    const scheduleSave = useCallback(
      (
        sectionId: string,
        payload: { layout?: string; content?: SectionContent }
      ) => {
        const existing = saveTimers.current.get(sectionId);
        if (existing) clearTimeout(existing);
        const existingPayload = pendingSaves.current.get(sectionId) ?? {};
        pendingSaves.current.set(sectionId, { ...existingPayload, ...payload });

        const timer = setTimeout(async () => {
          setIsSaving(true);
          try {
            const latestPayload =
              pendingSaves.current.get(sectionId) ?? payload;
            await fetch(`/api/resumes/${resumeId}/sections/${sectionId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(latestPayload),
            });
          } finally {
            pendingSaves.current.delete(sectionId);
            setIsSaving(false);
            saveTimers.current.delete(sectionId);
            onPendingChange(hasPendingChanges());
          }
        }, SAVE_DEBOUNCE_MS);

        onPendingChange(true);
        saveTimers.current.set(sectionId, timer);
      },
      [hasPendingChanges, onPendingChange, resumeId, setIsSaving]
    );

    const flushPendingSaves = useCallback(async () => {
      saveTimers.current.forEach((timer) => clearTimeout(timer));
      saveTimers.current.clear();

      const entries = [...pendingSaves.current.entries()];
      const deletedSectionIds = [...pendingDeletedSectionIds.current];
      const createdSectionIds = pendingCreatedSectionIds.current;
      const currentSections = useResumeStore.getState().sections;
      const createdSections = currentSections.filter((section) =>
        createdSectionIds.has(section.id)
      );
      const needsOrderSave = hasPendingOrder.current;

      if (
        entries.length === 0 &&
        deletedSectionIds.length === 0 &&
        createdSections.length === 0 &&
        !needsOrderSave
      ) {
        return;
      }

      setIsSaving(true);
      try {
        for (const sectionId of deletedSectionIds) {
          await fetch(`/api/resumes/${resumeId}/sections/${sectionId}`, {
            method: 'DELETE',
          });
        }

        const createdSectionsByTempId = new Map<string, ResumeSection>();
        for (const section of createdSections) {
          const response = await fetch(`/api/resumes/${resumeId}/sections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: section.type,
              content: section.content,
              layout: section.layout,
              order_index: section.order_index,
            }),
          });
          if (!response.ok) throw new Error('섹션 저장 실패');
          const createdSection = (await response.json()) as ResumeSection;
          createdSectionsByTempId.set(section.id, createdSection);
        }

        if (createdSectionsByTempId.size > 0) {
          const latestSections = useResumeStore.getState().sections;
          setSections(
            latestSections.map(
              (section) => createdSectionsByTempId.get(section.id) ?? section
            )
          );
        }

        for (const [sectionId, payload] of entries) {
          if (
            isTemporarySectionId(sectionId) ||
            deletedSectionIds.includes(sectionId)
          )
            continue;
          await fetch(`/api/resumes/${resumeId}/sections/${sectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }

        if (needsOrderSave) await saveOrder();

        entries.forEach(([sectionId]) =>
          pendingSaves.current.delete(sectionId)
        );
        deletedSectionIds.forEach((sectionId) =>
          pendingDeletedSectionIds.current.delete(sectionId)
        );
        createdSections.forEach((section) =>
          pendingCreatedSectionIds.current.delete(section.id)
        );
        hasPendingOrder.current = false;
        onPendingChange(false);
      } finally {
        setIsSaving(false);
      }
    }, [onPendingChange, resumeId, saveOrder, setIsSaving, setSections]);

    useImperativeHandle(
      ref,
      () => ({
        save: flushPendingSaves,
        markAllDirty: () => {
          const currentSections = useResumeStore.getState().sections;
          currentSections
            .filter((section) => section.id)
            .forEach((section) => {
              pendingSaves.current.set(section.id, {
                content: section.content,
                layout: section.layout,
              });
            });
          hasPendingOrder.current = true;
          onPendingChange(true);
        },
      }),
      [flushPendingSaves, onPendingChange]
    );

    useEffect(() => {
      if (!autoSave) return;
      void flushPendingSaves();
    }, [autoSave, flushPendingSaves]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setActiveSectionId(null);
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    const dispatchSave = useCallback(
      (
        sectionId: string | undefined,
        payload: { layout?: string; content?: SectionContent }
      ) => {
        if (!sectionId) return;
        if (autoSave) {
          scheduleSave(sectionId, payload);
        } else {
          const existing = pendingSaves.current.get(sectionId) ?? {};
          pendingSaves.current.set(sectionId, { ...existing, ...payload });
          onPendingChange(true);
        }
      },
      [autoSave, scheduleSave, onPendingChange]
    );

    const handleLayoutChange = useCallback(
      (sectionId: string, layout: string) => {
        updateSectionLayout(sectionId, layout);
        dispatchSave(sectionId, { layout });
      },
      [updateSectionLayout, dispatchSave]
    );

    const handleContentChange = useCallback(
      (sectionId: string, content: SectionContent) => {
        updateSectionContent(sectionId, content);
        dispatchSave(sectionId, { content });
      },
      [updateSectionContent, dispatchSave]
    );

    const handleMoveUp = useCallback(
      async (sectionId: string) => {
        moveSectionUp(sectionId);
        if (autoSave) {
          onPendingChange(true);
          setTimeout(() => {
            void saveOrder().finally(() =>
              onPendingChange(hasPendingChanges())
            );
          }, 0);
        } else {
          hasPendingOrder.current = true;
          onPendingChange(true);
        }
      },
      [moveSectionUp, saveOrder, autoSave, onPendingChange, hasPendingChanges]
    );

    const handleMoveDown = useCallback(
      async (sectionId: string) => {
        moveSectionDown(sectionId);
        if (autoSave) {
          onPendingChange(true);
          setTimeout(() => {
            void saveOrder().finally(() =>
              onPendingChange(hasPendingChanges())
            );
          }, 0);
        } else {
          hasPendingOrder.current = true;
          onPendingChange(true);
        }
      },
      [moveSectionDown, saveOrder, autoSave, onPendingChange, hasPendingChanges]
    );

    const handleDragStart = useCallback(
      (event: DragEvent<HTMLButtonElement>, sectionId: string) => {
        setDraggedSectionId(sectionId);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', sectionId);
      },
      []
    );

    const handleDragOver = useCallback(
      (event: DragEvent<HTMLDivElement>, sectionId: string) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTargetSectionId(sectionId);
      },
      []
    );

    const handleDragLeave = useCallback(
      (event: DragEvent<HTMLDivElement>, sectionId: string) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropTargetSectionId((current) =>
            current === sectionId ? null : current
          );
        }
      },
      []
    );

    const handleDrop = useCallback(
      (event: DragEvent<HTMLDivElement>, targetSectionId: string) => {
        event.preventDefault();
        const sourceSectionId =
          draggedSectionId ?? event.dataTransfer.getData('text/plain');
        setDraggedSectionId(null);
        setDropTargetSectionId(null);

        if (!sourceSectionId || sourceSectionId === targetSectionId) return;

        reorderSection(sourceSectionId, targetSectionId);
        if (autoSave) {
          onPendingChange(true);
          setTimeout(() => {
            void saveOrder().finally(() =>
              onPendingChange(hasPendingChanges())
            );
          }, 0);
        } else {
          hasPendingOrder.current = true;
          onPendingChange(true);
        }
      },
      [
        draggedSectionId,
        reorderSection,
        saveOrder,
        autoSave,
        onPendingChange,
        hasPendingChanges,
      ]
    );

    const handleDragEnd = useCallback(() => {
      setDraggedSectionId(null);
      setDropTargetSectionId(null);
    }, []);

    const handleDelete = useCallback(
      async (sectionId: string | undefined) => {
        if (!sectionId) return;
        setActiveSectionId((current) =>
          current === sectionId ? null : current
        );
        removeSection(sectionId);
        if (autoSave) {
          await fetch(`/api/resumes/${resumeId}/sections/${sectionId}`, {
            method: 'DELETE',
          });
          return;
        }
        if (isTemporarySectionId(sectionId)) {
          pendingCreatedSectionIds.current.delete(sectionId);
        } else {
          pendingDeletedSectionIds.current.add(sectionId);
        }
        pendingSaves.current.delete(sectionId);
        hasPendingOrder.current = true;
        onPendingChange(true);
      },
      [autoSave, onPendingChange, removeSection, resumeId]
    );

    const handleAddSection = useCallback(
      async (type: SectionType) => {
        if (addingSectionType) return;

        setSectionAddError(null);
        const content = makeDefaultContent(type);
        if (!autoSave) {
          const now = new Date().toISOString();
          const section: ResumeSection = {
            id: `${TEMP_SECTION_ID_PREFIX}${crypto.randomUUID()}`,
            resume_id: resumeId,
            type,
            layout: 'layout1',
            content,
            order_index: sections.length,
            created_at: now,
            updated_at: now,
          };
          pendingCreatedSectionIds.current.add(section.id);
          hasPendingOrder.current = true;
          addSection(section);
          onPendingChange(true);
          return;
        }

        setAddingSectionType(type);
        setIsSaving(true);
        onPendingChange(true);

        try {
          const res = await fetch(`/api/resumes/${resumeId}/sections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              content,
              layout: 'layout1',
              order_index: sections.length,
            }),
          });
          if (!res.ok) {
            setSectionAddError(
              '섹션을 추가하지 못했습니다. 다시 시도해주세요.'
            );
            return;
          }
          if (res.ok) {
            const section: ResumeSection = await res.json();
            addSection(section);
          }
        } catch {
          setSectionAddError('섹션을 추가하지 못했습니다. 다시 시도해주세요.');
        } finally {
          setAddingSectionType(null);
          setIsSaving(false);
          onPendingChange(hasPendingChanges());
        }
      },
      [
        addingSectionType,
        autoSave,
        resumeId,
        sections.length,
        addSection,
        hasPendingChanges,
        onPendingChange,
        setIsSaving,
      ]
    );

    return (
      <div className="resume-print-root mx-auto min-h-0 max-w-198.5 rounded-lg bg-white p-4 shadow-lg sm:p-8 md:min-h-280.75 md:p-12">
        <div className="space-y-6 sm:space-y-8">
          {visibleSections.map((section, index) => (
            <div
              key={section.id}
              className={`resume-section-wrapper relative rounded-lg pt-10 transition-all print:pt-0 print:ring-0 print:ring-offset-0 sm:pt-8 ${
                draggedSectionId === section.id ? 'opacity-50 print:opacity-100' : ''
              } ${
                dropTargetSectionId === section.id &&
                draggedSectionId !== section.id
                  ? 'ring-2 ring-blue-300 ring-offset-4'
                  : ''
              }`}
              onDragOver={(event) => handleDragOver(event, section.id)}
              onDragLeave={(event) => handleDragLeave(event, section.id)}
              onDrop={(event) => handleDrop(event, section.id)}
              onClick={() => setActiveSectionId(section.id)}
            >
              {section.type !== 'header' && (
                <h2 className="mb-3 border-b border-gray-200 pb-1 text-sm font-bold tracking-widest text-gray-400 uppercase">
                  {SECTION_LABELS[section.type]}
                </h2>
              )}
              <SectionEditor
                section={section}
                onLayoutChange={(layout) =>
                  handleLayoutChange(section.id, layout)
                }
                onContentChange={(content) =>
                  handleContentChange(section.id, content)
                }
                onMoveUp={() => handleMoveUp(section.id)}
                onMoveDown={() => handleMoveDown(section.id)}
                onDelete={() => handleDelete(section.id)}
                isFirst={index === 0}
                isLast={index === visibleSections.length - 1}
                isActive={activeSectionId === section.id}
                onActivate={() => setActiveSectionId(section.id)}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: (event) => handleDragStart(event, section.id),
                  onDragEnd: handleDragEnd,
                }}
              />
            </div>
          ))}
          {addingSectionType && (
            <SectionSkeleton label={SECTION_LABELS[addingSectionType]} />
          )}
        </div>

        <div className="no-print mt-8">
          <AddSectionMenu
            existingTypes={sections.map((s) => s.type)}
            onAdd={handleAddSection}
            isAdding={isAddingSection}
          />
          {sectionAddError && (
            <p className="mt-2 text-center text-xs text-red-500">
              {sectionAddError}
            </p>
          )}
        </div>
      </div>
    );
  }
);
