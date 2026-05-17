'use client';

import { Dialog } from '@base-ui/react';
import type { SectionType } from '@/lib/types';
import { LAYOUT_OPTIONS } from '@/lib/types';

interface Props {
  sectionType: SectionType;
  currentLayout: string;
  onSelect: (layout: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LAYOUT_PREVIEWS: Record<string, React.ReactNode> = {
  layout1: (
    <div className="space-y-1">
      <div className="mx-auto h-2 w-3/4 rounded bg-gray-300" />
      <div className="mx-auto h-1.5 w-1/2 rounded bg-gray-200" />
      <div className="mx-auto h-1 w-2/3 rounded bg-gray-100" />
    </div>
  ),
  layout2: (
    <div className="space-y-1">
      <div className="h-2 w-2/3 rounded bg-gray-300" />
      <div className="h-1.5 w-1/2 rounded bg-gray-200" />
      <div className="h-1 w-3/4 rounded bg-gray-100" />
    </div>
  ),
  layout3: (
    <div className="flex gap-2">
      <div className="flex-1 space-y-1">
        <div className="h-2 rounded bg-gray-300" />
        <div className="h-1.5 w-2/3 rounded bg-gray-200" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="h-1 rounded bg-gray-100" />
        <div className="h-1 w-4/5 rounded bg-gray-100" />
        <div className="h-1 w-3/5 rounded bg-gray-100" />
      </div>
    </div>
  ),
};

export function LayoutPicker({
  sectionType,
  currentLayout,
  onSelect,
  open,
  onOpenChange,
}: Props) {
  const options = LAYOUT_OPTIONS[sectionType] ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="no-print fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
        <Dialog.Popup className="no-print fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl sm:p-6">
          <Dialog.Title className="mb-1 text-lg font-semibold text-gray-900">
            레이아웃 선택
          </Dialog.Title>
          <Dialog.Description className="mb-5 text-sm text-gray-500">
            섹션의 레이아웃을 선택하세요. 내용은 그대로 유지됩니다.
          </Dialog.Description>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onSelect(opt.id);
                  onOpenChange(false);
                }}
                className={`rounded-lg border-2 p-3 text-left transition-all ${
                  currentLayout === opt.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="mb-2 rounded bg-gray-50 p-2">
                  {LAYOUT_PREVIEWS[opt.id]}
                </div>
                <p className="text-center text-xs font-medium text-gray-700">
                  {opt.label}
                </p>
                {currentLayout === opt.id && (
                  <p className="mt-0.5 text-center text-xs text-blue-500">
                    현재 선택
                  </p>
                )}
              </button>
            ))}
          </div>

          <div className="mt-5 flex justify-end">
            <Dialog.Close className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900">
              닫기
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
