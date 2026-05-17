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

  const add = () => onChange({ categories: [...content.categories, newCategory()] });
  const remove = (id: string) =>
    onChange({ categories: content.categories.filter((c) => c.id !== id) });
  const update = (id: string, patch: Partial<SkillCategory>) =>
    onChange({ categories: updateCategory(content.categories, id, patch) });

  const actions = (id: string) => (
    <div className="no-print resume-action-buttons gap-1 mt-1">
      <button type="button" onClick={add} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 border border-blue-200 rounded">+ 추가</button>
      {content.categories.length > 1 && (
        <button type="button" onClick={() => remove(id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 border border-red-200 rounded">삭제</button>
      )}
    </div>
  );

  if (layout === 'layout1') {
    return (
      <div className="space-y-3">
        {content.categories.map((cat) => (
          <div key={cat.id} className="resume-action-host focus:outline-none" tabIndex={0}>
            <div className="flex items-center gap-3 flex-wrap">
              <EditableField
                value={cat.name}
                onChange={(v) => update(cat.id, { name: v })}
                tag="span"
                className="font-semibold text-gray-700 min-w-[80px]"
                placeholder="카테고리"
              />
              <span className="text-gray-300">:</span>
              <div className="flex flex-wrap gap-1.5">
                {cat.skills.split(',').map((skill, i) => (
                  <span key={i} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-sm">
                    {skill.trim()}
                  </span>
                ))}
              </div>
            </div>
            <EditableField
              value={cat.skills}
              onChange={(v) => update(cat.id, { skills: v })}
              tag="p"
              className="text-xs text-gray-400 mt-1"
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
          <div key={cat.id} className="resume-action-host focus:outline-none" tabIndex={0}>
            <EditableField
              value={cat.name}
              onChange={(v) => update(cat.id, { name: v })}
              tag="h4"
              className="font-semibold text-gray-800 text-sm uppercase tracking-wide mb-2"
              placeholder="카테고리"
            />
            <EditableField
              value={cat.skills}
              onChange={(v) => update(cat.id, { skills: v })}
              tag="p"
              className="text-gray-600 text-sm"
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
        <div key={cat.id} className="resume-action-host border border-gray-100 rounded-lg p-3 focus:outline-none" tabIndex={0}>
          <EditableField
            value={cat.name}
            onChange={(v) => update(cat.id, { name: v })}
            tag="h4"
            className="font-semibold text-gray-800 mb-2"
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
