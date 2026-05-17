'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export const useAIStore = create<AIStore>()(
  persist(
    (set) => ({
      rules: `- 한국어로 작성할 것
- 전문적이고 신뢰감 있는 어조 유지
- 과장된 표현 지양
- 문단을 나눠 잘 읽힐 수 있도록 구성
- 성과는 반드시 수치로 표현 (예: "응답 속도 40% 개선", "월 방문자 1만 명 달성")
- 수치화 방법이나 기준도 함께 기재 (예: "A/B 테스트 기준", "Google Analytics 측정값")
- "최첨단", "혁신적인", "최신" 등 도구나 기술을 꾸미는 불필요한 수식어 사용 금지`,
      geminiKey: '',
      geminiModel: 'gemini-2.5-flash',
      notionPageUrl: '',
      autoSave: true,
      setRules: (rules) => set({ rules }),
      setGeminiKey: (geminiKey) => set({ geminiKey }),
      setGeminiModel: (geminiModel) => set({ geminiModel }),
      setNotionPageUrl: (notionPageUrl) => set({ notionPageUrl }),
      setAutoSave: (autoSave) => set({ autoSave }),
    }),
    { name: 'ai-settings' }
  )
);
