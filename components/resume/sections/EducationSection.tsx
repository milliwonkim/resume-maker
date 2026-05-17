'use client';

import type {
  EducationContent,
  EducationItem,
  GpaScale,
  HighSchoolCategory,
  SchoolType,
} from '@/lib/types';
import { HIGH_SCHOOL_CATEGORY_OPTIONS, SCHOOL_TYPE_LABELS } from '@/lib/types';
import { EditableField } from '../EditableField';

interface Props {
  content: EducationContent;
  layout: string;
  onChange: (content: EducationContent) => void;
}

const GPA_SCALES: GpaScale[] = ['4.5', '4.3', '4.0'];
const SCHOOL_TYPES: SchoolType[] = ['university', 'highschool', 'middleschool'];
const DEFAULT_ADDITIONAL_MAJOR_LABEL = '부전공';
const DEFAULT_HIGH_SCHOOL_CATEGORY: HighSchoolCategory = '인문계(일반고)';
const HIGH_SCHOOL_CUSTOM_OPTION = '__custom';

const isUniversity = (item: EducationItem) => item.schoolType === 'university';
const isHighSchool = (item: EducationItem) => item.schoolType === 'highschool';
type AdditionalMajor = NonNullable<EducationItem['additionalMajors']>[number];

function updateItem(
  items: EducationItem[],
  id: string,
  patch: Partial<EducationItem>
): EducationItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

function GpaScaleSelect({
  value,
  onChange,
}: {
  value: GpaScale | undefined;
  onChange: (v: GpaScale) => void;
}) {
  return (
    <select
      value={value ?? '4.5'}
      onChange={(e) => onChange(e.target.value as GpaScale)}
      className="cursor-pointer rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-500 focus:ring-1 focus:ring-blue-300 focus:outline-none"
    >
      {GPA_SCALES.map((scale) => (
        <option key={scale} value={scale}>
          {scale}
        </option>
      ))}
    </select>
  );
}

function SchoolTypeSelect({
  value,
  onChange,
}: {
  value: SchoolType;
  onChange: (v: SchoolType) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SchoolType)}
      className="cursor-pointer rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-500 focus:ring-1 focus:ring-blue-300 focus:outline-none"
    >
      {SCHOOL_TYPES.map((type) => (
        <option key={type} value={type}>
          {SCHOOL_TYPE_LABELS[type]}
        </option>
      ))}
    </select>
  );
}

function makeNewItem(schoolType: SchoolType): EducationItem {
  const base = {
    id: crypto.randomUUID(),
    schoolType,
    school: SCHOOL_TYPE_LABELS[schoolType],
    startDate: '20XX.03',
    endDate: '20XX.02',
  };
  if (schoolType === 'university') {
    return {
      ...base,
      degree: '학사',
      field: '전공',
      additionalMajors: [],
      gpa: '',
      gpaScale: '4.5',
    };
  }
  if (schoolType === 'highschool') {
    return { ...base, highSchoolCategory: DEFAULT_HIGH_SCHOOL_CATEGORY };
  }
  return base;
}

export function EducationSection({ content, layout, onChange }: Props) {
  const add = (schoolType: SchoolType) =>
    onChange({ items: [...content.items, makeNewItem(schoolType)] });
  const remove = (id: string) =>
    onChange({ items: content.items.filter((i) => i.id !== id) });
  const update = (id: string, patch: Partial<EducationItem>) =>
    onChange({ items: updateItem(content.items, id, patch) });

  const handleSchoolTypeChange = (id: string, schoolType: SchoolType) => {
    const patch: Partial<EducationItem> = { schoolType };
    if (schoolType === 'university') {
      patch.degree = '학사';
      patch.field = '전공';
      patch.additionalMajors = [];
      patch.highSchoolCategory = undefined;
      patch.gpa = '';
      patch.gpaScale = '4.5';
    } else if (schoolType === 'highschool') {
      patch.degree = undefined;
      patch.field = undefined;
      patch.additionalMajors = undefined;
      patch.highSchoolCategory = DEFAULT_HIGH_SCHOOL_CATEGORY;
      patch.gpa = undefined;
      patch.gpaScale = undefined;
    } else {
      patch.degree = undefined;
      patch.field = undefined;
      patch.additionalMajors = undefined;
      patch.highSchoolCategory = undefined;
      patch.gpa = undefined;
      patch.gpaScale = undefined;
    }
    update(id, patch);
  };

  const addAdditionalMajor = (item: EducationItem) => {
    update(item.id, {
      additionalMajors: [
        ...(item.additionalMajors ?? []),
        {
          id: crypto.randomUUID(),
          label: DEFAULT_ADDITIONAL_MAJOR_LABEL,
          field: '전공명',
        },
      ],
    });
  };

  const updateAdditionalMajor = (
    item: EducationItem,
    majorId: string,
    patch: Partial<AdditionalMajor>
  ) => {
    update(item.id, {
      additionalMajors: (item.additionalMajors ?? []).map((major) =>
        major.id === majorId ? { ...major, ...patch } : major
      ),
    });
  };

  const removeAdditionalMajor = (item: EducationItem, majorId: string) => {
    update(item.id, {
      additionalMajors: (item.additionalMajors ?? []).filter(
        (major) => major.id !== majorId
      ),
    });
  };

  const AddButtons = () => (
    <div className="flex flex-wrap gap-1">
      {SCHOOL_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => add(type)}
          className="rounded border border-blue-200 px-2 py-0.5 text-xs text-blue-500 hover:text-blue-700"
        >
          + {SCHOOL_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );

  const HighSchoolCategorySelect = ({ item }: { item: EducationItem }) => {
    const value = item.highSchoolCategory ?? '';
    const selectValue = HIGH_SCHOOL_CATEGORY_OPTIONS.includes(
      value as HighSchoolCategory
    )
      ? value
      : HIGH_SCHOOL_CUSTOM_OPTION;

    return (
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === HIGH_SCHOOL_CUSTOM_OPTION) return;
          update(item.id, { highSchoolCategory: e.target.value });
        }}
        className="cursor-pointer rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-500 focus:ring-1 focus:ring-blue-300 focus:outline-none"
        aria-label="고등학교 계열 선택"
      >
        {HIGH_SCHOOL_CATEGORY_OPTIONS.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
        <option value={HIGH_SCHOOL_CUSTOM_OPTION}>직접입력</option>
      </select>
    );
  };

  const ItemActions = ({ item }: { item: EducationItem }) => (
    <div className="no-print resume-action-buttons flex-wrap gap-1">
      <SchoolTypeSelect
        value={item.schoolType}
        onChange={(v) => handleSchoolTypeChange(item.id, v)}
      />
      {isHighSchool(item) && <HighSchoolCategorySelect item={item} />}
      {isUniversity(item) && item.gpa !== undefined && (
        <GpaScaleSelect
          value={item.gpaScale}
          onChange={(v) => update(item.id, { gpaScale: v })}
        />
      )}
      <AddButtons />
      {content.items.length > 1 && (
        <button
          type="button"
          onClick={() => remove(item.id)}
          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-400 hover:text-red-600"
        >
          삭제
        </button>
      )}
    </div>
  );

  const AdditionalMajorsInline = ({ item }: { item: EducationItem }) => (
    <>
      {(item.additionalMajors ?? []).map((major) => (
        <span key={major.id} className="inline-flex items-center gap-1">
          <span className="text-gray-300">|</span>
          <EditableField
            value={major.label}
            onChange={(v) =>
              updateAdditionalMajor(item, major.id, { label: v })
            }
            tag="span"
            className="text-gray-500"
            placeholder="구분"
          />
          <EditableField
            value={major.field}
            onChange={(v) =>
              updateAdditionalMajor(item, major.id, { field: v })
            }
            tag="span"
            className="text-blue-600"
            placeholder="전공명"
          />
          <button
            type="button"
            onClick={() => removeAdditionalMajor(item, major.id)}
            className="no-print resume-action-button text-xs text-red-400 hover:text-red-600"
            aria-label={`${major.label} 삭제`}
          >
            삭제
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => addAdditionalMajor(item)}
        className="no-print resume-action-button rounded border border-blue-200 px-1.5 py-0.5 text-xs text-blue-500 hover:text-blue-700"
      >
        + 추가 전공
      </button>
    </>
  );

  const AdditionalMajorsBlock = ({ item }: { item: EducationItem }) => (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {(item.additionalMajors ?? []).map((major) => (
        <span key={major.id} className="inline-flex items-center gap-1">
          <EditableField
            value={major.label}
            onChange={(v) =>
              updateAdditionalMajor(item, major.id, { label: v })
            }
            tag="span"
            className="text-gray-500"
            placeholder="구분"
          />
          <span className="text-gray-300">/</span>
          <EditableField
            value={major.field}
            onChange={(v) =>
              updateAdditionalMajor(item, major.id, { field: v })
            }
            tag="span"
            className="text-blue-600"
            placeholder="전공명"
          />
          <button
            type="button"
            onClick={() => removeAdditionalMajor(item, major.id)}
            className="no-print resume-action-button text-xs text-red-400 hover:text-red-600"
            aria-label={`${major.label} 삭제`}
          >
            삭제
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => addAdditionalMajor(item)}
        className="no-print resume-action-button rounded border border-blue-200 px-1.5 py-0.5 text-xs text-blue-500 hover:text-blue-700"
      >
        + 추가 전공
      </button>
    </div>
  );

  if (layout === 'layout2') {
    return (
      <div className="space-y-2">
        {content.items.map((item) => (
          <div
            key={item.id}
            className="resume-action-host flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-2 last:border-0 focus:outline-none"
            tabIndex={0}
          >
            <div className="flex flex-wrap items-center gap-3">
              <EditableField
                value={item.school}
                onChange={(v) => update(item.id, { school: v })}
                tag="span"
                className="font-semibold text-gray-900"
                placeholder="학교명"
              />
              {isUniversity(item) && (
                <>
                  <span className="text-gray-300">|</span>
                  <EditableField
                    value={item.degree ?? ''}
                    onChange={(v) => update(item.id, { degree: v })}
                    tag="span"
                    className="text-gray-700"
                    placeholder="학위"
                  />
                  <EditableField
                    value={item.field ?? ''}
                    onChange={(v) => update(item.id, { field: v })}
                    tag="span"
                    className="text-blue-600"
                    placeholder="전공"
                  />
                  <AdditionalMajorsInline item={item} />
                  {item.gpa !== undefined && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="flex items-center gap-1 text-sm text-gray-500">
                        <span className="text-xs text-gray-400">학점</span>
                        <EditableField
                          value={item.gpa}
                          onChange={(v) => update(item.id, { gpa: v })}
                          tag="span"
                          className="text-sm text-gray-500"
                          placeholder="0.0"
                        />
                        <span className="text-gray-300">/</span>
                        <span>{item.gpaScale ?? '4.5'}</span>
                      </span>
                    </>
                  )}
                </>
              )}
              {isHighSchool(item) && (
                <>
                  <span className="text-gray-300">|</span>
                  <EditableField
                    value={item.highSchoolCategory ?? ''}
                    onChange={(v) => update(item.id, { highSchoolCategory: v })}
                    tag="span"
                    className="text-blue-600"
                    placeholder="계열/유형"
                  />
                </>
              )}
            </div>
            <span className="text-sm text-gray-500">
              <EditableField
                value={item.startDate}
                onChange={(v) => update(item.id, { startDate: v })}
                tag="span"
                placeholder="입학"
              />
              <span className="mx-1">–</span>
              <EditableField
                value={item.endDate}
                onChange={(v) => update(item.id, { endDate: v })}
                tag="span"
                placeholder="졸업"
              />
            </span>
            <ItemActions item={item} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {content.items.map((item) => (
        <div
          key={item.id}
          className="resume-action-host focus:outline-none"
          tabIndex={0}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <EditableField
                value={item.school}
                onChange={(v) => update(item.id, { school: v })}
                tag="span"
                className="text-lg font-bold text-gray-900"
                placeholder="학교명"
              />
              {isUniversity(item) && (
                <>
                  <span className="text-gray-400">·</span>
                  <EditableField
                    value={item.degree ?? ''}
                    onChange={(v) => update(item.id, { degree: v })}
                    tag="span"
                    className="text-gray-700"
                    placeholder="학위"
                  />
                  <span className="text-gray-400">/</span>
                  <EditableField
                    value={item.field ?? ''}
                    onChange={(v) => update(item.id, { field: v })}
                    tag="span"
                    className="text-blue-600"
                    placeholder="전공"
                  />
                </>
              )}
              {isHighSchool(item) && (
                <>
                  <span className="text-gray-400">·</span>
                  <EditableField
                    value={item.highSchoolCategory ?? ''}
                    onChange={(v) => update(item.id, { highSchoolCategory: v })}
                    tag="span"
                    className="text-blue-600"
                    placeholder="계열/유형"
                  />
                </>
              )}
            </div>
            <span className="text-sm text-gray-500">
              <EditableField
                value={item.startDate}
                onChange={(v) => update(item.id, { startDate: v })}
                tag="span"
                placeholder="입학"
              />
              <span className="mx-1">–</span>
              <EditableField
                value={item.endDate}
                onChange={(v) => update(item.id, { endDate: v })}
                tag="span"
                placeholder="졸업"
              />
            </span>
          </div>
          {isUniversity(item) && <AdditionalMajorsBlock item={item} />}
          {isUniversity(item) && item.gpa !== undefined && (
            <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <span className="text-xs text-gray-400">학점</span>
              <EditableField
                value={item.gpa}
                onChange={(v) => update(item.id, { gpa: v })}
                tag="span"
                className="text-sm text-gray-500"
                placeholder="0.0"
              />
              <span className="text-gray-300">/</span>
              <span>{item.gpaScale ?? '4.5'}</span>
            </div>
          )}
          <ItemActions item={item} />
        </div>
      ))}
    </div>
  );
}
