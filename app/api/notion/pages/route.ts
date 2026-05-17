import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const NOTION_VERSION = '2022-06-28';

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

interface DatabasePage {
  id: string;
  object: string;
  properties: Record<string, NotionProperty>;
}

interface DatabaseQueryResponse {
  results: DatabasePage[];
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
  relation?: unknown[];
  formula?: { type: string; string?: string; number?: number; boolean?: boolean };
}

interface NotionPageResponse {
  id: string;
  properties: Record<string, NotionProperty>;
}

interface NotionDatabaseResponse {
  id: string;
  title: RichText[];
  properties: Record<string, { name: string; type: string }>;
}

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function fetchAllBlocks(blockId: string, token: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);

    const res = await fetch(url.toString(), { headers: notionHeaders(token) });
    if (!res.ok) break;

    const data = await res.json() as NotionBlocksResponse;
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return blocks;
}

async function fetchPageTitle(pageId: string, token: string): Promise<string> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: notionHeaders(token),
  });
  if (!res.ok) return '';

  const page = await res.json() as NotionPageResponse;
  const titleProp = Object.values(page.properties).find((p) => p.type === 'title');
  return titleProp?.title?.map((t) => t.plain_text).join('') ?? '';
}

function extractRichText(richText: RichText[]): string {
  return richText.map((t) => t.plain_text).join('');
}

function extractPropertyValue(prop: NotionProperty): string {
  switch (prop.type) {
    case 'title':
      return extractRichText(prop.title ?? []);
    case 'rich_text':
      return extractRichText(prop.rich_text ?? []);
    case 'number':
      return prop.number !== null && prop.number !== undefined ? String(prop.number) : '';
    case 'select':
      return prop.select?.name ?? '';
    case 'multi_select':
      return (prop.multi_select ?? []).map((s) => s.name).join(', ');
    case 'status':
      return prop.status?.name ?? '';
    case 'date': {
      if (!prop.date) return '';
      return prop.date.end ? `${prop.date.start} ~ ${prop.date.end}` : prop.date.start;
    }
    case 'checkbox':
      return prop.checkbox ? '✓' : '✗';
    case 'url':
      return prop.url ?? '';
    case 'email':
      return prop.email ?? '';
    case 'phone_number':
      return prop.phone_number ?? '';
    case 'people':
      return (prop.people ?? []).map((p) => p.name ?? '').filter(Boolean).join(', ');
    case 'relation':
      return (prop.relation ?? []).length > 0 ? `[관계 ${(prop.relation ?? []).length}개]` : '';
    case 'formula': {
      const f = prop.formula;
      if (!f) return '';
      if (f.type === 'string') return f.string ?? '';
      if (f.type === 'number') return f.number !== undefined ? String(f.number) : '';
      if (f.type === 'boolean') return f.boolean ? '✓' : '✗';
      return '';
    }
    default:
      return '';
  }
}

async function queryDatabase(databaseId: string, token: string): Promise<string> {
  // Fetch schema for property order
  const schemaRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers: notionHeaders(token),
  });

  let propOrder: string[] = [];
  if (schemaRes.ok) {
    const schema = await schemaRes.json() as NotionDatabaseResponse;
    propOrder = Object.keys(schema.properties);
  }

  const rows: string[] = [];
  let cursor: string | null = null;

  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    if (!res.ok) break;

    const data = await res.json() as DatabaseQueryResponse;

    for (const page of data.results) {
      const orderedProps = propOrder.length > 0
        ? propOrder.map((key) => page.properties[key]).filter(Boolean)
        : Object.values(page.properties);

      const parts = orderedProps
        .map((prop) => extractPropertyValue(prop))
        .filter(Boolean);

      if (parts.length > 0) rows.push(parts.join(' | '));
    }

    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return rows.join('\n');
}

async function processBlock(block: NotionBlock, token: string, depth: number): Promise<string> {
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
      text = `${indent}${icon} ${extractRichText((content?.rich_text as RichText[]) ?? [])}`.trim();
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
      const url = fileType === 'external'
        ? (content?.external as { url: string } | undefined)?.url
        : (content?.file as { url: string } | undefined)?.url;
      const caption = extractRichText((content?.caption as RichText[]) ?? []);
      text = `[${type}${caption ? `: ${caption}` : ''}${url ? ` (${url})` : ''}]`;
      break;
    }
    case 'bookmark':
    case 'embed':
    case 'link_preview': {
      const url = content?.url as string ?? '';
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
      const rows = await queryDatabase(block.id, token);
      text = `\n${indent}[데이터베이스: ${title}]\n${rows}`;
      return text;
    }
    case 'link_to_page': {
      const linkedId = (content?.page_id ?? content?.database_id) as string | undefined;
      text = linkedId ? `[연결: ${linkedId}]` : '[연결된 페이지]';
      break;
    }
    case 'column_list':
    case 'column':
    case 'synced_block':
    case 'template':
    case 'table':
      // container — handled via has_children below
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

async function processBlocks(blocks: NotionBlock[], token: string, depth: number): Promise<string> {
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
    return Response.json({ error: 'Notion 토큰이 필요합니다.' }, { status: 401 });
  }

  let pageId: string;
  try {
    const body = await request.json() as { pageId?: string };
    if (!body.pageId) {
      return Response.json({ error: 'pageId가 필요합니다.' }, { status: 400 });
    }
    pageId = body.pageId;
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    // Determine if this is a page or a database
    const [pageRes, dbRes] = await Promise.all([
      fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: notionHeaders(token) }),
      fetch(`https://api.notion.com/v1/databases/${pageId}`, { headers: notionHeaders(token) }),
    ]);

    if (!pageRes.ok && !dbRes.ok) {
      return Response.json({ error: '페이지 또는 데이터베이스를 찾을 수 없습니다.' }, { status: 404 });
    }

    let text = '';

    if (pageRes.ok) {
      const page = await pageRes.json() as NotionPageResponse;
      const titleProp = Object.values(page.properties).find((p) => p.type === 'title');
      const title = titleProp?.title?.map((t) => t.plain_text).join('') ?? '';
      if (title) text += `# ${title}\n\n`;

      const blocks = await fetchAllBlocks(pageId, token);
      const body = await processBlocks(blocks, token, 0);
      text += body;
    } else if (dbRes.ok) {
      const db = await dbRes.json() as NotionDatabaseResponse;
      const title = db.title?.map((t) => t.plain_text).join('') ?? '데이터베이스';
      text = `# ${title}\n\n`;
      text += await queryDatabase(pageId, token);
    }

    return Response.json({ text: text.trim() });
  } catch (err) {
    return Response.json(
      { error: `페이지 불러오기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}` },
      { status: 500 }
    );
  }
}
