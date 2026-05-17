'use client';

import type { SummaryContent } from '@/lib/types';

import { RichTextField } from '../RichTextField';

interface Props {
  content: SummaryContent;
  layout: string;
  onChange: (content: SummaryContent) => void;
}

export function SummarySection({ content, layout, onChange }: Props) {
  const handleChange = (text: string) => onChange({ ...content, text });

  if (layout === 'layout2') {
    return (
      <div className="border-l-4 border-blue-500 pl-4 py-1">
        <RichTextField
          value={content.text}
          onChange={handleChange}
          placeholder="자기소개를 작성하세요..."
          className="text-gray-700 leading-relaxed block w-full italic"
        />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <RichTextField
        value={content.text}
        onChange={handleChange}
        placeholder="자기소개를 작성하세요..."
        className="text-gray-700 leading-relaxed block w-full"
      />
    </div>
  );
}
