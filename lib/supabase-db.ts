import type { AuthenticatedUser } from '@/lib/auth';
import { requireSupabaseConfig } from '@/lib/supabase/config';

import { compactSectionContent, normalizeSectionContent } from './rich-text';
import type {
  Resume,
  ResumeSection,
  SectionContent,
  SectionType,
} from './types';

type DbId = string | number;

interface DbResume {
  id: DbId;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface DbResumeSection {
  id: DbId;
  resume_id: DbId;
  type: SectionType;
  layout: string;
  content: unknown;
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
  accessToken: string;
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
  options: SupabaseRequestOptions
): Promise<T> {
  const { url, anonKey } = requireSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${options.accessToken}`,
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

async function getSectionType(
  auth: AuthenticatedUser,
  resumeId: string,
  id: string
): Promise<SectionType> {
  const rows = await supabaseRequest<Array<Pick<DbResumeSection, 'type'>>>(
    `resume_sections?select=type&resume_id=eq.${encodeFilterValue(
      resumeId
    )}&id=eq.${encodeFilterValue(id)}&limit=1`,
    { accessToken: auth.accessToken }
  );
  const type = rows[0]?.type;
  if (!type) throw new Error('섹션을 찾을 수 없습니다.');
  return type;
}

export async function getResumes(auth: AuthenticatedUser): Promise<Resume[]> {
  const rows = await supabaseRequest<DbResume[]>(
    `resumes?select=id,user_id,title,created_at,updated_at&user_id=eq.${encodeFilterValue(
      auth.id
    )}&order=created_at.desc`,
    { accessToken: auth.accessToken }
  );
  return rows.map(normalizeResume);
}

export async function createResume(
  auth: AuthenticatedUser,
  title = '새 이력서'
): Promise<Resume> {
  const now = new Date().toISOString();
  const rows = await supabaseRequest<DbResume[]>('resumes', {
    method: 'POST',
    accessToken: auth.accessToken,
    prefer: 'return=representation',
    body: {
      user_id: auth.id,
      title,
      created_at: now,
      updated_at: now,
    },
  });
  return normalizeResume(rows[0]);
}

export async function updateResumeTitle(
  auth: AuthenticatedUser,
  id: string,
  title: string
): Promise<void> {
  await supabaseRequest<undefined>(
    `resumes?id=eq.${encodeFilterValue(id)}&user_id=eq.${encodeFilterValue(
      auth.id
    )}`,
    {
      method: 'PATCH',
      accessToken: auth.accessToken,
      prefer: 'return=minimal',
      body: { title },
    }
  );
}

export async function deleteResume(
  auth: AuthenticatedUser,
  id: string
): Promise<void> {
  await supabaseRequest<undefined>(
    `resumes?id=eq.${encodeFilterValue(id)}&user_id=eq.${encodeFilterValue(
      auth.id
    )}`,
    {
      method: 'DELETE',
      accessToken: auth.accessToken,
      prefer: 'return=minimal',
    }
  );
}

export async function getSections(
  auth: AuthenticatedUser,
  resumeId: string
): Promise<ResumeSection[]> {
  const sections = await supabaseRequest<DbResumeSection[]>(
    `resume_sections?select=id,resume_id,type,layout,content,order_index,created_at,updated_at&resume_id=eq.${encodeFilterValue(
      resumeId
    )}&order=order_index.asc`,
    { accessToken: auth.accessToken }
  );
  return sortSectionsByOrder(sections.map(normalizeSection));
}

export async function createSection(
  auth: AuthenticatedUser,
  resumeId: string,
  type: SectionType,
  content: SectionContent,
  orderIndex: number,
  layout = 'layout1'
): Promise<ResumeSection> {
  const now = new Date().toISOString();
  const rows = await supabaseRequest<DbResumeSection[]>('resume_sections', {
    method: 'POST',
    accessToken: auth.accessToken,
    prefer: 'return=representation',
    body: {
      resume_id: resumeId,
      type,
      layout,
      content: compactSectionContent(type, content),
      order_index: orderIndex,
      created_at: now,
      updated_at: now,
    },
  });
  return normalizeSection(rows[0]);
}

export async function updateSectionLayout(
  auth: AuthenticatedUser,
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
      accessToken: auth.accessToken,
      prefer: 'return=minimal',
      body: { layout },
    }
  );
}

export async function updateSectionContent(
  auth: AuthenticatedUser,
  resumeId: string,
  id: string,
  content: SectionContent
): Promise<void> {
  const type = await getSectionType(auth, resumeId, id);
  await supabaseRequest<undefined>(
    `resume_sections?resume_id=eq.${encodeFilterValue(
      resumeId
    )}&id=eq.${encodeFilterValue(id)}`,
    {
      method: 'PATCH',
      accessToken: auth.accessToken,
      prefer: 'return=minimal',
      body: { content: compactSectionContent(type, content) },
    }
  );
}

export async function updateSectionOrder(
  auth: AuthenticatedUser,
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
      accessToken: auth.accessToken,
      prefer: 'return=minimal',
      body: { order_index: orderIndex },
    }
  );
}

export async function deleteSection(
  auth: AuthenticatedUser,
  resumeId: string,
  id: string
): Promise<void> {
  await supabaseRequest<undefined>(
    `resume_sections?resume_id=eq.${encodeFilterValue(
      resumeId
    )}&id=eq.${encodeFilterValue(id)}`,
    {
      method: 'DELETE',
      accessToken: auth.accessToken,
      prefer: 'return=minimal',
    }
  );
}

async function findResumeByTitle(
  auth: AuthenticatedUser,
  title: string
): Promise<Resume | null> {
  const rows = await supabaseRequest<DbResume[]>(
    `resumes?select=id,user_id,title,created_at,updated_at&title=eq.${encodeFilterValue(
      title
    )}&user_id=eq.${encodeFilterValue(auth.id)}&limit=1`,
    { accessToken: auth.accessToken }
  );
  return rows[0] ? normalizeResume(rows[0]) : null;
}

async function insertSections(
  auth: AuthenticatedUser,
  resumeId: string,
  sections: ResumeSection[]
): Promise<void> {
  if (sections.length === 0) return;

  await supabaseRequest<DbResumeSection[]>('resume_sections', {
    method: 'POST',
    accessToken: auth.accessToken,
    prefer: 'return=representation',
    body: sortSectionsByOrder(sections).map((section) => ({
      resume_id: resumeId,
      type: section.type,
      layout: section.layout,
      content: compactSectionContent(section.type, section.content),
      order_index: section.order_index,
      created_at: section.created_at,
      updated_at: section.updated_at,
    })),
  });
}

export async function replaceResumeWithSectionsByTitle(
  auth: AuthenticatedUser,
  resume: Resume,
  sections: ResumeSection[]
): Promise<void> {
  const existing = await findResumeByTitle(auth, resume.title);
  let targetResumeId = existing?.id;

  if (targetResumeId) {
    await supabaseRequest<undefined>(
      `resume_sections?resume_id=eq.${encodeFilterValue(targetResumeId)}`,
      {
        method: 'DELETE',
        accessToken: auth.accessToken,
        prefer: 'return=minimal',
      }
    );
    await supabaseRequest<undefined>(
      `resumes?id=eq.${encodeFilterValue(
        targetResumeId
      )}&user_id=eq.${encodeFilterValue(auth.id)}`,
      {
        method: 'PATCH',
        accessToken: auth.accessToken,
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
      accessToken: auth.accessToken,
      prefer: 'return=representation',
      body: {
        user_id: auth.id,
        title: resume.title,
        created_at: resume.created_at,
        updated_at: resume.updated_at,
      },
    });
    targetResumeId = String(rows[0].id);
  }

  await insertSections(auth, targetResumeId, sections);
}
