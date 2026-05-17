const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ALLOWED_TAGS = new Set([
  'P',
  'STRONG',
  'B',
  'EM',
  'I',
  'S',
  'U',
  'UL',
  'OL',
  'LI',
  'BR',
]);
const VOID_TAGS = new Set(['BR']);
const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;
const CODE_FENCE_PATTERN = /^```(?:html|markdown|md)?\s*([\s\S]*?)\s*```$/i;
const UNORDERED_LIST_PATTERN = /^\s*[-*]\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s*\d+[.)]\s+(.+)$/;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITY_MAP[char]);
}

function normalizeTagName(tagName: string): string {
  if (tagName === 'B') return 'strong';
  if (tagName === 'I') return 'em';
  return tagName.toLowerCase();
}

function serializeAllowedNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return formatInline(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;
  if (!ALLOWED_TAGS.has(element.tagName)) {
    return Array.from(element.childNodes).map(serializeAllowedNode).join('');
  }

  const tagName = normalizeTagName(element.tagName);
  if (VOID_TAGS.has(element.tagName)) {
    return `<${tagName}>`;
  }

  return `<${tagName}>${Array.from(element.childNodes).map(serializeAllowedNode).join('')}</${tagName}>`;
}

function sanitizeHtml(value: string): string {
  if (typeof DOMParser === 'undefined') {
    return escapeHtml(value);
  }

  const document = new DOMParser().parseFromString(
    `<div>${value}</div>`,
    'text/html'
  );
  const container = document.body.firstElementChild;
  if (!container) return '';

  return Array.from(container.childNodes).map(serializeAllowedNode).join('');
}

function stripCodeFence(value: string): string {
  const match = value.trim().match(CODE_FENCE_PATTERN);
  return match?.[1] ?? value;
}

function formatInline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/\+\+([^+\n]+)\+\+/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}

function listItemContent(line: string, isOrdered: boolean): string | null {
  const pattern = isOrdered ? ORDERED_LIST_PATTERN : UNORDERED_LIST_PATTERN;
  const match = line.match(pattern);
  return match?.[1] ?? null;
}

function markdownToHtml(value: string): string {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const unorderedContent = listItemContent(line, false);
    const orderedContent = listItemContent(line, true);

    if (unorderedContent !== null || orderedContent !== null) {
      const isOrdered = orderedContent !== null;
      const items: string[] = [];

      while (index < lines.length) {
        const content = listItemContent(lines[index], isOrdered);
        if (content === null) break;
        items.push(`<li>${formatInline(content)}</li>`);
        index += 1;
      }

      blocks.push(
        `<${isOrdered ? 'ol' : 'ul'}>${items.join('')}</${isOrdered ? 'ol' : 'ul'}>`
      );
      continue;
    }

    blocks.push(`<p>${formatInline(line)}</p>`);
    index += 1;
  }

  return blocks.join('');
}

export function normalizeRichTextForEditor(value: string): string {
  const trimmed = stripCodeFence(value).trim();
  if (!trimmed) return '';

  if (HTML_TAG_PATTERN.test(trimmed)) {
    return sanitizeHtml(trimmed);
  }

  return markdownToHtml(trimmed);
}
