'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Dialog } from '@base-ui/react';
import type { User } from '@supabase/supabase-js';

import { SettingsDialog } from '@/components/settings/SettingsDialog';
import type { Resume } from '@/lib/types';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAIStore } from '@/store/ai';
import { useResumeStore } from '@/store/resume';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemma-4-31b-it', label: 'Gemma 4 31B' },
  { id: 'gemma-4-26b-it', label: 'Gemma 4 26B' },
] as const;

export function ResumeDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resumes, setResumes, addResume, removeResume } = useResumeStore();
  const { geminiKey, geminiModel, rules } = useAIStore();
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(
    searchParams.get('auth_error') ? '구글 로그인에 실패했습니다. 다시 시도해주세요.' : ''
  );
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Resume | null>(null);
  const [aiCopyTarget, setAiCopyTarget] = useState<Resume | null>(null);
  const [aiCopyTitle, setAiCopyTitle] = useState('');
  const [aiCopyDirection, setAiCopyDirection] = useState('');
  const [aiCopyModel, setAiCopyModel] = useState(geminiModel);
  const [aiCopyCreating, setAiCopyCreating] = useState(false);
  const [aiCopyError, setAiCopyError] = useState('');

  const loadResumes = useCallback(async ({ claimOrphans = false } = {}) => {
    setLoading(true);
    try {
      const response = await fetch('/api/resumes');
      if (response.status === 401) {
        setUser(null);
        setResumes([]);
        return;
      }
      const data: unknown = await response.json();
      const list = Array.isArray(data) ? (data as Resume[]) : [];

      if (list.length === 0 && claimOrphans) {
        const claimRes = await fetch('/api/resumes/claim', { method: 'POST' });
        if (claimRes.ok) {
          const { claimed } = (await claimRes.json()) as { claimed: number };
          if (claimed > 0) {
            const retry = await fetch('/api/resumes');
            const retryData: unknown = await retry.json();
            setResumes(Array.isArray(retryData) ? (retryData as Resume[]) : []);
            return;
          }
        }
      }

      setResumes(list);
    } finally {
      setLoading(false);
    }
  }, [setResumes]);

  useEffect(() => {
    if (searchParams.get('auth_error')) {
      router.replace('/');
    }
  }, [router, searchParams]);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!isMounted) return;
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        void loadResumes({ claimOrphans: true });
      } else {
        setLoading(false);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void loadResumes({ claimOrphans: true });
        return;
      }
      setResumes([]);
      setLoading(false);
    });

    void loadUser();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadResumes, setResumes, supabase]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        setAuthError('구글 로그인에 실패했습니다.');
        setSigningIn(false);
      }
    } catch {
      setAuthError('구글 로그인에 실패했습니다.');
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      setUser(null);
      setResumes([]);
    } finally {
      setSigningOut(false);
    }
  };

  const handleCreate = async () => {
    const title = newTitle.trim() || '새 이력서';
    setCreating(true);
    try {
      const res = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const resume: Resume = await res.json();
        addResume(resume);
        setDialogOpen(false);
        setNewTitle('');
        router.push(`/resumes/${resume.id}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (resume: Resume) => {
    removeResume(resume.id);
    setDeleteTarget(null);
    await fetch(`/api/resumes/${resume.id}`, { method: 'DELETE' });
  };

  const openAiCopyDialog = (resume: Resume) => {
    setAiCopyTarget(resume);
    setAiCopyTitle(`${resume.title} - 변환본`);
    setAiCopyDirection('');
    setAiCopyModel(geminiModel);
    setAiCopyError('');
  };

  const handleAiCopy = async () => {
    if (!aiCopyTarget) return;

    const target = aiCopyDirection.trim();
    if (!target) {
      setAiCopyError('새 컨셉 또는 직군을 입력해주세요.');
      return;
    }

    setAiCopyCreating(true);
    setAiCopyError('');
    try {
      const res = await fetch('/api/resumes/ai-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceResumeId: aiCopyTarget.id,
          title: aiCopyTitle.trim() || undefined,
          target,
          rules,
          apiKey: geminiKey || undefined,
          model: aiCopyModel,
        }),
      });
      const data = (await res.json()) as { resume?: Resume; error?: string };
      if (!res.ok || !data.resume) {
        setAiCopyError(data.error ?? 'AI 이력서 생성에 실패했습니다.');
        return;
      }
      addResume(data.resume);
      setAiCopyTarget(null);
      setAiCopyTitle('');
      setAiCopyDirection('');
      setAiCopyModel(geminiModel);
      router.push(`/resumes/${data.resume.id}`);
    } catch {
      setAiCopyError('네트워크 오류가 발생했습니다.');
    } finally {
      setAiCopyCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Logo + Title */}
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-sm font-semibold text-gray-900">이력서 빌더</h1>
          </div>

          {/* Right side actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            {user && (
              <>
                <span className="hidden max-w-40 truncate text-xs text-gray-400 md:block">
                  {user.email}
                </span>

                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title="설정"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  <span className="hidden sm:inline">{signingOut ? '로그아웃 중...' : '로그아웃'}</span>
                </button>

                <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
                  <Dialog.Trigger className="flex h-8 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-700">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    새 이력서
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
                    <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl sm:p-6">
                      <Dialog.Title className="mb-1 text-lg font-semibold text-gray-900">
                        새 이력서 만들기
                      </Dialog.Title>
                      <Dialog.Description className="mb-4 text-sm text-gray-500">
                        이력서 제목을 입력하세요.
                      </Dialog.Description>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        placeholder="예: 프론트엔드 개발자 이력서"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                        autoFocus
                      />
                      <div className="mt-4 flex justify-end gap-2">
                        <Dialog.Close className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                          취소
                        </Dialog.Close>
                        <button
                          type="button"
                          onClick={handleCreate}
                          disabled={creating}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                          {creating ? '생성 중...' : '만들기'}
                        </button>
                      </div>
                    </Dialog.Popup>
                  </Dialog.Portal>
                </Dialog.Root>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {authLoading ? (
          <div className="flex items-center justify-center py-24 text-sm text-gray-400">
            로그인 상태 확인 중...
          </div>
        ) : !user ? (
          <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center px-4">
            <div className="w-full max-w-sm">
              <div className="mb-8 text-center">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900">이력서 빌더</h2>
                <p className="mt-1.5 text-sm text-gray-500">
                  구글 계정으로 로그인해 이력서를 관리하세요
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {signingIn ? (
                    <svg className="h-4 w-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                  )}
                  {signingIn ? '로그인 중...' : 'Google로 계속하기'}
                </button>

                {authError && (
                  <p className="mt-3 text-center text-xs text-red-500">{authError}</p>
                )}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            불러오는 중...
          </div>
        ) : resumes.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mb-4 text-6xl">📄</div>
            <h2 className="mb-2 text-xl font-semibold text-gray-700">
              이력서가 없습니다
            </h2>
            <p className="mb-6 text-gray-500">
              첫 번째 이력서를 만들어 보세요!
            </p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              이력서 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {resumes.map((resume) => (
              <div
                key={resume.id}
                className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 transition-all hover:border-blue-300 hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/resumes/${resume.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-4 text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                    <svg
                      width="20"
                      height="20"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-gray-900 transition-colors group-hover:text-blue-600">
                      {resume.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {formatDate(resume.updated_at)}
                    </p>
                  </div>
                </button>
                <div className="ml-4 flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/resumes/${resume.id}`)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    편집하기 →
                  </button>
                  <button
                    type="button"
                    onClick={() => openAiCopyDialog(resume)}
                    className="text-xs font-medium text-violet-600 hover:text-violet-700"
                  >
                    AI 변환
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(resume)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} />
      )}

      {/* Delete confirmation */}
      <Dialog.Root
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl sm:p-6">
            <Dialog.Title className="mb-1 text-lg font-semibold text-gray-900">
              이력서 삭제
            </Dialog.Title>
            <Dialog.Description className="mb-5 text-sm text-gray-500">
              <span className="font-medium text-gray-700">
                {deleteTarget?.title}
              </span>
              을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                취소
              </Dialog.Close>
              <button
                type="button"
                onClick={() => deleteTarget && handleDelete(deleteTarget)}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                삭제하기
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* AI copy confirmation */}
      <Dialog.Root
        open={!!aiCopyTarget}
        onOpenChange={(open) => !open && setAiCopyTarget(null)}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white p-5 shadow-2xl sm:p-6">
            <Dialog.Title className="mb-1 text-lg font-semibold text-gray-900">
              AI로 새 이력서 만들기
            </Dialog.Title>
            <Dialog.Description className="mb-4 text-sm text-gray-500">
              <span className="font-medium text-gray-700">
                {aiCopyTarget?.title}
              </span>
              을(를) 바탕으로 새 컨셉의 이력서를 만듭니다.
            </Dialog.Description>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  새 이력서 제목
                </label>
                <input
                  type="text"
                  value={aiCopyTitle}
                  onChange={(e) => setAiCopyTitle(e.target.value)}
                  placeholder="예: PO 전환 이력서"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  새 컨셉 또는 직군
                </label>
                <textarea
                  value={aiCopyDirection}
                  onChange={(e) => setAiCopyDirection(e.target.value)}
                  placeholder={
                    '예시:\n- 프론트엔드 개발자 이력서를 프로덕트 매니저 전환용으로 바꿔줘\n- SI 개발 경험을 SaaS 스타트업 지원용으로 재구성해줘'
                  }
                  rows={5}
                  className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  AI 모델
                </label>
                <select
                  value={aiCopyModel}
                  onChange={(e) => setAiCopyModel(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-violet-300 focus:outline-none"
                >
                  {GEMINI_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>

              {aiCopyError && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-500">
                  {aiCopyError}
                </p>
              )}
            </div>

            <div className="mt-4 flex shrink-0 justify-end gap-2">
              <Dialog.Close className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                취소
              </Dialog.Close>
              <button
                type="button"
                onClick={handleAiCopy}
                disabled={aiCopyCreating}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
              >
                {aiCopyCreating ? '생성 중...' : 'AI로 만들기'}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
