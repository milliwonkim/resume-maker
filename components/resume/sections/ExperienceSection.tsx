'use client';

import type { ExperienceContent, ExperienceItem } from '@/lib/types';

import { EditableField } from '../EditableField';
import { RichTextField } from '../RichTextField';

const EXPERIENCE_DESCRIPTION_GUIDE = [
  '- 해결한 문제: 어떤 비즈니스/제품/기술 문제를 다뤘는지',
  '- 맡은 역할: 본인이 주도하거나 책임진 범위',
  '- 성과: 수치, 품질 개선, 비용 절감, 일정 단축 등 확인 가능한 결과',
].join('\n');

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

function ItemActions({
  onAdd,
  onRemove,
  canRemove,
}: {
  onAdd: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="no-print resume-action-buttons gap-1 mt-2">
      <button
        type="button"
        onClick={onAdd}
        className="text-xs text-blue-500 hover:text-blue-700 px-2 py-0.5 border border-blue-200 rounded"
      >
        + 항목 추가
      </button>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 border border-red-200 rounded"
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
    description: EXPERIENCE_DESCRIPTION_GUIDE,
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
          <div key={item.id} className="resume-action-host relative pl-6 border-l-2 border-blue-200 focus:outline-none" tabIndex={0}>
            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <EditableField
                  value={item.company}
                  onChange={(v) => update(item.id, { company: v })}
                  tag="span"
                  className="font-bold text-gray-900 text-lg"
                  placeholder="회사명"
                />
                <span className="text-gray-400 mx-2">·</span>
                <EditableField
                  value={item.role}
                  onChange={(v) => update(item.id, { role: v })}
                  tag="span"
                  className="text-blue-600 font-medium"
                  placeholder="직책"
                />
              </div>
              <div className="text-sm text-gray-500">
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
            </div>
            <EditableField
              value={item.location}
              onChange={(v) => update(item.id, { location: v })}
              tag="p"
              className="text-sm text-gray-500 mt-0.5"
              placeholder="위치"
            />
            <RichTextField
              value={item.description}
              onChange={(v) => update(item.id, { description: v })}
              className="text-gray-700 mt-2 leading-relaxed block w-full"
              placeholder="업무 나열보다 문제, 역할, 성과를 중심으로 작성"
            />
            <ItemActions
              onAdd={add}
              onRemove={() => remove(item.id)}
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
          <div key={item.id} className="resume-action-host border border-gray-200 rounded-lg p-4 shadow-sm focus:outline-none" tabIndex={0}>
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <EditableField
                  value={item.company}
                  onChange={(v) => update(item.id, { company: v })}
                  tag="span"
                  className="font-bold text-gray-900 text-lg"
                  placeholder="회사명"
                />
                <br />
                <EditableField
                  value={item.role}
                  onChange={(v) => update(item.id, { role: v })}
                  tag="span"
                  className="text-blue-600 font-medium"
                  placeholder="직책"
                />
              </div>
              <div className="text-sm text-gray-500 text-right">
                <div>
                  <EditableField value={item.startDate} onChange={(v) => update(item.id, { startDate: v })} tag="span" placeholder="시작" />
                  <span className="mx-1">–</span>
                  <EditableField value={item.endDate} onChange={(v) => update(item.id, { endDate: v })} tag="span" placeholder="종료" />
                </div>
                <EditableField value={item.location} onChange={(v) => update(item.id, { location: v })} tag="span" className="text-xs" placeholder="위치" />
              </div>
            </div>
            <RichTextField
              value={item.description}
              onChange={(v) => update(item.id, { description: v })}
              className="text-gray-700 mt-3 leading-relaxed block w-full text-sm"
              placeholder="업무 나열보다 문제, 역할, 성과를 중심으로 작성"
            />
            <ItemActions
              onAdd={add}
              onRemove={() => remove(item.id)}
              canRemove={content.items.length > 1}
            />
          </div>
        ))}
      </div>
    );
  }

  // layout3: compact
  return (
    <div className="space-y-3">
      {content.items.map((item) => (
        <div key={item.id} className="flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
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
                className="text-blue-600 text-sm"
                placeholder="직책"
              />
            </div>
            <span className="text-xs text-gray-500">
              <EditableField value={item.startDate} onChange={(v) => update(item.id, { startDate: v })} tag="span" placeholder="시작" />
              <span className="mx-1">–</span>
              <EditableField value={item.endDate} onChange={(v) => update(item.id, { endDate: v })} tag="span" placeholder="종료" />
            </span>
          </div>
          <RichTextField
            value={item.description}
            onChange={(v) => update(item.id, { description: v })}
            className="text-sm text-gray-600 leading-relaxed block w-full"
            placeholder="업무 나열보다 문제, 역할, 성과를 중심으로 작성"
          />
          <ItemActions
            onAdd={add}
            onRemove={() => remove(item.id)}
            canRemove={content.items.length > 1}
          />
        </div>
      ))}
    </div>
  );
}
