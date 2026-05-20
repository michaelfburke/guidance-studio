import { GoogleGenerativeAI, Part } from '@google/generative-ai'
import type { LLMProvider, LLMCallOptions } from './provider'
import { imageMimeType } from '../asset-manager'

export class GeminiProvider implements LLMProvider {
  name = 'gemini'
  private client: GoogleGenerativeAI

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async call(options: LLMCallOptions): Promise<string> {
    const { prompt, images, maxTokens = 4096, systemPrompt } = options

    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash',
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
