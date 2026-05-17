import { normalizeRichTextForEditor } from '@/lib/rich-text';
import type {
  SectionType,
  SectionContent,
  SummaryContent,
  ExperienceContent,
  EducationContent,
  HighSchoolCategory,
  SkillsContent,
  ProjectsContent,
} from '@/lib/types';
import { HIGH_SCHOOL_CATEGORY_OPTIONS } from '@/lib/types';

const SCHOOL_TYPES = ['university', 'highschool', 'middleschool'] as const;
const GPA_SCALES = ['4.5', '4.3', '4.0'] as const;
const ADDITIONAL_MAJOR_FALLBACK_LABEL = '추가 전공';
const DEFAULT_HIGH_SCHOOL_CATEGORY: HighSchoolCategory = '인문계(일반고)';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function toRichTextValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === 'string').join('\n');
  return '';
}

export function parseJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced?.[1] ?? trimmed;
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed)) throw new Error('AI result is not a JSON array');
  return parsed;
}

function isSchoolType(
  value: unknown,
): value is EducationContent['items'][number]['schoolType'] {
  return (
    typeof value === 'string' &&
    SCHOOL_TYPES.includes(
      value as EducationContent['items'][number]['schoolType'],
    )
  );
}

function isGpaScale(
  value: unknown,
): value is EducationContent['items'][number]['gpaScale'] {
  return (
    typeof value === 'string' &&
    GPA_SCALES.includes(
      value as NonNullable<EducationContent['items'][number]['gpaScale']>,
    )
  );
}

function inferSchoolType(
  item: Record<string, unknown>,
): EducationContent['items'][number]['schoolType'] {
  if (isSchoolType(item.schoolType)) return item.schoolType;
  const school = toText(item.school);
  if (school.includes('고등')) return 'highschool';
  if (school.includes('중학')) return 'middleschool';
  return 'university';
}

function normalizeAdditionalMajor(
  value: unknown,
):
  | NonNullable<EducationContent['items'][number]['additionalMajors']>[number]
  | null {
  if (!isRecord(value)) return null;
  const label =
    toText(value.label) ||
    toText(value.type) ||
    toText(value.name) ||
    ADDITIONAL_MAJOR_FALLBACK_LABEL;
  const field = toText(value.field) || toText(value.major);
  if (!field) return null;
  return { id: crypto.randomUUID(), label, field };
}

function normalizeAdditionalMajors(
  item: Record<string, unknown>,
): NonNullable<EducationContent['items'][number]['additionalMajors']> {
  const additionalMajors = Array.isArray(item.additionalMajors)
    ? item.additionalMajors
        .map(normalizeAdditionalMajor)
        .filter((major) => major !== null)
    : [];

  const minor = toText(item.minor);
  if (minor) {
    additionalMajors.push({ id: crypto.randomUUID(), label: '부전공', field: minor });
  }

  const doubleMajor = toText(item.doubleMajor);
  if (doubleMajor) {
    additionalMajors.push({
      id: crypto.randomUUID(),
      label: '복수전공',
      field: doubleMajor,
    });
  }

  return additionalMajors;
}

function normalizeHighSchoolCategory(item: Record<string, unknown>): string {
  const rawValue =
    toText(item.highSchoolCategory) ||
    toText(item.category) ||
    toText(item.track) ||
    toText(item.highSchoolType);

  if (!rawValue) return DEFAULT_HIGH_SCHOOL_CATEGORY;
  if (HIGH_SCHOOL_CATEGORY_OPTIONS.includes(rawValue as HighSchoolCategory))
    return rawValue;
  if (rawValue.includes('마이스터')) return '마이스터고';
  if (
    rawValue.includes('전문') ||
    rawValue.includes('특성화') ||
    rawValue.includes('공업') ||
    rawValue.includes('상업')
  ) {
    return '전문계(특성화고)';
  }
  if (rawValue.includes('인문') || rawValue.includes('일반'))
    return '인문계(일반고)';
  if (
    rawValue.includes('특목') ||
    rawValue.includes('외고') ||
    rawValue.includes('과학') ||
    rawValue.includes('국제')
  ) {
    return '특목고';
  }
  if (rawValue.includes('자율') || rawValue.includes('자사')) return '자율고';
  return rawValue;
}

export function normalizeEducationItem(
  item: unknown,
): EducationContent['items'][number] {
  if (!isRecord(item)) {
    return {
      id: crypto.randomUUID(),
      schoolType: 'university',
      school: '',
      degree: '',
      field: '',
      additionalMajors: [],
      startDate: '',
      endDate: '',
      gpa: '',
      gpaScale: '4.5',
    };
  }

  const schoolType = inferSchoolType(item);
  const base = {
    id: crypto.randomUUID(),
    schoolType,
    school: toText(item.school),
    startDate: toText(item.startDate),
    endDate: toText(item.endDate),
  };

  if (schoolType === 'highschool') {
    return { ...base, highSchoolCategory: normalizeHighSchoolCategory(item) };
  }

  if (schoolType !== 'university') return base;

  return {
    ...base,
    degree: toText(item.degree),
    field: toText(item.field),
    additionalMajors: normalizeAdditionalMajors(item),
    gpa: toText(item.gpa),
    gpaScale: isGpaScale(item.gpaScale) ? item.gpaScale : '4.5',
  };
}

/**
 * Parses an AI-generated text result and returns the corresponding SectionContent.
 * Returns null if the result cannot be parsed (caller should keep existing content).
 */
export function applyAIResult(
  sectionType: SectionType,
  text: string,
): SectionContent | null {
  if (sectionType === 'summary' || sectionType === 'text') {
    return { text: normalizeRichTextForEditor(text) } as SummaryContent;
  }

  try {
    const parsed = parseJsonArray(text);

    if (sectionType === 'experience') {
      return {
        items: parsed.filter(isRecord).map((item) => {
          const rawProjects = Array.isArray(item.projects) ? item.projects : [];
          const hasProjects = rawProjects.length > 0;
          return {
            id: crypto.randomUUID(),
            company: toText(item.company),
            role: toText(item.role),
            location: toText(item.location),
            startDate: toText(item.startDate),
            endDate: toText(item.endDate),
            projects: hasProjects
              ? rawProjects.filter(isRecord).map((p) => ({
                  id: crypto.randomUUID(),
                  name: toText(p.name),
                  startDate: toText(p.startDate),
                  endDate: toText(p.endDate),
                  tech: toText(p.tech),
                  problem: normalizeRichTextForEditor(toRichTextValue(p.problem)),
                  ownership: normalizeRichTextForEditor(toRichTextValue(p.ownership)),
                  achievement: normalizeRichTextForEditor(toRichTextValue(p.achievement)),
                }))
              : [
                  {
                    id: crypto.randomUUID(),
                    name: '프로젝트명',
                    tech: toText(item.tech),
                    problem: normalizeRichTextForEditor(toRichTextValue(item.problem)),
                    ownership: normalizeRichTextForEditor(toRichTextValue(item.ownership)),
                    achievement: normalizeRichTextForEditor(toRichTextValue(item.achievement)),
                  },
                ],
          };
        }),
      } as ExperienceContent;
    }

    if (sectionType === 'education') {
      return { items: parsed.map(normalizeEducationItem) } as EducationContent;
    }

    if (sectionType === 'skills') {
      return {
        categories: parsed.filter(isRecord).map((item) => ({
          id: crypto.randomUUID(),
          name: toText(item.name),
          skills: toText(item.skills),
        })),
      } as SkillsContent;
    }

    if (sectionType === 'projects') {
      return {
        items: parsed.filter(isRecord).map((item) => ({
          id: crypto.randomUUID(),
          name: toText(item.name),
          tech: toText(item.tech),
          link: toText(item.link),
          description: normalizeRichTextForEditor(toText(item.description)),
        })),
      } as ProjectsContent;
    }
  } catch {
    return null;
  }

  return null;
}
