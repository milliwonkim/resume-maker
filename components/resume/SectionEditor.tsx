'use client';

import { useState, type HTMLAttributes } from 'react';
import type { ResumeSection, SectionContent } from '@/lib/types';
import { SECTION_LABELS } from '@/lib/types';
import { HeaderSection } from './sections/HeaderSection';
import { SummarySection } from './sections/SummarySection';
import { TextSection } from './sections/TextSection';
import { ExperienceSection } from './sections/ExperienceSection';
import { EducationSection } from './sections/EducationSection';
import { SkillsSection } from './sections/SkillsSection';
import { ProjectsSection } from './sections/ProjectsSection';
import { LayoutPicker } from './LayoutPicker';
import type {
  HeaderContent,
  SummaryContent,
  TextContent,
  ExperienceContent,
  EducationContent,
  SkillsContent,
  ProjectsContent,
} from '@/lib/types';
import { AIPanel } from '@/components/ai/AIPanel';
import { applyAIResult } from '@/lib/ai-apply';

interface Props {
  section: ResumeSection;
  onLayoutChange: (layout: string) => void;
  onContentChange: (content: SectionContent) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
  isActive: boolean;
  onActivate: () => void;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
}

export function SectionEditor({
  section,
  onLayoutChange,
  onContentChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  isFirst,
  isLast,
  isActive,
  onActivate,
  dragHandleProps,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState<'generate' | 'edit'>('generate');

  const renderContent = () => {
    switch (section.type) {
      case 'header':
        return (
          <HeaderSection
            content={section.content as HeaderContent}
            layout={section.layout}
            onChange={onContentChange}
          />
        );
      case 'summary':
        return (
          <SummarySection
            content={section.content as SummaryContent}
            layout={section.layout}
            onChange={onContentChange}
          />
        );
      case 'text':
        return (
          <TextSection
            content={section.content as TextContent}
            layout={section.layout}
            onChange={onContentChange}
          />
        );
      case 'experience':
        return (
          <ExperienceSection
            content={section.content as ExperienceContent}
            layout={section.layout}
            onChange={onContentChange}
          />
        );
      case 'education':
        return (
          <EducationSection
            content={section.content as EducationContent}
            layout={section.layout}
            onChange={onContentChange}
          />
        );
      case 'skills':
        return (
          <SkillsSection
            content={section.content as SkillsContent}
            layout={section.layout}
            onChange={onContentChange}
          />
        );
      case 'projects':
        return (
          <ProjectsSection
            content={section.content as ProjectsContent}
            layout={section.layout}
            onChange={onContentChange}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`relative rounded-lg transition-all print:ring-0 print:ring-offset-0 ${isActive ? 'ring-2 ring-blue-300 ring-offset-2' : ''}`}
      onClick={onActivate}
    >
      {/* Section toolbar */}
      {isActive && (
        <div className="no-print mb-2 flex flex-wrap items-center gap-1 sm:absolute sm:-top-8 sm:left-0 sm:mb-0 sm:flex-nowrap">
          {section.type !== 'text' && (
            <span className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500">
              {SECTION_LABELS[section.type]}
            </span>
          )}
          <button
            type="button"
            className="cursor-grab rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-50 active:cursor-grabbing"
            aria-label="섹션 순서 변경"
            title="드래그해서 순서 변경"
            {...dragHandleProps}
          >
            이동
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded border border-blue-200 bg-white px-2 py-0.5 text-xs text-blue-600 transition-colors hover:bg-blue-50"
          >
            레이아웃
          </button>
          <button
            type="button"
            onClick={() => {
              setAiMode('generate');
              setAiOpen(true);
            }}
            className="rounded border border-violet-200 bg-white px-2 py-0.5 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-50"
          >
            ✦ AI 생성
          </button>
          <button
            type="button"
            onClick={() => {
              setAiMode('edit');
              setAiOpen(true);
            }}
            className="rounded border border-emerald-200 bg-white px-2 py-0.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
          >
            ✦ AI 수정
          </button>
          {!isFirst && (
            <button
              type="button"
              onClick={onMoveUp}
              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-50"
            >
              ↑
            </button>
          )}
          {!isLast && (
            <button
              type="button"
              onClick={onMoveDown}
              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-50"
            >
              ↓
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-red-200 bg-white px-2 py-0.5 text-xs text-red-500 transition-colors hover:bg-red-50"
          >
            삭제
          </button>
        </div>
      )}

      {/* Section content */}
      <div className="resume-section-content py-2 print:py-0">
        {renderContent()}
      </div>

      <LayoutPicker
        sectionType={section.type}
        currentLayout={section.layout}
        onSelect={onLayoutChange}
        open={isActive && pickerOpen}
        onOpenChange={setPickerOpen}
      />

      {isActive && aiOpen && (
        <AIPanel
          sectionId={section.id}
          mode={aiMode}
          sectionType={section.type}
          currentContent={section.content}
          onApply={(text) => {
            const content = applyAIResult(section.type, text);
            if (content === null) return false;
            onContentChange(content);
            return true;
          }}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}
