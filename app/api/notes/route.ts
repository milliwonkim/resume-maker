import { NextRequest } from 'next/server';

import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { createNote, getNotes } from '@/lib/notion-db';
import { normalizeRichTextValue } from '@/lib/rich-text';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const notes = await getNotes(auth);
    return Response.json(notes);
  } catch {
    return Response.json(
      { error: '메모를 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const body = (await request.json().catch(() => ({}))) as unknown;
    const title =
      isRecord(body) && typeof body.title === 'string'
        ? body.title.trim() || '새 메모'
        : '새 메모';
    const content = isRecord(body)
      ? normalizeRichTextValue(body.content)
      : normalizeRichTextValue(undefined);

    const note = await createNote(auth, title, content);
    return Response.json(note, { status: 201 });
  } catch {
    return Response.json(
      { error: '메모를 만들지 못했습니다.' },
      { status: 500 }
    );
  }
}
