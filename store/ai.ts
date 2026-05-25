'use client';

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

const SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getCookieStorage(): StateStorage {
  return {
    getItem: (name) => {
      if (typeof document === 'undefined') return null;

      const prefix = `${encodeURIComponent(name)}=`;
      const cookie = document.cookie
        .split('; ')
        .find((item) => item.startsWith(prefix));

      if (cookie) return decodeURIComponent(cookie.slice(prefix.length));

      return window.localStorage.getItem(name);
    },
    setItem: (name, value) => {
      if (typeof document === 'undefined') return;

      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
        value
      )}; Max-Age=${SETTINGS_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
      window.localStorage.removeItem(name);
    },
    removeItem: (name) => {
      if (typeof document === 'undefined') return;

      document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax`;
      window.localStorage.removeItem(name);
    },
  };
}

interface AIStore {
  rules: string;
  geminiKey: string;
  geminiModel: string;
  notionPageUrl: string;
  autoSave: boolean;
  setRules: (rules: string) => void;
  setGeminiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  setNotionPageUrl: (url: string) => void;
  setAutoSave: (v: boolean) => void;
}

interface PersistedAIStore {
  rules: string;
  geminiKey: string;
  geminiModel: string;
  notionPageUrl: string;
  autoSave: boolean;
}

export const useAIStore = create<AIStore>()(
  persist<AIStore, [], [], PersistedAIStore>(
    (set) => ({
      rules: `- 한국어로 작성할 것
- 전문적이고 신뢰감 있는 어조 유지
- 과장된 표현 지양
- 문단을 나눠 잘 읽힐 수 있도록 구성
- 성과는 반드시 수치로 표현 (예: "응답 속도 40% 개선", "월 방문자 1만 명 달성")
- 수치화 방법이나 기준도 함께 기재 (예: "A/B 테스트 기준", "Google Analytics 측정값")
- "최첨단", "혁신적인", "최신" 등 도구나 기술을 꾸미는 불필요한 수식어 사용 금지`,
      geminiKey: '',
      geminiModel: 'gemma-4-31b-it',
      notionPageUrl: '',
      autoSave: true,
      setRules: (rules) => set({ rules }),
      setGeminiKey: (geminiKey) => set({ geminiKey }),
      setGeminiModel: (geminiModel) => set({ geminiModel }),
      setNotionPageUrl: (notionPageUrl) => set({ notionPageUrl }),
      setAutoSave: (autoSave) => set({ autoSave }),
    }),
    {
      name: 'ai-settings',
      storage: createJSONStorage(() => getCookieStorage()),
      partialize: (state) => ({
        rules: state.rules,
        geminiKey: state.geminiKey,
        geminiModel: state.geminiModel,
        notionPageUrl: state.notionPageUrl,
        autoSave: state.autoSave,
      }),
    }
  )
);
