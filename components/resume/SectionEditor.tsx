'use client';

import { useState, type HTMLAttributes } from 'react';
import type { ResumeSection, SectionContent } from '@/lib/types';
import { HIGH_SCHOOL_CATEGORY_OPTIONS, SECTION_LABELS } from '@/lib/types';
import { normalizeRichTextForEditor } from '@/lib/rich-text';
import { HeaderSection } from './sections/HeaderSection';
import { SummarySection } from './sections/SummarySection';
import { TextSection } from './sections/TextSection';
import { ExperienceSection } from './sections/ExperienceSection';
import { EducationSection } from './sections/EducationSection';
import { SkillsSection } from './sections/SkillsSection';
import { ProjectsSection } from './sections/ProjectsSection';
import { LayoutPicker } from './LayoutPicker';
import type { HeaderContent, SummaryContent, TextContent, ExperienceContent, EducationContent, HighSchoolCategory, SkillsContent, ProjectsContent } from '@/lib/types';
import { AIPanel } from '@/components/ai/AIPanel';

const SCHOOL_TYPES = ['university', 'highschool', 'middleschool'] as const;
const GPA_SCALES = ['4.5', '4.3', '4.0'] as const;
const ADDITIONAL_MAJOR_FALLBACK_LABEL = '추가 전공';
const DEFAULT_HIGH_SCHOOL_CATEGORY: HighSchoolCategory = '인문계(일반고)';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function parseJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced?.[1] ?? trimmed;
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed)) throw new Error('AI result is not a JSON array');
  return parsed;
}

function isSchoolType(value: unknown): value is EducationContent['items'][number]['schoolType'] {
  return typeof value === 'string' && SCHOOL_TYPES.includes(value as EducationContent['items'][number]['schoolType']);
}

function isGpaScale(value: unknown): value is EducationContent['items'][number]['gpaScale'] {
  return typeof value === 'string' && GPA_SCALES.includes(value as NonNullable<EducationContent['items'][number]['gpaScale']>);
}

function inferSchoolType(item: Record<string, unknown>): EducationContent['items'][number]['schoolType'] {
  if (isSchoolType(item.schoolType)) return item.schoolType;
  const school = toText(item.school);
  if (school.includes('고등')) return 'highschool';
  if (school.includes('중학')) return 'middleschool';
  return 'university';
}

function normalizeAdditionalMajor(value: unknown): NonNullable<EducationContent['items'][number]['additionalMajors']>[number] | null {
  if (!isRecord(value)) return null;
  const label = toText(value.label) || toText(value.type) || toText(value.name) || ADDITIONAL_MAJOR_FALLBACK_LABEL;
  const field = toText(value.field) || toText(value.major);
  if (!field) return null;
  return {
    id: crypto.randomUUID(),
    label,
    field,
  };
}

function normalizeAdditionalMajors(item: Record<string, unknown>): NonNullable<EducationContent['items'][number]['additionalMajors']> {
  const additionalMajors = Array.isArray(item.additionalMajors)
    ? item.additionalMajors.map(normalizeAdditionalMajor).filter((major) => major !== null)
    : [];

  const minor = toText(item.minor);
  if (minor) {
    additionalMajors.push({
      id: crypto.randomUUID(),
      label: '부전공',
      field: minor,
    });
  }

  const doubleMajor = toText(item.doubleMajor);
  if (doubleMajor) {
    additionalMajors.push({
      id: crypto.randomUUID(),
      label: '복수전공',
      field: doubleMajor,
    });
  }

  return additionalMajors;
}

function normalizeHighSchoolCategory(item: Record<string, unknown>): string {
  const rawValue =
    toText(item.highSchoolCategory) ||
    toText(item.category) ||
    toText(item.track) ||
    toText(item.highSchoolType);

  if (!rawValue) return DEFAULT_HIGH_SCHOOL_CATEGORY;
  if (HIGH_SCHOOL_CATEGORY_OPTIONS.includes(rawValue as HighSchoolCategory)) return rawValue;
  if (rawValue.includes('마이스터')) return '마이스터고';
  if (rawValue.includes('전문') || rawValue.includes('특성화') || rawValue.includes('공업') || rawValue.includes('상업')) {
    return '전문계(특성화고)';
  }
  if (rawValue.includes('인문') || rawValue.includes('일반')) return '인문계(일반고)';
  if (rawValue.includes('특목') || rawValue.includes('외고') || rawValue.includes('과학') || rawValue.includes('국제')) {
    return '특목고';
  }
  if (rawValue.includes('자율') || rawValue.includes('자사')) return '자율고';
  return rawValue;
}

function normalizeEducationItem(item: unknown): EducationContent['items'][number] {
  if (!isRecord(item)) {
    return {
      id: crypto.randomUUID(),
      schoolType: 'university',
      school: '',
      degree: '',
      field: '',
      additionalMajors: [],
      startDate: '',
      endDate: '',
      gpa: '',
      gpaScale: '4.5',
    };
  }

  const schoolType = inferSchoolType(item);
  const base = {
    id: crypto.randomUUID(),
    schoolType,
    school: toText(item.school),
    startDate: toText(item.startDate),
    endDate: toText(item.endDate),
  };

  if (schoolType === 'highschool') {
    return {
      ...base,
      highSchoolCategory: normalizeHighSchoolCategory(item),
    };
  }

  if (schoolType !== 'university') return base;

  return {
    ...base,
    degree: toText(item.degree),
    field: toText(item.field),
    additionalMajors: normalizeAdditionalMajors(item),
    gpa: toText(item.gpa),
    gpaScale: isGpaScale(item.gpaScale) ? item.gpaScale : '4.5',
  };
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
      className={`relative rounded-lg transition-all ${isActive ? 'ring-2 ring-blue-300 ring-offset-2' : ''}`}
      onClick={onActivate}
    >
      {/* Section toolbar */}
      {isActive && (
        <div className="no-print flex flex-wrap items-center gap-1 mb-2 sm:absolute sm:-top-8 sm:left-0 sm:flex-nowrap sm:mb-0">
          {section.type !== 'text' && (
            <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded">
              {SECTION_LABELS[section.type]}
            </span>
          )}
          <button
            type="button"
            className="text-xs text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 px-2 py-0.5 rounded cursor-grab active:cursor-grabbing transition-colors"
            aria-label="섹션 순서 변경"
            title="드래그해서 순서 변경"
            {...dragHandleProps}
          >
            이동
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors"
          >
            레이아웃
          </button>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="text-xs text-violet-600 bg-white border border-violet-200 hover:bg-violet-50 px-2 py-0.5 rounded transition-colors font-medium"
          >
            ✦ AI
          </button>
          {!isFirst && (
            <button
              type="button"
              onClick={onMoveUp}
              className="text-xs text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 px-2 py-0.5 rounded transition-colors"
            >
              ↑
            </button>
          )}
          {!isLast && (
            <button
              type="button"
              onClick={onMoveDown}
              className="text-xs text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 px-2 py-0.5 rounded transition-colors"
            >
              ↓
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-red-500 bg-white border border-red-200 hover:bg-red-50 px-2 py-0.5 rounded transition-colors"
          >
            삭제
          </button>
        </div>
      )}

      {/* Section content */}
      <div className="py-2">{renderContent()}</div>

      <LayoutPicker
        sectionType={section.type}
        currentLayout={section.layout}
        onSelect={onLayoutChange}
        open={isActive && pickerOpen}
        onOpenChange={setPickerOpen}
      />

      {isActive && aiOpen && (
        <AIPanel
          sectionType={section.type}
          currentContent={section.content}
          onApply={(text) => {
            const type = section.type;
            if (type === 'summary' || type === 'text') {
              onContentChange({ text: normalizeRichTextForEditor(text) } as SummaryContent);
              return;
            }
            // JSON sections: parse and merge with crypto IDs
            try {
              const parsed = parseJsonArray(text);
              if (type === 'experience') {
                onContentChange({
                  items: parsed.filter(isRecord).map((item) => ({
                    id: crypto.randomUUID(),
                    company: toText(item.company),
                    role: toText(item.role),
                    location: toText(item.location),
                    startDate: toText(item.startDate),
                    endDate: toText(item.endDate),
                    description: normalizeRichTextForEditor(
                      toText(item.description)
                    ),
                  })),
                } as ExperienceContent);
              } else if (type === 'education') {
                onContentChange({
                  items: parsed.map(normalizeEducationItem),
                } as EducationContent);
              } else if (type === 'skills') {
                onContentChange({
                  categories: parsed.filter(isRecord).map((item) => ({
                    id: crypto.randomUUID(),
                    name: toText(item.name),
                    skills: toText(item.skills),
                  })),
                } as SkillsContent);
              } else if (type === 'projects') {
                onContentChange({
                  items: parsed.filter(isRecord).map((item) => ({
                    id: crypto.randomUUID(),
                    name: toText(item.name),
                    tech: toText(item.tech),
                    link: toText(item.link),
                    description: normalizeRichTextForEditor(
                      toText(item.description)
                    ),
                  })),
                } as ProjectsContent);
              }
            } catch {
              // fallback: keep current content unchanged
            }
          }}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}
