'use client';

import type { AIJob } from '@/store/ai-jobs';
import { normalizeRichTextForEditor } from '@/lib/rich-text';

interface Props {
  job: AIJob;
  onApply: () => void;
  onClose: () => void;
}

function tryParseJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function ResultPreview({ text, sectionType }: { text: string; sectionType: string }) {
  const parsed = tryParseJson(text);
  if (parsed !== null) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-700">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  }
  if (sectionType === 'summary' || sectionType === 'text') {
    return (
      <div
        className="rich-text-field rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-800"
        dangerouslySetInnerHTML={{ __html: normalizeRichTextForEditor(text) }}
      />
    );
  }
  return (
    <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
      {text}
    </p>
  );
}

export function AIResultPanel({ job, onApply, onClose }: Props) {
  const modeLabel = job.mode === 'generate' ? 'AI 생성' : 'AI 수정';

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs text-green-600">
              ✓
            </span>
            <span className="text-base font-semibold text-gray-900">
              {modeLabel} 완료
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
              {job.sectionLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-lg leading-none text-gray-400 transition-colors hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Result preview */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-3 text-sm text-gray-500">
            생성된 내용을 확인하고 적용하세요.
          </p>
          {job.result ? (
            <ResultPreview text={job.result} sectionType={job.sectionType} />
          ) : (
            <p className="text-sm text-gray-400">결과 없음</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!job.result}
            className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:bg-gray-200"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
