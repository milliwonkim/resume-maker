import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

import { USER_TOKEN_COOKIE_NAMES } from '@/lib/user-token-cookies';

const NOTION_VERSION = '2022-06-28';

interface NotionRichText {
  plain_text: string;
}

interface NotionDatabaseResult {
  id: string;
  object: 'database';
  title?: NotionRichText[];
}

interface NotionSearchResponse {
  results: NotionDatabaseResult[];
}

interface DatabaseOption {
  id: string;
  title: string;
}

function databaseTitle(database: NotionDatabaseResult): string {
  const title = database.title?.map((item) => item.plain_text).join('').trim();
  return title || '제목 없는 데이터베이스';
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_TOKEN_COOKIE_NAMES.notionToken)?.value;

  if (!token) {
    return Response.json(
      { error: '먼저 Notion 통합 토큰을 확인해주세요.' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() ?? '';

  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      filter: { value: 'database', property: 'object' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 20,
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    return Response.json(
      { error: error.message ?? 'Notion 데이터베이스를 불러오지 못했습니다.' },
      { status: response.status }
    );
  }

  const data = (await response.json()) as NotionSearchResponse;
  const databases: DatabaseOption[] = data.results.map((database) => ({
    id: database.id,
    title: databaseTitle(database),
  }));

  return Response.json({ databases });
}
