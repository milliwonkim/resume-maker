import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSection } from '@/lib/notion-db';
import type { SectionType, SectionContent } from '@/lib/types';

async function getToken(): Promise<string | null> {
  const store = await cookies();
  return store.get('notion_token')?.value ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  if (!token)
    return Response.json(
      { error: 'Notion 연결이 필요합니다.' },
      { status: 401 }
    );

  try {
    const { id } = await params;
    const body = (await request.json()) as {
      type: SectionType;
      content: SectionContent;
      order_index?: number;
      layout?: string;
    };
    const section = await createSection(
      token,
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
