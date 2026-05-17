'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

import { normalizeRichTextForEditor } from '@/lib/rich-text';

interface RichTextFieldProps {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
}

interface ToolbarPosition {
  left: number;
  top: number;
}

const TOOLBAR_EDGE_PADDING = 12;
const TOOLBAR_GAP = 8;
const TOOLBAR_WIDTH = 204;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function RichTextField({
  value,
  onChange,
  className = '',
  placeholder = '클릭하여 편집',
}: RichTextFieldProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [toolbarPosition, setToolbarPosition] =
    useState<ToolbarPosition | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: normalizeRichTextForEditor(value),
    immediatelyRender: false,
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: 'rich-text-field outline-none min-h-[1em] cursor-text',
      },
    },
  });

  const updateToolbarPosition = useCallback(
    (clientX?: number, clientY?: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const maxLeft = Math.max(
        TOOLBAR_EDGE_PADDING,
        rect.width - TOOLBAR_EDGE_PADDING
      );
      let left = rect.width / 2;
      let top = -TOOLBAR_GAP;

      if (clientX !== undefined && clientY !== undefined) {
        left = clientX - rect.left;
        top = clientY - rect.top - TOOLBAR_GAP;
      } else if (editor) {
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        left = coords.left - rect.left;
        top = coords.top - rect.top - TOOLBAR_GAP;
      }

      setToolbarPosition({
        left: clamp(left, TOOLBAR_EDGE_PADDING, maxLeft),
        top,
      });
    },
    [editor]
  );

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = normalizeRichTextForEditor(value);
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!isFocused) return;
    const frame = window.requestAnimationFrame(() => updateToolbarPosition());
    return () => window.cancelAnimationFrame(frame);
  }, [isFocused, updateToolbarPosition]);

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      updateToolbarPosition(event.clientX, event.clientY);
    },
    [updateToolbarPosition]
  );

  const handleMouseUp = useCallback(() => {
    window.requestAnimationFrame(() => updateToolbarPosition());
  }, [updateToolbarPosition]);

  const toolbarStyle: CSSProperties = {
    left: toolbarPosition?.left ?? TOOLBAR_WIDTH / 2,
    top: toolbarPosition?.top ?? -TOOLBAR_GAP,
    transform: 'translate(-50%, -100%)',
  };

  return (
    <div
      ref={wrapperRef}
      className={`relative ${className}`}
      onKeyUp={() => updateToolbarPosition()}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {isFocused && (
        <div
          className="rich-text-toolbar absolute z-20 flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1 py-0.5 shadow-md"
          style={toolbarStyle}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`flex h-7 w-7 items-center justify-center rounded text-sm font-bold transition-colors hover:bg-gray-100 ${editor?.isActive('bold') ? 'bg-gray-200 text-gray-900' : 'text-gray-600'}`}
            title="굵게"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`flex h-7 w-7 items-center justify-center rounded text-sm italic transition-colors hover:bg-gray-100 ${editor?.isActive('italic') ? 'bg-gray-200 text-gray-900' : 'text-gray-600'}`}
            title="기울임"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className={`flex h-7 w-7 items-center justify-center rounded text-sm underline transition-colors hover:bg-gray-100 ${editor?.isActive('underline') ? 'bg-gray-200 text-gray-900' : 'text-gray-600'}`}
            title="밑줄"
          >
            U
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            className={`flex h-7 w-7 items-center justify-center rounded text-sm line-through transition-colors hover:bg-gray-100 ${editor?.isActive('strike') ? 'bg-gray-200 text-gray-900' : 'text-gray-600'}`}
            title="취소선"
          >
            S
          </button>
          <div className="mx-0.5 h-4 w-px bg-gray-200" />
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={`flex h-7 w-7 items-center justify-center rounded text-base transition-colors hover:bg-gray-100 ${editor?.isActive('bulletList') ? 'bg-gray-200 text-gray-900' : 'text-gray-600'}`}
            title="글머리 기호"
          >
            ≡
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className={`flex h-7 w-7 items-center justify-center rounded text-xs transition-colors hover:bg-gray-100 ${editor?.isActive('orderedList') ? 'bg-gray-200 text-gray-900' : 'text-gray-600'}`}
            title="번호 목록"
          >
            1.
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
