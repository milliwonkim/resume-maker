import { cookies } from 'next/headers';

import {
  USER_TOKEN_COOKIE_NAMES,
  type UserTokenStatus,
} from '@/lib/user-token-cookies';

export async function getServerUserTokenStatus(): Promise<UserTokenStatus> {
  const cookieStore = await cookies();

  return {
    hasNotionToken: cookieStore.has(USER_TOKEN_COOKIE_NAMES.notionToken),
    hasNotionDatabaseId: cookieStore.has(
      USER_TOKEN_COOKIE_NAMES.notionDatabaseId
    ),
    hasGeminiApiKey: cookieStore.has(USER_TOKEN_COOKIE_NAMES.geminiApiKey),
  };
}

export interface ServerNotionConfig {
  token: string;
  databaseId: string;
}

export async function requireServerNotionConfig(): Promise<ServerNotionConfig> {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_TOKEN_COOKIE_NAMES.notionToken)?.value;
  const databaseId = cookieStore.get(
    USER_TOKEN_COOKIE_NAMES.notionDatabaseId
  )?.value;

  if (!token || !databaseId) {
    throw new Error('Notion 데이터베이스 토큰이 설정되지 않았습니다.');
  }

  return { token, databaseId };
}

export async function getServerGeminiApiKey(
  requestApiKey?: string
): Promise<string> {
  const cookieStore = await cookies();
  return (
    requestApiKey?.trim() ||
    cookieStore.get(USER_TOKEN_COOKIE_NAMES.geminiApiKey)?.value ||
    process.env.GEMINI_API_KEY ||
    ''
  );
}
