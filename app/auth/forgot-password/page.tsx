'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClientSupabaseClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('이메일을 입력해주세요.');
      return;
    }

    setError('');
    setIsSending(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        }
      );

      if (resetError) {
        setError('비밀번호 재설정 이메일을 보내지 못했습니다.');
        return;
      }

      setIsSent(true);
    } catch {
      setError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <section className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-lg font-semibold text-gray-900">
          비밀번호 찾기
        </h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          가입한 이메일로 비밀번호 재설정 링크를 보내드립니다.
        </p>

        {isSent ? (
          <div className="mt-5 space-y-4">
            <p className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-700">
              {email.trim()}으로 재설정 링크를 보냈습니다.
            </p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              로그인으로 돌아가기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="이메일"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              autoFocus
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={isSending}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSending ? '발송 중...' : '재설정 링크 받기'}
            </button>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600"
            >
              로그인으로 돌아가기
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
