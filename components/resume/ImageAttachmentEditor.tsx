'use client';

import Image from 'next/image';
import { useState, type ChangeEvent, type DragEvent } from 'react';

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
        throw new Error(data.error ?? '사진을 첨부하지 못했습니다.');
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

function moveImage(
  images: ResumeImage[],
  fromIndex: number,
  toIndex: number
): ResumeImage[] {
  const next = [...images];
  const [image] = next.splice(fromIndex, 1);
  if (!image) return images;
  next.splice(toIndex, 0, image);
  return next;
}

function DragHandleIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5.5" cy="3.5" r="1.5" />
      <circle cx="10.5" cy="3.5" r="1.5" />
      <circle cx="5.5" cy="8" r="1.5" />
      <circle cx="10.5" cy="8" r="1.5" />
      <circle cx="5.5" cy="12.5" r="1.5" />
      <circle cx="10.5" cy="12.5" r="1.5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M10 3v11M10 3L7 6M10 3l3 3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 15v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="31.4"
        strokeDashoffset="10"
      />
    </svg>
  );
}

export function ImageAttachmentEditor({
  images = [],
  onChange,
  addLabel = '사진 추가',
}: ImageAttachmentEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setError(null);
      setIsUploading(true);
      const nextImages = await createResumeImages(files);
      onChange([...images, ...nextImages]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '사진을 첨부하지 못했습니다.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleAdd = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []) as File[];
    event.currentTarget.value = '';
    await uploadFiles(files);
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
      setIsUploading(true);
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
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (id: string) => {
    onChange(images.filter((image) => image.id !== id));
  };

  // Card reorder drag-and-drop (desktop)
  const handleDragStart =
    (index: number) => (e: DragEvent<HTMLDivElement>) => {
      setDraggedIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleCardDragOver =
    (index: number) => (e: DragEvent<HTMLElement>) => {
      if (e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (index !== draggedIndex) setDragOverIndex(index);
    };

  const handleCardDragLeave = (e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIndex(null);
    }
  };

  const handleCardDrop =
    (index: number) => (e: DragEvent<HTMLElement>) => {
      if (e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) {
        setDraggedIndex(null);
        setDragOverIndex(null);
        return;
      }
      onChange(moveImage(images, draggedIndex, index));
      setDraggedIndex(null);
      setDragOverIndex(null);
    };

  // File drag-and-drop upload zone
  const handleDropZoneDragOver = (e: DragEvent<HTMLLabelElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDropZoneDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDropZoneDrop = async (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files as FileList).filter(
      (f: File) => f.type.startsWith(IMAGE_MIME_PREFIX)
    );
    await uploadFiles(files);
  };

  return (
    <div className="mt-3">
      {images.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <figure
              key={image.id}
              onDragOver={handleCardDragOver(index)}
              onDragLeave={handleCardDragLeave}
              onDrop={handleCardDrop(index)}
              className={[
                'overflow-hidden rounded-lg border bg-white transition-all duration-150',
                draggedIndex === index
                  ? 'scale-95 opacity-40 border-gray-300'
                  : dragOverIndex === index
                    ? 'border-blue-400 shadow-lg ring-2 ring-blue-100'
                    : 'border-gray-200 shadow-sm',
              ].join(' ')}
            >
              {/* Image with drag handle overlay */}
              <div className="relative aspect-[4/3] bg-gray-100">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, 320px"
                  className="object-cover"
                />
                {/* Drag handle – only this element is draggable */}
                <div
                  draggable
                  onDragStart={handleDragStart(index)}
                  onDragEnd={handleDragEnd}
                  className="no-print absolute top-2 left-2 cursor-grab rounded-md bg-black/50 p-1.5 text-white transition-opacity hover:bg-black/70 active:cursor-grabbing"
                  title="드래그하여 순서 변경"
                  aria-label="순서 변경 핸들"
                >
                  <DragHandleIcon />
                </div>
                {/* Order badge */}
                <div className="no-print absolute top-2 right-2 min-w-[20px] rounded-full bg-black/50 px-1.5 py-0.5 text-center text-xs font-medium text-white">
                  {index + 1}
                </div>
              </div>

              {/* Caption (shown in print too) */}
              {image.caption?.trim() && (
                <figcaption className="px-3 pt-1.5 pb-1 text-xs text-gray-500">
                  {image.caption}
                </figcaption>
              )}

              {/* Edit controls – editor only */}
              <div className="no-print space-y-2 p-2.5">
                <input
                  value={image.caption ?? ''}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onChange(
                      updateImage(images, image.id, {
                        caption: event.currentTarget.value,
                      })
                    )
                  }
                  className="w-full rounded-md border border-gray-200 px-2.5 py-2 text-xs text-gray-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="사진 설명 입력 (선택)"
                  aria-label="사진 설명"
                />
                <input
                  value={image.alt}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onChange(
                      updateImage(images, image.id, {
                        alt: event.currentTarget.value,
                      })
                    )
                  }
                  className="w-full rounded-md border border-gray-200 px-2.5 py-2 text-xs text-gray-500 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  placeholder="대체 텍스트 (스크린 리더용)"
                  aria-label="사진 대체 텍스트"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="cursor-pointer rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 active:bg-gray-100 touch-manipulation">
                    사진 변경
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        handleReplace(event, image)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onChange(moveImage(images, index, index - 1))}
                    disabled={index === 0}
                    className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                    aria-label="위로 이동"
                    title="위로 이동"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(moveImage(images, index, index + 1))}
                    disabled={index === images.length - 1}
                    className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                    aria-label="아래로 이동"
                    title="아래로 이동"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    className="ml-auto rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 active:bg-red-100 touch-manipulation"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </figure>
          ))}
        </div>
      )}

      {/* 업로드 중 스피너 – focus 상태와 무관하게 항상 표시 */}
      {isUploading && (
        <div className="no-print mt-2 flex items-center gap-1.5 text-xs text-sky-600">
          <SpinnerIcon />
          업로드 중...
        </div>
      )}

      {/* Upload button / drop zone */}
      {!isUploading && (
        <div className="no-print resume-action-buttons mt-2 gap-1">
          <label
            className={[
              'inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors touch-manipulation',
              isDragOver
                ? 'border-blue-400 bg-blue-50 text-blue-600'
                : 'border-sky-200 text-sky-600 hover:bg-sky-50 active:bg-sky-100',
            ].join(' ')}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
          >
            {isDragOver ? (
              '여기에 놓으세요'
            ) : (
              <>
                <UploadIcon />+ {addLabel}
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAdd}
            />
          </label>
        </div>
      )}

      {error && <p className="no-print mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
