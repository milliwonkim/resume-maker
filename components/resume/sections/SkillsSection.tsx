'use client';

import type { SkillsContent, SkillCategory } from '@/lib/types';
import { EditableField } from '../EditableField';

interface Props {
  content: SkillsContent;
  layout: string;
  onChange: (content: SkillsContent) => void;
}

function updateCategory(
  categories: SkillCategory[],
  id: string,
  patch: Partial<SkillCategory>
): SkillCategory[] {
  return categories.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

export function SkillsSection({ content, layout, onChange }: Props) {
  const newCategory = (): SkillCategory => ({
    id: crypto.randomUUID(),
    name: '카테고리',
    skills: '기술1, 기술2',
  });

  const add = () =>
    onChange({ categories: [...content.categories, newCategory()] });
  const remove = (id: string) =>
    onChange({ categories: content.categories.filter((c) => c.id !== id) });
  const update = (id: string, patch: Partial<SkillCategory>) =>
    onChange({ categories: updateCategory(content.categories, id, patch) });

  const actions = (id: string) => (
    <div className="no-print resume-action-buttons mt-1 gap-1">
      <button
        type="button"
        onClick={add}
        className="rounded border border-blue-200 px-2 py-0.5 text-xs text-blue-500 hover:text-blue-700"
      >
        + 추가
      </button>
      {content.categories.length > 1 && (
        <button
          type="button"
          onClick={() => remove(id)}
          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-400 hover:text-red-600"
        >
          삭제
        </button>
      )}
    </div>
  );

  if (layout === 'layout1') {
    return (
      <div className="space-y-3">
        {content.categories.map((cat) => (
          <div
            key={cat.id}
            className="resume-action-host focus:outline-none"
            tabIndex={0}
          >
            <div className="flex flex-wrap items-center gap-3">
              <EditableField
                value={cat.name}
                onChange={(v) => update(cat.id, { name: v })}
                tag="span"
                className="min-w-[80px] font-semibold text-gray-700"
                placeholder="카테고리"
              />
              <span className="text-gray-300">:</span>
              <div className="flex flex-wrap gap-1.5">
                {cat.skills.split(',').map((skill, i) => (
                  <span
                    key={i}
                    className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-sm text-blue-700"
                  >
                    {skill.trim()}
                  </span>
                ))}
              </div>
            </div>
            <EditableField
              value={cat.skills}
              onChange={(v) => update(cat.id, { skills: v })}
              tag="p"
              className="mt-1 text-xs text-gray-400"
              placeholder="기술1, 기술2, 기술3 (쉼표로 구분)"
            />
            {actions(cat.id)}
          </div>
        ))}
      </div>
    );
  }

  if (layout === 'layout2') {
    return (
      <div className="space-y-4">
        {content.categories.map((cat) => (
          <div
            key={cat.id}
            className="resume-action-host focus:outline-none"
            tabIndex={0}
          >
            <EditableField
              value={cat.name}
              onChange={(v) => update(cat.id, { name: v })}
              tag="h4"
              className="mb-2 text-sm font-semibold tracking-wide text-gray-800 uppercase"
              placeholder="카테고리"
            />
            <EditableField
              value={cat.skills}
              onChange={(v) => update(cat.id, { skills: v })}
              tag="p"
              className="text-sm text-gray-600"
              placeholder="기술1, 기술2, 기술3"
            />
            {actions(cat.id)}
          </div>
        ))}
      </div>
    );
  }

  // layout3: two-column grid
  return (
    <div className="grid grid-cols-2 gap-4">
      {content.categories.map((cat) => (
        <div
          key={cat.id}
          className="resume-action-host rounded-lg border border-gray-100 p-3 focus:outline-none"
          tabIndex={0}
        >
          <EditableField
            value={cat.name}
            onChange={(v) => update(cat.id, { name: v })}
            tag="h4"
            className="mb-2 font-semibold text-gray-800"
            placeholder="카테고리"
          />
          <EditableField
            value={cat.skills}
            onChange={(v) => update(cat.id, { skills: v })}
            tag="p"
            className="text-sm text-gray-600"
            placeholder="기술1, 기술2"
          />
          {actions(cat.id)}
        </div>
      ))}
    </div>
  );
}
