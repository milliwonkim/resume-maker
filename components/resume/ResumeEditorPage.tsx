'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  PageSizes,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { useRouter } from 'next/navigation';

import { useResumeStore } from '@/store/resume';
import { useAIStore } from '@/store/ai';
import { useAIJobsStore, type AIJob } from '@/store/ai-jobs';
import { applyAIResult } from '@/lib/ai-apply';
import { registerResumePrintHandlers } from '@/lib/resume-print';
import { richTextToPlainText } from '@/lib/rich-text';
import { NotesNavbarButton } from '@/components/notes/NotesNavbarButton';
import { ResumeEditor, type ResumeEditorRef } from './ResumeEditor';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { AIPanel } from '@/components/ai/AIPanel';
import type {
  EducationContent,
  ExperienceContent,
  HeaderContent,
  ProjectsContent,
  Resume,
  ResumeSection,
  RichTextDocument,
  SkillsContent,
  SummaryContent,
  TextContent,
} from '@/lib/types';

interface Props {
  resumeId: string;
}

const PDF_FILE_EXTENSION = 'pdf';
const PDF_MARGIN = 42;
const PDF_CONTENT_GAP = 7;
const PDF_SECTION_GAP = 16;
const PDF_ITEM_GAP = 9;
const PDF_REGULAR_FONT_URL = '/api/pdf-fonts/regular';
const PDF_BOLD_FONT_URL = '/api/pdf-fonts/bold';
const FILE_NAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]+/g;
const PDF_TEXT_COLOR = rgb(0.13, 0.15, 0.18);
const PDF_MUTED_COLOR = rgb(0.36, 0.39, 0.44);
const PDF_ACCENT_COLOR = rgb(0.15, 0.34, 0.72);
const PDF_LINE_COLOR = rgb(0.78, 0.81, 0.85);

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface PdfContext {
  document: PDFDocument;
  page: PDFPage;
  fonts: PdfFonts;
  y: number;
}

interface PdfParagraph {
  text: string;
  font?: 'regular' | 'bold';
  size?: number;
  color?: ReturnType<typeof rgb>;
  indent?: number;
  gapAfter?: number;
}

function getExportFileName(title: string | undefined) {
  const name = (title?.trim() || 'resume')
    .replace(FILE_NAME_FORBIDDEN_CHARS, '-')
    .replace(/\s+/g, '-');
  return `${name}.${PDF_FILE_EXTENSION}`;
}

function getPageWidth() {
  return PageSizes.A4[0];
}

function getPageHeight() {
  return PageSizes.A4[1];
}

function getContentWidth(indent = 0) {
  return getPageWidth() - PDF_MARGIN * 2 - indent;
}

function getUsableHeight() {
  return getPageHeight() - PDF_MARGIN * 2;
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim() === '';
}

function compact(values: Array<string | undefined>): string[] {
  return values.filter((value) => !isBlank(value)) as string[];
}

function getTextFont(fonts: PdfFonts, type: 'regular' | 'bold' = 'regular') {
  return type === 'bold' ? fonts.bold : fonts.regular;
}

function splitLongWord(
  word: string,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
  const chunks: string[] = [];
  let current = '';
  for (const char of word) {
    const next = `${current}${char}`;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      chunks.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapCjkLine(
  sourceLine: string,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
  const wrapped: string[] = [];
  let line = '';
  for (const char of sourceLine) {
    const next = `${line}${char}`;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      wrapped.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) wrapped.push(line);
  return wrapped;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const wrapped: string[] = [];
  for (const sourceLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = sourceLine.trim();
    if (!trimmed) {
      wrapped.push('');
      continue;
    }

    if (!/\s/.test(trimmed)) {
      wrapped.push(...wrapCjkLine(trimmed, font, size, maxWidth));
      continue;
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) wrapped.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
        continue;
      }

      const chunks = splitLongWord(word, font, size, maxWidth);
      wrapped.push(...chunks.slice(0, -1));
      line = chunks.at(-1) ?? '';
    }
    if (line) wrapped.push(line);
  }
  return wrapped;
}

function addPage(context: PdfContext) {
  context.page = context.document.addPage(PageSizes.A4);
  context.y = getPageHeight() - PDF_MARGIN;
}

function ensureSpace(context: PdfContext, height: number) {
  if (context.y - height >= PDF_MARGIN) return;
  addPage(context);
}

function getParagraphHeight(context: PdfContext, paragraph: PdfParagraph) {
  const size = paragraph.size ?? 10;
  const lineHeight = size * 1.45;
  const font = getTextFont(context.fonts, paragraph.font);
  const lines = wrapText(
    paragraph.text,
    font,
    size,
    getContentWidth(paragraph.indent ?? 0)
  );
  return lines.length * lineHeight + (paragraph.gapAfter ?? 0);
}

function drawParagraphs(context: PdfContext, paragraphs: PdfParagraph[]) {
  const normalized = paragraphs.filter((paragraph) => paragraph.text.trim());
  if (normalized.length === 0) return;

  const blockHeight = normalized.reduce(
    (sum, paragraph) => sum + getParagraphHeight(context, paragraph),
    0
  );
  const blockFitsOnePage = blockHeight <= getUsableHeight();
  if (blockFitsOnePage) ensureSpace(context, blockHeight);

  for (const paragraph of normalized) {
    const size = paragraph.size ?? 10;
    const lineHeight = size * 1.45;
    const indent = paragraph.indent ?? 0;
    const font = getTextFont(context.fonts, paragraph.font);
    const lines = wrapText(paragraph.text, font, size, getContentWidth(indent));
    const paragraphHeight =
      lines.length * lineHeight + (paragraph.gapAfter ?? 0);

    if (!blockFitsOnePage && paragraphHeight <= getUsableHeight()) {
      ensureSpace(context, paragraphHeight);
    }

    for (const line of lines) {
      ensureSpace(context, lineHeight);
      context.page.drawText(line, {
        x: PDF_MARGIN + indent,
        y: context.y,
        size,
        font,
        color: paragraph.color ?? PDF_TEXT_COLOR,
      });
      context.y -= lineHeight;
    }
    context.y -= paragraph.gapAfter ?? 0;
  }
}

function drawCenteredText(
  context: PdfContext,
  text: string,
  size: number,
  fontType: 'regular' | 'bold',
  color = PDF_TEXT_COLOR
) {
  if (isBlank(text)) return;
  const font = getTextFont(context.fonts, fontType);
  const width = font.widthOfTextAtSize(text, size);
  context.page.drawText(text, {
    x: (getPageWidth() - width) / 2,
    y: context.y,
    size,
    font,
    color,
  });
  context.y -= size * 1.45;
}

function drawDivider(context: PdfContext, gap = 10) {
  ensureSpace(context, gap + 1);
  context.page.drawLine({
    start: { x: PDF_MARGIN, y: context.y },
    end: { x: getPageWidth() - PDF_MARGIN, y: context.y },
    thickness: 0.8,
    color: PDF_LINE_COLOR,
  });
  context.y -= gap;
}

function richTextToExportText(value: RichTextDocument | undefined) {
  return value ? richTextToPlainText(value).trim() : '';
}

function drawHeaderSection(context: PdfContext, content: HeaderContent) {
  ensureSpace(context, 84);
  drawCenteredText(context, content.name, 22, 'bold');
  drawCenteredText(context, content.title, 12, 'regular', PDF_ACCENT_COLOR);
  const contactText = compact([
    content.email,
    content.phone,
    content.location,
    content.github,
    content.linkedin,
    content.website,
  ]).join(' | ');
  drawCenteredText(context, contactText, 8.5, 'regular', PDF_MUTED_COLOR);
  context.y -= 4;
  drawDivider(context, 14);
}

function drawSectionTitle(context: PdfContext, title: string) {
  ensureSpace(context, 38);
  context.y -= PDF_CONTENT_GAP;
  context.page.drawText(title, {
    x: PDF_MARGIN,
    y: context.y,
    size: 10,
    font: context.fonts.bold,
    color: PDF_MUTED_COLOR,
  });
  context.y -= 8;
  drawDivider(context, 10);
}

function drawTextSection(
  context: PdfContext,
  title: string,
  text: RichTextDocument | undefined
) {
  const content = richTextToExportText(text);
  if (isBlank(content)) return;
  drawSectionTitle(context, title);
  drawParagraphs(context, [{ text: content, size: 9.5 }]);
  context.y -= PDF_SECTION_GAP;
}

function drawExperienceSection(
  context: PdfContext,
  content: ExperienceContent
) {
  const items = content.items.filter(
    (item) => !isBlank(item.company) || !isBlank(item.role)
  );
  if (items.length === 0) return;

  drawSectionTitle(context, '경력');
  for (const item of items) {
    const meta = compact([
      [item.startDate, item.endDate].filter(Boolean).join(' - '),
      item.location,
    ]).join(' | ');
    const paragraphs: PdfParagraph[] = [
      {
        text: compact([item.company, item.role]).join(' / '),
        font: 'bold',
        size: 10.5,
        gapAfter: 1,
      },
      { text: meta, size: 8.5, color: PDF_MUTED_COLOR, gapAfter: 4 },
    ];

    const projects =
      item.projects?.filter((project) => !isBlank(project.name)) ?? [];
    if (projects.length > 0) {
      projects.forEach((project) => {
        const projectPeriod = compact([
          project.startDate,
          project.endDate,
        ]).join(' - ');
        paragraphs.push({
          text: compact([project.name, projectPeriod]).join(' | '),
          font: 'bold',
          size: 9.3,
          indent: 10,
          gapAfter: 2,
        });
        if (!isBlank(project.tech)) {
          paragraphs.push({
            text: `기술: ${project.tech}`,
            size: 8.8,
            indent: 10,
            color: PDF_MUTED_COLOR,
          });
        }
        [
          ['문제', project.problem],
          ['역할', project.ownership],
          ['성과', project.achievement],
        ].forEach(([label, value]) => {
          const text = richTextToExportText(
            value as RichTextDocument | undefined
          );
          if (!isBlank(text)) {
            paragraphs.push({
              text: `${label}: ${text}`,
              size: 9,
              indent: 10,
              gapAfter: 2,
            });
          }
        });
      });
    } else {
      if (!isBlank(item.tech)) {
        paragraphs.push({
          text: `기술: ${item.tech}`,
          size: 8.8,
          color: PDF_MUTED_COLOR,
        });
      }
      [
        ['설명', item.description],
        ['문제', item.problem],
        ['역할', item.ownership],
        ['성과', item.achievement],
      ].forEach(([label, value]) => {
        const text = richTextToExportText(
          value as RichTextDocument | undefined
        );
        if (!isBlank(text)) {
          paragraphs.push({ text: `${label}: ${text}`, size: 9, gapAfter: 2 });
        }
      });
    }

    drawParagraphs(context, paragraphs);
    context.y -= PDF_ITEM_GAP;
  }
  context.y -= PDF_SECTION_GAP - PDF_ITEM_GAP;
}

function drawEducationSection(context: PdfContext, content: EducationContent) {
  const items = content.items.filter((item) => !isBlank(item.school));
  if (items.length === 0) return;

  drawSectionTitle(context, '학력');
  for (const item of items) {
    const major = compact([
      item.degree,
      item.field,
      ...(item.additionalMajors ?? []).map((majorItem) =>
        compact([majorItem.label, majorItem.field]).join(': ')
      ),
      item.highSchoolCategory,
    ]).join(' / ');
    const meta = compact([
      compact([item.startDate, item.endDate]).join(' - '),
      item.gpa ? `GPA ${item.gpa}/${item.gpaScale ?? '4.5'}` : undefined,
    ]).join(' | ');

    drawParagraphs(context, [
      { text: item.school, font: 'bold', size: 10.3, gapAfter: 1 },
      { text: major, size: 9, color: PDF_MUTED_COLOR, gapAfter: 1 },
      { text: meta, size: 8.5, color: PDF_MUTED_COLOR },
    ]);
    context.y -= PDF_ITEM_GAP;
  }
  context.y -= PDF_SECTION_GAP - PDF_ITEM_GAP;
}

function drawSkillsSection(context: PdfContext, content: SkillsContent) {
  const categories = content.categories.filter(
    (category) => !isBlank(category.name) || !isBlank(category.skills)
  );
  if (categories.length === 0) return;

  drawSectionTitle(context, '기술');
  categories.forEach((category) => {
    drawParagraphs(context, [
      {
        text: compact([category.name, category.skills]).join(': '),
        size: 9.2,
      },
    ]);
  });
  context.y -= PDF_SECTION_GAP;
}

function drawProjectsSection(context: PdfContext, content: ProjectsContent) {
  const items = content.items.filter((item) => !isBlank(item.name));
  if (items.length === 0) return;

  drawSectionTitle(context, '프로젝트');
  items.forEach((item) => {
    drawParagraphs(context, [
      { text: item.name, font: 'bold', size: 10.3, gapAfter: 2 },
      {
        text: compact([item.tech, item.link]).join(' | '),
        size: 8.7,
        color: PDF_MUTED_COLOR,
        gapAfter: 3,
      },
      { text: richTextToExportText(item.description), size: 9 },
    ]);
    context.y -= PDF_ITEM_GAP;
  });
  context.y -= PDF_SECTION_GAP - PDF_ITEM_GAP;
}

async function loadPdfFont(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PDF font request failed: ${response.status}`);
  }

  return response.arrayBuffer();
}

async function createTextPdf(sections: ResumeSection[]) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regularFontBytes, boldFontBytes] = await Promise.all([
    loadPdfFont(PDF_REGULAR_FONT_URL),
    loadPdfFont(PDF_BOLD_FONT_URL),
  ]);
  const fonts: PdfFonts = {
    regular: await document.embedFont(regularFontBytes),
    bold: await document.embedFont(boldFontBytes),
  };

  const context: PdfContext = {
    document,
    page: document.addPage(PageSizes.A4),
    fonts,
    y: getPageHeight() - PDF_MARGIN,
  };

  sections
    .filter((section) => section.id)
    .sort((a, b) => a.order_index - b.order_index)
    .forEach((section) => {
      if (section.type === 'header') {
        drawHeaderSection(context, section.content as HeaderContent);
      }
      if (section.type === 'summary') {
        drawTextSection(
          context,
          '자기소개',
          (section.content as SummaryContent).text
        );
      }
      if (section.type === 'text') {
        drawTextSection(
          context,
          '일반 텍스트',
          (section.content as TextContent).text
        );
      }
      if (section.type === 'experience') {
        drawExperienceSection(context, section.content as ExperienceContent);
      }
      if (section.type === 'education') {
        drawEducationSection(context, section.content as EducationContent);
      }
      if (section.type === 'skills') {
        drawSkillsSection(context, section.content as SkillsContent);
      }
      if (section.type === 'projects') {
        drawProjectsSection(context, section.content as ProjectsContent);
      }
    });

  return document.save({ useObjectStreams: true });
}

function downloadBytes(bytes: Uint8Array, fileName: string) {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const url = URL.createObjectURL(
    new Blob([arrayBuffer], { type: 'application/pdf' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
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

  useEffect(() => registerResumePrintHandlers(), []);

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
    setIsExportingPdf(true);
    try {
      await editorRef.current?.save();
      const latestSections = useResumeStore.getState().sections;
      const bytes = await createTextPdf(latestSections);
      downloadBytes(
        bytes,
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
      <header className="no-print sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3">
          <button
            type="button"
            onClick={handleBackClick}
            className="flex shrink-0 items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            ← <span className="hidden sm:inline">Home</span>
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
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">
                      ✓
                    </span>
                    <span className="hidden sm:inline">AI 완료</span>
                  </>
                )}
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500">
                  {jobs.length}
                </span>
              </button>
            )}

            <NotesNavbarButton resumeId={resumeId} />

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
      <main className="overflow-x-auto px-2 py-4 sm:px-4 sm:py-10">
        <div className="mx-auto max-w-4xl">
          <ResumeEditor
            ref={editorRef}
            resumeId={resumeId}
            autoSave={autoSave}
            onPendingChange={setHasPendingEditorChanges}
          />
        </div>
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
              <span className="text-base font-semibold text-gray-900">
                AI 작업 현황
              </span>
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
            <ul className="flex-1 divide-y divide-gray-50 overflow-y-auto px-5 py-2">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center gap-3 py-3">
                  {/* Status icon */}
                  {job.status === 'running' && (
                    <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                  )}
                  {job.status === 'completed' && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">
                      ✓
                    </span>
                  )}
                  {job.status === 'error' && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs text-red-500">
                      ✕
                    </span>
                  )}

                  {/* Job info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {job.sectionLabel}
                    </p>
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
      {selectedJob &&
        (() => {
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
                if (content !== null)
                  updateSectionContent(selectedJob.sectionId, content);
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
