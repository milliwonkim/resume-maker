import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getResumes, createResume } from '@/lib/notion-db';

async function getNotionCtx(): Promise<{
  token: string;
  databaseId: string;
} | null> {
  const store = await cookies();
  const token = store.get('notion_token')?.value;
  const databaseId = store.get('notion_db_id')?.value;
  if (!token || !databaseId) return null;
  return { token, databaseId };
}

export async function GET() {
  const ctx = await getNotionCtx();
  if (!ctx)
    return Response.json(
      { error: 'Notion 연결 및 데이터베이스 설정이 필요합니다.' },
      { status: 401 }
    );

  try {
    const resumes = await getResumes(ctx.token, ctx.databaseId);
    return Response.json(resumes);
  } catch (err) {
    return Response.json(
      {
        error: `Failed to fetch resumes: ${err instanceof Error ? err.message : ''}`,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getNotionCtx();
  if (!ctx)
    return Response.json(
      { error: 'Notion 연결 및 데이터베이스 설정이 필요합니다.' },
      { status: 401 }
    );

  try {
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const resume = await createResume(ctx.token, ctx.databaseId, body.title);
    return Response.json(resume, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error: `Failed to create resume: ${err instanceof Error ? err.message : ''}`,
      },
      { status: 500 }
    );
  }
}
