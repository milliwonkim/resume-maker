'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@base-ui/react';
import { useResumeStore } from '@/store/resume';
import { NotionSetup } from '@/components/notion/NotionSetup';
import type { Resume } from '@/lib/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function ResumeDashboard() {
  const router = useRouter();
  const { resumes, setResumes, addResume, removeResume } = useResumeStore();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Resume | null>(null);

  useEffect(() => {
    if (!ready) return;
    fetch('/api/resumes')
      .then((r) => r.json())
      .then((data) => {
        setResumes(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ready, setResumes]);

  if (!ready) {
    return <NotionSetup onReady={() => setReady(true)} />;
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">이력서 빌더</h1>
            <p className="hidden text-sm text-gray-500 sm:block">
              나만의 이력서를 만들어보세요
            </p>
          </div>
          <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
            <Dialog.Trigger className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
              <span className="text-base leading-none">+</span>새 이력서
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
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {loading ? (
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
          <div className="grid gap-4 grid-cols-1">
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
    </div>
  );
}
