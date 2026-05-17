import { NextRequest } from 'next/server';
import {
  updateSectionLayout,
  updateSectionContent,
  updateSectionOrder,
  deleteSection,
} from '@/lib/supabase-db';
import type { SectionContent } from '@/lib/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const body = (await request.json()) as {
      layout?: string;
      content?: SectionContent;
      order_index?: number;
    };

    if (body.layout !== undefined)
      await updateSectionLayout(id, sectionId, body.layout);
    if (body.content !== undefined)
      await updateSectionContent(id, sectionId, body.content);
    if (body.order_index !== undefined)
      await updateSectionOrder(id, sectionId, body.order_index);

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
  try {
    const { id, sectionId } = await params;
    await deleteSection(id, sectionId);
    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: 'Failed to delete section' },
      { status: 500 }
    );
  }
}
