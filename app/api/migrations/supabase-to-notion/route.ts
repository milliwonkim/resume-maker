import { cookies } from 'next/headers';

import {
  prepareSupabaseResumeImport,
  upsertResumeFromSupabase,
} from '@/lib/notion-db';
import { getResumes, getSections } from '@/lib/supabase-db';

interface MigrationRequestBody {
  databaseId?: string;
}

function normalizeNotionId(input: string): string {
  const trimmed = input.trim();
  const uuidMatch = trimmed.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  if (uuidMatch) return uuidMatch[1];

  const compactMatch = trimmed.match(/([0-9a-f]{32})(?:[?#]|$)/i);
  if (!compactMatch) return trimmed;

  const raw = compactMatch[1];
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(
    12,
    16
  )}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

async function runMigration(databaseIdInput: string | undefined) {
  const cookieStore = await cookies();
  const token = cookieStore.get('notion_token')?.value;
  if (!token) {
    return Response.json(
      { error: 'Notion 연결이 필요합니다.' },
      { status: 401 }
    );
  }

  const databaseId = normalizeNotionId(
    databaseIdInput ?? cookieStore.get('notion_db_id')?.value ?? ''
  );
  if (!databaseId) {
    return Response.json(
      { error: '동기화할 Notion 데이터베이스 ID가 필요합니다.' },
      { status: 400 }
    );
  }

  try {
    await prepareSupabaseResumeImport(token, databaseId);

    const resumes = await getResumes();
    let sectionCount = 0;
    let createdCount = 0;
    let updatedCount = 0;

    for (const resume of resumes) {
      const sections = await getSections(resume.id);
      const result = await upsertResumeFromSupabase(
        token,
        databaseId,
        resume,
        sections
      );
      sectionCount += result.sectionCount;
      if (result.created) {
        createdCount += 1;
      } else {
        updatedCount += 1;
      }
    }

    return Response.json({
      migrated: true,
      resumeCount: resumes.length,
      sectionCount,
      createdCount,
      updatedCount,
    });
  } catch (err) {
    return Response.json(
      {
        error: `마이그레이션 실패: ${
          err instanceof Error ? err.message : '알 수 없는 오류'
        }`,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as MigrationRequestBody;
  return runMigration(body.databaseId);
}
