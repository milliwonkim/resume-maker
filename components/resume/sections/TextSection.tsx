'use client';

import type { TextContent } from '@/lib/types';

import { RichTextField } from '../RichTextField';

interface Props {
  content: TextContent;
  layout: string;
  onChange: (content: TextContent) => void;
}

export function TextSection({ content, layout, onChange }: Props) {
  const handleChange = (text: string) => onChange({ ...content, text });

  if (layout === 'layout2') {
    return (
      <div className="rounded-lg border border-gray-200 px-4 py-3">
        <RichTextField
          value={content.text}
          onChange={handleChange}
          placeholder="텍스트를 작성하세요..."
          className="block w-full leading-relaxed text-gray-700"
        />
      </div>
    );
  }

  return (
    <RichTextField
      value={content.text}
      onChange={handleChange}
      placeholder="텍스트를 작성하세요..."
      className="block w-full leading-relaxed text-gray-700"
    />
  );
}
