import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST() {
  const auth = await getAuthenticatedUser();
  if (!auth) return unauthorizedResponse();

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc('claim_orphaned_resumes');

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ claimed: data as number });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
