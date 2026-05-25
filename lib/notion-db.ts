import type { AuthenticatedUser } from '@/lib/auth';
import {
  compactSectionContent,
  normalizeRichTextValue,
  normalizeSectionContent,
} from '@/lib/rich-text';
import { requireServerNotionConfig } from '@/lib/server-user-tokens';
import type {
  Note,
  Resume,
  ResumeSection,
  RichTextDocument,
  SectionContent,
  SectionType,
} from '@/lib/types';

const NOTION_VERSION = '2022-06-28';
const JSON_CHUNK_SIZE = 1800;

type EntityKind = 'resume' | 'section' | 'note' | 'link';

interface NotionProperty {
  id?: string;
  type: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  select?: { name: string } | null;
  number?: number | null;
  date?: { start: string } | null;
}

interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, NotionProperty>;
}

interface NotionQueryResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionBlock {
  id: string;
  type: string;
  code?: {
    rich_text?: Array<{ plain_text: string }>;
  };
}

interface NotionBlocksResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

interface DatabaseInfo {
  titlePropertyName: string;
}

interface NotionEntityInput {
  kind: EntityKind;
  id: string;
  title: string;
  resumeId?: string;
  sectionType?: SectionType;
  layout?: string;
  orderIndex?: number;
  updatedAt?: string;
  content?: unknown;
}

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function notionFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { token } = await requireServerNotionConfig();
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    ...init,
    headers: {
      ...notionHeaders(token),
      ...init.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message ?? 'Notion 요청 실패');
  }

  return (await response.json()) as T;
}

async function getDatabaseInfo(): Promise<DatabaseInfo> {
  const { databaseId } = await requireServerNotionConfig();
  const database = await notionFetch<{
    properties: Record<string, { type: string }>;
  }>(`databases/${databaseId}`);
  const titlePropertyName = Object.entries(database.properties).find(
    ([, property]) => property.type === 'title'
  )?.[0];

  if (!titlePropertyName) {
    throw new Error('Notion 데이터베이스에 제목 속성이 필요합니다.');
  }

  return { titlePropertyName };
}

function richText(value: string) {
  return [{ type: 'text', text: { content: value.slice(0, 2000) } }];
}

function titleText(value: string) {
  return [{ type: 'text', text: { content: value.slice(0, 2000) } }];
}

function jsonBlocks(content: unknown) {
  if (content === undefined) return [];

  const json = JSON.stringify(content);
  const chunks: string[] = [];
  for (let index = 0; index < json.length; index += JSON_CHUNK_SIZE) {
    chunks.push(json.slice(index, index + JSON_CHUNK_SIZE));
  }

  return chunks.map((chunk) => ({
    object: 'block',
    type: 'code',
    code: {
      language: 'json',
      rich_text: richText(chunk),
    },
  }));
}

function titleFromPage(page: NotionPage, titlePropertyName: string): string {
  return (
    page.properties[titlePropertyName]?.title
      ?.map((item) => item.plain_text)
      .join('') || '제목 없음'
  );
}

function richTextValue(page: NotionPage, propertyName: string): string {
  return (
    page.properties[propertyName]?.rich_text
      ?.map((item) => item.plain_text)
      .join('') ?? ''
  );
}

function selectValue(page: NotionPage, propertyName: string): string {
  return page.properties[propertyName]?.select?.name ?? '';
}

function numberValue(page: NotionPage, propertyName: string): number {
  return page.properties[propertyName]?.number ?? 0;
}

function entityProperties(input: NotionEntityInput, titlePropertyName: string) {
  return {
    [titlePropertyName]: { title: titleText(input.title) },
    Kind: { select: { name: input.kind } },
    EntityId: { rich_text: richText(input.id) },
    ResumeId: { rich_text: richText(input.resumeId ?? '') },
    SectionType: input.sectionType
      ? { select: { name: input.sectionType } }
      : { select: null },
    Layout: { rich_text: richText(input.layout ?? '') },
    Order:
      input.orderIndex === undefined ? { number: null } : { number: input.orderIndex },
    UpdatedAt: { date: { start: input.updatedAt ?? new Date().toISOString() } },
  };
}

async function queryEntities(kind: EntityKind): Promise<NotionPage[]> {
  const { databaseId } = await requireServerNotionConfig();
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  do {
    const response: NotionQueryResponse = await notionFetch<NotionQueryResponse>(
      `databases/${databaseId}/query`,
      {
        method: 'POST',
        body: JSON.stringify({
          filter: { property: 'Kind', select: { equals: kind } },
          start_cursor: cursor ?? undefined,
          page_size: 100,
        }),
      }
    );
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return pages;
}

async function findEntity(kind: EntityKind, id: string): Promise<NotionPage | null> {
  const { databaseId } = await requireServerNotionConfig();
  const response: NotionQueryResponse = await notionFetch<NotionQueryResponse>(
    `databases/${databaseId}/query`,
    {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          and: [
            { property: 'Kind', select: { equals: kind } },
            { property: 'EntityId', rich_text: { equals: id } },
          ],
        },
        page_size: 1,
      }),
    }
  );
  return response.results[0] ?? null;
}

async function createEntity(input: NotionEntityInput): Promise<NotionPage> {
  const { databaseId } = await requireServerNotionConfig();
  const { titlePropertyName } = await getDatabaseInfo();

  return notionFetch<NotionPage>('pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: entityProperties(input, titlePropertyName),
      children: jsonBlocks(input.content),
    }),
  });
}

async function updateEntity(
  pageId: string,
  input: NotionEntityInput
): Promise<void> {
  const { titlePropertyName } = await getDatabaseInfo();
  await notionFetch(`pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: entityProperties(input, titlePropertyName),
    }),
  });

  if (input.content !== undefined) {
    await replacePageContent(pageId, input.content);
  }
}

async function archiveEntity(pageId: string): Promise<void> {
  await notionFetch(`pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true }),
  });
}

async function getPageBlocks(pageId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;

  do {
    const response: NotionBlocksResponse =
      await notionFetch<NotionBlocksResponse>(
      `blocks/${pageId}/children?page_size=100${
        cursor ? `&start_cursor=${cursor}` : ''
      }`
    );
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return blocks;
}

async function readJsonContent<T>(pageId: string, fallback: T): Promise<T> {
  const blocks = await getPageBlocks(pageId);
  const json = blocks
    .filter((block) => block.type === 'code')
    .map((block) =>
      block.code?.rich_text?.map((item) => item.plain_text).join('')
    )
    .join('');

  if (!json) return fallback;

  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

async function replacePageContent(pageId: string, content: unknown): Promise<void> {
  const blocks = await getPageBlocks(pageId);
  await Promise.all(
    blocks.map((block) =>
      notionFetch(`blocks/${block.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      })
    )
  );

  const children = jsonBlocks(content);
  if (children.length === 0) return;

  await notionFetch(`blocks/${pageId}/children`, {
    method: 'PATCH',
    body: JSON.stringify({ children }),
  });
}

function normalizeResumePage(
  page: NotionPage,
  titlePropertyName: string
): Resume {
  return {
    id: richTextValue(page, 'EntityId') || page.id,
    title: titleFromPage(page, titlePropertyName),
    created_at: page.created_time,
    updated_at: page.properties.UpdatedAt?.date?.start ?? page.last_edited_time,
  };
}

async function normalizeSectionPage(page: NotionPage): Promise<ResumeSection> {
  const type = selectValue(page, 'SectionType') as SectionType;
  const content = await readJsonContent<SectionContent>(
    page.id,
    normalizeSectionContent(type, {})
  );

  return {
    id: richTextValue(page, 'EntityId') || page.id,
    resume_id: richTextValue(page, 'ResumeId'),
    type,
    layout: richTextValue(page, 'Layout') || 'layout1',
    content: normalizeSectionContent(type, content),
    order_index: numberValue(page, 'Order'),
    created_at: page.created_time,
    updated_at: page.properties.UpdatedAt?.date?.start ?? page.last_edited_time,
  };
}

async function normalizeNotePage(
  page: NotionPage,
  titlePropertyName: string
): Promise<Note> {
  const content = await readJsonContent<RichTextDocument>(
    page.id,
    normalizeRichTextValue('')
  );

  return {
    id: richTextValue(page, 'EntityId') || page.id,
    title: titleFromPage(page, titlePropertyName),
    content: normalizeRichTextValue(content),
    created_at: page.created_time,
    updated_at: page.properties.UpdatedAt?.date?.start ?? page.last_edited_time,
  };
}

export async function getResumes(auth: AuthenticatedUser): Promise<Resume[]> {
  void auth;
  const { titlePropertyName } = await getDatabaseInfo();
  const pages = await queryEntities('resume');
  return pages
    .map((page) => normalizeResumePage(page, titlePropertyName))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createResume(
  _auth: AuthenticatedUser,
  title = '새 이력서'
): Promise<Resume> {
  const now = new Date().toISOString();
  const page = await createEntity({
    kind: 'resume',
    id: crypto.randomUUID(),
    title,
    updatedAt: now,
  });
  const { titlePropertyName } = await getDatabaseInfo();
  return normalizeResumePage(page, titlePropertyName);
}

export async function updateResumeTitle(
  _auth: AuthenticatedUser,
  id: string,
  title: string
): Promise<void> {
  const page = await findEntity('resume', id);
  if (!page) throw new Error('이력서를 찾을 수 없습니다.');
  await updateEntity(page.id, {
    kind: 'resume',
    id,
    title,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteResume(
  _auth: AuthenticatedUser,
  id: string
): Promise<void> {
  const page = await findEntity('resume', id);
  if (page) await archiveEntity(page.id);

  const sections = await getSections(_auth, id);
  await Promise.all(
    sections.map(async (section) => {
      const sectionPage = await findEntity('section', section.id);
      if (sectionPage) await archiveEntity(sectionPage.id);
    })
  );
}

export async function getSections(
  _auth: AuthenticatedUser,
  resumeId: string
): Promise<ResumeSection[]> {
  const pages = (await queryEntities('section')).filter(
    (page) => richTextValue(page, 'ResumeId') === resumeId
  );
  const sections = await Promise.all(pages.map(normalizeSectionPage));
  return sections.sort((a, b) => a.order_index - b.order_index);
}

export async function createSection(
  _auth: AuthenticatedUser,
  resumeId: string,
  type: SectionType,
  content: SectionContent,
  orderIndex: number,
  layout = 'layout1'
): Promise<ResumeSection> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const page = await createEntity({
    kind: 'section',
    id,
    title: `${type} ${orderIndex + 1}`,
    resumeId,
    sectionType: type,
    layout,
    orderIndex,
    updatedAt: now,
    content: compactSectionContent(type, content),
  });
  return normalizeSectionPage(page);
}

export async function updateSectionLayout(
  _auth: AuthenticatedUser,
  resumeId: string,
  id: string,
  layout: string
): Promise<void> {
  const page = await findEntity('section', id);
  if (!page) throw new Error('섹션을 찾을 수 없습니다.');
  await updateEntity(page.id, {
    kind: 'section',
    id,
    title: titleFromPage(page, (await getDatabaseInfo()).titlePropertyName),
    resumeId,
    sectionType: selectValue(page, 'SectionType') as SectionType,
    layout,
    orderIndex: numberValue(page, 'Order'),
  });
}

export async function updateSectionContent(
  _auth: AuthenticatedUser,
  resumeId: string,
  id: string,
  content: SectionContent
): Promise<void> {
  const page = await findEntity('section', id);
  if (!page) throw new Error('섹션을 찾을 수 없습니다.');
  const type = selectValue(page, 'SectionType') as SectionType;
  await updateEntity(page.id, {
    kind: 'section',
    id,
    title: titleFromPage(page, (await getDatabaseInfo()).titlePropertyName),
    resumeId,
    sectionType: type,
    layout: richTextValue(page, 'Layout') || 'layout1',
    orderIndex: numberValue(page, 'Order'),
    content: compactSectionContent(type, content),
  });
}

export async function updateSectionOrder(
  _auth: AuthenticatedUser,
  resumeId: string,
  id: string,
  orderIndex: number
): Promise<void> {
  const page = await findEntity('section', id);
  if (!page) throw new Error('섹션을 찾을 수 없습니다.');
  await updateEntity(page.id, {
    kind: 'section',
    id,
    title: titleFromPage(page, (await getDatabaseInfo()).titlePropertyName),
    resumeId,
    sectionType: selectValue(page, 'SectionType') as SectionType,
    layout: richTextValue(page, 'Layout') || 'layout1',
    orderIndex,
  });
}

export async function deleteSection(
  _auth: AuthenticatedUser,
  _resumeId: string,
  id: string
): Promise<void> {
  const page = await findEntity('section', id);
  if (page) await archiveEntity(page.id);
}

export async function getNotes(auth: AuthenticatedUser): Promise<Note[]> {
  void auth;
  const { titlePropertyName } = await getDatabaseInfo();
  const pages = await queryEntities('note');
  const notes = await Promise.all(
    pages.map((page) => normalizeNotePage(page, titlePropertyName))
  );
  return notes.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function createNote(
  _auth: AuthenticatedUser,
  title = '새 메모',
  content?: RichTextDocument
): Promise<Note> {
  const now = new Date().toISOString();
  const page = await createEntity({
    kind: 'note',
    id: crypto.randomUUID(),
    title,
    updatedAt: now,
    content: normalizeRichTextValue(content),
  });
  return normalizeNotePage(page, (await getDatabaseInfo()).titlePropertyName);
}

export async function updateNote(
  _auth: AuthenticatedUser,
  id: string,
  payload: { title?: string; content?: RichTextDocument }
): Promise<void> {
  const page = await findEntity('note', id);
  if (!page) throw new Error('메모를 찾을 수 없습니다.');
  const titlePropertyName = (await getDatabaseInfo()).titlePropertyName;
  await updateEntity(page.id, {
    kind: 'note',
    id,
    title: payload.title ?? titleFromPage(page, titlePropertyName),
    updatedAt: new Date().toISOString(),
    content:
      payload.content === undefined
        ? await readJsonContent(page.id, normalizeRichTextValue(''))
        : normalizeRichTextValue(payload.content),
  });
}

export async function deleteNote(
  _auth: AuthenticatedUser,
  id: string
): Promise<void> {
  const page = await findEntity('note', id);
  if (page) await archiveEntity(page.id);
}

export async function getResumeNoteIds(
  _auth: AuthenticatedUser,
  resumeId: string
): Promise<string[]> {
  const links = await queryEntities('link');
  return links
    .filter((page) => richTextValue(page, 'ResumeId') === resumeId)
    .map((page) => richTextValue(page, 'EntityId').split(':')[1])
    .filter(Boolean);
}

export async function linkResumeNote(
  _auth: AuthenticatedUser,
  resumeId: string,
  noteId: string
): Promise<void> {
  const id = `${resumeId}:${noteId}`;
  const existing = await findEntity('link', id);
  if (existing) return;
  await createEntity({
    kind: 'link',
    id,
    title: id,
    resumeId,
  });
}

export async function unlinkResumeNote(
  _auth: AuthenticatedUser,
  _resumeId: string,
  noteId: string
): Promise<void> {
  const links = await queryEntities('link');
  const page = links.find((link) =>
    richTextValue(link, 'EntityId').endsWith(`:${noteId}`)
  );
  if (page) await archiveEntity(page.id);
}

export async function replaceResumeWithSectionsByTitle(
  auth: AuthenticatedUser,
  resume: Resume,
  sections: ResumeSection[]
): Promise<void> {
  const existing = (await getResumes(auth)).find(
    (item) => item.title === resume.title
  );
  const target = existing ?? (await createResume(auth, resume.title));
  await updateResumeTitle(auth, target.id, resume.title);
  const oldSections = await getSections(auth, target.id);
  await Promise.all(
    oldSections.map((section) => deleteSection(auth, target.id, section.id))
  );
  for (const [index, section] of sections.entries()) {
    await createSection(
      auth,
      target.id,
      section.type,
      section.content,
      index,
      section.layout
    );
  }
}
