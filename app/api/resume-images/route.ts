import { NextRequest } from 'next/server';

import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ResumeImage } from '@/lib/types';

const RESUME_IMAGES_BUCKET = 'resume-images';
const MAX_IMAGE_FILE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIME_PREFIX = 'image/';
const SAFE_FILE_NAME_PATTERN = /[^a-zA-Z0-9._-]+/g;

function sanitizeFileName(fileName: string): string {
  return fileName.replace(SAFE_FILE_NAME_PATTERN, '-').replace(/^-+|-+$/g, '');
}

function getUploadPath(userId: string, file: File): string {
  const fileName = sanitizeFileName(file.name) || 'resume-image';
  return `${userId}/${crypto.randomUUID()}-${fileName}`;
}

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith(IMAGE_MIME_PREFIX)) {
    return '이미지 파일만 첨부할 수 있습니다.';
  }

  if (file.size > MAX_IMAGE_FILE_BYTES) {
    return '사진은 4MB 이하 파일만 첨부할 수 있습니다.';
  }

  return null;
}

function isOwnedStoragePath(userId: string, path: string): boolean {
  return path.startsWith(`${userId}/`) && !path.includes('..');
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const formData = await request.formData();
    const file = formData.get('file');
    const alt = formData.get('alt');

    if (!(file instanceof File)) {
      return Response.json(
        { error: '사진 파일이 필요합니다.' },
        { status: 400 }
      );
    }

    const validationError = validateImageFile(file);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const path = getUploadPath(auth.id, file);
    const { error } = await supabase.storage
      .from(RESUME_IMAGES_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from(RESUME_IMAGES_BUCKET)
      .getPublicUrl(path);
    const image: ResumeImage = {
      id: crypto.randomUUID(),
      src: data.publicUrl,
      path,
      alt: typeof alt === 'string' && alt.trim() ? alt.trim() : '첨부 사진',
      caption: '',
    };

    return Response.json({ image }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: '사진을 Supabase에 업로드하지 못했습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    const body = (await request.json().catch(() => ({}))) as { path?: string };
    const path = body.path?.trim();

    if (!path || !isOwnedStoragePath(auth.id, path)) {
      return Response.json(
        { error: '삭제할 사진 경로가 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.storage
      .from(RESUME_IMAGES_BUCKET)
      .remove([path]);

    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: '사진을 삭제하지 못했습니다.' },
      { status: 500 }
    );
  }
}
