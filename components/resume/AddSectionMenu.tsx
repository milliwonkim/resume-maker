'use client';

import { Menu } from '@base-ui/react';
import type { SectionType } from '@/lib/types';
import { SECTION_LABELS } from '@/lib/types';

interface Props {
  existingTypes: SectionType[];
  onAdd: (type: SectionType) => void;
  isAdding?: boolean;
}

const ALL_TYPES: SectionType[] = [
  'header',
  'summary',
  'text',
  'experience',
  'education',
  'skills',
  'projects',
];
const SINGLE_TYPES: SectionType[] = ['header', 'summary'];

export function AddSectionMenu({
  existingTypes,
  onAdd,
  isAdding = false,
}: Props) {
  const available = ALL_TYPES.filter((t) => {
    if (SINGLE_TYPES.includes(t)) return !existingTypes.includes(t);
    return true;
  });

  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={isAdding}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 py-3 text-sm text-gray-500 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-500 disabled:cursor-wait disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
      >
        {isAdding ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
        ) : (
          <span className="text-lg leading-none">+</span>
        )}
        {isAdding ? '섹션 추가 중...' : '섹션 추가'}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="center" sideOffset={6}>
          <Menu.Popup className="z-50 min-w-40 rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl">
            {available.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">
                추가 가능한 섹션 없음
              </div>
            ) : (
              available.map((type) => (
                <Menu.Item
                  key={type}
                  disabled={isAdding}
                  onClick={() => onAdd(type)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-600 data-[disabled]:cursor-wait data-[disabled]:text-gray-400 data-[disabled]:hover:bg-transparent"
                >
                  {SECTION_LABELS[type]}
                </Menu.Item>
              ))
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
