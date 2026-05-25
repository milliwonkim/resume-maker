import { NextRequest } from 'next/server';

import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import type { ResumeImage } from '@/lib/types';

const MAX_IMAGE_FILE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIME_PREFIX = 'image/';

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith(IMAGE_MIME_PREFIX)) {
    return '이미지 파일만 첨부할 수 있습니다.';
  }

  if (file.size > MAX_IMAGE_FILE_BYTES) {
    return '사진은 4MB 이하 파일만 첨부할 수 있습니다.';
  }

  return null;
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${bytes.toString('base64')}`;
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

    const image: ResumeImage = {
      id: crypto.randomUUID(),
      src: await fileToDataUrl(file),
      path: '',
      alt: typeof alt === 'string' && alt.trim() ? alt.trim() : '첨부 사진',
      caption: '',
    };

    return Response.json({ image }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    console.error('[resume-images] unexpected error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) return unauthorizedResponse();

    await request.json().catch(() => ({}));

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: '사진을 삭제하지 못했습니다.' },
      { status: 500 }
    );
  }
}
