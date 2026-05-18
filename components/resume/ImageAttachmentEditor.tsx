'use client';

import Image from 'next/image';
import { useState, type ChangeEvent } from 'react';

import type { ResumeImage } from '@/lib/types';

const MAX_IMAGE_FILE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIME_PREFIX = 'image/';

interface ImageAttachmentEditorProps {
  images?: ResumeImage[];
  onChange: (images: ResumeImage[]) => void;
  addLabel?: string;
}

function fileNameToAlt(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || '첨부 사진';
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

async function createResumeImages(files: File[]): Promise<ResumeImage[]> {
  const invalidFile = files.find((file) => validateImageFile(file) !== null);
  if (invalidFile) {
    throw new Error(
      validateImageFile(invalidFile) ?? '사진을 첨부할 수 없습니다.'
    );
  }

  return Promise.all(
    files.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('alt', fileNameToAlt(file.name));

      const response = await fetch('/api/resume-images', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as {
        image?: ResumeImage;
        error?: string;
      };

      if (!response.ok || !data.image) {
        throw new Error(
          data.error ?? '사진을 Supabase에 업로드하지 못했습니다.'
        );
      }

      return data.image;
    })
  );
}

function updateImage(
  images: ResumeImage[],
  id: string,
  patch: Partial<ResumeImage>
): ResumeImage[] {
  return images.map((image) =>
    image.id === id ? { ...image, ...patch } : image
  );
}

function moveImage(images: ResumeImage[], fromIndex: number, toIndex: number) {
  const next = [...images];
  const [image] = next.splice(fromIndex, 1);
  if (!image) return images;
  next.splice(toIndex, 0, image);
  return next;
}

export function ImageAttachmentEditor({
  images = [],
  onChange,
  addLabel = '사진 추가',
}: ImageAttachmentEditorProps) {
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;

    try {
      setError(null);
      const nextImages = await createResumeImages(files);
      onChange([...images, ...nextImages]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '사진을 첨부하지 못했습니다.'
      );
    }
  };

  const handleReplace = async (
    event: ChangeEvent<HTMLInputElement>,
    image: ResumeImage
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    try {
      setError(null);
      const [replacement] = await createResumeImages([file]);
      if (!replacement) return;
      onChange(
        updateImage(images, image.id, {
          src: replacement.src,
          path: replacement.path,
          alt: image.alt || replacement.alt,
          caption: image.caption ?? '',
        })
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '사진을 수정하지 못했습니다.'
      );
    }
  };

  const removeImage = (id: string) => {
    onChange(images.filter((image) => image.id !== id));
  };

  return (
    <div className="mt-3">
      {images.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <figure
              key={image.id}
              className="overflow-hidden rounded-md border border-gray-200 bg-white"
            >
              <div className="relative aspect-[4/3] bg-gray-100">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, 320px"
                  className="object-cover"
                />
              </div>
              {image.caption?.trim() && (
                <figcaption className="px-2 pt-1 text-xs text-gray-500">
                  {image.caption}
                </figcaption>
              )}
              <div className="no-print space-y-2 p-2">
                <input
                  value={image.alt}
                  onChange={(event) =>
                    onChange(
                      updateImage(images, image.id, {
                        alt: event.currentTarget.value,
                      })
                    )
                  }
                  className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="대체 텍스트"
                  aria-label="사진 대체 텍스트"
                />
                <input
                  value={image.caption ?? ''}
                  onChange={(event) =>
                    onChange(
                      updateImage(images, image.id, {
                        caption: event.currentTarget.value,
                      })
                    )
                  }
                  className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="사진 설명"
                  aria-label="사진 설명"
                />
                <div className="flex flex-wrap gap-1">
                  <label className="cursor-pointer rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50">
                    사진 변경
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => handleReplace(event, image)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(moveImage(images, index, index - 1))
                    }
                    disabled={index === 0}
                    className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    위로
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(moveImage(images, index, index + 1))
                    }
                    disabled={index === images.length - 1}
                    className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    아래로
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </figure>
          ))}
        </div>
      )}
      <div className="no-print resume-action-buttons mt-2 gap-1">
        <label className="cursor-pointer rounded border border-sky-200 px-2 py-0.5 text-xs text-sky-600 hover:bg-sky-50">
          + {addLabel}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleAdd}
          />
        </label>
      </div>
      {error && <p className="no-print mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
