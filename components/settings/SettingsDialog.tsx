'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAIStore } from '@/store/ai';

type SettingsTab = 'ai' | 'notion';

interface PageItem {
  id: string;
  title: string;
  isWorkspaceLevel: boolean;
}

interface Props {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: Props) {
  const {
    rules,
    setRules,
    geminiKey,
    setGeminiKey,
    notionPageUrl,
    setNotionPageUrl,
    autoSave,
    setAutoSave,
  } = useAIStore();

  const [tab, setTab] = useState<SettingsTab>('ai');

  // AI tab state
  const [rulesLocal, setRulesLocal] = useState(rules);
  const [geminiKeyLocal, setGeminiKeyLocal] = useState(geminiKey);
  const [autoSaveLocal, setAutoSaveLocal] = useState(autoSave);

  // Notion tab state
  const [tokenInput, setTokenInput] = useState('');
  const [pageUrlLocal, setPageUrlLocal] = useState(notionPageUrl);
  const [notionConnected, setNotionConnected] = useState(false);
  const [notionChecking, setNotionChecking] = useState(true);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionError, setNotionError] = useState('');
  const [databaseId, setDatabaseId] = useState<string | null>(null);

  // Location change state
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationPages, setLocationPages] = useState<PageItem[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedLocationTitle, setSelectedLocationTitle] = useState('');
  const [locationPageUrl, setLocationPageUrl] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/notion/token').then(
        (r) => r.json() as Promise<{ connected: boolean }>
      ),
      fetch('/api/notion/database').then(
        (r) => r.json() as Promise<{ databaseId: string | null }>
      ),
    ])
      .then(([token, db]) => {
        if (token.connected) setNotionConnected(true);
        setDatabaseId(db.databaseId);
      })
      .catch(() => {})
      .finally(() => setNotionChecking(false));
  }, []);

  useEffect(() => {
    if (!showLocationPicker) return;
    const timer = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const res = await fetch(
          `/api/notion/search?q=${encodeURIComponent(locationQuery)}`
        );
        const data = (await res.json()) as { pages?: PageItem[] };
        setLocationPages(data.pages ?? []);
      } finally {
        setLocationSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [locationQuery, showLocationPicker]);

  const handleSaveAI = () => {
    setRules(rulesLocal);
    setGeminiKey(geminiKeyLocal);
    setAutoSave(autoSaveLocal);
    onClose();
  };

  const handleNotionConnect = useCallback(async () => {
    if (!tokenInput.trim()) {
      setNotionError('토큰을 입력해주세요.');
      return;
    }
    setNotionLoading(true);
    setNotionError('');
    try {
      const res = await fetch('/api/notion/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setNotionError(data.error ?? '연결 실패');
        return;
      }
      setTokenInput('');
      setNotionConnected(true);
    } catch {
      setNotionError('네트워크 오류');
    } finally {
      setNotionLoading(false);
    }
  }, [tokenInput]);

  const handleNotionDisconnect = useCallback(async () => {
    await fetch('/api/notion/token', { method: 'DELETE' });
    setNotionConnected(false);
    setPageUrlLocal('');
    setNotionError('');
  }, []);

  const handleSaveNotion = () => {
    setNotionPageUrl(pageUrlLocal.trim());
    onClose();
    window.location.reload();
  };

  const handleClearPageUrl = () => {
    setPageUrlLocal('');
    setNotionPageUrl('');
  };

  const handleChangeLocation = useCallback(async () => {
    const trimmedLocationPageUrl = locationPageUrl.trim();
    if (!selectedLocationId && !trimmedLocationPageUrl) return;

    setLocationLoading(true);
    setLocationError('');
    try {
      const res = await fetch('/api/notion/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          selectedLocationId
            ? { parentPageId: selectedLocationId }
            : { parentPageUrl: trimmedLocationPageUrl }
        ),
      });
      const data = (await res.json()) as {
        databaseId?: string;
        error?: string;
      };
      if (!res.ok || !data.databaseId) {
        setLocationError(data.error ?? '저장 위치 변경 실패');
        return;
      }
      setDatabaseId(data.databaseId);
      setShowLocationPicker(false);
      setSelectedLocationId('');
      setSelectedLocationTitle('');
      setLocationQuery('');
      setLocationPageUrl('');
    } catch {
      setLocationError('네트워크 오류');
    } finally {
      setLocationLoading(false);
    }
  }, [locationPageUrl, selectedLocationId]);

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <span className="text-base font-semibold text-gray-900">설정</span>
          <button
            type="button"
            onClick={onClose}
            className="text-lg leading-none text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-gray-100">
          {(['ai', 'notion'] as SettingsTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-violet-500 text-violet-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'ai' ? 'AI 설정' : 'Notion 연동'}
            </button>
          ))}
        </div>

        {/* AI tab */}
        {tab === 'ai' && (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  저장 방식
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoSaveLocal(true)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      autoSaveLocal
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block text-sm font-medium">자동 저장</span>
                    <span className="mt-0.5 block text-xs text-gray-400">
                      수정하면 자동 저장
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoSaveLocal(false)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      !autoSaveLocal
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block text-sm font-medium">수동 저장</span>
                    <span className="mt-0.5 block text-xs text-gray-400">
                      저장 버튼을 눌러야 반영
                    </span>
                  </button>
                </div>
                {!autoSaveLocal && (
                  <p className="mt-2 text-xs text-orange-500">
                    저장하지 않고 닫거나 이동하면 변경사항이 사라집니다.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Gemini API 키
                </label>
                <input
                  type="password"
                  value={geminiKeyLocal}
                  onChange={(e) => setGeminiKeyLocal(e.target.value)}
                  placeholder="AIza... (없으면 서버 환경변수 사용)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">
                  이 기기 로컬에만 저장됩니다.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  AI 규칙
                </label>
                <textarea
                  value={rulesLocal}
                  onChange={(e) => setRulesLocal(e.target.value)}
                  rows={10}
                  placeholder={'- 한국어로 작성할 것\n- 전문적인 어조 유지'}
                  className="w-full resize-none rounded-lg border border-gray-200 p-3 font-mono text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveAI}
                className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700"
              >
                저장
              </button>
            </div>
          </>
        )}

        {/* Notion tab */}
        {tab === 'notion' && (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Token section */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Notion 계정 연결
                  </label>
                  {notionConnected && (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
                      연결됨
                    </span>
                  )}
                </div>

                {notionChecking ? (
                  <div className="flex justify-center py-4">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                  </div>
                ) : notionConnected ? (
                  <button
                    type="button"
                    onClick={handleNotionDisconnect}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 transition-colors hover:border-red-300 hover:text-red-700"
                  >
                    연결 해제
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                      Notion → 설정 → 연결 → 내부 통합 → 새 통합
                    </p>
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && handleNotionConnect()
                      }
                      placeholder="secret_..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                    />
                    {notionError && (
                      <p className="text-xs text-red-500">{notionError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleNotionConnect}
                      disabled={notionLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:bg-gray-300"
                    >
                      {notionLoading ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          연결 중...
                        </>
                      ) : (
                        '연결하기'
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Page URL section */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  기본 참고 페이지
                </label>
                <p className="mb-2 text-xs text-gray-400">
                  저장하면 AI 패널에서 자동으로 불러옵니다. 저장 시 페이지가
                  새로고침됩니다.
                </p>
                <div className="relative">
                  <input
                    type="text"
                    value={pageUrlLocal}
                    onChange={(e) => setPageUrlLocal(e.target.value)}
                    placeholder="https://www.notion.so/..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-14 text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                  />
                  {pageUrlLocal && (
                    <button
                      type="button"
                      onClick={handleClearPageUrl}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      해제
                    </button>
                  )}
                </div>
                {notionPageUrl && pageUrlLocal === notionPageUrl && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-green-600">
                    <span>✓</span> 저장된 링크
                  </p>
                )}
              </div>

              {/* Storage location section */}
              {notionConnected && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      이력서 저장 위치
                    </label>
                    {databaseId ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
                        저장소 연결됨
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
                        미설정
                      </span>
                    )}
                  </div>
                  <p className="mb-2 text-xs text-gray-400">
                    이력서 저장소 데이터베이스가 생성될 Notion 페이지를
                    검색하거나 링크로 지정합니다.
                  </p>

                  {!showLocationPicker ? (
                    <button
                      type="button"
                      onClick={() => setShowLocationPicker(true)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      {databaseId ? '저장 위치 변경' : '저장 위치 선택'}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={locationQuery}
                        onChange={(e) => setLocationQuery(e.target.value)}
                        placeholder="페이지 검색..."
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                        autoFocus
                      />
                      <div className="max-h-40 overflow-hidden overflow-y-auto rounded-lg border border-gray-100">
                        {locationSearching ? (
                          <div className="p-3 text-center text-xs text-gray-400">
                            검색 중...
                          </div>
                        ) : locationPages.length === 0 ? (
                          <div className="p-3 text-center text-xs text-gray-400">
                            페이지를 검색해주세요
                          </div>
                        ) : (
                          locationPages.map((page) => (
                            <button
                              key={page.id}
                              type="button"
                              onClick={() => {
                                setSelectedLocationId(page.id);
                                setSelectedLocationTitle(page.title);
                                setLocationPageUrl('');
                              }}
                              className={`flex w-full items-center gap-2 border-b border-gray-50 px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-violet-50 ${
                                selectedLocationId === page.id
                                  ? 'bg-violet-50 text-violet-700'
                                  : 'text-gray-700'
                              }`}
                            >
                              <span>📁</span>
                              <span className="flex-1 truncate">
                                {page.title}
                              </span>
                              {selectedLocationId === page.id && (
                                <span className="text-xs text-violet-600">
                                  선택됨
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                      <div className="flex items-center gap-3">
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
                          setSelectedLocationTitle('');
                        }}
                        placeholder="Notion 페이지 링크 붙여넣기"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                      />
                      {selectedLocationTitle && (
                        <p className="text-xs text-violet-600">
                          ✓ {selectedLocationTitle} 선택됨
                        </p>
                      )}
                      {locationError && (
                        <p className="text-xs text-red-500">{locationError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowLocationPicker(false);
                            setSelectedLocationId('');
                            setSelectedLocationTitle('');
                            setLocationQuery('');
                            setLocationPageUrl('');
                            setLocationError('');
                          }}
                          className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={handleChangeLocation}
                          disabled={
                            (!selectedLocationId && !locationPageUrl.trim()) ||
                            locationLoading
                          }
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 py-2 text-sm text-white transition-colors hover:bg-violet-700 disabled:bg-violet-300"
                        >
                          {locationLoading ? (
                            <>
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              확인 중...
                            </>
                          ) : (
                            '확인 후 저장하기'
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveNotion}
                className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700"
              >
                저장 및 새로고침
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
