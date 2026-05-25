const GEMINI_QUOTA_ERROR_CODE = 'GEMINI_QUOTA_EXCEEDED';
const GEMINI_ACCESS_DENIED_ERROR_CODE = 'GEMINI_ACCESS_DENIED';

interface GeminiErrorResult {
  code?: string;
  message: string;
  status: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectErrorValues(value: unknown, depth = 0): string[] {
  if (depth > 3) return [];

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

function getErrorText(error: unknown): string {
  return collectErrorValues(error).join(' ').toLowerCase();
}

export function getGeminiErrorResult(error: unknown): GeminiErrorResult {
  const errorText = getErrorText(error);

  if (
    errorText.includes('429') ||
    errorText.includes('quota') ||
    errorText.includes('resource_exhausted') ||
    errorText.includes('rate limit')
  ) {
    return {
      code: GEMINI_QUOTA_ERROR_CODE,
      message: '잠시 후에 다시 실행해주세요.',
      status: 429,
    };
  }

  if (
    errorText.includes('403') ||
    errorText.includes('permission_denied') ||
    errorText.includes('denied access')
  ) {
    return {
      code: GEMINI_ACCESS_DENIED_ERROR_CODE,
      message:
        'Gemini API 키가 속한 Google 프로젝트의 접근이 거부되었습니다. AI Studio에서 새 API 키를 만들거나 프로젝트의 Gemini API 권한 상태를 확인해주세요.',
      status: 403,
    };
  }

  return {
    message: 'Gemini API 호출에 실패했습니다. API 키와 선택한 모델을 확인해주세요.',
    status: 500,
  };
}
