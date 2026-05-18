import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface AuthenticatedUser {
  id: string;
  accessToken: string;
  email: string | null;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return null;

  return {
    id: user.id,
    accessToken: session.access_token,
    email: user.email ?? null,
  };
}

export function unauthorizedResponse() {
  return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
}
