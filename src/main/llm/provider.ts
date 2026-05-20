export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMCallOptions {
  prompt: string
  images?: Buffer[]
  maxTokens?: number
  systemPrompt?: string
}

export interface LLMProvider {
  name: string
  call(options: LLMCallOptions): Promise<string>
}
