export const USER_TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const USER_TOKEN_COOKIE_NAMES = {
  notionToken: 'notion_token',
  notionDatabaseId: 'resume_builder_notion_database_id',
  geminiApiKey: 'resume_builder_gemini_api_key',
} as const;

export interface UserTokenStatus {
  hasNotionToken: boolean;
  hasNotionDatabaseId: boolean;
  hasGeminiApiKey: boolean;
}

export interface UserTokenValues {
  notionToken: string;
  notionDatabaseId: string;
  geminiApiKey: string;
}

export function getClientCookieValue(name: string): string {
  if (typeof document === 'undefined') return '';

  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : '';
}

export function getClientUserTokenStatus(): UserTokenStatus {
  return {
    hasNotionToken: Boolean(
      getClientCookieValue(USER_TOKEN_COOKIE_NAMES.notionToken)
    ),
    hasNotionDatabaseId: Boolean(
      getClientCookieValue(USER_TOKEN_COOKIE_NAMES.notionDatabaseId)
    ),
    hasGeminiApiKey: Boolean(
      getClientCookieValue(USER_TOKEN_COOKIE_NAMES.geminiApiKey)
    ),
  };
}

export function hasRequiredUserTokens(status: UserTokenStatus): boolean {
  return (
    status.hasNotionToken &&
    status.hasNotionDatabaseId &&
    status.hasGeminiApiKey
  );
}
