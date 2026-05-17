'use client';

import type {
  ExperienceContent,
  ExperienceItem,
  ExperienceProject,
} from '@/lib/types';

import { EditableField } from '../EditableField';
import { RichTextField } from '../RichTextField';

interface Props {
  content: ExperienceContent;
  layout: string;
  onChange: (content: ExperienceContent) => void;
}

function updateItem(
  items: ExperienceItem[],
  id: string,
  patch: Partial<ExperienceItem>
): ExperienceItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function parseDateToMonths(date: string): number | null {
  const match = date.match(/^(\d{4})\.(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1]) * 12 + parseInt(match[2]);
}

function calcTenure(startDate: string, endDate: string): string | null {
  const startMonths = parseDateToMonths(startDate);
  const now = new Date();
  const endMonths =
    endDate === '현재'
      ? now.getFullYear() * 12 + (now.getMonth() + 1)
      : parseDateToMonths(endDate);
  if (startMonths === null || endMonths === null) return null;
  const total = endMonths - startMonths;
  if (total <= 0) return null;
  const years = Math.floor(total / 12);
  const months = total % 12;
  if (years > 0 && months > 0) return `${years}년 ${months}개월`;
  if (years > 0) return `${years}년`;
  return `${months}개월`;
}

function TechBadges({ tech }: { tech?: string }) {
  if (!tech?.trim()) return null;
  const tags = tech
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

const STRUCTURED_FIELDS = [
  {
    key: 'problem' as const,
    label: '해결한 문제',
    placeholder: '어떤 비즈니스·기술 문제가 있었는지 (상황/배경)',
  },
  {
    key: 'ownership' as const,
    label: '담당 역할',
    placeholder: '본인이 주도하거나 책임진 구체적인 범위',
  },
  {
    key: 'achievement' as const,
    label: '핵심 성과',
    placeholder: '수치, 품질 개선, 비용 절감 등 확인 가능한 결과',
  },
] as const;

function newProject(): ExperienceProject {
  return {
    id: crypto.randomUUID(),
    name: '프로젝트명',
    startDate: '',
    endDate: '',
    tech: '',
    problem: '',
    ownership: '',
    achievement: '',
  };
}

function ProjectCard({
  project,
  onUpdate,
  onRemove,
  canRemove,
  textSize = 'text-sm',
}: {
  project: ExperienceProject;
  onUpdate: (patch: Partial<ExperienceProject>) => void;
  onRemove: () => void;
  canRemove: boolean;
  textSize?: string;
}) {
  return (
    <div className="mt-3 border-l-2 border-indigo-100 pl-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <EditableField
            value={project.name}
            onChange={(v) => onUpdate({ name: v })}
            tag="span"
            className="text-sm font-semibold text-gray-800"
            placeholder="프로젝트명"
          />
          <span className="text-xs text-gray-400">
            <EditableField
              value={project.startDate ?? ''}
              onChange={(v) => onUpdate({ startDate: v })}
              tag="span"
              placeholder="시작"
            />
            {(project.startDate || project.endDate) && (
              <span className="mx-0.5">–</span>
            )}
            <EditableField
              value={project.endDate ?? ''}
              onChange={(v) => onUpdate({ endDate: v })}
              tag="span"
              placeholder="종료"
            />
          </span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="no-print rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-400 hover:text-red-600"
          >
            삭제
          </button>
        )}
      </div>
      {project.tech && (
        <div className="mt-1">
          <TechBadges tech={project.tech} />
        </div>
      )}
      <div className="no-print mt-0.5">
        <EditableField
          value={project.tech ?? ''}
          onChange={(v) => onUpdate({ tech: v })}
          tag="span"
          className="text-xs text-gray-400 italic"
          placeholder="기술 스택 (쉼표로 구분: React, TypeScript, ...)"
        />
      </div>
      <div className="mt-2 space-y-3">
        {STRUCTURED_FIELDS.map((field, i) => (
          <div key={field.key}>
            {i > 0 && <div className="mb-3 border-t border-gray-100" />}
            <div className="flex items-baseline gap-2">
              <span className="w-16 shrink-0 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                {field.label}
              </span>
              <RichTextField
                value={project[field.key] ?? ''}
                onChange={(v) => onUpdate({ [field.key]: v })}
                className={`block w-full leading-relaxed text-gray-700 ${textSize}`}
                placeholder={field.placeholder}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Legacy rendering for items that predate the projects field
function LegacyFields({
  item,
  update,
  textSize = 'text-sm',
}: {
  item: ExperienceItem;
  update: (patch: Partial<ExperienceItem>) => void;
  textSize?: string;
}) {
  const hasStructured =
    (item.problem ?? '') !== '' ||
    (item.ownership ?? '') !== '' ||
    (item.achievement ?? '') !== '';
  const hasLegacy = (item.description ?? '') !== '' && !hasStructured;

  if (hasLegacy) {
    return (
      <div className="mt-2 border-l-2 border-gray-100 pl-4">
        <RichTextField
          value={item.description ?? ''}
          onChange={(v) => update({ description: v })}
          className={`block w-full leading-relaxed text-gray-700 ${textSize}`}
          placeholder="업무 내용을 작성해주세요"
        />
      </div>
    );
  }

  const legacyStructuredFields = [
    {
      key: 'problem' as const,
      label: '해결한 문제',
      placeholder: '어떤 비즈니스·기술 문제가 있었는지 (상황/배경)',
    },
    {
      key: 'ownership' as const,
      label: '담당 역할',
      placeholder: '본인이 주도하거나 책임진 구체적인 범위',
    },
    {
      key: 'achievement' as const,
      label: '핵심 성과',
      placeholder: '수치, 품질 개선, 비용 절감 등 확인 가능한 결과',
    },
  ] as const;

  return (
    <div className="mt-2 space-y-3 border-l-2 border-gray-100 pl-4">
      {legacyStructuredFields.map((field, i) => (
        <div key={field.key}>
          {i > 0 && <div className="mb-3 border-t border-gray-100" />}
          <div className="flex items-baseline gap-2">
            <span className="w-16 shrink-0 text-xs font-semibold tracking-wide text-gray-400 uppercase">
              {field.label}
            </span>
            <RichTextField
              value={item[field.key] ?? ''}
              onChange={(v) => update({ [field.key]: v })}
              className={`block w-full leading-relaxed text-gray-700 ${textSize}`}
              placeholder={field.placeholder}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectsBlock({
  item,
  onUpdate,
  textSize,
}: {
  item: ExperienceItem;
  onUpdate: (patch: Partial<ExperienceItem>) => void;
  textSize?: string;
}) {
  const projects = item.projects;

  if (!projects || projects.length === 0) {
    return <LegacyFields item={item} update={onUpdate} textSize={textSize} />;
  }

  const updateProject = (
    projectId: string,
    patch: Partial<ExperienceProject>
  ) => {
    onUpdate({
      projects: projects.map((p) =>
        p.id === projectId ? { ...p, ...patch } : p
      ),
    });
  };

  const removeProject = (projectId: string) => {
    onUpdate({ projects: projects.filter((p) => p.id !== projectId) });
  };

  const addProject = () => {
    onUpdate({ projects: [...projects, newProject()] });
  };

  return (
    <div>
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onUpdate={(patch) => updateProject(project.id, patch)}
          onRemove={() => removeProject(project.id)}
          canRemove={projects.length > 1}
          textSize={textSize}
        />
      ))}
      <div className="no-print mt-2">
        <button
          type="button"
          onClick={addProject}
          className="rounded border border-indigo-200 px-2 py-0.5 text-xs text-indigo-500 hover:text-indigo-700"
        >
          + 프로젝트 추가
        </button>
      </div>
    </div>
  );
}

function CompanyActions({
  onAddCompany,
  onRemoveCompany,
  canRemove,
}: {
  onAddCompany: () => void;
  onRemoveCompany: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="no-print resume-action-buttons mt-2 gap-1">
      <button
        type="button"
        onClick={onAddCompany}
        className="rounded border border-blue-200 px-2 py-0.5 text-xs text-blue-500 hover:text-blue-700"
      >
        + 회사 추가
      </button>
      {canRemove && (
        <button
          type="button"
          onClick={onRemoveCompany}
          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-400 hover:text-red-600"
        >
          삭제
        </button>
      )}
    </div>
  );
}

export function ExperienceSection({ content, layout, onChange }: Props) {
  const newItem = (): ExperienceItem => ({
    id: crypto.randomUUID(),
    company: '회사명',
    role: '직책',
    location: '서울',
    startDate: '20XX.01',
    endDate: '현재',
    projects: [newProject()],
  });

  const add = () => onChange({ items: [...content.items, newItem()] });
  const remove = (id: string) =>
    onChange({ items: content.items.filter((i) => i.id !== id) });
  const update = (id: string, patch: Partial<ExperienceItem>) =>
    onChange({ items: updateItem(content.items, id, patch) });

  if (layout === 'layout1') {
    return (
      <div className="space-y-6">
        {content.items.map((item) => (
          <div
            key={item.id}
            className="resume-action-host relative border-l-2 border-blue-300 pl-6 focus:outline-none"
            tabIndex={0}
          >
            <div className="absolute top-1 -left-2.25 h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <EditableField
                  value={item.company}
                  onChange={(v) => update(item.id, { company: v })}
                  tag="span"
                  className="text-base font-bold text-gray-900"
                  placeholder="회사명"
                />
                <span className="mx-2 text-gray-300">|</span>
                <EditableField
                  value={item.role}
                  onChange={(v) => update(item.id, { role: v })}
                  tag="span"
                  className="text-sm font-semibold text-blue-600"
                  placeholder="직책"
                />
                <EditableField
                  value={item.location}
                  onChange={(v) => update(item.id, { location: v })}
                  tag="span"
                  className="ml-2 text-xs text-gray-400"
                  placeholder="위치"
                />
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-medium text-gray-500">
                  <EditableField
                    value={item.startDate}
                    onChange={(v) => update(item.id, { startDate: v })}
                    tag="span"
                    placeholder="시작"
                  />
                  <span className="mx-1">–</span>
                  <EditableField
                    value={item.endDate}
                    onChange={(v) => update(item.id, { endDate: v })}
                    tag="span"
                    placeholder="종료"
                  />
                </div>
                {calcTenure(item.startDate, item.endDate) && (
                  <div className="mt-0.5 text-xs font-medium text-blue-500">
                    {calcTenure(item.startDate, item.endDate)}
                  </div>
                )}
              </div>
            </div>
            <ProjectsBlock
              item={item}
              onUpdate={(patch) => update(item.id, patch)}
            />
            <CompanyActions
              onAddCompany={add}
              onRemoveCompany={() => remove(item.id)}
              canRemove={content.items.length > 1}
            />
          </div>
        ))}
      </div>
    );
  }

  if (layout === 'layout2') {
    return (
      <div className="space-y-4">
        {content.items.map((item) => (
          <div
            key={item.id}
            className="resume-action-host overflow-hidden rounded-lg border border-gray-200 shadow-sm focus:outline-none"
            tabIndex={0}
          >
            <div className="h-1 bg-linear-to-r from-blue-500 to-blue-300" />
            <div className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <EditableField
                    value={item.company}
                    onChange={(v) => update(item.id, { company: v })}
                    tag="div"
                    className="text-base leading-tight font-bold text-gray-900"
                    placeholder="회사명"
                  />
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <EditableField
                      value={item.role}
                      onChange={(v) => update(item.id, { role: v })}
                      tag="span"
                      className="text-sm font-semibold text-blue-600"
                      placeholder="직책"
                    />
                    <span className="text-xs text-gray-300">·</span>
                    <EditableField
                      value={item.location}
                      onChange={(v) => update(item.id, { location: v })}
                      tag="span"
                      className="text-xs text-gray-400"
                      placeholder="위치"
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-medium text-gray-500">
                    <EditableField
                      value={item.startDate}
                      onChange={(v) => update(item.id, { startDate: v })}
                      tag="span"
                      placeholder="시작"
                    />
                    <span className="mx-1">–</span>
                    <EditableField
                      value={item.endDate}
                      onChange={(v) => update(item.id, { endDate: v })}
                      tag="span"
                      placeholder="종료"
                    />
                  </div>
                  {calcTenure(item.startDate, item.endDate) && (
                    <div className="mt-0.5 text-xs font-medium text-blue-500">
                      {calcTenure(item.startDate, item.endDate)}
                    </div>
                  )}
                </div>
              </div>
              <ProjectsBlock
                item={item}
                onUpdate={(patch) => update(item.id, patch)}
              />
              <CompanyActions
                onAddCompany={add}
                onRemoveCompany={() => remove(item.id)}
                canRemove={content.items.length > 1}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // layout3: compact
  return (
    <div className="space-y-4">
      {content.items.map((item) => (
        <div
          key={item.id}
          className="resume-action-host flex flex-col gap-0.5"
          tabIndex={0}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <EditableField
                value={item.company}
                onChange={(v) => update(item.id, { company: v })}
                tag="span"
                className="font-semibold text-gray-900"
                placeholder="회사명"
              />
              <EditableField
                value={item.role}
                onChange={(v) => update(item.id, { role: v })}
                tag="span"
                className="text-sm font-medium text-blue-600"
                placeholder="직책"
              />
              <EditableField
                value={item.location}
                onChange={(v) => update(item.id, { location: v })}
                tag="span"
                className="text-xs text-gray-400"
                placeholder="위치"
              />
            </div>
            <div className="shrink-0 text-right">
              <span className="text-xs text-gray-500">
                <EditableField
                  value={item.startDate}
                  onChange={(v) => update(item.id, { startDate: v })}
                  tag="span"
                  placeholder="시작"
                />
                <span className="mx-1">–</span>
                <EditableField
                  value={item.endDate}
                  onChange={(v) => update(item.id, { endDate: v })}
                  tag="span"
                  placeholder="종료"
                />
              </span>
              {calcTenure(item.startDate, item.endDate) && (
                <span className="ml-1 text-xs text-blue-500">
                  · {calcTenure(item.startDate, item.endDate)}
                </span>
              )}
            </div>
          </div>
          <ProjectsBlock
            item={item}
            onUpdate={(patch) => update(item.id, patch)}
            textSize="text-sm"
          />
          <CompanyActions
            onAddCompany={add}
            onRemoveCompany={() => remove(item.id)}
            canRemove={content.items.length > 1}
          />
        </div>
      ))}
    </div>
  );
}
