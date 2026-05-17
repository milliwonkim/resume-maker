'use client';

import type { ProjectsContent, ProjectItem } from '@/lib/types';
import { makeRichTextDocument } from '@/lib/types';

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
    description: makeRichTextDocument('프로젝트 설명을 작성하세요.'),
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
      <div className="grid grid-cols-1 gap-4">
        {content.items.map((item) => (
          <div
            key={item.id}
            className="resume-action-host rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md focus:outline-none"
            tabIndex={0}
          >
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
              className="mt-2 block w-full text-sm leading-relaxed text-gray-600"
              placeholder="프로젝트 설명"
            />
            <div className="mt-3 flex flex-wrap gap-1">
              {item.tech.split(',').map((t, i) => (
                <span
                  key={i}
                  className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                >
                  {t.trim()}
                </span>
              ))}
            </div>
            <EditableField
              value={item.tech}
              onChange={(v) => update(item.id, { tech: v })}
              tag="p"
              className="mt-1 text-xs text-gray-400"
              placeholder="기술 스택 (쉼표로 구분)"
            />
            <div className="no-print resume-action-buttons mt-2 gap-1">
              <button
                type="button"
                onClick={add}
                className="rounded border border-blue-200 px-2 py-0.5 text-xs text-blue-500 hover:text-blue-700"
              >
                + 추가
              </button>
              {content.items.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-400 hover:text-red-600"
                >
                  삭제
                </button>
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
        <div
          key={item.id}
          className="resume-action-host flex items-start gap-4 border-b border-gray-100 pb-4 last:border-0 focus:outline-none"
          tabIndex={0}
        >
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
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
              className="mt-1 block w-full text-sm leading-relaxed text-gray-600"
              placeholder="프로젝트 설명"
            />
          </div>
          <div className="no-print resume-action-buttons shrink-0 gap-1">
            <button
              type="button"
              onClick={add}
              className="rounded border border-blue-200 px-2 py-0.5 text-xs text-blue-500 hover:text-blue-700"
            >
              + 추가
            </button>
            {content.items.length > 1 && (
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-400 hover:text-red-600"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
