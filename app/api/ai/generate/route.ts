import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import type { SectionType } from '@/lib/types';

const GEMINI_QUOTA_ERROR_CODE = 'GEMINI_QUOTA_EXCEEDED';
const GEMINI_QUOTA_ERROR_MESSAGE = '잠시 후에 다시 실행해주세요.';
const JSON_SECTIONS: SectionType[] = ['experience', 'education', 'skills', 'projects'];
const RICH_TEXT_MARKUP_INSTRUCTION = 'WYSIWYG 편집기에 적용될 수 있도록 필요할 때만 **굵게**, *기울임*, ++밑줄++, ~~취소선~~, - 목록 형식의 Markdown 표시를 사용.';

const SECTION_PROMPTS: Record<SectionType, string> = {
  header: '이력서 기본 정보(이름, 직함, 연락처 등) 섹션을 작성',
  summary: '이력서 자기소개 섹션을 3~5문장으로 작성. 강점과 경력 목표를 포함',
  text: '이력서 섹션 내용을 작성',
  experience: `이력서 경력 섹션을 아래 JSON 배열 형식으로 작성.
형식: [{"company":"회사명","role":"직책","location":"도시","startDate":"YYYY.MM","endDate":"YYYY.MM 또는 현재","description":"업무 설명"}]
description 필드는 ${RICH_TEXT_MARKUP_INSTRUCTION}
description은 면접관이 바로 역량을 판단할 수 있도록 3~5개의 짧은 목록으로 작성.
각 목록은 업무 나열이 아니라 해결한 문제, 본인이 맡은 책임, 사용한 기술/판단, 확인 가능한 성과를 포함.
수치가 참고 자료에 있으면 반드시 반영하고, 없으면 과장하거나 임의로 만들지 말고 정성적 성과로 작성.
회사 소개보다 지원자가 어떤 상황에서 어떤 결과를 만들었는지가 먼저 보이게 작성.
마크다운 코드블록 없이 순수 JSON 배열만 출력.`,
  education: `이력서 학력 섹션을 아래 JSON 배열 형식으로 작성.
형식: [{"schoolType":"university","school":"학교명","degree":"학사","field":"전공","additionalMajors":[{"label":"부전공","field":"전공명"}],"startDate":"YYYY.MM","endDate":"YYYY.MM","gpa":"","gpaScale":"4.5"}]
고등학교 형식: [{"schoolType":"highschool","school":"학교명","highSchoolCategory":"인문계(일반고)","startDate":"YYYY.MM","endDate":"YYYY.MM"}]
schoolType은 university, highschool, middleschool 중 하나. additionalMajors는 부전공, 복수전공, 연계전공 등이 있을 때만 포함. highSchoolCategory는 인문계(일반고), 전문계(특성화고), 마이스터고, 특목고, 자율고, 기타 중 적절한 값을 사용. 대학교가 아니면 degree, field, additionalMajors, gpa, gpaScale은 생략.
마크다운 코드블록 없이 순수 JSON 배열만 출력.`,
  skills: `이력서 기술 섹션을 아래 JSON 배열 형식으로 작성.
형식: [{"name":"카테고리명","skills":"기술1, 기술2, 기술3"}]
마크다운 코드블록 없이 순수 JSON 배열만 출력.`,
  projects: `이력서 프로젝트 섹션을 아래 JSON 배열 형식으로 작성.
형식: [{"name":"프로젝트명","description":"설명","tech":"사용기술","link":""}]
description 필드는 ${RICH_TEXT_MARKUP_INSTRUCTION}
마크다운 코드블록 없이 순수 JSON 배열만 출력.`,
};

function buildPrompt(
  sectionType: SectionType,
  reference?: string,
  rules?: string,
  currentContent?: string
): string {
  const isJson = JSON_SECTIONS.includes(sectionType);
  const rulesBlock = rules?.trim() ? `\n\n[반드시 지켜야 할 규칙]\n${rules}` : '';
  const currentContentBlock = currentContent?.trim() ? `\n\n[현재 섹션 내용]\n${currentContent}` : '';
  const referenceBlock = reference?.trim() ? `\n\n[참고 자료]\n${reference}` : '';
  const outputInstruction = isJson
    ? '\n\n출력: 순수 JSON 배열만. 코드블록, 설명, 부가 텍스트 절대 금지.'
    : `\n\n출력: 본문 텍스트만. 제목이나 부가 설명 없이. ${RICH_TEXT_MARKUP_INSTRUCTION}`;
  return `당신은 전문 이력서 작성 AI입니다.\n\n지시: ${SECTION_PROMPTS[sectionType]}${rulesBlock}${currentContentBlock}${referenceBlock}${outputInstruction}`;
}

function buildRefinePrompt(sectionType: SectionType, previousResult: string, userRequest: string, rules?: string): string {
  const isJson = JSON_SECTIONS.includes(sectionType);
  const rulesBlock = rules?.trim() ? `\n\n[반드시 지켜야 할 규칙]\n${rules}` : '';
  const outputInstruction = isJson
    ? '\n\n출력: 순수 JSON 배열만. 코드블록, 설명, 부가 텍스트 절대 금지.'
    : `\n\n출력: 본문 텍스트만. 제목이나 부가 설명 없이. ${RICH_TEXT_MARKUP_INSTRUCTION}`;
  return `당신은 전문 이력서 작성 AI입니다.${rulesBlock}\n\n[이전 결과]\n${previousResult}\n\n[사용자 수정 요청]\n${userRequest}\n\n위 이전 결과를 사용자 요청에 맞게 수정해줘.${outputInstruction}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

  return Object.values(value).flatMap((nestedValue) => collectErrorValues(nestedValue, depth + 1));
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

export async function POST(request: NextRequest) {
  let body: {
    sectionType: SectionType;
    apiKey?: string;
    reference?: string;
    rules?: string;
    currentContent?: string;
    previousResult?: string;
    userRequest?: string;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  if (!body.sectionType) {
    return Response.json({ error: 'sectionType이 필요합니다.' }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Gemini API 키를 설정해주세요.' }, { status: 400 });
  }

  const prompt = body.previousResult && body.userRequest
    ? buildRefinePrompt(body.sectionType, body.previousResult, body.userRequest, body.rules)
    : buildPrompt(body.sectionType, body.reference, body.rules, body.currentContent);

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return Response.json({ text: result.text?.trim() ?? '' });
  } catch (err) {
    if (isGeminiQuotaError(err)) {
      return Response.json(
        { error: GEMINI_QUOTA_ERROR_MESSAGE, code: GEMINI_QUOTA_ERROR_CODE },
        { status: 429 }
      );
    }

    return Response.json(
      { error: 'AI 생성 실패' },
      { status: 500 }
    );
  }
}
