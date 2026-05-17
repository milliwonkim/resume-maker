'use client';

import type { SummaryContent } from '@/lib/types';
import type { RichTextDocument } from '@/lib/types';

import { RichTextField } from '../RichTextField';

interface Props {
  content: SummaryContent;
  layout: string;
  onChange: (content: SummaryContent) => void;
}

export function SummarySection({ content, layout, onChange }: Props) {
  const handleChange = (text: RichTextDocument) => onChange({ ...content, text });

  if (layout === 'layout2') {
    return (
      <div className="border-l-4 border-blue-500 py-1 pl-4">
        <RichTextField
          value={content.text}
          onChange={handleChange}
          placeholder="자기소개를 작성하세요..."
          className="block w-full leading-relaxed text-gray-700 italic"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <RichTextField
        value={content.text}
        onChange={handleChange}
        placeholder="자기소개를 작성하세요..."
        className="block w-full leading-relaxed text-gray-700"
      />
    </div>
  );
}
