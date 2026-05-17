import type { Resume, ResumeSection, SectionType, SectionContent } from './types';

const NOTION_VERSION = '2022-06-28';
const SECTIONS_CAPTION = '__resume_sections__';
const MAX_RICH_TEXT_LENGTH = 2000;

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}


function splitIntoRichText(text: string): Array<{ type: 'text'; text: { content: string } }> {
  const chunks: Array<{ type: 'text'; text: { content: string } }> = [];
  for (let i = 0; i < text.length; i += MAX_RICH_TEXT_LENGTH) {
    chunks.push({ type: 'text', text: { content: text.slice(i, i + MAX_RICH_TEXT_LENGTH) } });
  }
  return chunks.length > 0 ? chunks : [{ type: 'text', text: { content: '' } }];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotionRichText {
  plain_text: string;
}

interface NotionCodeBlock {
  id: string;
  type: 'code';
  code: {
    rich_text: NotionRichText[];
    caption: NotionRichText[];
    language: string;
  };
}

interface NotionBlock {
  id: string;
  type: string;
}

interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  properties: Record<string, {
    type: string;
    title?: NotionRichText[];
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pageToResume(page: NotionPage): Resume {
  const titleProp = Object.values(page.properties).find((p) => p.type === 'title');
  const title = titleProp?.title?.map((t) => t.plain_text).join('') ?? '제목 없음';
  return {
    id: page.id,
    title,
    created_at: page.created_time,
    updated_at: page.last_edited_time,
  };
}

async function findSectionsBlock(token: string, pageId: string): Promise<NotionCodeBlock | null> {
  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
    headers: notionHeaders(token),
  });
  if (!res.ok) return null;
  const data = await res.json() as { results: NotionBlock[] };
  const block = data.results.find(
    (b): b is NotionCodeBlock =>
      b.type === 'code' &&
      'code' in b &&
      ((b as NotionCodeBlock).code.caption ?? []).some((c) => c.plain_text === SECTIONS_CAPTION)
  );
  return block ?? null;
}

async function readSections(token: string, pageId: string): Promise<ResumeSection[]> {
  const block = await findSectionsBlock(token, pageId);
  if (!block) return [];
  const json = block.code.rich_text.map((t) => t.plain_text).join('');
  try {
    return JSON.parse(json) as ResumeSection[];
  } catch {
    return [];
  }
}

function sortSectionsByOrder(sections: ResumeSection[]): ResumeSection[] {
  return [...sections].sort((a, b) => a.order_index - b.order_index);
}

async function writeSections(token: string, pageId: string, sections: ResumeSection[]): Promise<void> {
  const block = await findSectionsBlock(token, pageId);
  const json = JSON.stringify(sections);
  const richText = splitIntoRichText(json);

  if (block) {
    const res = await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
      method: 'PATCH',
      headers: notionHeaders(token),
      body: JSON.stringify({
        code: {
          rich_text: richText,
          language: 'json',
          caption: [{ type: 'text', text: { content: SECTIONS_CAPTION } }],
        },
      }),
    });
    if (!res.ok) {
      const err = await res.json() as { message?: string };
      throw new Error(err.message ?? '섹션 저장 실패');
    }
  } else {
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: notionHeaders(token),
      body: JSON.stringify({
        children: [{
          object: 'block',
          type: 'code',
          code: {
            rich_text: richText,
            language: 'json',
            caption: [{ type: 'text', text: { content: SECTIONS_CAPTION } }],
          },
        }],
      }),
    });
    if (!res.ok) {
      const err = await res.json() as { message?: string };
      throw new Error(err.message ?? '섹션 블록 생성 실패');
    }
  }
}

// ── Resumes ───────────────────────────────────────────────────────────────────

export async function getResumes(token: string, databaseId: string): Promise<Resume[]> {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({
      page_size: 100,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    }),
  });
  if (!res.ok) {
    const err = await res.json() as { message?: string };
    throw new Error(err.message ?? 'Notion 데이터베이스 조회 실패');
  }
  const data = await res.json() as { results: NotionPage[] };
  return data.results.filter((p) => !p.archived).map(pageToResume);
}

export async function createResume(token: string, databaseId: string, title = '새 이력서'): Promise<Resume> {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        title: { title: [{ type: 'text', text: { content: title } }] },
      },
      children: [{
        object: 'block',
        type: 'code',
        code: {
          rich_text: [{ type: 'text', text: { content: '[]' } }],
          language: 'json',
          caption: [{ type: 'text', text: { content: SECTIONS_CAPTION } }],
        },
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.json() as { message?: string };
    throw new Error(err.message ?? 'Notion 페이지 생성 실패');
  }
  const page = await res.json() as NotionPage;
  return pageToResume(page);
}

export async function updateResumeTitle(token: string, id: string, title: string): Promise<void> {
  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH',
    headers: notionHeaders(token),
    body: JSON.stringify({
      properties: {
        title: { title: [{ type: 'text', text: { content: title } }] },
      },
    }),
  });
  if (!res.ok) throw new Error('제목 업데이트 실패');
}

export async function deleteResume(token: string, id: string): Promise<void> {
  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: 'PATCH',
    headers: notionHeaders(token),
    body: JSON.stringify({ archived: true }),
  });
  if (!res.ok) throw new Error('이력서 삭제 실패');
}

// ── Sections ──────────────────────────────────────────────────────────────────

export async function getSections(token: string, resumeId: string): Promise<ResumeSection[]> {
  return sortSectionsByOrder(await readSections(token, resumeId));
}

export async function createSection(
  token: string,
  resumeId: string,
  type: SectionType,
  content: SectionContent,
  orderIndex: number,
  layout = 'layout1',
): Promise<ResumeSection> {
  const sections = await readSections(token, resumeId);
  const now = new Date().toISOString();
  const newSection: ResumeSection = {
    id: crypto.randomUUID(),
    resume_id: resumeId,
    type,
    layout,
    content,
    order_index: orderIndex,
    created_at: now,
    updated_at: now,
  };
  await writeSections(token, resumeId, [...sections, newSection]);
  return newSection;
}

export async function updateSectionLayout(token: string, resumeId: string, id: string, layout: string): Promise<void> {
  const sections = await readSections(token, resumeId);
  await writeSections(
    token,
    resumeId,
    sections.map((s) => s.id === id ? { ...s, layout, updated_at: new Date().toISOString() } : s),
  );
}

export async function updateSectionContent(
  token: string,
  resumeId: string,
  id: string,
  content: SectionContent,
): Promise<void> {
  const sections = await readSections(token, resumeId);
  await writeSections(
    token,
    resumeId,
    sections.map((s) => s.id === id ? { ...s, content, updated_at: new Date().toISOString() } : s),
  );
}

export async function updateSectionOrder(token: string, resumeId: string, id: string, orderIndex: number): Promise<void> {
  const sections = await readSections(token, resumeId);
  await writeSections(
    token,
    resumeId,
    sortSectionsByOrder(
      sections.map((s) => s.id === id ? { ...s, order_index: orderIndex, updated_at: new Date().toISOString() } : s),
    ),
  );
}

export async function deleteSection(token: string, resumeId: string, id: string): Promise<void> {
  const sections = await readSections(token, resumeId);
  await writeSections(token, resumeId, sections.filter((s) => s.id !== id));
}
