import { GoogleGenAI } from '@google/genai';
import type { NextRequest } from 'next/server';

import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import {
  createResume,
  createSection,
  deleteResume,
  getResumes,
  getSections,
} from '@/lib/supabase-db';
import {
  compactSectionContent,
  normalizeSectionContent,
} from '@/lib/rich-text';
import type {
  Resume,
  ResumeSection,
  SectionContent,
  SectionType,
} from '@/lib/types';
import { SECTION_LABELS } from '@/lib/types';

const GEMINI_QUOTA_ERROR_CODE = 'GEMINI_QUOTA_EXCEEDED';
const GEMINI_QUOTA_ERROR_MESSAGE = '잠시 후에 다시 실행해주세요.';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const JSON_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
const SECTION_TYPES = [
  'header',
  'summary',
  'text',
  'experience',
  'education',
  'skills',
  'projects',
] as const satisfies readonly SectionType[];

interface AICopyRequestBody {
  sourceResumeId?: string;
  target?: string;
  title?: string;
  apiKey?: string;
  model?: string;
  rules?: string;
}

interface SourceSectionSnapshot {
  type: SectionType;
  label: string;
  layout: string;
  content: unknown;
}

interface GeneratedSection {
  type: SectionType;
  layout: string;
  content: SectionContent;
}

interface GeneratedResumePayload {
  title: string;
  sections: GeneratedSection[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIds);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) => key !== 'id' && key !== 'resume_id' && key !== 'images'
      )
      .map(([key, nestedValue]) => [key, stripIds(nestedValue)])
  );
}

function isSectionType(value: unknown): value is SectionType {
  return (
    typeof value === 'string' && SECTION_TYPES.includes(value as SectionType)
  );
}

function stripJsonFence(value: string): string {
  const match = value.trim().match(JSON_FENCE_PATTERN);
  return match?.[1] ?? value;
}

function collectErrorValues(value: unknown, depth = 0): string[] {
  if (depth > 2) return [];

  if (typeof value === 'string' || typeof value === 'number') {
    return [String(value)];
  }

  if (value instanceof Error) {
    return [value.message, ...collectErrorValues(value.cause, depth + 1)];
  }

  if (!isRecord(value)) return [];

  return Object.values(value).flatMap((nestedValue) =>
    collectErrorValues(nestedValue, depth + 1)
  );
}

function isGeminiQuotaError(error: unknown): boolean {
  const errorText = collectErrorValues(error).join(' ').toLowerCase();
  return (
    errorText.includes('429') ||
    errorText.includes('quota') ||
    errorText.includes('resource_exhausted') ||
    errorText.includes('rate limit')
  );
}

function buildSourceSnapshot(
  sections: ResumeSection[]
): SourceSectionSnapshot[] {
  return sections.map((section) => ({
    type: section.type,
    label: SECTION_LABELS[section.type],
    layout: section.layout,
    content: stripIds(compactSectionContent(section.type, section.content)),
  }));
}

function buildPrompt(
  sourceResume: Resume,
  sections: ResumeSection[],
  target: string,
  title?: string,
  rules?: string
): string {
  const titleInstruction = title?.trim()
    ? `새 이력서 제목은 "${title.trim()}"로 사용.`
    : '새 이력서 제목도 목표 직군/컨셉에 맞게 한국어로 작성.';
  const rulesBlock = rules?.trim()
    ? `\n\n[추가 작성 규칙]\n${rules.trim()}`
    : '';

  return `당신은 전문 이력서 작성 AI입니다.

[작업]
아래 원본 이력서를 복사하되, 목표 직군 또는 컨셉에 맞는 새 이력서로 재작성하세요.

[목표 직군/컨셉]
${target}

[제목 규칙]
${titleInstruction}

[작성 원칙]
- 회사명, 학교명, 기간, 연락처, 링크처럼 사실 정보는 원본에 있는 경우 그대로 유지.
- 목표 직군/컨셉에 덜 맞는 표현은 과장하지 말고 관련 역량이 드러나도록 재구성.
- 원본에 없는 성과 수치, 직책, 경력, 기술은 만들지 말 것.
- 경력과 프로젝트는 문제, 담당 범위, 성과가 보이도록 구체적으로 작성.
- 전문 용어나 어려운 기술 은어는 남발하지 말고 누구나 이해할 수 있는 쉬운 표현을 사용.
- 모든 id, resume_id 필드는 출력하지 말 것.
${rulesBlock}

[출력 JSON 형식]
{
  "title": "새 이력서 제목",
  "sections": [
    {
      "type": "header | summary | text | experience | education | skills | projects",
      "layout": "원본 layout 값",
      "content": "원본 섹션 type에 맞는 content 객체"
    }
  ]
}

[섹션별 content 형식]
- header: {"name":"","title":"","email":"","phone":"","location":"","linkedin":"","github":"","website":""}
- summary/text: {"text":"마크다운 본문"}
- experience: {"items":[{"company":"","role":"","location":"","startDate":"","endDate":"","projects":[{"name":"","startDate":"","endDate":"","tech":"","problem":"","ownership":"","achievement":""}]}]}
- education: {"items":[{"schoolType":"university|highschool|middleschool","school":"","degree":"","field":"","additionalMajors":[{"label":"","field":""}],"highSchoolCategory":"","startDate":"","endDate":"","gpa":"","gpaScale":"4.5"}]}
- skills: {"categories":[{"name":"","skills":"기술1, 기술2"}]}
- projects: {"items":[{"name":"","description":"마크다운 본문","tech":"","link":""}]}

마크다운 코드블록 없이 순수 JSON 객체만 출력.

[원본 이력서]
${JSON.stringify(
  {
    title: sourceResume.title,
    sections: buildSourceSnapshot(sections),
  },
  null,
  2
)}`;
}

function parseGeneratedPayload(text: string): GeneratedResumePayload {
  const parsed: unknown = JSON.parse(stripJsonFence(text));
  if (!isRecord(parsed)) throw new Error('AI result is not an object');

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections = rawSections
    .filter(isRecord)
    .map((section): GeneratedSection | null => {
      if (!isSectionType(section.type)) return null;
      const layout =
        typeof section.layout === 'string' ? section.layout : 'layout1';
      const content = normalizeSectionContent(section.type, section.content);
      return { type: section.type, layout, content };
    })
    .filter((section) => section !== null);

  if (sections.length === 0) {
    throw new Error('AI result has no sections');
  }

  return { title, sections };
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser();
  if (!auth) return unauthorizedResponse();

  let body: AICopyRequestBody;
  try {
    body = (await request.json()) as AICopyRequestBody;
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const sourceResumeId = body.sourceResumeId?.trim();
  const target = body.target?.trim();

  if (!sourceResumeId) {
    return Response.json(
      { error: 'sourceResumeId가 필요합니다.' },
      { status: 400 }
    );
  }

  if (!target) {
    return Response.json(
      { error: '새 컨셉 또는 직군을 입력해주세요.' },
      { status: 400 }
    );
  }

  const apiKey = body.apiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Gemini API 키를 설정해주세요.' },
      { status: 400 }
    );
  }

  let createdResume: Resume | null = null;

  try {
    const resumes = await getResumes(auth);
    const sourceResume = resumes.find((resume) => resume.id === sourceResumeId);
    if (!sourceResume) {
      return Response.json(
        { error: '원본 이력서를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const sourceSections = await getSections(auth, sourceResumeId);
    if (sourceSections.length === 0) {
      return Response.json(
        { error: '원본 이력서에 섹션이 없습니다.' },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenAI({ apiKey });
    const result = await genAI.models.generateContent({
      model: body.model?.trim() || DEFAULT_MODEL,
      contents: buildPrompt(
        sourceResume,
        sourceSections,
        target,
        body.title,
        body.rules
      ),
    });

    const generated = parseGeneratedPayload(result.text?.trim() ?? '');
    const resumeTitle =
      body.title?.trim() ||
      generated.title ||
      `${sourceResume.title} - AI 변환`;

    createdResume = await createResume(auth, resumeTitle);
    for (const [index, section] of generated.sections.entries()) {
      await createSection(
        auth,
        createdResume.id,
        section.type,
        section.content,
        index,
        section.layout
      );
    }

    return Response.json({ resume: createdResume }, { status: 201 });
  } catch (error) {
    if (createdResume) {
      await deleteResume(auth, createdResume.id).catch(() => undefined);
    }

    if (isGeminiQuotaError(error)) {
      return Response.json(
        { error: GEMINI_QUOTA_ERROR_MESSAGE, code: GEMINI_QUOTA_ERROR_CODE },
        { status: 429 }
      );
    }

    return Response.json({ error: 'AI 이력서 생성 실패' }, { status: 500 });
  }
}
