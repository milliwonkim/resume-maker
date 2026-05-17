'use client';

import type { ProjectsContent, ProjectItem } from '@/lib/types';

import { EditableField } from '../EditableField';
import { RichTextField } from '../RichTextField';

interface Props {
  content: ProjectsContent;
  layout: string;
  onChange: (content: ProjectsContent) => void;
}

function updateItem(
  items: ProjectItem[],
  id: string,
  patch: Partial<ProjectItem>
): ProjectItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

export function ProjectsSection({ content, layout, onChange }: Props) {
  const newItem = (): ProjectItem => ({
    id: crypto.randomUUID(),
    name: '프로젝트명',
    description: '프로젝트 설명을 작성하세요.',
    tech: 'React, TypeScript',
    link: '',
  });

  const add = () => onChange({ items: [...content.items, newItem()] });
  const remove = (id: string) =>
    onChange({ items: content.items.filter((i) => i.id !== id) });
  const update = (id: string, patch: Partial<ProjectItem>) =>
    onChange({ items: updateItem(content.items, id, patch) });

  if (layout === 'layout1') {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {content.items.map((item) => (
          <div key={item.id} className="resume-action-host border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow focus:outline-none" tabIndex={0}>
            <div className="flex items-start justify-between">
              <EditableField
                value={item.name}
                onChange={(v) => update(item.id, { name: v })}
                tag="h4"
                className="font-bold text-gray-900"
                placeholder="프로젝트명"
              />
              <EditableField
                value={item.link ?? ''}
                onChange={(v) => update(item.id, { link: v })}
                tag="span"
                className="text-xs text-blue-500 underline"
                placeholder="링크 (선택)"
              />
            </div>
            <RichTextField
              value={item.description}
              onChange={(v) => update(item.id, { description: v })}
              className="text-sm text-gray-600 mt-2 leading-relaxed block w-full"
              placeholder="프로젝트 설명"
            />
            <div className="mt-3 flex flex-wrap gap-1">
              {item.tech.split(',').map((t, i) => (
                <span key={i} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
                  {t.trim()}
                </span>
              ))}
            </div>
            <EditableField
              value={item.tech}
              onChange={(v) => update(item.id, { tech: v })}
              tag="p"
              className="text-xs text-gray-400 mt-1"
              placeholder="기술 스택 (쉼표로 구분)"
            />
            <div className="no-print resume-action-buttons gap-1 mt-2">
              <button type="button" onClick={add} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 border border-blue-200 rounded">+ 추가</button>
              {content.items.length > 1 && (
                <button type="button" onClick={() => remove(item.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 border border-red-200 rounded">삭제</button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // layout2: list
  return (
    <div className="space-y-4">
      {content.items.map((item) => (
        <div key={item.id} className="resume-action-host flex gap-4 items-start border-b border-gray-100 pb-4 last:border-0 focus:outline-none" tabIndex={0}>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <EditableField
                value={item.name}
                onChange={(v) => update(item.id, { name: v })}
                tag="span"
                className="font-bold text-gray-900"
                placeholder="프로젝트명"
              />
              <EditableField
                value={item.tech}
                onChange={(v) => update(item.id, { tech: v })}
                tag="span"
                className="text-xs text-gray-500"
                placeholder="기술 스택"
              />
              <EditableField
                value={item.link ?? ''}
                onChange={(v) => update(item.id, { link: v })}
                tag="span"
                className="text-xs text-blue-500 underline"
                placeholder="링크 (선택)"
              />
            </div>
            <RichTextField
              value={item.description}
              onChange={(v) => update(item.id, { description: v })}
              className="text-sm text-gray-600 mt-1 leading-relaxed block w-full"
              placeholder="프로젝트 설명"
            />
          </div>
          <div className="no-print resume-action-buttons gap-1 shrink-0">
            <button type="button" onClick={add} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 border border-blue-200 rounded">+ 추가</button>
            {content.items.length > 1 && (
              <button type="button" onClick={() => remove(item.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 border border-red-200 rounded">삭제</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
