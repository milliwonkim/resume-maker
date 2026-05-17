import type {
  EducationContent,
  ExperienceContent,
  HeaderContent,
  ProjectsContent,
  Resume,
  ResumeSection,
  SectionType,
  SectionContent,
  SkillsContent,
  SummaryContent,
  TextContent,
} from './types';
import { richTextToPlainText } from './rich-text';

const NOTION_VERSION = '2022-06-28';
const SECTIONS_CAPTION = '__resume_sections__';
const MAX_RICH_TEXT_LENGTH = 2000;
const SUPABASE_ID_PROPERTY = 'Supabase ID';
const SYNCED_AT_PROPERTY = '동기화 시각';
const RESUME_DB_PROPERTIES = {
  [SUPABASE_ID_PROPERTY]: { rich_text: {} },
  이름: { rich_text: {} },
  직무: { rich_text: {} },
  이메일: { rich_text: {} },
  전화: { rich_text: {} },
  지역: { rich_text: {} },
  LinkedIn: { rich_text: {} },
  GitHub: { rich_text: {} },
  웹사이트: { rich_text: {} },
  자기소개: { rich_text: {} },
  '일반 텍스트': { rich_text: {} },
  경력: { rich_text: {} },
  학력: { rich_text: {} },
  기술: { rich_text: {} },
  프로젝트: { rich_text: {} },
  [SYNCED_AT_PROPERTY]: { date: {} },
} satisfies Record<string, NotionDatabasePropertyConfig>;

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function splitIntoRichText(
  text: string
): Array<{ type: 'text'; text: { content: string } }> {
  const chunks: Array<{ type: 'text'; text: { content: string } }> = [];
  for (let i = 0; i < text.length; i += MAX_RICH_TEXT_LENGTH) {
    chunks.push({
      type: 'text',
      text: { content: text.slice(i, i + MAX_RICH_TEXT_LENGTH) },
    });
  }
  return chunks.length > 0 ? chunks : [{ type: 'text', text: { content: '' } }];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotionRichText {
  plain_text: string;
}

type NotionDatabasePropertyConfig =
  | { title: Record<string, never> }
  | { rich_text: Record<string, never> }
  | { email: Record<string, never> }
  | { phone_number: Record<string, never> }
  | { url: Record<string, never> }
  | { date: Record<string, never> };

type NotionPagePropertyValue =
  | { title: Array<{ type: 'text'; text: { content: string } }> }
  | { rich_text: Array<{ type: 'text'; text: { content: string } }> }
  | { email: string | null }
  | { phone_number: string | null }
  | { url: string | null }
  | { date: { start: string } | null };

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
  properties: Record<
    string,
    {
      type: string;
      title?: NotionRichText[];
    }
  >;
}

interface NotionDatabasePage extends NotionPage {
  properties: NotionPage['properties'] &
    Record<
      string,
      {
        type: string;
        rich_text?: NotionRichText[];
      }
    >;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pageToResume(page: NotionPage): Resume {
  const titleProp = Object.values(page.properties).find(
    (p) => p.type === 'title'
  );
  const title =
    titleProp?.title?.map((t) => t.plain_text).join('') ?? '제목 없음';
  return {
    id: page.id,
    title,
    created_at: page.created_time,
    updated_at: page.last_edited_time,
  };
}

async function findSectionsBlock(
  token: string,
  pageId: string
): Promise<NotionCodeBlock | null> {
  const res = await fetch(
    `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
    {
      headers: notionHeaders(token),
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { results: NotionBlock[] };
  const block = data.results.find(
    (b): b is NotionCodeBlock =>
      b.type === 'code' &&
      'code' in b &&
      ((b as NotionCodeBlock).code.caption ?? []).some(
        (c) => c.plain_text === SECTIONS_CAPTION
      )
  );
  return block ?? null;
}

async function readSections(
  token: string,
  pageId: string
): Promise<ResumeSection[]> {
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

function textProperty(value: string | undefined): NotionPagePropertyValue {
  const trimmed = value?.trim() ?? '';
  return { rich_text: trimmed ? splitIntoRichText(trimmed) : [] };
}

function titleProperty(value: string): NotionPagePropertyValue {
  return { title: [{ type: 'text', text: { content: value } }] };
}

function dateProperty(value: string): NotionPagePropertyValue {
  return { date: { start: value } };
}

function joinPresent(values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join(' | ');
}

function formatSummary(content: SummaryContent): string {
  return richTextToPlainText(content.text);
}

function formatText(content: TextContent): string {
  return richTextToPlainText(content.text);
}

function formatExperience(content: ExperienceContent): string {
  return content.items
    .map((item) => {
      const heading = joinPresent([
        item.company,
        item.role,
        item.location,
        joinPresent([item.startDate, item.endDate]),
      ]);
      const projectText = (item.projects ?? [])
        .map((project) =>
          [
            joinPresent([
              project.name,
              joinPresent([project.startDate, project.endDate]),
            ]),
            project.tech ? `기술: ${project.tech}` : '',
            project.problem
              ? `문제: ${richTextToPlainText(project.problem)}`
              : '',
            project.ownership
              ? `역할: ${richTextToPlainText(project.ownership)}`
              : '',
            project.achievement
              ? `성과: ${richTextToPlainText(project.achievement)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        )
        .filter(Boolean)
        .join('\n\n');
      const legacyText = [
        item.tech ? `기술: ${item.tech}` : '',
        item.problem ? `문제: ${richTextToPlainText(item.problem)}` : '',
        item.ownership ? `역할: ${richTextToPlainText(item.ownership)}` : '',
        item.achievement
          ? `성과: ${richTextToPlainText(item.achievement)}`
          : '',
        item.description ? richTextToPlainText(item.description) : '',
      ]
        .filter(Boolean)
        .join('\n');

      return [heading, projectText || legacyText].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function formatEducation(content: EducationContent): string {
  return content.items
    .map((item) =>
      [
        joinPresent([
          item.school,
          item.degree,
          item.field,
          joinPresent([item.startDate, item.endDate]),
        ]),
        item.additionalMajors && item.additionalMajors.length > 0
          ? `복수/부전공: ${item.additionalMajors
              .map((major) => joinPresent([major.label, major.field]))
              .filter(Boolean)
              .join(', ')}`
          : '',
        item.highSchoolCategory
          ? `고등학교 계열: ${item.highSchoolCategory}`
          : '',
        item.gpa ? `학점: ${item.gpa}/${item.gpaScale ?? ''}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function formatSkills(content: SkillsContent): string {
  return content.categories
    .map((category) => joinPresent([category.name, category.skills]))
    .filter(Boolean)
    .join('\n');
}

function formatProjects(content: ProjectsContent): string {
  return content.items
    .map((item) =>
      [
        joinPresent([item.name, item.tech, item.link]),
        richTextToPlainText(item.description),
      ]
        .filter(Boolean)
        .join('\n')
    )
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function buildResumePropertyValues(
  resume: Resume,
  sections: ResumeSection[]
): Record<string, NotionPagePropertyValue> {
  const propertyValues: Record<string, string> = {};
  const appendProperty = (name: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    propertyValues[name] = propertyValues[name]
      ? `${propertyValues[name]}\n\n${trimmed}`
      : trimmed;
  };

  for (const section of sortSectionsByOrder(sections)) {
    switch (section.type) {
      case 'header': {
        const content = section.content as HeaderContent;
        propertyValues.이름 = content.name;
        propertyValues.직무 = content.title;
        propertyValues.이메일 = content.email;
        propertyValues.전화 = content.phone;
        propertyValues.지역 = content.location;
        propertyValues.LinkedIn = content.linkedin ?? '';
        propertyValues.GitHub = content.github ?? '';
        propertyValues.웹사이트 = content.website ?? '';
        break;
      }
      case 'summary':
        appendProperty(
          '자기소개',
          formatSummary(section.content as SummaryContent)
        );
        break;
      case 'text':
        appendProperty(
          '일반 텍스트',
          formatText(section.content as TextContent)
        );
        break;
      case 'experience':
        appendProperty(
          '경력',
          formatExperience(section.content as ExperienceContent)
        );
        break;
      case 'education':
        appendProperty(
          '학력',
          formatEducation(section.content as EducationContent)
        );
        break;
      case 'skills':
        appendProperty('기술', formatSkills(section.content as SkillsContent));
        break;
      case 'projects':
        appendProperty(
          '프로젝트',
          formatProjects(section.content as ProjectsContent)
        );
        break;
    }
  }

  return {
    title: titleProperty(resume.title),
    [SUPABASE_ID_PROPERTY]: textProperty(resume.id),
    이름: textProperty(propertyValues.이름),
    직무: textProperty(propertyValues.직무),
    이메일: textProperty(propertyValues.이메일),
    전화: textProperty(propertyValues.전화),
    지역: textProperty(propertyValues.지역),
    LinkedIn: textProperty(propertyValues.LinkedIn),
    GitHub: textProperty(propertyValues.GitHub),
    웹사이트: textProperty(propertyValues.웹사이트),
    자기소개: textProperty(propertyValues.자기소개),
    '일반 텍스트': textProperty(propertyValues['일반 텍스트']),
    경력: textProperty(propertyValues.경력),
    학력: textProperty(propertyValues.학력),
    기술: textProperty(propertyValues.기술),
    프로젝트: textProperty(propertyValues.프로젝트),
    [SYNCED_AT_PROPERTY]: dateProperty(new Date().toISOString()),
  };
}

async function ensureResumeDatabaseProperties(
  token: string,
  databaseId: string
): Promise<void> {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: 'PATCH',
    headers: notionHeaders(token),
    body: JSON.stringify({ properties: RESUME_DB_PROPERTIES }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(err.message ?? 'Notion 데이터베이스 속성 설정 실패');
  }
}

async function findResumePageBySupabaseId(
  token: string,
  databaseId: string,
  resumeId: string
): Promise<NotionDatabasePage | null> {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify({
        page_size: 1,
        filter: {
          property: SUPABASE_ID_PROPERTY,
          rich_text: { equals: resumeId },
        },
      }),
    }
  );
  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(err.message ?? 'Notion 이력서 조회 실패');
  }
  const data = (await res.json()) as { results: NotionDatabasePage[] };
  return data.results[0] ?? null;
}

export async function upsertResumeFromSupabase(
  token: string,
  databaseId: string,
  resume: Resume,
  sections: ResumeSection[]
): Promise<{ pageId: string; created: boolean; sectionCount: number }> {
  const properties = buildResumePropertyValues(resume, sections);
  const existingPage = await findResumePageBySupabaseId(
    token,
    databaseId,
    resume.id
  );

  if (existingPage) {
    const res = await fetch(
      `https://api.notion.com/v1/pages/${existingPage.id}`,
      {
        method: 'PATCH',
        headers: notionHeaders(token),
        body: JSON.stringify({ properties }),
      }
    );
    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? 'Notion 이력서 업데이트 실패');
    }
    await writeSections(token, existingPage.id, sections);
    return {
      pageId: existingPage.id,
      created: false,
      sectionCount: sections.length,
    };
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
      children: [
        {
          object: 'block',
          type: 'code',
          code: {
            rich_text: splitIntoRichText(JSON.stringify(sections)),
            language: 'json',
            caption: [{ type: 'text', text: { content: SECTIONS_CAPTION } }],
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(err.message ?? 'Notion 이력서 생성 실패');
  }

  const page = (await res.json()) as NotionPage;
  return { pageId: page.id, created: true, sectionCount: sections.length };
}

export async function prepareSupabaseResumeImport(
  token: string,
  databaseId: string
): Promise<void> {
  await ensureResumeDatabaseProperties(token, databaseId);
}

async function writeSections(
  token: string,
  pageId: string,
  sections: ResumeSection[]
): Promise<void> {
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
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? '섹션 저장 실패');
    }
  } else {
    const res = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children`,
      {
        method: 'PATCH',
        headers: notionHeaders(token),
        body: JSON.stringify({
          children: [
            {
              object: 'block',
              type: 'code',
              code: {
                rich_text: richText,
                language: 'json',
                caption: [
                  { type: 'text', text: { content: SECTIONS_CAPTION } },
                ],
              },
            },
          ],
        }),
      }
    );
    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw new Error(err.message ?? '섹션 블록 생성 실패');
    }
  }
}

// ── Resumes ───────────────────────────────────────────────────────────────────

export async function getResumes(
  token: string,
  databaseId: string
): Promise<Resume[]> {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify({
        page_size: 100,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      }),
    }
  );
  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(err.message ?? 'Notion 데이터베이스 조회 실패');
  }
  const data = (await res.json()) as { results: NotionPage[] };
  return data.results.filter((p) => !p.archived).map(pageToResume);
}

export async function createResume(
  token: string,
  databaseId: string,
  title = '새 이력서'
): Promise<Resume> {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        title: { title: [{ type: 'text', text: { content: title } }] },
      },
      children: [
        {
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{ type: 'text', text: { content: '[]' } }],
            language: 'json',
            caption: [{ type: 'text', text: { content: SECTIONS_CAPTION } }],
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(err.message ?? 'Notion 페이지 생성 실패');
  }
  const page = (await res.json()) as NotionPage;
  return pageToResume(page);
}

export async function updateResumeTitle(
  token: string,
  id: string,
  title: string
): Promise<void> {
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

export async function getSections(
  token: string,
  resumeId: string
): Promise<ResumeSection[]> {
  return sortSectionsByOrder(await readSections(token, resumeId));
}

export async function createSection(
  token: string,
  resumeId: string,
  type: SectionType,
  content: SectionContent,
  orderIndex: number,
  layout = 'layout1'
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

export async function updateSectionLayout(
  token: string,
  resumeId: string,
  id: string,
  layout: string
): Promise<void> {
  const sections = await readSections(token, resumeId);
  await writeSections(
    token,
    resumeId,
    sections.map((s) =>
      s.id === id ? { ...s, layout, updated_at: new Date().toISOString() } : s
    )
  );
}

export async function updateSectionContent(
  token: string,
  resumeId: string,
  id: string,
  content: SectionContent
): Promise<void> {
  const sections = await readSections(token, resumeId);
  await writeSections(
    token,
    resumeId,
    sections.map((s) =>
      s.id === id ? { ...s, content, updated_at: new Date().toISOString() } : s
    )
  );
}

export async function updateSectionOrder(
  token: string,
  resumeId: string,
  id: string,
  orderIndex: number
): Promise<void> {
  const sections = await readSections(token, resumeId);
  await writeSections(
    token,
    resumeId,
    sortSectionsByOrder(
      sections.map((s) =>
        s.id === id
          ? {
              ...s,
              order_index: orderIndex,
              updated_at: new Date().toISOString(),
            }
          : s
      )
    )
  );
}

export async function deleteSection(
  token: string,
  resumeId: string,
  id: string
): Promise<void> {
  const sections = await readSections(token, resumeId);
  await writeSections(
    token,
    resumeId,
    sections.filter((s) => s.id !== id)
  );
}
