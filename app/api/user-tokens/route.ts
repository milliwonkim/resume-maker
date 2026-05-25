import { GoogleGenAI } from '@google/genai';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

import {
  USER_TOKEN_COOKIE_MAX_AGE,
  USER_TOKEN_COOKIE_NAMES,
  type UserTokenValues,
  hasRequiredUserTokens,
} from '@/lib/user-token-cookies';
import { getGeminiErrorResult } from '@/lib/gemini-errors';
import { getServerUserTokenStatus } from '@/lib/server-user-tokens';

const COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: USER_TOKEN_COOKIE_MAX_AGE,
};

interface UserTokenRequestBody {
  notionToken?: string;
  notionDatabaseId?: string;
  geminiApiKey?: string;
}

interface ValidationResult {
  values?: UserTokenValues;
  error?: string;
}

interface CredentialValidationResult {
  notionToken?: string;
  geminiApiKey?: string;
  error?: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNotionDatabaseId(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/[0-9a-fA-F]{32}/);
  const raw = match?.[0] ?? trimmed.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(raw)) {
    throw new Error('Notion 데이터베이스 ID 또는 URL을 확인해주세요.');
  }
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(
    12,
    16
  )}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

async function validateNotionDatabase(
  notionToken: string,
  notionDatabaseId: string
): Promise<void> {
  const response = await fetch(
    `https://api.notion.com/v1/databases/${notionDatabaseId}`,
    {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error('Notion 토큰 또는 데이터베이스 권한을 확인해주세요.');
  }

  await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        Kind: { select: {} },
        EntityId: { rich_text: {} },
        ResumeId: { rich_text: {} },
        SectionType: { select: {} },
        Layout: { rich_text: {} },
        Order: { number: {} },
        UpdatedAt: { date: {} },
      },
    }),
  });
}

async function validateGeminiApiKey(apiKey: string): Promise<void> {
  const genAI = new GoogleGenAI({ apiKey });
  try {
    await genAI.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: 'Return only OK.',
    });
  } catch (error) {
    throw new Error(getGeminiErrorResult(error).message);
  }
}

async function validateNotionToken(notionToken: string): Promise<void> {
  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { value: 'database', property: 'object' },
      page_size: 1,
    }),
  });

  if (!response.ok) {
    throw new Error('Notion 통합 토큰을 확인해주세요.');
  }
}

async function validateCredentials(
  body: unknown
): Promise<CredentialValidationResult> {
  if (!body || typeof body !== 'object') {
    return { error: '잘못된 요청입니다.' };
  }

  const candidate = body as UserTokenRequestBody;
  const notionToken = readString(candidate.notionToken);
  const geminiApiKey = readString(candidate.geminiApiKey);

  if (!notionToken || !geminiApiKey) {
    return { error: 'Notion 통합 토큰과 Gemini API 키가 필요합니다.' };
  }

  try {
    await validateNotionToken(notionToken);
    await validateGeminiApiKey(geminiApiKey);

    return { notionToken, geminiApiKey };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : '토큰 확인에 실패했습니다.',
    };
  }
}

async function validateBody(body: unknown): Promise<ValidationResult> {
  if (!body || typeof body !== 'object') {
    return { error: '잘못된 요청입니다.' };
  }

  const candidate = body as UserTokenRequestBody;
  const cookieStore = await cookies();
  const notionToken =
    readString(candidate.notionToken) ||
    cookieStore.get(USER_TOKEN_COOKIE_NAMES.notionToken)?.value ||
    '';
  const geminiApiKey =
    readString(candidate.geminiApiKey) ||
    cookieStore.get(USER_TOKEN_COOKIE_NAMES.geminiApiKey)?.value ||
    '';
  const notionDatabaseIdInput = readString(candidate.notionDatabaseId);

  if (!notionToken || !notionDatabaseIdInput || !geminiApiKey) {
    return {
      error: 'Notion 토큰, Notion 데이터베이스 ID, Gemini API 키가 모두 필요합니다.',
    };
  }

  try {
    const notionDatabaseId = normalizeNotionDatabaseId(notionDatabaseIdInput);
    await validateNotionDatabase(notionToken, notionDatabaseId);
    await validateGeminiApiKey(geminiApiKey);

    return {
      values: {
        notionToken,
        notionDatabaseId,
        geminiApiKey,
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : '토큰 확인에 실패했습니다.',
    };
  }
}

export async function GET() {
  const status = await getServerUserTokenStatus();
  return Response.json({
    ...status,
    hasCredentials: status.hasNotionToken && status.hasGeminiApiKey,
    ready: hasRequiredUserTokens(status),
  });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const validation = await validateCredentials(body);
  if (!validation.notionToken || !validation.geminiApiKey) {
    return Response.json(
      { error: validation.error ?? '토큰 확인에 실패했습니다.' },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(USER_TOKEN_COOKIE_NAMES.notionToken, validation.notionToken, {
    ...COOKIE_OPTIONS,
    httpOnly: true,
  });
  cookieStore.set(
    USER_TOKEN_COOKIE_NAMES.geminiApiKey,
    validation.geminiApiKey,
    {
      ...COOKIE_OPTIONS,
      httpOnly: true,
    }
  );
  cookieStore.delete(USER_TOKEN_COOKIE_NAMES.notionDatabaseId);

  return Response.json({ ok: true });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const validation = await validateBody(body);
  if (!validation.values) {
    return Response.json(
      { error: validation.error ?? '토큰 확인에 실패했습니다.' },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(
    USER_TOKEN_COOKIE_NAMES.notionToken,
    validation.values.notionToken,
    {
      ...COOKIE_OPTIONS,
      httpOnly: true,
    }
  );
  cookieStore.set(
    USER_TOKEN_COOKIE_NAMES.notionDatabaseId,
    validation.values.notionDatabaseId,
    COOKIE_OPTIONS
  );
  cookieStore.set(
    USER_TOKEN_COOKIE_NAMES.geminiApiKey,
    validation.values.geminiApiKey,
    {
      ...COOKIE_OPTIONS,
      httpOnly: true,
    }
  );

  return Response.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(USER_TOKEN_COOKIE_NAMES.notionToken);
  cookieStore.delete(USER_TOKEN_COOKIE_NAMES.notionDatabaseId);
  cookieStore.delete(USER_TOKEN_COOKIE_NAMES.geminiApiKey);

  return Response.json({ ok: true });
}
