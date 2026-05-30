'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  SectionType,
  SectionContent,
  ExperienceContent,
} from '@/lib/types';
import { SECTION_LABELS } from '@/lib/types';
import { normalizeRichTextValue } from '@/lib/rich-text';
import { useAIStore } from '@/store/ai';
import { useAIJobsStore } from '@/store/ai-jobs';
import { RichTextRenderer } from '@/components/resume/RichTextRenderer';
import { NotionImport } from './NotionImport';

const GEMINI_QUOTA_ERROR_CODE = 'GEMINI_QUOTA_EXCEEDED';
const GEMINI_QUOTA_TOAST_MESSAGE = '잠시 후에 다시 실행해주세요.';
const TOAST_DURATION_MS = 3000;

const GEMINI_MODELS = [
  { id: 'gemma-4-31b-it', label: 'Gemma 4 31B' },
  { id: 'gemma-4-26b-it', label: 'Gemma 4 26B' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
] as const;

interface Props {
  sectionId: string;
  mode?: 'generate' | 'edit';
  sectionType: SectionType;
  currentContent: SectionContent;
  onApply: (text: string) => boolean;
  onClose: () => void;
  preloadedResult?: string;
}

type Tab = 'generate' | 'rules';

interface Message {
  role: 'user' | 'ai';
  text: string;
  suggestions?: string[];
}

export function AIPanel({
  sectionId,
  mode = 'generate',
  sectionType,
  currentContent,
  onApply,
  onClose,
  preloadedResult,
}: Props) {
  const { rules, setRules, geminiKey, geminiModel, setGeminiModel } =
    useAIStore();
  const currentJobIdRef = useRef<string | null>(null);
  const sessionMessagesKey = `ai_messages_${sectionType}`;
  const sessionReferenceKey = `ai_reference_${sectionType}`;
  const [tab, setTab] = useState<Tab>('generate');
  const [reference, setReference] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(sessionReferenceKey) ?? '';
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    if (preloadedResult) return [{ role: 'ai', text: preloadedResult }];
    if (typeof window === 'undefined') return [];
    try {
      const stored = sessionStorage.getItem(sessionMessagesKey);
      return stored ? (JSON.parse(stored) as Message[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rulesLocal, setRulesLocal] = useState(rules);
  const [notionOpen, setNotionOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setIsReferenceFocused] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [editDirection, setEditDirection] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasMessages = messages.length > 0;
  const latestAiText =
    [...messages].reverse().find((m) => m.role === 'ai')?.text ?? '';

  useEffect(() => {
    sessionStorage.setItem(sessionMessagesKey, JSON.stringify(messages));
  }, [messages, sessionMessagesKey]);

  useEffect(() => {
    sessionStorage.setItem(sessionReferenceKey, reference);
  }, [reference, sessionReferenceKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimeoutRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  const fetchSuggestions = useCallback(
    async (content: string): Promise<string[]> => {
      try {
        const res = await fetch('/api/ai/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionType,
            content,
            apiKey: geminiKey || undefined,
          }),
        });
        const data = (await res.json()) as { suggestions?: string[] };
        return data.suggestions ?? [];
      } catch {
        return [];
      }
    },
    [sectionType, geminiKey]
  );

  const addAiMessage = useCallback(
    async (text: string, replace = false) => {
      const suggestions = await fetchSuggestions(text);
      const msg: Message = { role: 'ai', text, suggestions };
      setMessages((prev) => (replace ? [msg] : [...prev, msg]));
    },
    [fetchSuggestions]
  );

  const callGenerate = useCallback(
    async (body: Record<string, unknown>) => {
      setError('');
      try {
        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            apiKey: geminiKey || undefined,
            model: geminiModel,
          }),
        });
        const data = (await res.json()) as {
          text?: string;
          error?: string;
          code?: string;
        };
        if (!res.ok || data.error) {
          if (data.code === GEMINI_QUOTA_ERROR_CODE) {
            showToast(GEMINI_QUOTA_TOAST_MESSAGE);
            return null;
          }
          setError(data.error ?? 'AI 생성 실패');
          return null;
        }
        return data.text ?? '';
      } catch {
        setError('네트워크 오류가 발생했습니다.');
        return null;
      }
    },
    [geminiKey, geminiModel, showToast]
  );

  const handleGenerate = useCallback(async () => {
    setMessages([]);
    sessionStorage.removeItem(sessionMessagesKey);

    const jobId = crypto.randomUUID();
    currentJobIdRef.current = jobId;
    useAIJobsStore.getState().addJob({
      id: jobId,
      sectionId,
      sectionType,
      sectionLabel: SECTION_LABELS[sectionType],
      mode: 'generate',
      status: 'running',
      startedAt: Date.now(),
    });

    setLoading(true);
    try {
      const text = await callGenerate({
        sectionType,
        reference: reference || undefined,
        rules,
        currentContent: JSON.stringify(currentContent),
      });
      if (text !== null) {
        useAIJobsStore
          .getState()
          .updateJob(jobId, { status: 'completed', result: text });
        await addAiMessage(text, true);
      } else {
        useAIJobsStore.getState().updateJob(jobId, { status: 'error' });
      }
    } catch {
      useAIJobsStore.getState().updateJob(jobId, { status: 'error' });
    } finally {
      setLoading(false);
    }
  }, [
    callGenerate,
    addAiMessage,
    sectionId,
    sectionType,
    sessionMessagesKey,
    reference,
    rules,
    currentContent,
  ]);

  const handleSend = useCallback(async () => {
    const req = input.trim();
    if (!req || !latestAiText) return;
    setMessages((prev) => [...prev, { role: 'user', text: req }]);
    setInput('');
    setLoading(true);
    try {
      const text = await callGenerate({
        sectionType,
        rules,
        previousResult: latestAiText,
        userRequest: req,
      });
      if (text !== null) await addAiMessage(text);
    } finally {
      setLoading(false);
    }
  }, [callGenerate, addAiMessage, input, latestAiText, sectionType, rules]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInput(suggestion);
  }, []);

  const handleEditSubmit = useCallback(async () => {
    const direction = editDirection.trim();
    if (!direction) return;

    const jobId = crypto.randomUUID();
    currentJobIdRef.current = jobId;
    useAIJobsStore.getState().addJob({
      id: jobId,
      sectionId,
      sectionType,
      sectionLabel: SECTION_LABELS[sectionType],
      mode: 'edit',
      status: 'running',
      startedAt: Date.now(),
    });

    setMessages([{ role: 'user', text: direction }]);
    setLoading(true);
    try {
      const text = await callGenerate({
        sectionType,
        rules,
        reference: reference || undefined,
        previousResult: JSON.stringify(currentContent),
        userRequest: direction,
      });
      if (text !== null) {
        useAIJobsStore
          .getState()
          .updateJob(jobId, { status: 'completed', result: text });
        await addAiMessage(text);
      } else {
        useAIJobsStore.getState().updateJob(jobId, { status: 'error' });
      }
    } catch {
      useAIJobsStore.getState().updateJob(jobId, { status: 'error' });
    } finally {
      setLoading(false);
    }
  }, [
    callGenerate,
    addAiMessage,
    editDirection,
    sectionId,
    sectionType,
    rules,
    reference,
    currentContent,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApply = useCallback(() => {
    if (!latestAiText) return;

    const didApply = onApply(latestAiText);
    if (!didApply) {
      setError(
        'AI 결과 형식을 적용할 수 없습니다. 다시 생성하거나 추가 요청으로 형식을 정리해주세요.'
      );
      return;
    }

    if (currentJobIdRef.current) {
      useAIJobsStore.getState().removeJob(currentJobIdRef.current);
      currentJobIdRef.current = null;
    }
    onClose();
  }, [latestAiText, onApply, onClose]);

  const handleReset = () => {
    setMessages([]);
    setInput('');
    setError('');
    setReference('');
    sessionStorage.removeItem(sessionMessagesKey);
    sessionStorage.removeItem(sessionReferenceKey);
  };

  const handleSaveRules = () => {
    setRules(rulesLocal);
    setTab('generate');
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      {toastMessage && (
        <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toastMessage}
        </div>
      )}
      <div
        className={`flex w-full flex-col rounded-t-2xl bg-white shadow-2xl transition-all duration-300 sm:rounded-2xl ${isExpanded ? 'h-[90vh] sm:max-w-5xl' : 'max-h-[90vh] sm:max-w-lg'}`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">
              {mode === 'edit' ? 'AI 수정' : 'AI 생성'}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
              {SECTION_LABELS[sectionType]}
            </span>
            <select
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              className="cursor-pointer rounded-full border-0 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 focus:ring-2 focus:ring-blue-300 focus:outline-none"
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600"
              title={isExpanded ? '작게 보기' : '크게 보기'}
            >
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-lg leading-none text-gray-400 transition-colors hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-gray-100">
          {(['generate', 'rules'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                if (t === 'rules') setRulesLocal(rules);
                setTab(t);
              }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-violet-500 text-violet-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'generate' ? '생성' : '규칙'}
            </button>
          ))}
        </div>

        {/* ── Rules tab ── */}
        {tab === 'rules' && (
          <>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="mb-3 text-sm text-gray-600">
                AI가 항상 지켜야 할 규칙을 설정하세요.
              </p>
              <textarea
                value={rulesLocal}
                onChange={(e) => setRulesLocal(e.target.value)}
                placeholder={
                  '예시:\n- 한국어로 작성할 것\n- 간결하고 전문적인 어조'
                }
                rows={10}
                className="w-full resize-none rounded-lg border border-gray-200 p-3 font-mono text-sm focus:ring-2 focus:ring-violet-300 focus:outline-none"
              />
            </div>
            <div className="flex shrink-0 gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setTab('generate')}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveRules}
                className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700"
              >
                저장
              </button>
            </div>
          </>
        )}

        {/* ── Edit tab: setup phase ── */}
        {tab === 'generate' && mode === 'edit' && !hasMessages && !loading && (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
              {sectionType === 'experience' && (
                <ExperienceStructurePreview content={currentContent} />
              )}
              <div className="flex min-h-0 flex-1 flex-col">
                <label className="mb-1.5 text-sm font-medium text-gray-700">
                  어떻게 수정할까요?
                </label>
                <textarea
                  value={editDirection}
                  onChange={(e) => setEditDirection(e.target.value)}
                  placeholder={
                    '예시:\n- 더 간결하게 다듬어줘\n- 영문으로 바꿔줘\n- 성과 위주로 재작성해줘\n- 문장을 더 자신감 있게 수정해줘'
                  }
                  className="min-h-36 w-full flex-1 resize-none rounded-lg border border-gray-200 p-3 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-300 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleEditSubmit();
                    }
                  }}
                />
              </div>
              {reference.trim() && (
                <p className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  이전에 입력한 참고사항도 함께 반영됩니다.
                </p>
              )}
              {error && (
                <p className="shrink-0 rounded-lg bg-red-50 p-3 text-sm text-red-500">
                  {error}
                </p>
              )}
            </div>
            <div className="shrink-0 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={handleEditSubmit}
                disabled={loading || !editDirection.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-emerald-200"
              >
                수정하기
              </button>
            </div>
          </>
        )}

        {/* ── Generate tab: setup phase ── */}
        {tab === 'generate' &&
          mode === 'generate' &&
          !hasMessages &&
          !loading && (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="mb-1.5 flex shrink-0 items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      참고사항{' '}
                      <span className="font-normal text-gray-400">(선택)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setNotionOpen(true)}
                      className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50"
                    >
                      <NotionIcon />
                      Notion에서 가져오기
                    </button>
                  </div>
                  <textarea
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    onFocus={() => setIsReferenceFocused(true)}
                    onBlur={() => setIsReferenceFocused(false)}
                    placeholder="참고할 내용을 입력하거나 Notion에서 가져오세요. 비워두면 AI가 직접 생성합니다."
                    className="min-h-30 w-full flex-1 resize-none rounded-lg border border-gray-200 p-3 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-violet-300 focus:outline-none"
                  />
                </div>

                {error && (
                  <p className="shrink-0 rounded-lg bg-red-50 p-3 text-sm text-red-500">
                    {error}
                  </p>
                )}
              </div>
              <div className="shrink-0 border-t border-gray-100 px-5 py-4">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:bg-violet-300"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      생성 중...
                    </>
                  ) : reference.trim() ? (
                    '참고사항 기반으로 생성'
                  ) : (
                    'AI로 생성'
                  )}
                </button>
              </div>
            </>
          )}

        {/* ── Generate tab: chat phase ── */}
        {tab === 'generate' && (hasMessages || loading) && (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}
                  >
                    {msg.role === 'ai' && (
                      <div className="mt-1 mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50">
                        <span className="text-xs font-bold text-blue-500">
                          G
                        </span>
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'rounded-tr-sm bg-violet-600 whitespace-pre-wrap text-white'
                          : 'rounded-tl-sm bg-gray-100 text-gray-800'
                      }`}
                    >
                      {msg.role === 'ai' ? (
                        <RichTextPreview value={msg.text} />
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                  {msg.role === 'ai' &&
                    msg.suggestions &&
                    msg.suggestions.length > 0 && (
                      <div className="mt-2 ml-8 flex flex-wrap gap-1.5">
                        {msg.suggestions.map((s, si) => (
                          <button
                            key={si}
                            type="button"
                            onClick={() => handleSuggestionClick(s)}
                            className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-600 transition-colors hover:bg-violet-100"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <span className="text-xs font-bold text-blue-500">G</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3">
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              )}
              {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-500">
                  {error}
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 border-t border-gray-100 px-4 py-3">
              <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="추가 요청사항 입력... (Enter 전송, Shift+Enter 줄바꿈)"
                  rows={1}
                  className="max-h-28 flex-1 resize-none bg-transparent py-0.5 text-sm placeholder:text-gray-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:bg-violet-200"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50"
              >
                처음부터
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!latestAiText}
                className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:bg-gray-200"
              >
                적용
              </button>
            </div>
          </>
        )}
      </div>

      {notionOpen && (
        <NotionImport
          onImport={(text) => {
            setReference((prev) => (prev ? `${prev}\n\n${text}` : text));
            setNotionOpen(false);
          }}
          onClose={() => setNotionOpen(false)}
        />
      )}
    </div>
  );
}

function tryParseExperienceContent(
  content: SectionContent
): ExperienceContent | null {
  if (
    typeof content === 'object' &&
    content !== null &&
    'items' in content &&
    Array.isArray((content as ExperienceContent).items)
  ) {
    return content as ExperienceContent;
  }
  return null;
}

function ExperienceStructurePreview({ content }: { content: SectionContent }) {
  const experience = tryParseExperienceContent(content);
  if (!experience || experience.items.length === 0) return null;

  return (
    <div className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
        현재 경력 구조
      </p>
      <div className="space-y-2">
        {experience.items.map((item) => (
          <div key={item.id}>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-bold text-gray-800">
                {item.company}
              </span>
              <span className="text-xs text-gray-400">{item.role}</span>
              <span className="text-xs text-gray-400">
                {item.startDate} – {item.endDate}
              </span>
            </div>
            {item.projects && item.projects.length > 0 && (
              <ul className="mt-1 ml-2 space-y-0.5">
                {item.projects.map((project) => (
                  <li
                    key={project.id}
                    className="flex flex-wrap items-baseline gap-1.5 text-xs text-gray-600"
                  >
                    <span className="text-gray-300">└</span>
                    <span className="font-medium">{project.name}</span>
                    {(project.startDate || project.endDate) && (
                      <span className="text-gray-400">
                        {project.startDate}
                        {project.startDate && project.endDate && ' – '}
                        {project.endDate}
                      </span>
                    )}
                    {project.tech && (
                      <span className="truncate text-gray-400">
                        ({project.tech})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function tryParseJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function RichTextPreview({ value }: { value: string }) {
  const parsed = tryParseJson(value);

  if (parsed !== null) {
    return (
      <pre className="overflow-x-auto rounded-md border border-gray-200 bg-white p-3 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap text-gray-700">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  }

  return (
    <RichTextRenderer
      value={normalizeRichTextValue(value)}
      className="rounded-md border border-gray-200 bg-white p-3 text-sm leading-relaxed text-gray-700"
    />
  );
}

function ExpandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3v5H3M21 8h-5V3M3 16h5v5M16 21v-5h5" />
    </svg>
  );
}

function NotionIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100" height="100" rx="15" fill="white" />
      <path
        d="M19.5 17.5C22.2 19.5 23.3 19.3 28.5 19L73.5 16.2C74.5 16.2 73.7 17.2 73.2 17.4L65.5 22.7C64 23.7 62 24.9 58.5 25.2L16 28.2C14.3 28.3 13.5 27.5 14.2 26.5L19.5 17.5Z"
        fill="#1a1a1a"
      />
      <path
        d="M22 33.5V81C22 83.5 23.3 84.3 26.2 84.1L77.5 81.1C80.4 80.9 80.8 79.1 80.8 76.9V30.2C80.8 28 79.8 26.9 77.9 27.1L25 30.3C22.9 30.5 22 31.3 22 33.5Z"
        fill="#f7f6f3"
      />
      <path
        d="M70.5 35.5L42.5 37.3C40.8 37.4 40.4 38.3 40.4 39.5V71.2C40.4 72.4 40.9 73 42 72.9L70 71.1C71.3 71 71.8 70.2 71.8 69V37C71.8 35.8 71.3 35.4 70.5 35.5Z"
        fill="#1a1a1a"
      />
      <path
        d="M35 38.5C35 36.8 33.6 35.6 32 35.7L27.5 36C26 36.1 25.5 37.1 25.5 38.2V69.8C25.5 70.9 26.2 71.5 27.5 71.4L31.5 71.1C33 71 35 70 35 68.5V38.5Z"
        fill="#1a1a1a"
      />
    </svg>
  );
}
