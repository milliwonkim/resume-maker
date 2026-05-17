import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  updateSectionLayout,
  updateSectionContent,
  updateSectionOrder,
  deleteSection,
} from '@/lib/notion-db';
import type { SectionContent } from '@/lib/types';

async function getToken(): Promise<string | null> {
  const store = await cookies();
  return store.get('notion_token')?.value ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const token = await getToken();
  if (!token)
    return Response.json(
      { error: 'Notion 연결이 필요합니다.' },
      { status: 401 }
    );

  try {
    const { id, sectionId } = await params;
    const body = (await request.json()) as {
      layout?: string;
      content?: SectionContent;
      order_index?: number;
    };

    if (body.layout !== undefined)
      await updateSectionLayout(token, id, sectionId, body.layout);
    if (body.content !== undefined)
      await updateSectionContent(token, id, sectionId, body.content);
    if (body.order_index !== undefined)
      await updateSectionOrder(token, id, sectionId, body.order_index);

    return Response.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Failed to update section: ${msg}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const token = await getToken();
  if (!token)
    return Response.json(
      { error: 'Notion 연결이 필요합니다.' },
      { status: 401 }
    );

  try {
    const { id, sectionId } = await params;
    await deleteSection(token, id, sectionId);
    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: 'Failed to delete section' },
      { status: 500 }
    );
  }
}
