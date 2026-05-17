import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const NOTION_VERSION = '2022-06-28';
const DB_COOKIE = 'notion_db_id';
const DB_TITLE = '이력서 저장소';
const RESUME_DB_PROPERTIES = {
  title: { title: {} },
  'Supabase ID': { rich_text: {} },
  이름: { rich_text: {} },
  직무: { rich_text: {} },
  이메일: { rich_text: {} },
  전화: { rich_text: {} },
  지역: { rich_text: {} },
  LinkedIn: { rich_text: {} },
  GitHub: { rich_text: {} },
  웹사이트: { rich_text: {} },
  자기소개: { rich_text: {} },
  '일반 텍스트': { rich_text: {} },
  경력: { rich_text: {} },
  학력: { rich_text: {} },
  기술: { rich_text: {} },
  프로젝트: { rich_text: {} },
  '동기화 시각': { date: {} },
};

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

interface NotionRichText {
  plain_text: string;
}

interface NotionDatabase {
  id: string;
  title: NotionRichText[];
  object: string;
  parent: {
    type: string;
    page_id?: string;
  };
}

interface NotionSearchResponse {
  results: NotionDatabase[];
}

interface DatabaseRequestBody {
  parentPageId?: string;
  parentPageUrl?: string;
}

function normalizePageId(input: string): string | null {
  const trimmed = input.trim();
  const uuidMatch = trimmed.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  if (uuidMatch) return uuidMatch[1];

  const compactMatch = trimmed.match(/([0-9a-f]{32})(?:[?#]|$)/i);
  if (!compactMatch) return null;

  const raw = compactMatch[1];
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

async function validateParentPage(
  token: string,
  parentPageId: string
): Promise<Response | null> {
  const pageRes = await fetch(
    `https://api.notion.com/v1/pages/${parentPageId}`,
    {
      headers: notionHeaders(token),
    }
  );

  if (pageRes.ok) return null;

  const err = (await pageRes.json()) as { message?: string };
  return Response.json(
    { error: err.message ?? '유효한 Notion 페이지를 찾을 수 없습니다.' },
    { status: pageRes.status }
  );
}

// GET: 현재 저장된 데이터베이스 ID 반환
export async function GET() {
  const store = await cookies();
  const dbId = store.get(DB_COOKIE)?.value ?? null;
  return Response.json({ databaseId: dbId });
}

// POST: 선택한 Notion 페이지 안에서 이력서 DB를 찾거나 생성
export async function POST(request: NextRequest) {
  const store = await cookies();
  const token = store.get('notion_token')?.value;
  if (!token)
    return Response.json(
      { error: 'Notion 연결이 필요합니다.' },
      { status: 401 }
    );

  let parentPageId: string;
  try {
    const body = (await request.json()) as DatabaseRequestBody;
    const rawParentPageId = body.parentPageId ?? body.parentPageUrl;
    if (!rawParentPageId)
      return Response.json(
        { error: '저장할 Notion 페이지가 필요합니다.' },
        { status: 400 }
      );

    const normalizedPageId = normalizePageId(rawParentPageId);
    if (!normalizedPageId)
      return Response.json(
        { error: '올바른 Notion 페이지 링크 또는 ID를 입력해주세요.' },
        { status: 400 }
      );

    parentPageId = normalizedPageId;
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  try {
    const invalidPageResponse = await validateParentPage(token, parentPageId);
    if (invalidPageResponse) return invalidPageResponse;

    // 해당 페이지의 하위에 기존 이력서 DB가 있는지 확인
    const searchRes = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify({
        query: DB_TITLE,
        filter: { value: 'database', property: 'object' },
        page_size: 20,
      }),
    });

    if (searchRes.ok) {
      const searchData = (await searchRes.json()) as NotionSearchResponse;
      const existing = searchData.results.find(
        (db) =>
          db.title?.map((t) => t.plain_text).join('') === DB_TITLE &&
          db.parent.type === 'page_id' &&
          db.parent.page_id === parentPageId
      );
      if (existing) {
        store.set(DB_COOKIE, existing.id, COOKIE_OPTIONS);
        return Response.json({ databaseId: existing.id, created: false });
      }
    }

    // 없으면 해당 페이지 하위에 새 데이터베이스 생성
    const createRes = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify({
        parent: { type: 'page_id', page_id: parentPageId },
        title: [{ type: 'text', text: { content: DB_TITLE } }],
        properties: RESUME_DB_PROPERTIES,
      }),
    });

    if (!createRes.ok) {
      const err = (await createRes.json()) as { message?: string };
      return Response.json(
        { error: err.message ?? '데이터베이스 생성 실패' },
        { status: createRes.status }
      );
    }

    const db = (await createRes.json()) as NotionDatabase;
    store.set(DB_COOKIE, db.id, COOKIE_OPTIONS);
    return Response.json({ databaseId: db.id, created: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '알 수 없는 오류' },
      { status: 500 }
    );
  }
}

// DELETE: 데이터베이스 연결 해제
export async function DELETE() {
  const store = await cookies();
  store.delete(DB_COOKIE);
  return Response.json({ ok: true });
}
