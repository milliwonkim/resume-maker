'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SectionType, SectionContent } from '@/lib/types';
import { SECTION_LABELS } from '@/lib/types';
import { normalizeRichTextForEditor } from '@/lib/rich-text';
import { useAIStore } from '@/store/ai';
import { NotionImport } from './NotionImport';

const GEMINI_QUOTA_ERROR_CODE = 'GEMINI_QUOTA_EXCEEDED';
const GEMINI_QUOTA_TOAST_MESSAGE = '잠시 후에 다시 실행해주세요.';
const TOAST_DURATION_MS = 3000;

interface Props {
  sectionType: SectionType;
  currentContent: SectionContent;
  onApply: (text: string) => void;
  onClose: () => void;
}

type Tab = 'generate' | 'rules';

interface Message {
  role: 'user' | 'ai';
  text: string;
  suggestions?: string[];
}

export function AIPanel({ sectionType, currentContent, onApply, onClose }: Props) {
  const { rules, setRules, geminiKey } = useAIStore();
  const [tab, setTab] = useState<Tab>('generate');
  const [reference, setReference] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rulesLocal, setRulesLocal] = useState(rules);
  const [notionOpen, setNotionOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReferenceFocused, setIsReferenceFocused] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasMessages = messages.length > 0;
  const latestAiText = [...messages].reverse().find((m) => m.role === 'ai')?.text ?? '';
  const shouldShowAppliedRules = rules.trim() && !isReferenceFocused;

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

  const fetchSuggestions = useCallback(async (content: string): Promise<string[]> => {
    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionType, content, apiKey: geminiKey || undefined }),
      });
      const data = await res.json() as { suggestions?: string[] };
      return data.suggestions ?? [];
    } catch {
      return [];
    }
  }, [sectionType, geminiKey]);

  const addAiMessage = useCallback(async (text: string, replace = false) => {
    const suggestions = await fetchSuggestions(text);
    const msg: Message = { role: 'ai', text, suggestions };
    setMessages((prev) => replace ? [msg] : [...prev, msg]);
  }, [fetchSuggestions]);

  const callGenerate = useCallback(async (body: Record<string, unknown>) => {
    setError('');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, apiKey: geminiKey || undefined }),
      });
      const data = await res.json() as { text?: string; error?: string; code?: string };
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
  }, [geminiKey, showToast]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const text = await callGenerate({
        sectionType,
        reference: reference || undefined,
        rules,
        currentContent: JSON.stringify(currentContent),
      });
      if (text !== null) await addAiMessage(text, true);
    } finally {
      setLoading(false);
    }
  }, [callGenerate, addAiMessage, sectionType, reference, rules, currentContent]);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
    setError('');
    setReference('');
  };

  const handleSaveRules = () => {
    setRules(rulesLocal);
    setTab('generate');
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      {toastMessage && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toastMessage}
        </div>
      )}
      <div className={`bg-white rounded-t-2xl sm:rounded-2xl w-full shadow-2xl flex flex-col transition-all duration-300 ${isExpanded ? 'sm:max-w-5xl h-[90vh]' : 'sm:max-w-lg max-h-[90vh]'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-900">AI 생성</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {SECTION_LABELS[sectionType]}
            </span>
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
              Gemini 2.5 Flash
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
              title={isExpanded ? '작게 보기' : '크게 보기'}
            >
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors text-lg leading-none">
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 shrink-0">
          {(['generate', 'rules'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { if (t === 'rules') setRulesLocal(rules); setTab(t); }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'text-violet-600 border-b-2 border-violet-500' : 'text-gray-500 hover:text-gray-700'
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
              <p className="text-sm text-gray-600 mb-3">AI가 항상 지켜야 할 규칙을 설정하세요.</p>
              <textarea
                value={rulesLocal}
                onChange={(e) => setRulesLocal(e.target.value)}
                placeholder={"예시:\n- 한국어로 작성할 것\n- 간결하고 전문적인 어조"}
                rows={10}
                className="w-full text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 font-mono"
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0">
              <button type="button" onClick={() => setTab('generate')} className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2.5 rounded-lg transition-colors">
                취소
              </button>
              <button type="button" onClick={handleSaveRules} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                저장
              </button>
            </div>
          </>
        )}

        {/* ── Generate tab: setup phase ── */}
        {tab === 'generate' && !hasMessages && (
          <>
            <div className="flex-1 flex flex-col gap-4 p-5 min-h-0 overflow-hidden">
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-1.5 shrink-0">
                  <label className="text-sm font-medium text-gray-700">
                    참고사항 <span className="text-gray-400 font-normal">(선택)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setNotionOpen(true)}
                    className="text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors"
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
                  className="flex-1 w-full text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-gray-400 min-h-30"
                />
              </div>
              {shouldShowAppliedRules && (
                <div className="bg-violet-50 rounded-lg p-3 shrink-0">
                  <p className="text-xs text-violet-600 font-medium mb-1">적용 중인 규칙</p>
                  <p className="text-xs text-violet-700 whitespace-pre-wrap leading-relaxed">{rules}</p>
                </div>
              )}
              {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg p-3 shrink-0">{error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 shrink-0">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />생성 중...</>
                ) : reference.trim() ? '참고사항 기반으로 생성' : 'AI로 생성'}
              </button>
            </div>
          </>
        )}

        {/* ── Generate tab: chat phase ── */}
        {tab === 'generate' && hasMessages && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>
                    {msg.role === 'ai' && (
                      <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center mr-2 mt-1 shrink-0">
                        <span className="text-blue-500 text-xs font-bold">G</span>
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-violet-600 text-white rounded-tr-sm whitespace-pre-wrap'
                          : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                      }`}
                    >
                      {msg.role === 'ai' ? <RichTextPreview value={msg.text} /> : msg.text}
                    </div>
                  </div>
                  {msg.role === 'ai' && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-8">
                      {msg.suggestions.map((s, si) => (
                        <button
                          key={si}
                          type="button"
                          onClick={() => handleSuggestionClick(s)}
                          className="text-xs text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-full transition-colors"
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
                  <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center mr-2 shrink-0">
                    <span className="text-blue-500 text-xs font-bold">G</span>
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg p-3">{error}</p>}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 py-3 border-t border-gray-100 shrink-0">
              <div className="flex items-end gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="추가 요청사항 입력... (Enter 전송, Shift+Enter 줄바꿈)"
                  rows={1}
                  className="flex-1 bg-transparent text-sm resize-none focus:outline-none placeholder:text-gray-400 max-h-28 py-0.5"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="w-8 h-8 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-200 text-white rounded-lg flex items-center justify-center shrink-0 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2 shrink-0">
              <button type="button" onClick={handleReset} className="border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                처음부터
              </button>
              <button
                type="button"
                onClick={() => { onApply(latestAiText); onClose(); }}
                disabled={!latestAiText}
                className="flex-1 bg-gray-900 hover:bg-gray-700 disabled:bg-gray-200 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                적용
              </button>
            </div>
          </>
        )}
      </div>

      {notionOpen && (
        <NotionImport
          onImport={(text) => { setReference((prev) => prev ? `${prev}\n\n${text}` : text); setNotionOpen(false); }}
          onClose={() => setNotionOpen(false)}
        />
      )}
    </div>
  );
}

function RichTextPreview({ value }: { value: string }) {
  return (
    <div
      className="rich-text-field"
      dangerouslySetInnerHTML={{ __html: normalizeRichTextForEditor(value) }}
    />
  );
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v5H3M21 8h-5V3M3 16h5v5M16 21v-5h5" />
    </svg>
  );
}

function NotionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="15" fill="white"/>
      <path d="M19.5 17.5C22.2 19.5 23.3 19.3 28.5 19L73.5 16.2C74.5 16.2 73.7 17.2 73.2 17.4L65.5 22.7C64 23.7 62 24.9 58.5 25.2L16 28.2C14.3 28.3 13.5 27.5 14.2 26.5L19.5 17.5Z" fill="#1a1a1a"/>
      <path d="M22 33.5V81C22 83.5 23.3 84.3 26.2 84.1L77.5 81.1C80.4 80.9 80.8 79.1 80.8 76.9V30.2C80.8 28 79.8 26.9 77.9 27.1L25 30.3C22.9 30.5 22 31.3 22 33.5Z" fill="#f7f6f3"/>
      <path d="M70.5 35.5L42.5 37.3C40.8 37.4 40.4 38.3 40.4 39.5V71.2C40.4 72.4 40.9 73 42 72.9L70 71.1C71.3 71 71.8 70.2 71.8 69V37C71.8 35.8 71.3 35.4 70.5 35.5Z" fill="#1a1a1a"/>
      <path d="M35 38.5C35 36.8 33.6 35.6 32 35.7L27.5 36C26 36.1 25.5 37.1 25.5 38.2V69.8C25.5 70.9 26.2 71.5 27.5 71.4L31.5 71.1C33 71 35 70 35 68.5V38.5Z" fill="#1a1a1a"/>
    </svg>
  );
}
