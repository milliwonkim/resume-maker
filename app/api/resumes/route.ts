import { NextRequest } from 'next/server';

import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { getResumes, createResume } from '@/lib/notion-db';

export async function GET() {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const resumes = await getResumes(auth);
    return Response.json(resumes);
  } catch (err) {
    return Response.json(
      {
        error: `Failed to fetch resumes: ${err instanceof Error ? err.message : ''}`,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const resume = await createResume(auth, body.title);
    return Response.json(resume, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error: `Failed to create resume: ${err instanceof Error ? err.message : ''}`,
      },
      { status: 500 }
    );
  }
}
