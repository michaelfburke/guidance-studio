import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, LLMCallOptions } from './provider'

export class ClaudeProvider implements LLMProvider {
  name = 'claude'
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async call(options: LLMCallOptions): Promise<string> {
    const { prompt, images, maxTokens = 4096, systemPrompt } = options

    const userContent: Anthropic.MessageParam['content'] = []

    if (images && images.length > 0) {
      for (const img of images) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: img.toString('base64')
          }
        })
      }
    }

    userContent.push({
      type: 'text',
      text: prompt
    })

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userContent
        }
      ]
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    return textBlock.text
  }
}
