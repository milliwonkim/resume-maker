'use client';

import { useRef, useEffect, useCallback, type ElementType } from 'react';

interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  tag?: ElementType;
  multiline?: boolean;
}

function readText(el: HTMLElement, multiline: boolean): string {
  if (!multiline) return el.textContent ?? '';
  // innerText preserves visual newlines from <br>/<div> that browsers insert on Enter
  // Trim the single trailing \n browsers append automatically
  return (el.innerText ?? '').replace(/\n$/, '');
}

function writeText(el: HTMLElement, value: string, multiline: boolean): void {
  if (!multiline) {
    el.textContent = value;
  } else {
    // innerText assignment renders \n as actual line breaks in contentEditable
    el.innerText = value;
  }
}

export function EditableField({
  value,
  onChange,
  className = '',
  placeholder = '클릭하여 편집',
  tag: Tag = 'span',
  multiline = false,
}: EditableFieldProps) {
  const ref = useRef<HTMLElement>(null);
  const isComposing = useRef(false);
  const lastValue = useRef(value);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      writeText(ref.current, value, multiline);
      lastValue.current = value;
    }
  }, [value, multiline]);

  const handleBlur = useCallback(() => {
    if (!ref.current) return;
    const newValue = readText(ref.current, multiline);
    if (newValue !== lastValue.current) {
      lastValue.current = newValue;
      onChange(newValue);
    }
  }, [onChange, multiline]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!multiline && e.key === 'Enter') {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    },
    [multiline]
  );

  return (
    <Tag
      ref={ref as React.Ref<never>}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onCompositionStart={() => { isComposing.current = true; }}
      onCompositionEnd={() => { isComposing.current = false; }}
      data-placeholder={placeholder}
      className={`outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 rounded px-0.5 cursor-text empty:before:content-[attr(data-placeholder)] empty:before:text-gray-300${multiline ? ' whitespace-pre-wrap' : ''} ${className}`}
    />
  );
}
