import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';

import { getServerGeminiApiKey } from '@/lib/server-user-tokens';
import type { SectionType } from '@/lib/types';
import { SECTION_LABELS } from '@/lib/types';

export async function POST(request: NextRequest) {
  let body: { sectionType: SectionType; content: string; apiKey?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ suggestions: [] });
  }

  const apiKey = await getServerGeminiApiKey(body.apiKey);
  if (!apiKey) return Response.json({ suggestions: [] });

  const sectionLabel = SECTION_LABELS[body.sectionType] ?? body.sectionType;

  const prompt = `이력서의 "${sectionLabel}" 섹션이 다음과 같이 작성되었습니다:

${body.content}

이 내용을 더 발전시키기 위한 후속 요청이나 개선 제안을 3개 만들어줘.
- 사용자가 클릭해서 바로 보낼 수 있는 짧은 문장 형태
- 각 20자 이내
- 질문 형태 또는 요청 형태 혼합
- 구체적이고 실용적인 내용

출력: JSON 배열만. 예시: ["더 간결하게 줄여줘", "성과를 수치로 바꿔줘", "다른 어조로 다시 써줘"]`;

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const result = await genAI.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: prompt,
    });
    const raw = result.text?.trim() ?? '[]';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const suggestions = JSON.parse(cleaned) as string[];
    return Response.json({ suggestions: suggestions.slice(0, 3) });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
