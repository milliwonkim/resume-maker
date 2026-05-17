import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'notion_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

// POST: save token as httpOnly cookie after validating with Notion
export async function POST(request: NextRequest) {
  let token: string;
  try {
    const body = (await request.json()) as { token: string };
    token = body.token?.trim();
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  if (!token) {
    return Response.json({ error: '토큰이 필요합니다.' }, { status: 400 });
  }

  // Validate the token against Notion before storing
  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { value: 'page', property: 'object' },
      page_size: 1,
    }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    return Response.json(
      { error: err.message ?? 'Notion 토큰이 유효하지 않습니다.' },
      { status: 401 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, COOKIE_OPTIONS);

  return Response.json({ ok: true });
}

// GET: check whether a token cookie is already set
export async function GET() {
  const cookieStore = await cookies();
  const has = cookieStore.has(COOKIE_NAME);
  return Response.json({ connected: has });
}

// DELETE: clear the token cookie (logout)
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return Response.json({ ok: true });
}
