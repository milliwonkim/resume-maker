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
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">이력서 빌더</h1>
            <p className="text-sm text-gray-500 hidden sm:block">나만의 이력서를 만들어보세요</p>
          </div>
          <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
            <Dialog.Trigger className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <span className="text-base leading-none">+</span>
              새 이력서
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" />
              <Dialog.Popup className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-2xl p-5 sm:p-6 w-[calc(100%-2rem)] max-w-sm">
                <Dialog.Title className="text-lg font-semibold text-gray-900 mb-1">
                  새 이력서 만들기
                </Dialog.Title>
                <Dialog.Description className="text-sm text-gray-500 mb-4">
                  이력서 제목을 입력하세요.
                </Dialog.Description>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="예: 프론트엔드 개발자 이력서"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus
                />
                <div className="mt-4 flex gap-2 justify-end">
                  <Dialog.Close className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                    취소
                  </Dialog.Close>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
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
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            불러오는 중...
          </div>
        ) : resumes.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📄</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">이력서가 없습니다</h2>
            <p className="text-gray-500 mb-6">첫 번째 이력서를 만들어 보세요!</p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              이력서 만들기
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resumes.map((resume) => (
              <div
                key={resume.id}
                className="bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/resumes/${resume.id}`)}
                  className="w-full text-left p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {resume.title}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(resume.updated_at)}
                  </p>
                </button>
                <div className="px-5 pb-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => router.push(`/resumes/${resume.id}`)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
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
      <Dialog.Root open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-2xl p-5 sm:p-6 w-[calc(100%-2rem)] max-w-sm">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-1">
              이력서 삭제
            </Dialog.Title>
            <Dialog.Description className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{deleteTarget?.title}</span>을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </Dialog.Description>
            <div className="flex gap-2 justify-end">
              <Dialog.Close className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                취소
              </Dialog.Close>
              <button
                type="button"
                onClick={() => deleteTarget && handleDelete(deleteTarget)}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
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
