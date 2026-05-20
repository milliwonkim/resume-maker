'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClientSupabaseClient } from '@/lib/supabase/client';

type ResetStatus = 'checking' | 'ready' | 'saving' | 'saved' | 'missing';

const MIN_PASSWORD_LENGTH = 6;

function cleanResetUrl() {
  window.history.replaceState(null, '', window.location.pathname);
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const [status, setStatus] = useState<ResetStatus>('checking');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (!isMounted) return;

        if (exchangeError) {
          setStatus('missing');
          return;
        }

        cleanResetUrl();
        setStatus('ready');
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (!isMounted) return;

        if (sessionError) {
          setStatus('missing');
          return;
        }

        cleanResetUrl();
        setStatus('ready');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;
      setStatus(session ? 'ready' : 'missing');
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setStatus('ready');
      }
    });

    void checkSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      return;
    }

    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setError('');
    setStatus('saving');
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError('비밀번호를 변경하지 못했습니다. 재설정 링크를 다시 요청해주세요.');
      setStatus('ready');
      return;
    }

    setStatus('saved');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <section className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-lg font-semibold text-gray-900">
          비밀번호 재설정
        </h1>

        {status === 'checking' && (
          <p className="mt-5 text-center text-sm text-gray-500">
            재설정 링크를 확인하는 중...
          </p>
        )}

        {status === 'missing' && (
          <div className="mt-5 space-y-4 text-center">
            <p className="text-sm text-gray-500">
              재설정 링크가 만료되었거나 로그인 세션이 없습니다.
            </p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              다시 요청하기
            </button>
          </div>
        )}

        {status === 'saved' && (
          <div className="mt-5 space-y-4 text-center">
            <p className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
              비밀번호가 변경되었습니다.
            </p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              첫페이지로 이동
            </button>
          </div>
        )}

        {(status === 'ready' || status === 'saving') && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="새 비밀번호"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              autoFocus
            />
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder="새 비밀번호 확인"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={status === 'saving'}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {status === 'saving' ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
