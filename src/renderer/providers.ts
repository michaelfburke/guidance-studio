export type ProviderId = 'claude' | 'gemini' | 'openai' | 'openrouter' | 'copilot'

export interface ProviderMeta {
  id: ProviderId
  /** Short label for badges. */
  label: string
  /** Secondary descriptor shown next to the label. */
  vendor: string
  badgeClass: string
  /** Tailwind classes for the selected-card border + background tint. */
  accentBorder: string
  /** Tailwind text-color class for the selected-card accent. */
  accentText: string
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'claude',
    label: 'Claude',
    vendor: 'by Anthropic',
    badgeClass: 'badge-claude',
    accentBorder: 'border-orange-600/70 bg-orange-900/10',
    accentText: 'text-orange-400'
  },
  {
    id: 'gemini',
    label: 'Gemini',
    vendor: 'by Google',
    badgeClass: 'badge-gemini',
    accentBorder: 'border-blue-600/70 bg-blue-900/10',
    accentText: 'text-blue-400'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    vendor: 'OpenAI-compatible',
    badgeClass: 'badge-openai',
    accentBorder: 'border-teal-600/70 bg-teal-900/10',
    accentText: 'text-teal-400'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    vendor: 'multi-model',
    badgeClass: 'badge-openrouter',
    accentBorder: 'border-violet-600/70 bg-violet-900/10',
    accentText: 'text-violet-400'
  },
  {
    id: 'copilot',
    label: 'Copilot',
    vendor: 'by GitHub',
    badgeClass: 'badge-copilot',
    accentBorder: 'border-sky-600/70 bg-sky-900/10',
    accentText: 'text-sky-400'
  }
]

export function providerMeta(id: string): ProviderMeta {
  return PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0]
}
