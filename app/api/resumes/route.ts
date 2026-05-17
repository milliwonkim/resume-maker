import { NextRequest } from 'next/server';
import { getResumes, createResume } from '@/lib/supabase-db';

export async function GET() {
  try {
    const resumes = await getResumes();
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
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const resume = await createResume(body.title);
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
