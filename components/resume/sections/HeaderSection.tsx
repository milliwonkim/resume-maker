'use client';

import type { HeaderContent } from '@/lib/types';
import { EditableField } from '../EditableField';

interface Props {
  content: HeaderContent;
  layout: string;
  onChange: (content: HeaderContent) => void;
}

function field<K extends keyof HeaderContent>(
  content: HeaderContent,
  key: K,
  onChange: (c: HeaderContent) => void
) {
  return {
    value: (content[key] as string) ?? '',
    onChange: (v: string) => onChange({ ...content, [key]: v }),
  };
}

export function HeaderSection({ content, layout, onChange }: Props) {
  const f = (key: keyof HeaderContent) => field(content, key, onChange);

  if (layout === 'layout1') {
    return (
      <div className="border-b border-gray-700 py-6 text-center">
        <EditableField
          {...f('name')}
          tag="h1"
          placeholder="이름"
          className="block text-4xl font-bold text-gray-900"
        />
        <EditableField
          {...f('title')}
          tag="p"
          placeholder="직함"
          className="mt-1 block text-xl text-blue-600"
        />
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-gray-600">
          <EditableField {...f('email')} placeholder="이메일" />
          <span className="text-gray-300">|</span>
          <EditableField {...f('phone')} placeholder="전화번호" />
          <span className="text-gray-300">|</span>
          <EditableField {...f('location')} placeholder="위치" />
          {content.github && (
            <>
              <span className="text-gray-300">|</span>
              <EditableField {...f('github')} placeholder="GitHub" />
            </>
          )}
          {content.linkedin && (
            <>
              <span className="text-gray-300">|</span>
              <EditableField {...f('linkedin')} placeholder="LinkedIn" />
            </>
          )}
        </div>
      </div>
    );
  }

  if (layout === 'layout2') {
    return (
      <div className="border-b border-gray-700 py-6">
        <EditableField
          {...f('name')}
          tag="h1"
          placeholder="이름"
          className="block text-4xl font-bold text-gray-900"
        />
        <EditableField
          {...f('title')}
          tag="p"
          placeholder="직함"
          className="mt-1 block text-xl text-blue-600"
        />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          <EditableField {...f('email')} placeholder="이메일" />
          <EditableField {...f('phone')} placeholder="전화번호" />
          <EditableField {...f('location')} placeholder="위치" />
          <EditableField {...f('github')} placeholder="GitHub (선택)" />
          <EditableField {...f('linkedin')} placeholder="LinkedIn (선택)" />
        </div>
      </div>
    );
  }

  // layout3: two-column
  return (
    <div className="flex items-center justify-between gap-8 border-b border-gray-700 py-6">
      <div className="flex-1">
        <EditableField
          {...f('name')}
          tag="h1"
          placeholder="이름"
          className="block text-4xl font-bold text-gray-900"
        />
        <EditableField
          {...f('title')}
          tag="p"
          placeholder="직함"
          className="mt-1 block text-xl text-blue-600"
        />
      </div>
      <div className="space-y-1 text-right text-sm text-gray-600">
        <div>
          <EditableField {...f('email')} placeholder="이메일" />
        </div>
        <div>
          <EditableField {...f('phone')} placeholder="전화번호" />
        </div>
        <div>
          <EditableField {...f('location')} placeholder="위치" />
        </div>
        <div>
          <EditableField {...f('github')} placeholder="GitHub (선택)" />
        </div>
        <div>
          <EditableField {...f('linkedin')} placeholder="LinkedIn (선택)" />
        </div>
      </div>
    </div>
  );
}
