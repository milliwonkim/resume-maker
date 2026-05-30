'use client';

import { useState } from 'react';

import {
  USER_TOKEN_COOKIE_NAMES,
  getClientCookieValue,
} from '@/lib/user-token-cookies';

const NOTION_INTEGRATIONS_URL = 'https://www.notion.so/my-integrations';
const NOTION_DATABASE_CONNECTION_HELP_URL =
  'https://www.notion.com/help/add-and-manage-connections-with-the-api';
const GOOGLE_AI_STUDIO_API_KEY_URL = 'https://aistudio.google.com/apikey';

interface UserTokensResponse {
  ready?: boolean;
  error?: string;
}

interface NotionDatabaseOption {
  id: string;
  title: string;
}

type SetupStep = 'credentials' | 'database';

interface TokenSetupFormProps {
  onReady: () => void;
  title?: string;
  description?: string;
  defaultStep?: SetupStep;
}

export function TokenSetupForm({
  onReady,
  title = '이력서 만들기 전 토큰 세팅',
  description = '입력한 토큰은 서버 데이터베이스에 저장하지 않고 이 브라우저의 쿠키에만 보관됩니다. 다른 브라우저나 기기에서는 다시 설정해야 합니다.',
  defaultStep = 'credentials',
}: TokenSetupFormProps) {
  const [notionToken, setNotionToken] = useState('');
  const [notionDatabaseId, setNotionDatabaseId] = useState(() =>
    getClientCookieValue(USER_TOKEN_COOKIE_NAMES.notionDatabaseId)
  );
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [setupStep, setSetupStep] = useState<SetupStep>(defaultStep);
  const [databaseQuery, setDatabaseQuery] = useState('');
  const [databases, setDatabases] = useState<NotionDatabaseOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const handleCredentialsSubmit = async () => {
    setError('');
    setIsSaving(true);
    try {
      const response = await fetch('/api/user-tokens', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notionToken,
          geminiApiKey,
        }),
      });
      const data = (await response.json()) as UserTokensResponse;
      if (!response.ok) {
        setError(data.error ?? '토큰 확인에 실패했습니다.');
        return;
      }
      setSetupStep('database');
      setDatabases([]);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDatabaseSearch = async () => {
    setError('');
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (databaseQuery.trim()) params.set('q', databaseQuery.trim());
      const response = await fetch(
        `/api/user-tokens/notion-databases?${params.toString()}`
      );
      const data = (await response.json()) as {
        databases?: NotionDatabaseOption[];
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? 'Notion 데이터베이스를 불러오지 못했습니다.');
        return;
      }
      setDatabases(data.databases ?? []);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleDatabaseSubmit = async () => {
    setError('');
    setIsSaving(true);
    try {
      const response = await fetch('/api/user-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notionDatabaseId }),
      });
      const data = (await response.json()) as UserTokensResponse;
      if (!response.ok) {
        setError(data.error ?? '데이터베이스 확인에 실패했습니다.');
        return;
      }
      onReady();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const helpLinkClassName =
    'font-medium text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline';

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-center text-lg font-semibold text-gray-900">
        {title}
      </h2>
      <p className="mt-1 text-center text-sm text-gray-500">{description}</p>

      <div className="mt-5 flex rounded-lg bg-gray-100 p-1 text-xs font-medium text-gray-500">
        <span
          className={`flex-1 rounded-md px-3 py-1.5 text-center ${
            setupStep === 'credentials'
              ? 'bg-white text-gray-900 shadow-sm'
              : ''
          }`}
        >
          1. 토큰 확인
        </span>
        <span
          className={`flex-1 rounded-md px-3 py-1.5 text-center ${
            setupStep === 'database' ? 'bg-white text-gray-900 shadow-sm' : ''
          }`}
        >
          2. 데이터베이스 선택
        </span>
      </div>

      {setupStep === 'credentials' ? (
        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Notion 통합 토큰
            </label>
            <p className="mb-2 text-xs leading-5 text-gray-500">
              Notion의 내 통합 페이지에서 새 통합을 만든 뒤 Secret 값을
              복사하세요.{' '}
              <a
                href={NOTION_INTEGRATIONS_URL}
                target="_blank"
                rel="noreferrer"
                className={helpLinkClassName}
              >
                Notion 통합 만들기
              </a>
            </p>
            <input
              type="password"
              value={notionToken}
              onChange={(event) => setNotionToken(event.target.value)}
              placeholder="secret_..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Gemini API 키
            </label>
            <p className="mb-2 text-xs leading-5 text-gray-500">
              Google AI Studio에서 API 키를 만든 뒤 복사하세요. 키는 외부에
              공개하지 마세요.{' '}
              <a
                href={GOOGLE_AI_STUDIO_API_KEY_URL}
                target="_blank"
                rel="noreferrer"
                className={helpLinkClassName}
              >
                Gemini API 키 만들기
              </a>
            </p>
            <input
              type="password"
              value={geminiApiKey}
              onChange={(event) => setGeminiApiKey(event.target.value)}
              onKeyDown={(event) =>
                event.key === 'Enter' && void handleCredentialsSubmit()
              }
              placeholder="AIza..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Notion 데이터베이스 선택
            </label>
            <p className="mb-2 text-xs leading-5 text-gray-500">
              이력서를 저장할 Notion 데이터베이스를 만들고, 1단계에서 만든
              통합을 데이터베이스 연결에 추가하세요.{' '}
              <a
                href={NOTION_DATABASE_CONNECTION_HELP_URL}
                target="_blank"
                rel="noreferrer"
                className={helpLinkClassName}
              >
                데이터베이스 연결 방법
              </a>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={databaseQuery}
                onChange={(event) => setDatabaseQuery(event.target.value)}
                onKeyDown={(event) =>
                  event.key === 'Enter' && void handleDatabaseSearch()
                }
                placeholder="데이터베이스 이름으로 검색"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleDatabaseSearch}
                disabled={isSearching}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {isSearching ? '검색 중...' : '검색'}
              </button>
            </div>
            {databases.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                {databases.map((database) => (
                  <button
                    key={database.id}
                    type="button"
                    onClick={() => setNotionDatabaseId(database.id)}
                    className={`flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-blue-50 ${
                      notionDatabaseId === database.id
                        ? 'bg-blue-50 text-blue-700'
                        : ''
                    }`}
                  >
                    <span className="min-w-0 truncate">{database.title}</span>
                    {notionDatabaseId === database.id && (
                      <span className="text-xs font-medium">선택됨</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              데이터베이스 ID 또는 URL
            </label>
            <input
              type="text"
              value={notionDatabaseId}
              onChange={(event) => setNotionDatabaseId(event.target.value)}
              onKeyDown={(event) =>
                event.key === 'Enter' && void handleDatabaseSubmit()
              }
              placeholder="Notion 데이터베이스 URL 또는 ID"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-500">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={
          setupStep === 'credentials'
            ? handleCredentialsSubmit
            : handleDatabaseSubmit
        }
        disabled={isSaving}
        className="mt-5 w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
      >
        {isSaving
          ? setupStep === 'credentials'
            ? '토큰 확인 중...'
            : '데이터베이스 확인 중...'
          : setupStep === 'credentials'
            ? '토큰 확인하고 다음'
            : '데이터베이스 확인하고 시작'}
      </button>
      {setupStep === 'database' && (
        <button
          type="button"
          onClick={() => {
            setError('');
            setSetupStep('credentials');
          }}
          className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          토큰 다시 설정
        </button>
      )}
    </div>
  );
}
