import type {
  Resume,
  ResumeSection,
  SectionContent,
  SectionType,
} from './types';
import { normalizeSectionContent } from './rich-text';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type DbId = string | number;

interface DbResume {
  id: DbId;
  title: string;
  created_at: string;
  updated_at: string;
}

interface DbResumeSection {
  id: DbId;
  resume_id: DbId;
  type: SectionType;
  layout: string;
  content: SectionContent;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface SupabaseError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

interface SupabaseRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  prefer?: string;
}

function requireSupabaseConfig(): { url: string; anonKey: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  }
  return {
    url: SUPABASE_URL.replace(/\/$/, ''),
    anonKey: SUPABASE_ANON_KEY,
  };
}

function encodeFilterValue(value: string): string {
  return encodeURIComponent(value);
}

function normalizeResume(row: DbResume): Resume {
  return {
    ...row,
    id: String(row.id),
  };
}

function normalizeSection(row: DbResumeSection): ResumeSection {
  return {
    ...row,
    id: String(row.id),
    resume_id: String(row.resume_id),
    content: normalizeSectionContent(row.type, row.content),
  };
}

async function supabaseRequest<T>(
  path: string,
  options: SupabaseRequestOptions = {}
): Promise<T> {
  const { url, anonKey } = requireSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as SupabaseError;
    throw new Error(error.message ?? 'Supabase 요청 실패');
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function sortSectionsByOrder(sections: ResumeSection[]): ResumeSection[] {
  return [...sections].sort((a, b) => a.order_index - b.order_index);
}

async function getSectionType(resumeId: string, id: string): Promise<SectionType> {
  const rows = await supabaseRequest<Array<Pick<DbResumeSection, 'type'>>>(
    `resume_sections?select=type&resume_id=eq.${encodeFilterValue(
      resumeId
    )}&id=eq.${encodeFilterValue(id)}&limit=1`
  );
  const type = rows[0]?.type;
  if (!type) throw new Error('섹션을 찾을 수 없습니다.');
  return type;
}

export async function getResumes(): Promise<Resume[]> {
  const rows = await supabaseRequest<DbResume[]>(
    'resumes?select=id,title,created_at,updated_at&order=created_at.desc'
  );
  return rows.map(normalizeResume);
}

export async function createResume(title = '새 이력서'): Promise<Resume> {
  const now = new Date().toISOString();
  const rows = await supabaseRequest<DbResume[]>('resumes', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      title,
      created_at: now,
      updated_at: now,
    },
  });
  return normalizeResume(rows[0]);
}

export async function updateResumeTitle(
  id: string,
  title: string
): Promise<void> {
  await supabaseRequest<undefined>(`resumes?id=eq.${encodeFilterValue(id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { title },
  });
}

export async function deleteResume(id: string): Promise<void> {
  await supabaseRequest<undefined>(`resumes?id=eq.${encodeFilterValue(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

export async function getSections(resumeId: string): Promise<ResumeSection[]> {
  const sections = await supabaseRequest<DbResumeSection[]>(
    `resume_sections?select=id,resume_id,type,layout,content,order_index,created_at,updated_at&resume_id=eq.${encodeFilterValue(
      resumeId
    )}&order=order_index.asc`
  );
  return sortSectionsByOrder(sections.map(normalizeSection));
}

export async function createSection(
  resumeId: string,
  type: SectionType,
  content: SectionContent,
  orderIndex: number,
  layout = 'layout1'
): Promise<ResumeSection> {
  const now = new Date().toISOString();
  const rows = await supabaseRequest<DbResumeSection[]>('resume_sections', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      resume_id: resumeId,
      type,
      layout,
      content: normalizeSectionContent(type, content),
      order_index: orderIndex,
      created_at: now,
      updated_at: now,
    },
  });
  return normalizeSection(rows[0]);
}

export async function updateSectionLayout(
  resumeId: string,
  id: string,
  layout: string
): Promise<void> {
  await supabaseRequest<undefined>(
    `resume_sections?resume_id=eq.${encodeFilterValue(
      resumeId
    )}&id=eq.${encodeFilterValue(id)}`,
    {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { layout },
    }
  );
}

export async function updateSectionContent(
  resumeId: string,
  id: string,
  content: SectionContent
): Promise<void> {
  const type = await getSectionType(resumeId, id);
  await supabaseRequest<undefined>(
    `resume_sections?resume_id=eq.${encodeFilterValue(
      resumeId
    )}&id=eq.${encodeFilterValue(id)}`,
    {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { content: normalizeSectionContent(type, content) },
    }
  );
}

export async function updateSectionOrder(
  resumeId: string,
  id: string,
  orderIndex: number
): Promise<void> {
  await supabaseRequest<undefined>(
    `resume_sections?resume_id=eq.${encodeFilterValue(
      resumeId
    )}&id=eq.${encodeFilterValue(id)}`,
    {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { order_index: orderIndex },
    }
  );
}

export async function deleteSection(
  resumeId: string,
  id: string
): Promise<void> {
  await supabaseRequest<undefined>(
    `resume_sections?resume_id=eq.${encodeFilterValue(
      resumeId
    )}&id=eq.${encodeFilterValue(id)}`,
    {
      method: 'DELETE',
      prefer: 'return=minimal',
    }
  );
}

async function findResumeByTitle(title: string): Promise<Resume | null> {
  const rows = await supabaseRequest<DbResume[]>(
    `resumes?select=id,title,created_at,updated_at&title=eq.${encodeFilterValue(
      title
    )}&limit=1`
  );
  return rows[0] ? normalizeResume(rows[0]) : null;
}

async function insertSections(
  resumeId: string,
  sections: ResumeSection[]
): Promise<void> {
  if (sections.length === 0) return;

  await supabaseRequest<DbResumeSection[]>('resume_sections', {
    method: 'POST',
    prefer: 'return=representation',
    body: sortSectionsByOrder(sections).map((section) => ({
      resume_id: resumeId,
      type: section.type,
      layout: section.layout,
      content: normalizeSectionContent(section.type, section.content),
      order_index: section.order_index,
      created_at: section.created_at,
      updated_at: section.updated_at,
    })),
  });
}

export async function replaceResumeWithSectionsByTitle(
  resume: Resume,
  sections: ResumeSection[]
): Promise<void> {
  const existing = await findResumeByTitle(resume.title);
  let targetResumeId = existing?.id;

  if (targetResumeId) {
    await supabaseRequest<undefined>(
      `resume_sections?resume_id=eq.${encodeFilterValue(targetResumeId)}`,
      {
        method: 'DELETE',
        prefer: 'return=minimal',
      }
    );
    await supabaseRequest<undefined>(
      `resumes?id=eq.${encodeFilterValue(targetResumeId)}`,
      {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: {
          title: resume.title,
          created_at: resume.created_at,
          updated_at: resume.updated_at,
        },
      }
    );
  } else {
    const rows = await supabaseRequest<DbResume[]>('resumes', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        title: resume.title,
        created_at: resume.created_at,
        updated_at: resume.updated_at,
      },
    });
    targetResumeId = String(rows[0].id);
  }

  await insertSections(targetResumeId, sections);
}
