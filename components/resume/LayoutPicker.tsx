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
      <div className="h-2 bg-gray-300 rounded w-3/4 mx-auto" />
      <div className="h-1.5 bg-gray-200 rounded w-1/2 mx-auto" />
      <div className="h-1 bg-gray-100 rounded w-2/3 mx-auto" />
    </div>
  ),
  layout2: (
    <div className="space-y-1">
      <div className="h-2 bg-gray-300 rounded w-2/3" />
      <div className="h-1.5 bg-gray-200 rounded w-1/2" />
      <div className="h-1 bg-gray-100 rounded w-3/4" />
    </div>
  ),
  layout3: (
    <div className="flex gap-2">
      <div className="flex-1 space-y-1">
        <div className="h-2 bg-gray-300 rounded" />
        <div className="h-1.5 bg-gray-200 rounded w-2/3" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="h-1 bg-gray-100 rounded" />
        <div className="h-1 bg-gray-100 rounded w-4/5" />
        <div className="h-1 bg-gray-100 rounded w-3/5" />
      </div>
    </div>
  ),
};

export function LayoutPicker({ sectionType, currentLayout, onSelect, open, onOpenChange }: Props) {
  const options = LAYOUT_OPTIONS[sectionType] ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="no-print fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" />
        <Dialog.Popup className="no-print fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-2xl p-5 sm:p-6 w-[calc(100%-2rem)] max-w-md">
          <Dialog.Title className="text-lg font-semibold text-gray-900 mb-1">
            레이아웃 선택
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 mb-5">
            섹션의 레이아웃을 선택하세요. 내용은 그대로 유지됩니다.
          </Dialog.Description>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onSelect(opt.id);
                  onOpenChange(false);
                }}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  currentLayout === opt.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="mb-2 p-2 bg-gray-50 rounded">
                  {LAYOUT_PREVIEWS[opt.id]}
                </div>
                <p className="text-xs font-medium text-gray-700 text-center">{opt.label}</p>
                {currentLayout === opt.id && (
                  <p className="text-xs text-blue-500 text-center mt-0.5">현재 선택</p>
                )}
              </button>
            ))}
          </div>

          <div className="mt-5 flex justify-end">
            <Dialog.Close className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              닫기
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
