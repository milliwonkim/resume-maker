import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { updateResumeTitle, deleteResume, getSections } from '@/lib/notion-db';

async function getToken(): Promise<string | null> {
  const store = await cookies();
  return store.get('notion_token')?.value ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await getToken();
  if (!token) return Response.json({ error: 'Notion 연결이 필요합니다.' }, { status: 401 });

  try {
    const { id } = await params;
    const sections = await getSections(token, id);
    return Response.json({ sections });
  } catch {
    return Response.json({ error: 'Failed to fetch resume' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await getToken();
  if (!token) return Response.json({ error: 'Notion 연결이 필요합니다.' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json() as { title: string };
    await updateResumeTitle(token, id, body.title);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to update resume' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await getToken();
  if (!token) return Response.json({ error: 'Notion 연결이 필요합니다.' }, { status: 401 });

  try {
    const { id } = await params;
    await deleteResume(token, id);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to delete resume' }, { status: 500 });
  }
}
