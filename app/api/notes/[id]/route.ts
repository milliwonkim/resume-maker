import { NextRequest } from 'next/server';

import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { deleteNote, updateNote } from '@/lib/notion-db';
import { normalizeRichTextValue } from '@/lib/rich-text';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    if (!isRecord(body)) {
      return Response.json(
        { error: '요청 형식이 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    await updateNote(auth, id, {
      title: typeof body.title === 'string' ? body.title.trim() : undefined,
      content:
        body.content !== undefined
          ? normalizeRichTextValue(body.content)
          : undefined,
    });

    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: '메모를 수정하지 못했습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const { id } = await params;
    await deleteNote(auth, id);
    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: '메모를 삭제하지 못했습니다.' },
      { status: 500 }
    );
  }
}
