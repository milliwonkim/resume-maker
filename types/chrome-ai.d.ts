// Chrome Built-in AI (Prompt API) type declarations
// https://developer.chrome.com/docs/ai/built-in

interface AILanguageModelCapabilities {
  available: 'readily' | 'after-download' | 'no';
  defaultTemperature: number;
  defaultTopK: number;
  maxTopK: number;
}

interface AILanguageModelCreateOptions {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
}

interface AILanguageModelSession {
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): ReadableStream<string>;
  destroy(): void;
}

interface AILanguageModel {
  capabilities(): Promise<AILanguageModelCapabilities>;
  create(options?: AILanguageModelCreateOptions): Promise<AILanguageModelSession>;
}

interface WindowAI {
  languageModel: AILanguageModel;
}

interface Window {
  ai?: WindowAI;
}
