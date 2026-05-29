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
const RESUME_PAGE_CONTENT_KIND = 'resume-content';
const RESUME_SECTIONS_DATABASE_TITLE = 'Resume Sections';
const LEGACY_RESUME_SECTIONS_DATABASE_TITLE = '새 데이터베이스';
const SECTION_TYPES = [
  'header',
  'summary',
  'text',
  'experience',
  'education',
  'skills',
  'projects',
] as const satisfies readonly SectionType[];

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
  child_database?: {
    title: string;
  };
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

interface NotionSectionInput {
  id: string;
  resumeId: string;
  sectionType: SectionType;
  layout: string;
  orderIndex: number;
  updatedAt?: string;
  content?: unknown;
}

interface SectionPageTarget {
  page: NotionPage;
  storage: 'nested' | 'legacy';
  titlePropertyName: string;
}

interface StoredResumeSection {
  id: string;
  resume_id: string;
  type: SectionType;
  layout: string;
  content: unknown;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface ResumePageContent {
  kind: typeof RESUME_PAGE_CONTENT_KIND;
  version: 1;
  sections: StoredResumeSection[];
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

async function getDatabaseInfoById(databaseId: string): Promise<DatabaseInfo> {
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

async function getDatabaseInfo(): Promise<DatabaseInfo> {
  const { databaseId } = await requireServerNotionConfig();
  return getDatabaseInfoById(databaseId);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecordString(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : '';
}

function readRecordNumber(value: Record<string, unknown>, key: string): number {
  const candidate = value[key];
  return typeof candidate === 'number' ? candidate : 0;
}

function isSectionType(value: unknown): value is SectionType {
  return (
    typeof value === 'string' &&
    SECTION_TYPES.includes(value as (typeof SECTION_TYPES)[number])
  );
}

function emptyResumePageContent(): ResumePageContent {
  return {
    kind: RESUME_PAGE_CONTENT_KIND,
    version: 1,
    sections: [],
  };
}

function normalizeStoredSection(value: unknown): StoredResumeSection | null {
  if (!isRecord(value) || !isSectionType(value.type)) return null;

  const now = new Date().toISOString();
  const type = value.type;
  const content = normalizeSectionContent(type, value.content);

  return {
    id: readRecordString(value, 'id') || crypto.randomUUID(),
    resume_id: readRecordString(value, 'resume_id'),
    type,
    layout: readRecordString(value, 'layout') || 'layout1',
    content: compactSectionContent(type, content),
    order_index: readRecordNumber(value, 'order_index'),
    created_at: readRecordString(value, 'created_at') || now,
    updated_at: readRecordString(value, 'updated_at') || now,
  };
}

function normalizeResumePageContent(value: unknown): ResumePageContent {
  if (!isRecord(value) || !Array.isArray(value.sections)) {
    return emptyResumePageContent();
  }

  return {
    kind: RESUME_PAGE_CONTENT_KIND,
    version: 1,
    sections: value.sections
      .map(normalizeStoredSection)
      .filter((section): section is StoredResumeSection => section !== null),
  };
}

function toResumeSection(section: StoredResumeSection): ResumeSection {
  return {
    ...section,
    content: normalizeSectionContent(section.type, section.content),
  };
}

async function readResumePageContent(
  pageId: string
): Promise<ResumePageContent> {
  const content = await readJsonContent<unknown>(pageId, null);
  return normalizeResumePageContent(content);
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
      input.orderIndex === undefined
        ? { number: null }
        : { number: input.orderIndex },
    UpdatedAt: { date: { start: input.updatedAt ?? new Date().toISOString() } },
  };
}

function sectionTitle(input: NotionSectionInput): string {
  return `${input.sectionType} ${input.orderIndex + 1}`;
}

function sectionProperties(
  input: NotionSectionInput,
  titlePropertyName: string
) {
  return {
    [titlePropertyName]: { title: titleText(sectionTitle(input)) },
  };
}

function sectionRecordContent(
  input: NotionSectionInput,
  existing?: StoredResumeSection | null
): StoredResumeSection {
  const now = input.updatedAt ?? new Date().toISOString();
  return {
    id: input.id,
    resume_id: input.resumeId,
    type: input.sectionType,
    layout: input.layout,
    content:
      input.content === undefined
        ? (existing?.content ??
          compactSectionContent(
            input.sectionType,
            normalizeSectionContent(input.sectionType, {})
          ))
        : input.content,
    order_index: input.orderIndex,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

function parseSectionTitle(value: string): {
  sectionType: SectionType;
  orderIndex: number;
} | null {
  const [type, order] = value.trim().split(/\s+/);
  if (!isSectionType(type)) return null;

  const orderNumber = Number(order);
  return {
    sectionType: type,
    orderIndex: Number.isFinite(orderNumber) ? Math.max(orderNumber - 1, 0) : 0,
  };
}

function isUnsupportedKindSelectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('not found for property "Kind"');
}

async function queryEntities(kind: EntityKind): Promise<NotionPage[]> {
  const { databaseId } = await requireServerNotionConfig();
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  try {
    do {
      const response: NotionQueryResponse =
        await notionFetch<NotionQueryResponse>(`databases/${databaseId}/query`, {
          method: 'POST',
          body: JSON.stringify({
            filter: { property: 'Kind', select: { equals: kind } },
            start_cursor: cursor ?? undefined,
            page_size: 100,
          }),
        });
      pages.push(...response.results);
      cursor = response.has_more ? response.next_cursor : null;
    } while (cursor);
  } catch (error) {
    if (isUnsupportedKindSelectError(error)) return [];
    throw error;
  }

  return pages;
}

async function queryDatabasePages(databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  do {
    const response: NotionQueryResponse =
      await notionFetch<NotionQueryResponse>(`databases/${databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify({
          start_cursor: cursor ?? undefined,
          page_size: 100,
        }),
      });
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return pages;
}

async function findEntity(
  kind: EntityKind,
  id: string
): Promise<NotionPage | null> {
  const { databaseId } = await requireServerNotionConfig();

  try {
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
  } catch (error) {
    if (isUnsupportedKindSelectError(error)) return null;
    throw error;
  }
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

async function createResumeSectionsDatabase(
  resumePageId: string
): Promise<DatabaseInfo & { databaseId: string }> {
  const database = await notionFetch<{
    id: string;
    properties: Record<string, { type: string }>;
  }>('databases', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: resumePageId },
      title: richText(RESUME_SECTIONS_DATABASE_TITLE),
      properties: {
        이름: { title: {} },
      },
    }),
  });
  const titlePropertyName =
    Object.entries(database.properties).find(
      ([, property]) => property.type === 'title'
    )?.[0] ?? 'Name';

  return { databaseId: database.id, titlePropertyName };
}

async function findResumeSectionsDatabase(
  resumePageId: string
): Promise<(DatabaseInfo & { databaseId: string }) | null> {
  const blocks = await getPageBlocks(resumePageId);
  const childDatabaseBlocks = blocks.filter(
    (block) => block.type === 'child_database'
  );
  const databaseBlock = childDatabaseBlocks.find(
    (block) =>
      block.child_database?.title === RESUME_SECTIONS_DATABASE_TITLE ||
      block.child_database?.title === LEGACY_RESUME_SECTIONS_DATABASE_TITLE
  );

  if (!databaseBlock) return null;

  return {
    databaseId: databaseBlock.id,
    ...(await getDatabaseInfoById(databaseBlock.id)),
  };
}

async function ensureResumeSectionsDatabase(
  resumePageId: string
): Promise<DatabaseInfo & { databaseId: string }> {
  return (
    (await findResumeSectionsDatabase(resumePageId)) ??
    createResumeSectionsDatabase(resumePageId)
  );
}

async function createSectionPage(
  databaseId: string,
  titlePropertyName: string,
  input: NotionSectionInput
): Promise<NotionPage> {
  return notionFetch<NotionPage>('pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: sectionProperties(input, titlePropertyName),
      children: jsonBlocks(sectionRecordContent(input)),
    }),
  });
}

async function updateSectionPage(
  pageId: string,
  titlePropertyName: string,
  input: NotionSectionInput
): Promise<void> {
  const existing = normalizeStoredSection(
    await readJsonContent<unknown>(pageId, null)
  );
  await notionFetch(`pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: sectionProperties(input, titlePropertyName),
    }),
  });

  await replacePageContent(pageId, sectionRecordContent(input, existing));
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
    try {
      const unescapedJson = JSON.parse(`"${json}"`) as string;
      return JSON.parse(unescapedJson) as T;
    } catch {
      return fallback;
    }
  }
}

async function replacePageContent(
  pageId: string,
  content: unknown
): Promise<void> {
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

async function archivePageJsonContent(pageId: string): Promise<void> {
  const blocks = await getPageBlocks(pageId);
  await Promise.all(
    blocks
      .filter((block) => block.type === 'code')
      .map((block) =>
        notionFetch(`blocks/${block.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ archived: true }),
        })
      )
  );
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

async function getLegacySectionsByResumeId(
  resumeId: string,
  resumePage: NotionPage | null
): Promise<ResumeSection[]> {
  if (resumePage) {
    const content = await readResumePageContent(resumePage.id);
    if (content.sections.length > 0) {
      return content.sections
        .map((section) => toResumeSection({ ...section, resume_id: resumeId }))
        .sort((a, b) => a.order_index - b.order_index);
    }
  }

  const pages = (await queryEntities('section')).filter(
    (page) => richTextValue(page, 'ResumeId') === resumeId
  );
  const sections = await Promise.all(pages.map(normalizeSectionPage));
  return sections.sort((a, b) => a.order_index - b.order_index);
}

async function normalizeNestedSectionPage(
  page: NotionPage,
  resumeId: string,
  titlePropertyName: string
): Promise<ResumeSection | null> {
  const content = await readJsonContent<unknown>(page.id, null);
  const storedSection = normalizeStoredSection(content);
  if (storedSection) {
    return toResumeSection({
      ...storedSection,
      resume_id: storedSection.resume_id || resumeId,
    });
  }

  const parsed = parseSectionTitle(titleFromPage(page, titlePropertyName));
  if (!parsed) return null;

  const now = new Date().toISOString();
  return {
    id: page.id,
    resume_id: resumeId,
    type: parsed.sectionType,
    layout: 'layout1',
    content: normalizeSectionContent(parsed.sectionType, {}),
    order_index: parsed.orderIndex,
    created_at: page.created_time || now,
    updated_at: page.last_edited_time || now,
  };
}

async function getNestedSectionsByResumePage(
  resumePageId: string,
  resumeId: string
): Promise<ResumeSection[] | null> {
  const database = await findResumeSectionsDatabase(resumePageId);
  if (!database) return null;

  const pages = await queryDatabasePages(database.databaseId);
  const sections = await Promise.all(
    pages.map((page) =>
      normalizeNestedSectionPage(page, resumeId, database.titlePropertyName)
    )
  );
  return sections
    .filter((section): section is ResumeSection => section !== null)
    .sort((a, b) => a.order_index - b.order_index);
}

async function migrateLegacySectionsToNestedDatabase(
  resumeId: string,
  resumePage: NotionPage,
  database: DatabaseInfo & { databaseId: string }
): Promise<void> {
  const existingPages = await queryDatabasePages(database.databaseId);
  if (existingPages.length > 0) return;

  const legacySections = await getLegacySectionsByResumeId(
    resumeId,
    resumePage
  );
  await Promise.all(
    legacySections.map((section) =>
      createSectionPage(database.databaseId, database.titlePropertyName, {
        id: section.id,
        resumeId,
        sectionType: section.type,
        layout: section.layout,
        orderIndex: section.order_index,
        updatedAt: section.updated_at,
        content: compactSectionContent(section.type, section.content),
      })
    )
  );
  await archivePageJsonContent(resumePage.id);

  const legacyPages = (await queryEntities('section')).filter(
    (sectionPage) => richTextValue(sectionPage, 'ResumeId') === resumeId
  );
  await Promise.all(
    legacyPages.map((sectionPage) => archiveEntity(sectionPage.id))
  );
}

async function findSectionPageTarget(
  resumeId: string,
  sectionId: string
): Promise<SectionPageTarget | null> {
  const resumePage = await findEntity('resume', resumeId);
  if (resumePage) {
    const database = await findResumeSectionsDatabase(resumePage.id);
    if (database) {
      const pages = await queryDatabasePages(database.databaseId);
      let page = pages.find(
        (candidate) =>
          candidate.id === sectionId ||
          richTextValue(candidate, 'EntityId') === sectionId
      );

      if (!page) {
        for (const candidate of pages) {
          const storedSection = normalizeStoredSection(
            await readJsonContent<unknown>(candidate.id, null)
          );
          if (storedSection?.id === sectionId) {
            page = candidate;
            break;
          }
        }
      }

      if (page) {
        return {
          page,
          storage: 'nested',
          titlePropertyName: database.titlePropertyName,
        };
      }
    }
  }

  const legacyPage = await findEntity('section', sectionId);
  if (!legacyPage) return null;

  return {
    page: legacyPage,
    storage: 'legacy',
    titlePropertyName: (await getDatabaseInfo()).titlePropertyName,
  };
}

function legacySectionUpdateProperties(
  input: NotionSectionInput,
  titlePropertyName: string
) {
  return {
    [titlePropertyName]: { title: titleText(sectionTitle(input)) },
    ResumeId: { rich_text: richText(input.resumeId) },
    SectionType: { select: { name: input.sectionType } },
    Layout: { rich_text: richText(input.layout) },
    Order: { number: input.orderIndex },
    UpdatedAt: {
      date: { start: input.updatedAt ?? new Date().toISOString() },
    },
  };
}

async function updateLegacySectionPage(
  pageId: string,
  titlePropertyName: string,
  input: NotionSectionInput
): Promise<void> {
  await notionFetch(`pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: legacySectionUpdateProperties(input, titlePropertyName),
    }),
  });

  if (input.content !== undefined) {
    await replacePageContent(pageId, input.content);
  }
}

async function updateSectionPageTarget(
  target: SectionPageTarget,
  input: NotionSectionInput
): Promise<void> {
  if (target.storage === 'nested') {
    await updateSectionPage(target.page.id, target.titlePropertyName, input);
    return;
  }

  await updateLegacySectionPage(
    target.page.id,
    target.titlePropertyName,
    input
  );
}

async function getSectionInputBase(
  target: SectionPageTarget,
  resumeId: string,
  sectionId: string
): Promise<NotionSectionInput> {
  if (target.storage === 'nested') {
    const storedSection = normalizeStoredSection(
      await readJsonContent<unknown>(target.page.id, null)
    );
    const parsedTitle = parseSectionTitle(
      titleFromPage(target.page, target.titlePropertyName)
    );
    const sectionType = storedSection?.type ?? parsedTitle?.sectionType;
    if (!sectionType) throw new Error('섹션 타입을 찾을 수 없습니다.');

    return {
      id: storedSection?.id ?? sectionId,
      resumeId: storedSection?.resume_id || resumeId,
      sectionType,
      layout: storedSection?.layout ?? 'layout1',
      orderIndex: storedSection?.order_index ?? parsedTitle?.orderIndex ?? 0,
      content: storedSection?.content,
    };
  }

  return {
    id: sectionId,
    resumeId,
    sectionType: selectValue(target.page, 'SectionType') as SectionType,
    layout: richTextValue(target.page, 'Layout') || 'layout1',
    orderIndex: numberValue(target.page, 'Order'),
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
  await ensureResumeSectionsDatabase(page.id);
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
  if (page) {
    const database = await findResumeSectionsDatabase(page.id);
    if (database) {
      const sectionPages = await queryDatabasePages(database.databaseId);
      await Promise.all(
        sectionPages.map((section) => archiveEntity(section.id))
      );
    }
    await archiveEntity(page.id);
  }

  const legacyPages = (await queryEntities('section')).filter(
    (sectionPage) => richTextValue(sectionPage, 'ResumeId') === id
  );
  await Promise.all(
    legacyPages.map((sectionPage) => archiveEntity(sectionPage.id))
  );
}

async function getSectionsByResumeId(
  resumeId: string
): Promise<ResumeSection[]> {
  const resumePage = await findEntity('resume', resumeId);
  if (resumePage) {
    const nestedSections = await getNestedSectionsByResumePage(
      resumePage.id,
      resumeId
    );
    if (nestedSections !== null) return nestedSections;
  }

  return getLegacySectionsByResumeId(resumeId, resumePage);
}

export async function getSections(
  _auth: AuthenticatedUser,
  resumeId: string
): Promise<ResumeSection[]> {
  return getSectionsByResumeId(resumeId);
}

export async function createSection(
  _auth: AuthenticatedUser,
  resumeId: string,
  type: SectionType,
  content: SectionContent,
  orderIndex: number,
  layout = 'layout1'
): Promise<ResumeSection> {
  const resumePage = await findEntity('resume', resumeId);
  if (!resumePage) throw new Error('이력서를 찾을 수 없습니다.');
  const database = await ensureResumeSectionsDatabase(resumePage.id);
  await migrateLegacySectionsToNestedDatabase(resumeId, resumePage, database);

  const now = new Date().toISOString();
  const section: ResumeSection = {
    id: crypto.randomUUID(),
    resume_id: resumeId,
    type,
    layout,
    content: normalizeSectionContent(type, content),
    order_index: orderIndex,
    created_at: now,
    updated_at: now,
  };
  await createSectionPage(database.databaseId, database.titlePropertyName, {
    id: section.id,
    resumeId,
    sectionType: section.type,
    layout: section.layout,
    orderIndex: section.order_index,
    updatedAt: now,
    content: compactSectionContent(section.type, section.content),
  });

  return section;
}

export async function updateSectionLayout(
  _auth: AuthenticatedUser,
  resumeId: string,
  id: string,
  layout: string
): Promise<void> {
  const now = new Date().toISOString();
  const target = await findSectionPageTarget(resumeId, id);
  if (!target) throw new Error('섹션을 찾을 수 없습니다.');
  const base = await getSectionInputBase(target, resumeId, id);

  await updateSectionPageTarget(target, {
    ...base,
    layout,
    updatedAt: now,
  });
}

export async function updateSectionContent(
  _auth: AuthenticatedUser,
  resumeId: string,
  id: string,
  content: SectionContent
): Promise<void> {
  const now = new Date().toISOString();
  const target = await findSectionPageTarget(resumeId, id);
  if (!target) throw new Error('섹션을 찾을 수 없습니다.');
  const base = await getSectionInputBase(target, resumeId, id);

  await updateSectionPageTarget(target, {
    ...base,
    updatedAt: now,
    content: compactSectionContent(base.sectionType, content),
  });
}

export async function updateSectionOrder(
  _auth: AuthenticatedUser,
  resumeId: string,
  id: string,
  orderIndex: number
): Promise<void> {
  const now = new Date().toISOString();
  const target = await findSectionPageTarget(resumeId, id);
  if (!target) throw new Error('섹션을 찾을 수 없습니다.');
  const base = await getSectionInputBase(target, resumeId, id);

  await updateSectionPageTarget(target, {
    ...base,
    orderIndex,
    updatedAt: now,
  });
}

export async function deleteSection(
  _auth: AuthenticatedUser,
  resumeId: string,
  id: string
): Promise<void> {
  const target = await findSectionPageTarget(resumeId, id);
  if (target) await archiveEntity(target.page.id);
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
  const page = await findEntity('resume', target.id);
  if (!page) throw new Error('이력서를 찾을 수 없습니다.');

  const now = new Date().toISOString();
  const database = await ensureResumeSectionsDatabase(page.id);
  const existingPages = await queryDatabasePages(database.databaseId);
  await Promise.all(
    existingPages.map((sectionPage) => archiveEntity(sectionPage.id))
  );
  await archivePageJsonContent(page.id);

  const legacyPages = (await queryEntities('section')).filter(
    (sectionPage) => richTextValue(sectionPage, 'ResumeId') === target.id
  );
  await Promise.all(
    legacyPages.map((sectionPage) => archiveEntity(sectionPage.id))
  );

  const nextSections = sections.map((section, index) => ({
    ...section,
    resume_id: target.id,
    order_index: index,
    updated_at: now,
  }));
  await Promise.all(
    nextSections.map((section) =>
      createSectionPage(database.databaseId, database.titlePropertyName, {
        id: section.id,
        resumeId: target.id,
        sectionType: section.type,
        layout: section.layout,
        orderIndex: section.order_index,
        updatedAt: now,
        content: compactSectionContent(section.type, section.content),
      })
    )
  );
}
