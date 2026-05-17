import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const NOTION_VERSION = '2022-06-28';

interface NotionRichText {
  plain_text: string;
}

interface NotionPageResult {
  id: string;
  object: 'page';
  properties: Record<
    string,
    {
      type: string;
      title?: NotionRichText[];
    }
  >;
  parent: {
    type: string;
    workspace?: boolean;
    page_id?: string;
  };
}

interface NotionSearchResponse {
  results: NotionPageResult[];
  has_more: boolean;
  next_cursor: string | null;
}

interface PageItem {
  id: string;
  title: string;
  isWorkspaceLevel: boolean;
}

export async function GET(request: NextRequest) {
  const store = await cookies();
  const token = store.get('notion_token')?.value;
  if (!token)
    return Response.json(
      { error: 'Notion 연결이 필요합니다.' },
      { status: 401 }
    );

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? '';

  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        filter: { value: 'page', property: 'object' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 20,
      }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      return Response.json(
        { error: err.message ?? '검색 실패' },
        { status: res.status }
      );
    }

    const data = (await res.json()) as NotionSearchResponse;
    const pages: PageItem[] = data.results.map((page) => {
      const titleProp = Object.values(page.properties).find(
        (p) => p.type === 'title'
      );
      const title =
        titleProp?.title?.map((t) => t.plain_text).join('') ?? '제목 없음';
      return {
        id: page.id,
        title,
        isWorkspaceLevel: page.parent.type === 'workspace',
      };
    });

    return Response.json({ pages });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '알 수 없는 오류' },
      { status: 500 }
    );
  }
}
