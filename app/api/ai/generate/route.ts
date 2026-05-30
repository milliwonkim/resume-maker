import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';

import { getGeminiErrorResult } from '@/lib/gemini-errors';
import { getServerGeminiApiKey } from '@/lib/server-user-tokens';
import type { SectionType } from '@/lib/types';

const JSON_SECTIONS: SectionType[] = [
  'header',
  'experience',
  'education',
  'skills',
  'projects',
];
const RICH_TEXT_MARKUP_INSTRUCTION =
  'WYSIWYG 편집기에 적용될 수 있도록 필요할 때만 **굵게**, *기울임*, ++밑줄++, ~~취소선~~, - 목록 형식의 Markdown 표시를 사용.';

const SECTION_PROMPTS: Record<SectionType, string> = {
  header: `이력서 기본 정보 섹션을 아래 JSON 배열 형식으로 작성.
형식: [{"name":"이름","title":"직함/포지션","email":"이메일","phone":"전화번호","location":"지역","linkedin":"LinkedIn URL","github":"GitHub URL","website":"개인 웹사이트"}]
참고 자료에 없는 연락처나 URL은 만들지 말고 빈 문자열로 둘 것.
마크다운 코드블록 없이 순수 JSON 배열만 출력.`,
  summary: '이력서 자기소개 섹션을 3~5문장으로 작성. 강점과 경력 목표를 포함',
  text: '이력서 섹션 내용을 작성',
  experience: `이력서 경력 섹션을 아래 JSON 배열 형식으로 작성.
형식: [{"company":"회사명","role":"직책","location":"도시","startDate":"YYYY.MM","endDate":"YYYY.MM 또는 현재","projects":[{"name":"프로젝트명","startDate":"YYYY.MM","endDate":"YYYY.MM 또는 현재","tech":"기술1, 기술2","problem":"해결한 문제/상황","ownership":"담당 역할/책임","achievement":"핵심 성과"}]}]
회사 안에 여러 프로젝트가 있으면 projects 배열에 각각 추가.
프로젝트 name 규칙: 참고 자료에 프로젝트명이 명확히 있으면 그대로 사용. 없거나 기본값("프로젝트명")이면 problem·ownership·achievement 내용을 바탕으로 핵심을 요약한 한국어 제목(15자 이내)을 추론해서 작성. 단, 사용자가 명시적으로 제목을 생성하라고 요청하면 반드시 새 제목을 만들 것.
작성 관점: 프론트엔드 개발자를 채용하는 선임 프론트엔드 개발자가 이력서를 볼 때 궁금해하는 내용을 먼저 드러낼 것. 단순 업무 나열이 아니라 "어떤 문제를 왜 풀었는지", "본인이 어디까지 책임졌는지", "기술 선택과 구현 판단이 무엇이었는지", "그 결과 제품·사용자·팀에 어떤 변화가 있었는지"가 보여야 함.
problem: 서비스/제품 맥락, 사용자 불편, 개발 생산성 문제, 성능·안정성·유지보수 문제 중 실제로 다룬 문제를 2~3개 목록으로 작성. 가능하면 화면, 기능, 사용자 흐름, 운영 상황을 포함. ${RICH_TEXT_MARKUP_INSTRUCTION}
ownership: 본인이 직접 설계·구현·개선·조율한 범위를 2~3개 목록으로 작성. 프론트엔드 구조 설계, 상태 관리, API 연동, 컴포넌트 설계, 성능 개선, 테스트, 디자인/백엔드 협업, 배포 후 대응 중 해당되는 책임을 구체적으로 포함. ${RICH_TEXT_MARKUP_INSTRUCTION}
achievement: 수치·품질 개선·비용 절감·일정 단축·운영 안정화·협업 효율 등 확인 가능한 성과를 2~3개 목록으로 작성. 수치가 참고 자료에 있으면 반드시 반영하고, 없으면 과장하지 말고 관찰 가능한 정성적 결과로 작성. ${RICH_TEXT_MARKUP_INSTRUCTION}
직책(role) 작성 규칙: 참고 자료에 명확히 "리드", "Lead", "팀장", "책임" 등이 명시된 경우에만 해당 표현을 사용. 참고 자료에 없거나 업무 내용만으로 추측하는 경우에는 리드·시니어 등 과장된 표현을 쓰지 않고 실제 직책 또는 일반적인 직무명으로 작성. 단, 업무 내용에서 주도적인 역할이 분명히 드러난다면 description 안에서 그 사실을 언급하는 것은 괜찮음.
각 필드는 면접관이 다음 질문의 답을 바로 찾을 수 있도록 작성: 이 사람이 어떤 규모와 복잡도의 프론트엔드 문제를 다뤘는가, 혼자 한 일과 함께 한 일의 경계가 무엇인가, 기술 판단을 스스로 설명할 수 있는가, 결과가 실제로 검증되었는가.
참고 자료에 없는 수치, 트래픽 규모, 리더십 직함, 성과는 만들지 말 것.
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
  const rulesBlock = rules?.trim()
    ? `\n\n[반드시 지켜야 할 규칙]\n${rules}`
    : '';
  const currentContentBlock = currentContent?.trim()
    ? `\n\n[현재 섹션 내용]\n${currentContent}`
    : '';
  const referenceBlock = reference?.trim()
    ? `\n\n[참고 자료]\n${reference}`
    : '';
  const outputInstruction = isJson
    ? '\n\n출력: 순수 JSON 배열만. 코드블록, 설명, 부가 텍스트 절대 금지.'
    : `\n\n출력: 본문 텍스트만. 제목이나 부가 설명 없이. ${RICH_TEXT_MARKUP_INSTRUCTION}`;
  return `당신은 전문 이력서 작성 AI입니다.\n\n[언어 규칙]\n전문 용어나 어려운 기술 은어(예: 회귀 버그, 멱등성, 데드락, 레이스 컨디션 등)는 사용하지 말 것. 누구나 이해할 수 있는 쉬운 표현으로 대체할 것. 단, 기술 스택 이름(React, TypeScript 등)은 그대로 사용.\n\n지시: ${SECTION_PROMPTS[sectionType]}${rulesBlock}${currentContentBlock}${referenceBlock}${outputInstruction}`;
}

function stripId(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => key !== 'id')
  );
}

function normalizePreviousResult(
  sectionType: SectionType,
  previousResult: string
): string {
  if (sectionType !== 'experience') return previousResult;
  try {
    const parsed: unknown = JSON.parse(previousResult);
    const rawItems: unknown =
      isRecord(parsed) && Array.isArray(parsed.items) ? parsed.items : parsed;
    if (!Array.isArray(rawItems)) return previousResult;

    const cleaned = rawItems.filter(isRecord).map((item) => {
      const base = stripId(item);
      if (Array.isArray(item.projects)) {
        base.projects = item.projects.filter(isRecord).map(stripId);
      }
      return base;
    });
    return JSON.stringify(cleaned, null, 2);
  } catch {
    return previousResult;
  }
}

function buildRefinePrompt(
  sectionType: SectionType,
  previousResult: string,
  userRequest: string,
  rules?: string,
  reference?: string
): string {
  const isJson = JSON_SECTIONS.includes(sectionType);
  const rulesBlock = rules?.trim()
    ? `\n\n[반드시 지켜야 할 규칙]\n${rules}`
    : '';
  const referenceBlock = reference?.trim()
    ? `\n\n[참고 자료]\n${reference}`
    : '';
  const formatInstruction = isJson
    ? `\n\n[출력 형식]\n${SECTION_PROMPTS[sectionType]}`
    : '';
  const outputInstruction = isJson
    ? '\n\n출력: 순수 JSON 배열만. 코드블록, 설명, 부가 텍스트 절대 금지.'
    : `\n\n출력: 본문 텍스트만. 제목이나 부가 설명 없이. ${RICH_TEXT_MARKUP_INSTRUCTION}`;
  const cleanedPrevious = normalizePreviousResult(sectionType, previousResult);
  return `당신은 전문 이력서 작성 AI입니다.\n\n[언어 규칙]\n전문 용어나 어려운 기술 은어(예: 회귀 버그, 멱등성, 데드락, 레이스 컨디션 등)는 사용하지 말 것. 누구나 이해할 수 있는 쉬운 표현으로 대체할 것. 단, 기술 스택 이름(React, TypeScript 등)은 그대로 사용.${rulesBlock}${formatInstruction}\n\n[현재 내용]\n${cleanedPrevious}${referenceBlock}\n\n[수정 요청]\n${userRequest}\n\n위 현재 내용을 수정 요청에 맞게 수정해줘.${outputInstruction}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function POST(request: NextRequest) {
  let body: {
    sectionType: SectionType;
    apiKey?: string;
    model?: string;
    reference?: string;
    rules?: string;
    currentContent?: string;
    previousResult?: string;
    userRequest?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  if (!body.sectionType) {
    return Response.json(
      { error: 'sectionType이 필요합니다.' },
      { status: 400 }
    );
  }

  const apiKey = await getServerGeminiApiKey(body.apiKey);
  if (!apiKey) {
    return Response.json(
      { error: 'Gemini API 키를 설정해주세요.' },
      { status: 400 }
    );
  }

  const prompt =
    body.previousResult && body.userRequest
      ? buildRefinePrompt(
          body.sectionType,
          body.previousResult,
          body.userRequest,
          body.rules,
          body.reference
        )
      : buildPrompt(
          body.sectionType,
          body.reference,
          body.rules,
          body.currentContent
        );

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const result = await genAI.models.generateContent({
      model: body.model?.trim() || 'gemma-4-31b-it',
      contents: prompt,
    });
    return Response.json({ text: result.text?.trim() ?? '' });
  } catch (err) {
    console.error('[ai/generate] error:', err);
    const geminiError = getGeminiErrorResult(err);

    return Response.json(
      { error: geminiError.message, code: geminiError.code },
      { status: geminiError.status }
    );
  }
}
