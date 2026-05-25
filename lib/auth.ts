import { cookies } from 'next/headers';

import { USER_TOKEN_COOKIE_NAMES } from '@/lib/user-token-cookies';

export interface AuthenticatedUser {
  id: string;
  accessToken: string;
  email: string | null;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const notionToken = cookieStore.get(USER_TOKEN_COOKIE_NAMES.notionToken);
  const notionDatabaseId = cookieStore.get(
    USER_TOKEN_COOKIE_NAMES.notionDatabaseId
  );

  if (notionToken && notionDatabaseId) {
    return {
      id: 'notion-user',
      accessToken: notionToken.value,
      email: 'Notion 데이터베이스',
    };
  }

  return null;
}

export function unauthorizedResponse() {
  return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
}
