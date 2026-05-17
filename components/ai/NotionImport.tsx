'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAIStore } from '@/store/ai';

interface Props {
  onImport: (text: string) => void;
  onClose: () => void;
}

function extractPageId(input: string): string | null {
  const trimmed = input.trim();
  // UUID format with hyphens (already formatted)
  const uuidMatch = trimmed.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  if (uuidMatch) return uuidMatch[1];
  // Notion URL: last path segment is 32 hex chars (optionally with title prefix separated by -)
  const urlMatch = trimmed.match(/([0-9a-f]{32})(?:[?#]|$)/i);
  if (urlMatch) {
    const raw = urlMatch[1];
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  }
  return null;
}

export function NotionImport({ onImport, onClose }: Props) {
  const { notionPageUrl, setNotionPageUrl } = useAIStore();
  const [tokenInput, setTokenInput] = useState('');
  const [pageUrl, setPageUrl] = useState(notionPageUrl);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/notion/token')
      .then((r) => r.json() as Promise<{ connected: boolean }>)
      .then((data) => {
        if (data.connected) setConnected(true);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleConnect = useCallback(async () => {
    if (!tokenInput.trim()) {
      setError('Notion 통합 토큰을 입력해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/notion/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Notion 연결 실패');
        return;
      }
      setTokenInput('');
      setConnected(true);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [tokenInput]);

  const handleDisconnect = useCallback(async () => {
    await fetch('/api/notion/token', { method: 'DELETE' });
    setConnected(false);
    setPageUrl('');
    setError('');
  }, []);

  const handleImport = useCallback(async () => {
    const pageId = extractPageId(pageUrl);
    if (!pageId) {
      setError('올바른 Notion 페이지 링크를 입력해주세요.');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const res = await fetch('/api/notion/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? '페이지 불러오기 실패');
        return;
      }
      setNotionPageUrl(pageUrl.trim());
      onImport(data.text ?? '');
    } catch {
      setError('페이지 불러오기 실패');
    } finally {
      setImporting(false);
    }
  }, [pageUrl, onImport, setNotionPageUrl]);

  const handleClearPageUrl = useCallback(() => {
    setNotionPageUrl('');
    setPageUrl('');
  }, [setNotionPageUrl]);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <span className="text-sm font-semibold text-gray-900">
            Notion 연동
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          {checking ? (
            <div className="flex justify-center py-8">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            </div>
          ) : !connected ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Notion 통합 토큰을 입력하세요.{' '}
                <span className="text-xs text-gray-400">
                  (Notion → 설정 → 연결 → 내부 통합 → 새 통합)
                </span>
              </p>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                placeholder="secret_..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="button"
                onClick={handleConnect}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:bg-gray-300"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    연결 중...
                  </>
                ) : (
                  '연결하기'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Notion 페이지 링크를 붙여넣으세요.
                </p>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  연결 해제
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={pageUrl}
                  onChange={(e) => {
                    setPageUrl(e.target.value);
                    setError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleImport()}
                  placeholder="https://www.notion.so/..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-16 text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                />
                {notionPageUrl && (
                  <button
                    type="button"
                    onClick={handleClearPageUrl}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    해제
                  </button>
                )}
              </div>
              {notionPageUrl && (
                <p className="flex items-center gap-1 text-xs text-green-600">
                  <span>✓</span> 저장된 링크
                </p>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || !pageUrl.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:bg-violet-300"
              >
                {importing ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    불러오는 중...
                  </>
                ) : (
                  '페이지 가져오기'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
