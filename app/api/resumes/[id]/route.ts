import { NextRequest } from 'next/server';
import {
  updateResumeTitle,
  deleteResume,
  getSections,
} from '@/lib/supabase-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sections = await getSections(id);
    return Response.json({ sections });
  } catch {
    return Response.json({ error: 'Failed to fetch resume' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { title: string };
    await updateResumeTitle(id, body.title);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to update resume' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteResume(id);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to delete resume' }, { status: 500 });
  }
}
