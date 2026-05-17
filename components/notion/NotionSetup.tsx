'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAIStore } from '@/store/ai';

const NOTION_STATUS_KEY = ['notion', 'status'] as const;

interface PageItem {
  id: string;
  title: string;
  isWorkspaceLevel: boolean;
}

interface StatusData {
  connected: boolean;
  databaseId: string | null;
}

async function fetchStatus(): Promise<StatusData> {
  const [tokenRes, dbRes] = await Promise.all([
    fetch('/api/notion/token'),
    fetch('/api/notion/database'),
  ]);
  const token = (await tokenRes.json()) as { connected: boolean };
  const db = (await dbRes.json()) as { databaseId: string | null };
  return { connected: token.connected, databaseId: db.databaseId };
}

type Step = 'token' | 'reference' | 'location';

interface NotionSetupProps {
  onReady: () => void;
}

export function NotionSetup({ onReady }: NotionSetupProps) {
  const queryClient = useQueryClient();
  const { setNotionPageUrl } = useAIStore();
  const { data: status, isLoading } = useQuery({
    queryKey: NOTION_STATUS_KEY,
    queryFn: fetchStatus,
    staleTime: 1000 * 60,
  });

  const [step, setStep] = useState<Step>('token');
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [pageQuery, setPageQuery] = useState('');
  const [pages, setPages] = useState<PageItem[]>([]);
  const [pageSearching, setPageSearching] = useState(false);
  const [selectedRefPageId, setSelectedRefPageId] = useState('');
  const [selectedRefPageTitle, setSelectedRefPageTitle] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [locationPageUrl, setLocationPageUrl] = useState('');
  const effectiveStep =
    status?.connected && !status.databaseId && step === 'token'
      ? 'reference'
      : step;

  useEffect(() => {
    if (status?.connected && status.databaseId) {
      onReady();
    }
  }, [status, onReady]);

  const moveToStep = useCallback((nextStep: Step) => {
    setPages([]);
    setPageQuery('');
    setSelectedRefPageId('');
    setSelectedLocationId('');
    setLocationPageUrl('');
    setStep(nextStep);
  }, []);

  const connectToken = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notion/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? '연결 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTION_STATUS_KEY });
      moveToStep('reference');
      setTokenError('');
    },
    onError: (err: Error) => setTokenError(err.message),
  });

  const searchPages = useCallback(async (q: string) => {
    setPageSearching(true);
    try {
      const res = await fetch(`/api/notion/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { pages?: PageItem[] };
      setPages(data.pages ?? []);
    } finally {
      setPageSearching(false);
    }
  }, []);

  useEffect(() => {
    if (effectiveStep !== 'reference' && effectiveStep !== 'location') return;
    const timer = setTimeout(() => searchPages(pageQuery), 300);
    return () => clearTimeout(timer);
  }, [effectiveStep, pageQuery, searchPages]);

  const handleSelectReference = () => {
    if (selectedRefPageId) {
      // Save reference page URL to local store
      const url = `https://www.notion.so/${selectedRefPageId.replace(/-/g, '')}`;
      setNotionPageUrl(url);
    }
    moveToStep('location');
  };

  const selectLocation = useMutation({
    mutationFn: async (location: {
      parentPageId?: string;
      parentPageUrl?: string;
    }) => {
      const res = await fetch('/api/notion/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(location),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? '데이터베이스 설정 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTION_STATUS_KEY });
      onReady();
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-400">불러오는 중...</div>
      </div>
    );
  }

  const stepIndex =
    effectiveStep === 'token' ? 0 : effectiveStep === 'reference' ? 1 : 2;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-2">
          <StepDot index={0} current={stepIndex} label="1" />
          <div className="h-px flex-1 bg-gray-200" />
          <StepDot index={1} current={stepIndex} label="2" />
          <div className="h-px flex-1 bg-gray-200" />
          <StepDot index={2} current={stepIndex} label="3" />
        </div>

        {/* Browser-only notice */}
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
          <span className="mt-0.5 shrink-0 text-sm text-amber-500">🔒</span>
          <p className="text-xs leading-relaxed text-amber-700">
            입력하신 모든 정보(API 키, 토큰, 페이지 링크)는{' '}
            <strong>이 브라우저에만 저장</strong>되며 외부 서버로 전송되지
            않습니다.
          </p>
        </div>

        {/* Step 1: Token */}
        {effectiveStep === 'token' && (
          <>
            <h2 className="mb-1 text-xl font-bold text-gray-900">
              Notion 연결
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              Notion Integration 토큰을 입력하세요.{' '}
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                토큰 발급하기 →
              </a>
            </p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connectToken.mutate()}
              placeholder="secret_..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              autoFocus
            />
            {tokenError && (
              <p className="mt-2 text-xs text-red-500">{tokenError}</p>
            )}
            <button
              type="button"
              onClick={() => connectToken.mutate()}
              disabled={!token.trim() || connectToken.isPending}
              className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {connectToken.isPending ? '연결 중...' : '연결하기'}
            </button>
          </>
        )}

        {/* Step 2: Reference page */}
        {effectiveStep === 'reference' && (
          <>
            <h2 className="mb-1 text-xl font-bold text-gray-900">
              참고 페이지 선택
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              AI가 이력서 작성 시 참고할 Notion 페이지를 선택하세요.{' '}
              <span className="text-gray-400">
                (선택 사항 — 나중에 설정에서 변경 가능)
              </span>
            </p>
            <input
              type="text"
              value={pageQuery}
              onChange={(e) => setPageQuery(e.target.value)}
              placeholder="페이지 검색..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              autoFocus
            />
            <div className="mt-2 max-h-52 overflow-hidden overflow-y-auto rounded-lg border border-gray-100">
              {pageSearching ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  검색 중...
                </div>
              ) : pages.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  페이지를 검색해주세요
                </div>
              ) : (
                pages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => {
                      setSelectedRefPageId(page.id);
                      setSelectedRefPageTitle(page.title);
                    }}
                    className={`flex w-full items-center gap-2 border-b border-gray-50 px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-blue-50 ${
                      selectedRefPageId === page.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700'
                    }`}
                  >
                    <span className="text-base">📄</span>
                    <span className="flex-1 truncate">{page.title}</span>
                    {selectedRefPageId === page.id && (
                      <span className="text-xs text-blue-600">선택됨</span>
                    )}
                  </button>
                ))
              )}
            </div>
            {selectedRefPageTitle && (
              <p className="mt-2 text-xs text-blue-600">
                ✓ {selectedRefPageTitle} 선택됨
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => moveToStep('location')}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                건너뛰기
              </button>
              <button
                type="button"
                onClick={handleSelectReference}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                다음
              </button>
            </div>
          </>
        )}

        {/* Step 3: Save location */}
        {effectiveStep === 'location' && (
          <>
            <h2 className="mb-1 text-xl font-bold text-gray-900">
              저장 위치 선택
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              이력서를 저장할 Notion 페이지를 검색해서 선택하거나 링크를
              붙여넣으세요.{' '}
              <span className="font-medium text-gray-700">이력서 저장소</span>{' '}
              데이터베이스가 해당 페이지 안에 생성됩니다.
            </p>
            <input
              type="text"
              value={pageQuery}
              onChange={(e) => setPageQuery(e.target.value)}
              placeholder="페이지 검색..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              autoFocus
            />
            <div className="mt-2 max-h-52 overflow-hidden overflow-y-auto rounded-lg border border-gray-100">
              {pageSearching ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  검색 중...
                </div>
              ) : pages.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  페이지를 검색해주세요
                </div>
              ) : (
                pages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => {
                      setSelectedLocationId(page.id);
                      setLocationPageUrl('');
                    }}
                    className={`flex w-full items-center gap-2 border-b border-gray-50 px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-blue-50 ${
                      selectedLocationId === page.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700'
                    }`}
                  >
                    <span className="text-base">📁</span>
                    <span className="flex-1 truncate">{page.title}</span>
                    {selectedLocationId === page.id && (
                      <span className="text-xs text-blue-600">선택됨</span>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-100" />
              <span className="text-xs text-gray-400">또는</span>
              <div className="h-px flex-1 bg-gray-100" />
            </div>
            <input
              type="url"
              value={locationPageUrl}
              onChange={(e) => {
                setLocationPageUrl(e.target.value);
                setSelectedLocationId('');
              }}
              placeholder="Notion 페이지 링크 붙여넣기"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
            {selectLocation.isError && (
              <p className="mt-2 text-xs text-red-500">
                {(selectLocation.error as Error).message}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => moveToStep('reference')}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                이전
              </button>
              <button
                type="button"
                onClick={() =>
                  selectLocation.mutate(
                    selectedLocationId
                      ? { parentPageId: selectedLocationId }
                      : { parentPageUrl: locationPageUrl.trim() }
                  )
                }
                disabled={
                  (!selectedLocationId && !locationPageUrl.trim()) ||
                  selectLocation.isPending
                }
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {selectLocation.isPending ? '확인 중...' : '확인 후 저장하기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepDot({
  index,
  current,
  label,
}: {
  index: number;
  current: number;
  label: string;
}) {
  const done = current > index;
  const active = current === index;
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
        done
          ? 'bg-blue-600 text-white'
          : active
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-400'
      }`}
    >
      {done ? '✓' : label}
    </div>
  );
}
