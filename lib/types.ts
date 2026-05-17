export type SectionType =
  | "header"
  | "summary"
  | "text"
  | "experience"
  | "education"
  | "skills"
  | "projects";

export interface Resume {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ResumeSection {
  id: string;
  resume_id: string;
  type: SectionType;
  layout: string;
  content: SectionContent;
  order_index: number;
  created_at: string;
  updated_at: string;
}

// ── Header ──────────────────────────────────────────────
export interface HeaderContent {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

// ── Summary ─────────────────────────────────────────────
export interface SummaryContent {
  text: string;
}

// ── Plain text ──────────────────────────────────────────
export interface TextContent {
  text: string;
}

// ── Experience ──────────────────────────────────────────
export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ExperienceContent {
  items: ExperienceItem[];
}

// ── Education ───────────────────────────────────────────
export type GpaScale = '4.5' | '4.3' | '4.0';
export type SchoolType = 'university' | 'highschool' | 'middleschool';
export type HighSchoolCategory = (typeof HIGH_SCHOOL_CATEGORY_OPTIONS)[number];

export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  university: '대학교',
  highschool: '고등학교',
  middleschool: '중학교',
};

export const HIGH_SCHOOL_CATEGORY_OPTIONS = [
  '인문계(일반고)',
  '전문계(특성화고)',
  '마이스터고',
  '특목고',
  '자율고',
  '기타',
] as const;

export interface EducationItem {
  id: string;
  schoolType: SchoolType;
  school: string;
  degree?: string;
  field?: string;
  additionalMajors?: EducationAdditionalMajor[];
  highSchoolCategory?: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  gpaScale?: GpaScale;
}

export interface EducationAdditionalMajor {
  id: string;
  label: string;
  field: string;
}

export interface EducationContent {
  items: EducationItem[];
}

// ── Skills ──────────────────────────────────────────────
export interface SkillCategory {
  id: string;
  name: string;
  skills: string;
}

export interface SkillsContent {
  categories: SkillCategory[];
}

// ── Projects ────────────────────────────────────────────
export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  tech: string;
  link?: string;
}

export interface ProjectsContent {
  items: ProjectItem[];
}

export type SectionContent =
  | HeaderContent
  | SummaryContent
  | TextContent
  | ExperienceContent
  | EducationContent
  | SkillsContent
  | ProjectsContent;

export const SECTION_LABELS: Record<SectionType, string> = {
  header: "기본 정보",
  summary: "자기소개",
  text: "일반 텍스트",
  experience: "경력",
  education: "학력",
  skills: "기술",
  projects: "프로젝트",
};

export const LAYOUT_OPTIONS: Record<
  SectionType,
  { id: string; label: string }[]
> = {
  header: [
    { id: "layout1", label: "중앙 정렬" },
    { id: "layout2", label: "좌측 정렬" },
    { id: "layout3", label: "두 컬럼" },
  ],
  summary: [
    { id: "layout1", label: "박스형" },
    { id: "layout2", label: "인용구형" },
  ],
  text: [
    { id: "layout1", label: "기본형" },
    { id: "layout2", label: "강조형" },
  ],
  experience: [
    { id: "layout1", label: "타임라인" },
    { id: "layout2", label: "카드형" },
    { id: "layout3", label: "컴팩트" },
  ],
  education: [
    { id: "layout1", label: "기본형" },
    { id: "layout2", label: "인라인형" },
  ],
  skills: [
    { id: "layout1", label: "태그형" },
    { id: "layout2", label: "그룹형" },
    { id: "layout3", label: "두 컬럼" },
  ],
  projects: [
    { id: "layout1", label: "카드형" },
    { id: "layout2", label: "리스트형" },
  ],
};

const DEFAULT_EXPERIENCE_DESCRIPTION = [
  '- 해결한 문제: 어떤 비즈니스/제품/기술 문제를 다뤘는지',
  '- 맡은 역할: 본인이 주도하거나 책임진 범위',
  '- 성과: 수치, 품질 개선, 비용 절감, 일정 단축 등 확인 가능한 결과',
].join('\n');

export function makeDefaultContent(type: SectionType): SectionContent {
  switch (type) {
    case "header":
      return {
        name: "",
        title: "",
        email: "",
        phone: "",
        location: "",
        linkedin: "",
        github: "",
        website: "",
      } satisfies HeaderContent;
    case "summary":
      return { text: "자기소개를 작성해주세요." } satisfies SummaryContent;
    case "text":
      return { text: "내용을 작성해주세요." } satisfies TextContent;
    case "experience":
      return {
        items: [
          {
            id: crypto.randomUUID(),
            company: "회사명",
            role: "직책",
            location: "서울",
            startDate: "2022.01",
            endDate: "현재",
            description: DEFAULT_EXPERIENCE_DESCRIPTION,
          },
        ],
      } satisfies ExperienceContent;
    case "education":
      return {
        items: [
          {
            id: crypto.randomUUID(),
            schoolType: 'university',
            school: "대학교",
            degree: "학사",
            field: "컴퓨터공학",
            additionalMajors: [],
            startDate: "2018.03",
            endDate: "2022.02",
            gpa: '',
            gpaScale: '4.5',
          },
        ],
      } satisfies EducationContent;
    case "skills":
      return {
        categories: [
          {
            id: crypto.randomUUID(),
            name: "Frontend",
            skills: "React, TypeScript, Next.js",
          },
        ],
      } satisfies SkillsContent;
    case "projects":
      return {
        items: [
          {
            id: crypto.randomUUID(),
            name: "프로젝트명",
            description: "프로젝트 설명을 작성하세요.",
            tech: "React, TypeScript",
            link: "",
          },
        ],
      } satisfies ProjectsContent;
  }
}

export const DEFAULT_CONTENT: Record<SectionType, SectionContent> = {
  header: makeDefaultContent("header"),
  summary: makeDefaultContent("summary"),
  text: makeDefaultContent("text"),
  experience: makeDefaultContent("experience"),
  education: makeDefaultContent("education"),
  skills: makeDefaultContent("skills"),
  projects: makeDefaultContent("projects"),
};
