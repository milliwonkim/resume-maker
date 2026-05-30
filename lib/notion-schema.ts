interface NotionApiError {
  message?: string;
}

interface NotionRichTextItem {
  plain_text: string;
}

interface NotionDatabaseProperty {
  type: string;
}

interface NotionDatabaseResponse {
  id: string;
  properties: Record<string, NotionDatabaseProperty>;
}

type NotionSelectColor =
  | 'blue'
  | 'brown'
  | 'default'
  | 'gray'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'yellow';

interface NotionSelectOption {
  name: string;
  color: NotionSelectColor;
}

interface RequiredDatabaseProperty {
  name: string;
  type: string;
  schema: Record<string, unknown>;
}

interface NotionProperty {
  type: string;
  title?: NotionRichTextItem[];
  rich_text?: NotionRichTextItem[];
  select?: { name: string } | null;
  multi_select?: Array<{ name: string }>;
  status?: { name: string } | null;
  number?: number | null;
  date?: { start: string; end?: string | null } | null;
  checkbox?: boolean;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
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
  child_database?: { title: string };
}

interface NotionBlocksResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

interface StoredSection {
  id: string;
  resume_id: string;
  type: 'header' | 'summary' | 'text' | 'experience' | 'skills' | 'projects';
  layout: string;
  content: unknown;
  order_index: number;
  created_at: string;
  updated_at: string;
}

const NOTION_VERSION = '2022-06-28';
const JSON_CHUNK_SIZE = 1800;
const RESUME_SECTIONS_DATABASE_TITLE = 'Resume Sections';
const SYSTEM_PROPERTY_NAMES = new Set([
  'Kind',
  'EntityId',
  'ResumeId',
  'SectionType',
  'Layout',
  'Order',
  'UpdatedAt',
]);
const KIND_OPTIONS = [
  { name: 'resume', color: 'blue' },
  { name: 'section', color: 'purple' },
  { name: 'note', color: 'green' },
  { name: 'link', color: 'orange' },
] as const satisfies readonly NotionSelectOption[];
const SECTION_TYPE_OPTIONS = [
  { name: 'header', color: 'blue' },
  { name: 'summary', color: 'green' },
  { name: 'text', color: 'gray' },
  { name: 'experience', color: 'purple' },
  { name: 'education', color: 'yellow' },
  { name: 'skills', color: 'orange' },
  { name: 'projects', color: 'pink' },
] as const satisfies readonly NotionSelectOption[];
const REQUIRED_DATABASE_PROPERTIES = [
  {
    name: 'Kind',
    type: 'select',
    schema: { select: { options: KIND_OPTIONS } },
  },
  { name: 'EntityId', type: 'rich_text', schema: { rich_text: {} } },
  { name: 'ResumeId', type: 'rich_text', schema: { rich_text: {} } },
  {
    name: 'SectionType',
    type: 'select',
    schema: { select: { options: SECTION_TYPE_OPTIONS } },
  },
  { name: 'Layout', type: 'rich_text', schema: { rich_text: {} } },
  { name: 'Order', type: 'number', schema: { number: {} } },
  { name: 'UpdatedAt', type: 'date', schema: { date: {} } },
] as const satisfies readonly RequiredDatabaseProperty[];
const HEADER_PROPERTY_MAP = {
  name: ['이름', '성명', 'name'],
  title: ['직무', '직책', '타이틀', 'title', 'position'],
  email: ['이메일', 'email'],
  phone: ['전화번호', '연락처', '휴대폰', 'phone'],
  location: ['주소', '위치', '지역', 'location'],
  linkedin: ['링크드인', 'linkedin'],
  github: ['깃허브', 'github'],
  website: ['웹사이트', '포트폴리오', 'website', 'portfolio'],
} as const;
const SECTION_KEYWORDS = {
  summary: ['자기소개', '소개', '요약', 'summary', 'about', 'intro'],
  experience: ['경력', '이력', '경험', 'experience', 'career', 'work'],
  skills: ['기술', '스킬', '역량', 'skills', 'skill', 'tech stack'],
  projects: ['프로젝트', 'projects', 'project'],
  text: ['학력', '교육', 'education', '기타', '내용', 'content'],
} as const;

function notionHeaders(notionToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${notionToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function notionFetch<T>(
  notionToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    ...init,
    headers: { ...notionHeaders(notionToken), ...init.headers },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readNotionError(response));
  return (await response.json()) as T;
}

async function readNotionError(response: Response): Promise<string> {
  const error = (await response.json().catch(() => ({}))) as NotionApiError;
  return error.message ?? 'Notion 요청에 실패했습니다.';
}

function missingProperties(
  properties: Record<string, NotionDatabaseProperty>
): RequiredDatabaseProperty[] {
  return REQUIRED_DATABASE_PROPERTIES.filter(
    (property) => !properties[property.name]
  );
}

function mismatchedProperties(
  properties: Record<string, NotionDatabaseProperty>
): RequiredDatabaseProperty[] {
  return REQUIRED_DATABASE_PROPERTIES.filter((property) => {
    const existing = properties[property.name];
    return existing !== undefined && existing.type !== property.type;
  });
}

function schemaPatch(properties: RequiredDatabaseProperty[]) {
  return properties.reduce<Record<string, Record<string, unknown>>>(
    (patch, property) => ({ ...patch, [property.name]: property.schema }),
    {}
  );
}

function titlePropertyName(database: NotionDatabaseResponse): string {
  const titleProperty = Object.entries(database.properties).find(
    ([, property]) => property.type === 'title'
  );
  if (!titleProperty)
    throw new Error('Notion 데이터베이스에 제목 속성이 필요합니다.');
  return titleProperty[0];
}

function plainText(items: NotionRichTextItem[] | undefined): string {
  return (
    items
      ?.map((item) => item.plain_text)
      .join('')
      .trim() ?? ''
  );
}

function richText(value: string) {
  return [{ type: 'text', text: { content: value.slice(0, 2000) } }];
}

function propertyText(property: NotionProperty | undefined): string {
  if (!property) return '';
  if (property.title) return plainText(property.title);
  if (property.rich_text) return plainText(property.rich_text);
  if (property.select) return property.select.name;
  if (property.multi_select) {
    return property.multi_select.map((option) => option.name).join(', ');
  }
  if (property.status) return property.status.name;
  if (property.date) {
    return [property.date.start, property.date.end].filter(Boolean).join(' – ');
  }
  if (typeof property.number === 'number') return String(property.number);
  if (typeof property.checkbox === 'boolean')
    return property.checkbox ? '예' : '';
  return property.url ?? property.email ?? property.phone_number ?? '';
}

function normalizedName(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s_-]/g, '');
}

function propertyNameMatches(
  name: string,
  keywords: readonly string[]
): boolean {
  const normalized = normalizedName(name);
  return keywords.some((keyword) =>
    normalized.includes(normalizedName(keyword))
  );
}

function findPropertyByKeywords(
  page: NotionPage,
  keywords: readonly string[]
): string {
  const property = Object.entries(page.properties).find(([name]) =>
    propertyNameMatches(name, keywords)
  )?.[1];
  return propertyText(property).trim();
}

function isUnmanagedPage(page: NotionPage): boolean {
  return (
    !page.properties.Kind?.select?.name &&
    !propertyText(page.properties.EntityId)
  );
}

function richTextDocument(value: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: value ? [{ type: 'text', text: value }] : undefined,
      },
    ],
  };
}

function jsonBlocks(content: unknown) {
  const json = JSON.stringify(content);
  const chunks: string[] = [];
  for (let index = 0; index < json.length; index += JSON_CHUNK_SIZE) {
    chunks.push(json.slice(index, index + JSON_CHUNK_SIZE));
  }

  return chunks.map((chunk) => ({
    object: 'block',
    type: 'code',
    code: { language: 'json', rich_text: richText(chunk) },
  }));
}

function headerContent(page: NotionPage, titleName: string) {
  const header = {
    name: findPropertyByKeywords(page, HEADER_PROPERTY_MAP.name),
    title: findPropertyByKeywords(page, HEADER_PROPERTY_MAP.title),
    email: findPropertyByKeywords(page, HEADER_PROPERTY_MAP.email),
    phone: findPropertyByKeywords(page, HEADER_PROPERTY_MAP.phone),
    location: findPropertyByKeywords(page, HEADER_PROPERTY_MAP.location),
    linkedin: findPropertyByKeywords(page, HEADER_PROPERTY_MAP.linkedin),
    github: findPropertyByKeywords(page, HEADER_PROPERTY_MAP.github),
    website: findPropertyByKeywords(page, HEADER_PROPERTY_MAP.website),
  };
  const fallbackName = propertyText(page.properties[titleName]);
  const content = { ...header, name: header.name || fallbackName };
  return Object.values(content).some((value) => value.trim()) ? content : null;
}

function contentFromText(type: StoredSection['type'], value: string): unknown {
  if (type === 'header') return null;
  if (type === 'experience') {
    return {
      items: [
        {
          id: crypto.randomUUID(),
          company: '',
          role: '',
          location: '',
          startDate: '',
          endDate: '',
          description: richTextDocument(value),
        },
      ],
    };
  }
  if (type === 'skills') {
    return {
      categories: [{ id: crypto.randomUUID(), name: 'Skills', skills: value }],
    };
  }
  if (type === 'projects') {
    return {
      items: [
        {
          id: crypto.randomUUID(),
          name: '프로젝트',
          description: richTextDocument(value),
          tech: '',
        },
      ],
    };
  }
  return { text: richTextDocument(value) };
}

function sectionTypeForProperty(name: string): StoredSection['type'] | null {
  const match = Object.entries(SECTION_KEYWORDS).find(([, keywords]) =>
    propertyNameMatches(name, keywords)
  );
  return (match?.[0] as StoredSection['type'] | undefined) ?? null;
}

function makeStoredSection(
  page: NotionPage,
  type: StoredSection['type'],
  content: unknown,
  orderIndex: number
): StoredSection {
  return {
    id: crypto.randomUUID(),
    resume_id: page.id,
    type,
    layout: 'layout1',
    content,
    order_index: orderIndex,
    created_at: page.created_time,
    updated_at: new Date().toISOString(),
  };
}

function sectionsFromPageProperties(
  page: NotionPage,
  titleName: string
): StoredSection[] {
  const sections: StoredSection[] = [];
  const header = headerContent(page, titleName);
  if (header)
    sections.push(makeStoredSection(page, 'header', header, sections.length));

  for (const [name, property] of Object.entries(page.properties)) {
    if (name === titleName || SYSTEM_PROPERTY_NAMES.has(name)) continue;
    const type = sectionTypeForProperty(name);
    const text = propertyText(property).trim();
    if (!type || !text) continue;
    sections.push(
      makeStoredSection(
        page,
        type,
        contentFromText(type, text),
        sections.length
      )
    );
  }

  return sections;
}

async function queryDatabasePages(
  notionToken: string,
  databaseId: string
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const response: NotionQueryResponse =
      await notionFetch<NotionQueryResponse>(
        notionToken,
        `databases/${databaseId}/query`,
        {
          method: 'POST',
          body: JSON.stringify({
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

async function getPageBlocks(
  notionToken: string,
  pageId: string
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;
  do {
    const path = `blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const response: NotionBlocksResponse =
      await notionFetch<NotionBlocksResponse>(notionToken, path);
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return blocks;
}

async function findSectionsDatabase(
  notionToken: string,
  pageId: string
): Promise<string | null> {
  const blocks = await getPageBlocks(notionToken, pageId);
  const database = blocks.find(
    (block) =>
      block.type === 'child_database' &&
      block.child_database?.title === RESUME_SECTIONS_DATABASE_TITLE
  );
  return database?.id ?? null;
}

async function createSectionsDatabase(
  notionToken: string,
  pageId: string
): Promise<string> {
  const database = await notionFetch<{ id: string }>(notionToken, 'databases', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: pageId },
      title: richText(RESUME_SECTIONS_DATABASE_TITLE),
      properties: { 이름: { title: {} } },
    }),
  });
  return database.id;
}

async function ensureSectionsDatabase(
  notionToken: string,
  pageId: string
): Promise<string> {
  return (
    (await findSectionsDatabase(notionToken, pageId)) ??
    (await createSectionsDatabase(notionToken, pageId))
  );
}

async function createSectionPage(
  notionToken: string,
  databaseId: string,
  section: StoredSection
): Promise<void> {
  await notionFetch(notionToken, 'pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        이름: { title: richText(`${section.type} ${section.order_index + 1}`) },
      },
      children: jsonBlocks(section),
    }),
  });
}

async function updateResumeProperties(
  notionToken: string,
  page: NotionPage
): Promise<void> {
  await notionFetch(notionToken, `pages/${page.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        Kind: { select: { name: 'resume' } },
        EntityId: { rich_text: richText(page.id) },
        UpdatedAt: { date: { start: page.last_edited_time } },
      },
    }),
  });
}

async function backfillResumeSections(
  notionToken: string,
  page: NotionPage,
  titleName: string
): Promise<void> {
  const sections = sectionsFromPageProperties(page, titleName);
  if (sections.length === 0) return;

  const databaseId = await ensureSectionsDatabase(notionToken, page.id);
  if ((await queryDatabasePages(notionToken, databaseId)).length > 0) return;

  for (const section of sections) {
    await createSectionPage(notionToken, databaseId, section);
  }
}

async function backfillExistingResumePages(
  notionToken: string,
  database: NotionDatabaseResponse
): Promise<void> {
  const titleName = titlePropertyName(database);
  const pages = await queryDatabasePages(notionToken, database.id);
  for (const page of pages.filter(isUnmanagedPage)) {
    await updateResumeProperties(notionToken, page);
    await backfillResumeSections(notionToken, page, titleName);
  }
}

async function patchMissingProperties(
  notionToken: string,
  databaseId: string,
  properties: RequiredDatabaseProperty[]
): Promise<void> {
  if (properties.length === 0) return;
  await notionFetch(notionToken, `databases/${databaseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: schemaPatch(properties) }),
  });
}

function assertCompatibleSchema(database: NotionDatabaseResponse): void {
  const mismatches = mismatchedProperties(database.properties);
  if (mismatches.length === 0) return;

  throw new Error(
    `Notion 데이터베이스 속성 타입을 확인해주세요: ${mismatches
      .map((property) => `${property.name}은(는) ${property.type}`)
      .join(', ')} 타입이어야 합니다.`
  );
}

export async function ensureNotionDatabaseSchema(
  notionToken: string,
  notionDatabaseId: string
): Promise<void> {
  const database = await notionFetch<NotionDatabaseResponse>(
    notionToken,
    `databases/${notionDatabaseId}`
  );

  assertCompatibleSchema(database);
  await patchMissingProperties(
    notionToken,
    notionDatabaseId,
    missingProperties(database.properties)
  );
  await backfillExistingResumePages(notionToken, database);
}
