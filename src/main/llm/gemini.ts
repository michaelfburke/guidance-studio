import { GoogleGenerativeAI, Part } from '@google/generative-ai'
import type { LLMProvider, LLMCallOptions } from './provider'
import { imageMimeType } from '../asset-manager'

const DEFAULT_MODEL = 'gemini-2.5-flash'

export class GeminiProvider implements LLMProvider {
  name = 'gemini'
  private client: GoogleGenerativeAI
  private model: string

  constructor(apiKey: string, model = DEFAULT_MODEL) {
    this.client = new GoogleGenerativeAI(apiKey)
    this.model = model
  }

  async call(options: LLMCallOptions): Promise<string> {
    const { prompt, images, maxTokens = 4096, systemPrompt } = options

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt
    })

    const parts: Part[] = []

    if (images && images.length > 0) {
      for (const img of images) {
        parts.push({
          inlineData: {
            mimeType: imageMimeType(img),
            data: img.toString('base64')
          }
        })
      }
    }

    parts.push({ text: prompt })

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: maxTokens
      }
    })

    const response = await result.response
    return response.text()
  }
}
