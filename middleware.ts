import { type NextRequest, NextResponse } from 'next/server';

import { USER_TOKEN_COOKIE_NAMES } from '@/lib/user-token-cookies';

export async function middleware(request: NextRequest) {
  const hasNotionDatabase =
    request.cookies.has(USER_TOKEN_COOKIE_NAMES.notionToken) &&
    request.cookies.has(USER_TOKEN_COOKIE_NAMES.notionDatabaseId);

  if (hasNotionDatabase) {
    return NextResponse.next({ request });
  }

  return NextResponse.redirect(new URL('/', request.url));
}

export const config = {
  matcher: ['/resumes/:path*'],
};
