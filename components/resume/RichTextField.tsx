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
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';

import { normalizeRichTextValue } from '@/lib/rich-text';
import type { RichTextDocument } from '@/lib/types';

interface RichTextFieldProps {
  value: RichTextDocument;
  onChange: (document: RichTextDocument) => void;
  className?: string;
  placeholder?: string;
  enableTables?: boolean;
  toolbarMode?: 'floating' | 'fixed';
  editorClassName?: string;
}

interface ToolbarPosition {
  left: number;
  top: number;
}

const TOOLBAR_EDGE_PADDING = 12;
const TOOLBAR_GAP = 8;
const FLOATING_TOOLBAR_WIDTH = 340;
const FLOATING_TABLE_TOOLBAR_WIDTH = 640;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function RichTextField({
  value,
  onChange,
  className = '',
  placeholder = '클릭하여 편집',
  enableTables = false,
  toolbarMode = 'floating',
  editorClassName = '',
}: RichTextFieldProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [toolbarPosition, setToolbarPosition] =
    useState<ToolbarPosition | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder }),
      ...(enableTables
        ? [
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
          ]
        : []),
    ],
    content: normalizeRichTextValue(value),
    immediatelyRender: false,
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    onUpdate: ({ editor: e }) => onChange(normalizeRichTextValue(e.getJSON())),
    editorProps: {
      attributes: {
        class: `rich-text-field outline-none min-h-[1em] cursor-text ${editorClassName}`,
      },
    },
  });

  const updateToolbarPosition = useCallback(
    (clientX?: number, clientY?: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const toolbarWidth = enableTables
        ? FLOATING_TABLE_TOOLBAR_WIDTH
        : FLOATING_TOOLBAR_WIDTH;
      const maxLeft = Math.max(
        TOOLBAR_EDGE_PADDING,
        rect.width - TOOLBAR_EDGE_PADDING
      );
      let left = Math.min(rect.width / 2, toolbarWidth / 2);
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
    [editor, enableTables]
  );

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = normalizeRichTextValue(value);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
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
    left: toolbarPosition?.left ?? FLOATING_TOOLBAR_WIDTH / 2,
    top: toolbarPosition?.top ?? -TOOLBAR_GAP,
    transform: 'translate(-50%, -100%)',
  };
  const isToolbarVisible = toolbarMode === 'fixed' || isFocused;
  const toolbarClassName =
    toolbarMode === 'fixed'
      ? 'rich-text-toolbar sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 shadow-sm'
      : 'rich-text-toolbar absolute z-20 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1 py-0.5 shadow-md';

  const buttonClassName = (isActive = false) =>
    `flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs transition-colors hover:bg-gray-100 ${
      isActive ? 'bg-gray-200 text-gray-900' : 'text-gray-600'
    }`;

  return (
    <div
      ref={wrapperRef}
      className={`relative ${className}`}
      onKeyUp={() => updateToolbarPosition()}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {isToolbarVisible && (
        <div
          className={toolbarClassName}
          style={toolbarMode === 'floating' ? toolbarStyle : undefined}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`${buttonClassName(editor?.isActive('bold'))} font-bold`}
            title="굵게"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`${buttonClassName(editor?.isActive('italic'))} italic`}
            title="기울임"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className={`${buttonClassName(editor?.isActive('underline'))} underline`}
            title="밑줄"
          >
            U
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            className={`${buttonClassName(editor?.isActive('strike'))} line-through`}
            title="취소선"
          >
            S
          </button>
          <div className="mx-0.5 h-4 w-px bg-gray-200" />
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={buttonClassName(editor?.isActive('bulletList'))}
            title="글머리 기호"
          >
            •
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className={buttonClassName(editor?.isActive('orderedList'))}
            title="번호 목록"
          >
            1.
          </button>
          <button
            type="button"
            onClick={() =>
              editor?.chain().focus().liftListItem('listItem').run()
            }
            className={buttonClassName()}
            title="내어쓰기"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() =>
              editor?.chain().focus().sinkListItem('listItem').run()
            }
            className={buttonClassName()}
            title="들여쓰기"
          >
            →
          </button>
          {enableTables && (
            <>
              <div className="mx-0.5 h-4 w-px bg-gray-200" />
              <button
                type="button"
                onClick={() =>
                  editor
                    ?.chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
                className={buttonClassName(editor?.isActive('table'))}
                title="표 삽입"
              >
                표
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().addColumnAfter().run()}
                className={buttonClassName()}
                title="오른쪽 열 추가"
              >
                열+
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().deleteColumn().run()}
                className={buttonClassName()}
                title="열 삭제"
              >
                열-
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().addRowAfter().run()}
                className={buttonClassName()}
                title="아래 행 추가"
              >
                행+
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().deleteRow().run()}
                className={buttonClassName()}
                title="행 삭제"
              >
                행-
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().toggleHeaderRow().run()}
                className={buttonClassName()}
                title="헤더 행 전환"
              >
                H
              </button>
              <button
                type="button"
                onClick={() => editor?.chain().focus().deleteTable().run()}
                className={buttonClassName()}
                title="표 삭제"
              >
                삭제
              </button>
            </>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
