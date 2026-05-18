import { NextRequest } from 'next/server';

import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { createSection } from '@/lib/supabase-db';
import type { SectionType, SectionContent } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const { id } = await params;
    const body = (await request.json()) as {
      type: SectionType;
      content: SectionContent;
      order_index?: number;
      layout?: string;
    };
    const section = await createSection(
      auth,
      id,
      body.type,
      body.content,
      body.order_index ?? 0,
      body.layout
    );
    return Response.json(section, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Failed to create section: ${msg}` },
      { status: 500 }
    );
  }
}
