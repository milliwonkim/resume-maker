import { NextRequest } from 'next/server';

import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import {
  getResumeNoteIds,
  linkResumeNote,
  unlinkResumeNote,
} from '@/lib/notion-db';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const { id } = await params;
    const noteIds = await getResumeNoteIds(auth, id);
    return Response.json({ noteIds });
  } catch {
    return Response.json(
      { error: '연결된 메모를 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as unknown;
    if (
      !isRecord(body) ||
      typeof body.noteId !== 'string' ||
      typeof body.linked !== 'boolean'
    ) {
      return Response.json(
        { error: '요청 형식이 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    if (body.linked) {
      await linkResumeNote(auth, id, body.noteId);
    } else {
      await unlinkResumeNote(auth, id, body.noteId);
    }

    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: '메모 연결을 변경하지 못했습니다.' },
      { status: 500 }
    );
  }
}
