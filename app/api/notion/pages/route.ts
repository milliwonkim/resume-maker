import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

const NOTION_VERSION = '2022-06-28';
const NOTION_PAGE_SIZE = '100';
const PROPERTY_LABEL = '속성';
const DATABASE_LABEL = '데이터베이스';

interface RichText {
  plain_text: string;
  href?: string | null;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

interface NotionBlocksResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionProperty {
  type: string;
  title?: RichText[];
  rich_text?: RichText[];
  number?: number | null;
  select?: { name: string } | null;
  multi_select?: Array<{ name: string }>;
  status?: { name: string } | null;
  date?: { start: string; end?: string } | null;
  checkbox?: boolean;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
  people?: Array<{ name?: string }>;
  relation?: Array<{ id?: string }>;
  formula?: {
    type: string;
    string?: string;
    number?: number;
    boolean?: boolean;
    date?: { start: string; end?: string } | null;
  };
}

interface NotionPageResponse {
  id: string;
  properties: Record<string, NotionProperty>;
}

interface NotionDatabaseQueryResponse {
  results: NotionPageResponse[];
  has_more: boolean;
  next_cursor: string | null;
}

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function extractRichText(richText: RichText[]): string {
  return richText.map((text) => text.plain_text).join('');
}

function formatDateRange(date: { start: string; end?: string } | null): string {
  if (!date) return '';
  return date.end ? `${date.start} ~ ${date.end}` : date.start;
}

function formatFormula(property: NotionProperty): string {
  const formula = property.formula;
  if (!formula) return '';

  if (formula.type === 'string') return formula.string ?? '';
  if (formula.type === 'number') return String(formula.number ?? '');
  if (formula.type === 'boolean') return formula.boolean ? 'true' : 'false';
  if (formula.type === 'date') return formatDateRange(formula.date ?? null);

  return '';
}

function propertyValue(property: NotionProperty): string {
  switch (property.type) {
    case 'title':
      return extractRichText(property.title ?? []);
    case 'rich_text':
      return extractRichText(property.rich_text ?? []);
    case 'number':
      return property.number === null || property.number === undefined
        ? ''
        : String(property.number);
    case 'select':
      return property.select?.name ?? '';
    case 'multi_select':
      return property.multi_select?.map((item) => item.name).join(', ') ?? '';
    case 'status':
      return property.status?.name ?? '';
    case 'date':
      return formatDateRange(property.date ?? null);
    case 'checkbox':
      return property.checkbox === undefined
        ? ''
        : property.checkbox
          ? '예'
          : '아니오';
    case 'url':
      return property.url ?? '';
    case 'email':
      return property.email ?? '';
    case 'phone_number':
      return property.phone_number ?? '';
    case 'people':
      return (
        property.people
          ?.map((person) => person.name)
          .filter(Boolean)
          .join(', ') ?? ''
      );
    case 'relation':
      return (
        property.relation
          ?.map((relation) => relation.id)
          .filter(Boolean)
          .join(', ') ?? ''
      );
    case 'formula':
      return formatFormula(property);
    default:
      return '';
  }
}

function pageTitle(page: NotionPageResponse): string {
  const titleProperty = Object.values(page.properties).find(
    (property) => property.type === 'title'
  );
  return propertyValue(titleProperty ?? { type: 'title', title: [] });
}

function propertiesText(properties: Record<string, NotionProperty>): string {
  const lines = Object.entries(properties)
    .map(([name, property]) => ({ name, value: propertyValue(property) }))
    .filter((item) => item.value.trim())
    .map((item) => `- ${item.name}: ${item.value}`);

  return lines.length > 0 ? `${PROPERTY_LABEL}:\n${lines.join('\n')}` : '';
}

async function fetchAllBlocks(
  blockId: string,
  token: string
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', NOTION_PAGE_SIZE);
    if (cursor) url.searchParams.set('start_cursor', cursor);

    const response = await fetch(url.toString(), {
      headers: notionHeaders(token),
    });
    if (!response.ok) throw new Error('Notion 블록을 불러오지 못했습니다.');

    const data = (await response.json()) as NotionBlocksResponse;
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return blocks;
}

async function fetchDatabasePages(
  databaseId: string,
  token: string
): Promise<NotionPageResponse[]> {
  const pages: NotionPageResponse[] = [];
  let cursor: string | null = null;

  do {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: 'POST',
        headers: notionHeaders(token),
        body: JSON.stringify({
          start_cursor: cursor ?? undefined,
          page_size: Number(NOTION_PAGE_SIZE),
        }),
      }
    );

    if (!response.ok)
      throw new Error('Notion 데이터베이스를 불러오지 못했습니다.');

    const data = (await response.json()) as NotionDatabaseQueryResponse;
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return pages;
}

async function processDatabase(
  databaseId: string,
  token: string,
  depth: number
): Promise<string> {
  const rows = await fetchDatabasePages(databaseId, token);
  const rowTexts: string[] = [];

  for (const row of rows) {
    const title = pageTitle(row) || '제목 없음';
    const blocks = await fetchAllBlocks(row.id, token);
    const propertyLines = propertiesText(row.properties);
    const body = await processBlocks(blocks, token, depth + 1);
    rowTexts.push(
      [`${'#'.repeat(Math.min(depth + 2, 6))} ${title}`, propertyLines, body]
        .filter(Boolean)
        .join('\n')
    );
  }

  return rowTexts.join('\n\n');
}

async function processBlock(
  block: NotionBlock,
  token: string,
  depth: number
): Promise<string> {
  const indent = '  '.repeat(depth);
  const type = block.type;
  const content = block[type] as Record<string, unknown> | undefined;

  let text = '';

  switch (type) {
    case 'paragraph': {
      text = indent + extractRichText((content?.rich_text as RichText[]) ?? []);
      break;
    }
    case 'heading_1': {
      text = `\n# ${extractRichText((content?.rich_text as RichText[]) ?? [])}`;
      break;
    }
    case 'heading_2': {
      text = `\n## ${extractRichText((content?.rich_text as RichText[]) ?? [])}`;
      break;
    }
    case 'heading_3': {
      text = `\n### ${extractRichText((content?.rich_text as RichText[]) ?? [])}`;
      break;
    }
    case 'bulleted_list_item': {
      text = `${indent}• ${extractRichText((content?.rich_text as RichText[]) ?? [])}`;
      break;
    }
    case 'numbered_list_item': {
      text = `${indent}1. ${extractRichText((content?.rich_text as RichText[]) ?? [])}`;
      break;
    }
    case 'to_do': {
      const checked = content?.checked as boolean;
      text = `${indent}${checked ? '[x]' : '[ ]'} ${extractRichText((content?.rich_text as RichText[]) ?? [])}`;
      break;
    }
    case 'toggle': {
      text = `${indent}▶ ${extractRichText((content?.rich_text as RichText[]) ?? [])}`;
      break;
    }
    case 'quote': {
      text = `${indent}> ${extractRichText((content?.rich_text as RichText[]) ?? [])}`;
      break;
    }
    case 'callout': {
      const icon = (content?.icon as { emoji?: string })?.emoji ?? '';
      text =
        `${indent}${icon} ${extractRichText((content?.rich_text as RichText[]) ?? [])}`.trim();
      break;
    }
    case 'code': {
      const lang = (content?.language as string) ?? '';
      const code = extractRichText((content?.rich_text as RichText[]) ?? []);
      const caption = extractRichText((content?.caption as RichText[]) ?? []);
      text = `\`\`\`${lang}\n${code}\n\`\`\`${caption ? `\n${caption}` : ''}`;
      break;
    }
    case 'equation': {
      text = `$$${content?.expression as string}$$`;
      break;
    }
    case 'divider': {
      text = '---';
      break;
    }
    case 'table_row': {
      const cells = (content?.cells as RichText[][]) ?? [];
      text = indent + cells.map((cell) => extractRichText(cell)).join(' | ');
      break;
    }
    case 'image':
    case 'video':
    case 'file':
    case 'pdf': {
      const fileType = content?.type as string;
      const url =
        fileType === 'external'
          ? (content?.external as { url: string } | undefined)?.url
          : (content?.file as { url: string } | undefined)?.url;
      const caption = extractRichText((content?.caption as RichText[]) ?? []);
      text = `[${type}${caption ? `: ${caption}` : ''}${url ? ` (${url})` : ''}]`;
      break;
    }
    case 'bookmark':
    case 'embed':
    case 'link_preview': {
      const url = (content?.url as string) ?? '';
      const caption = extractRichText((content?.caption as RichText[]) ?? []);
      text = `[${type}${caption ? `: ${caption}` : ''}: ${url}]`;
      break;
    }
    case 'child_page': {
      const title = (content?.title as string) ?? '(제목 없음)';
      const childBlocks = await fetchAllBlocks(block.id, token);
      const childLines = await processBlocks(childBlocks, token, depth + 1);
      text = `\n${indent}[페이지: ${title}]\n${childLines}`;
      return text;
    }
    case 'child_database': {
      const title = (content?.title as string) ?? '(제목 없음)';
      const rows = await processDatabase(block.id, token, depth + 1);
      text = `\n${indent}[${DATABASE_LABEL}: ${title}]${rows ? `\n${rows}` : ''}`;
      return text;
    }
    case 'link_to_page': {
      const linkedId = (content?.page_id ?? content?.database_id) as
        | string
        | undefined;
      text = linkedId ? `[연결: ${linkedId}]` : '[연결된 페이지]';
      break;
    }
    case 'column_list':
    case 'column':
    case 'synced_block':
    case 'template':
    case 'table':
      break;
    default: {
      const richText = content?.rich_text as RichText[] | undefined;
      if (richText) text = indent + extractRichText(richText);
      break;
    }
  }

  if (block.has_children && !['child_page', 'child_database'].includes(type)) {
    const childBlocks = await fetchAllBlocks(block.id, token);
    const childLines = await processBlocks(childBlocks, token, depth + 1);
    if (childLines) text = text ? `${text}\n${childLines}` : childLines;
  }

  return text;
}

async function processBlocks(
  blocks: NotionBlock[],
  token: string,
  depth: number
): Promise<string> {
  const lines: string[] = [];
  for (const block of blocks) {
    const text = await processBlock(block, token, depth);
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('notion_token')?.value;
  if (!token) {
    return Response.json(
      { error: 'Notion 토큰이 필요합니다.' },
      { status: 401 }
    );
  }

  let pageId: string;
  try {
    const body = (await request.json()) as { pageId?: string };
    if (!body.pageId) {
      return Response.json({ error: 'pageId가 필요합니다.' }, { status: 400 });
    }
    pageId = body.pageId;
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: notionHeaders(token),
    });

    if (!pageRes.ok) {
      return Response.json(
        { error: '페이지를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const page = (await pageRes.json()) as NotionPageResponse;
    const title = pageTitle(page);
    const parts: string[] = [];

    if (title) parts.push(`# ${title}`);

    const pagePropertyLines = propertiesText(page.properties);
    if (pagePropertyLines) parts.push(pagePropertyLines);

    const blocks = await fetchAllBlocks(pageId, token);
    const body = await processBlocks(blocks, token, 0);
    if (body) parts.push(body);

    return Response.json({ text: parts.join('\n\n').trim() });
  } catch (error) {
    return Response.json(
      {
        error: `페이지 불러오기 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
      },
      { status: 500 }
    );
  }
}
