import type { ReactNode } from 'react';

import type {
  RichTextDocument,
  RichTextMark,
  RichTextNode,
} from '@/lib/types';

interface RichTextRendererProps {
  value: RichTextDocument;
  className?: string;
}

function renderMarks(text: string, marks: RichTextMark[] = []): ReactNode {
  return marks.reduce<ReactNode>((children, mark) => {
    if (mark.type === 'bold') return <strong>{children}</strong>;
    if (mark.type === 'italic') return <em>{children}</em>;
    if (mark.type === 'strike') return <s>{children}</s>;
    if (mark.type === 'underline') return <u>{children}</u>;
    return children;
  }, text);
}

function renderNode(node: RichTextNode, index: number): ReactNode {
  const children = node.content?.map(renderNode);

  if (node.type === 'text') {
    return <span key={index}>{renderMarks(node.text ?? '', node.marks)}</span>;
  }
  if (node.type === 'hardBreak') return <br key={index} />;
  if (node.type === 'paragraph') return <p key={index}>{children}</p>;
  if (node.type === 'bulletList') return <ul key={index}>{children}</ul>;
  if (node.type === 'orderedList') return <ol key={index}>{children}</ol>;
  if (node.type === 'listItem') return <li key={index}>{children}</li>;
  return null;
}

export function RichTextRenderer({
  value,
  className = '',
}: RichTextRendererProps) {
  return (
    <div className={`rich-text-field ${className}`}>
      {value.content.map(renderNode)}
    </div>
  );
}
