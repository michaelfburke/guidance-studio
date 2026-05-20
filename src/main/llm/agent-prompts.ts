export const SYSTEM_PROMPT = `You are GuidanceStudio, an expert technical writer and UX analyst.
You help teams create clear, actionable documentation for software products.
Your documentation is structured, precise, and written from the user's perspective.
Always use active voice and clear, concise language.`

export function buildAgentPlanningPrompt(url: string, goal: string): string {
  return `You are simulating an AI agent that navigated to ${url} and explored the feature: "${goal}".

Generate a realistic sequence of 6-10 steps that an agent would discover while exploring this feature.
Each step should represent a meaningful user action or screen state.

Return ONLY valid JSON with this exact structure:
{
  "productName": "...",
  "steps": [
    {
      "index": 0,
      "title": "...",
      "description": "...",
      "action": "nav|click|type|observe|screenshot"
    }
  ]
}

Make the steps realistic and specific to the product/feature. Include navigation, form interactions, and key UI elements.`
}

export function buildDocGenerationPrompt(
  productName: string,
  feature: string,
  goal: string,
  steps: Array<{ index: number; title: string; description: string }>,
  toneGuide?: string,
  linkedDocs?: string
): string {
  const stepsText = steps
    .map(s => `Step ${s.index + 1}: ${s.title}\n${s.description}`)
    .join('\n\n')

  const toneSection = toneGuide
    ? `\n\nTone and style guide:\n${toneGuide}`
    : ''

  const linkedDocsSection = linkedDocs
    ? `\n\nRelated documentation to reference:\n${linkedDocs}`
    : ''

  return `Create comprehensive user documentation for the following feature.

Product: ${productName}
Feature: ${feature}
Goal: ${goal}
${toneSection}
${linkedDocsSection}

Steps captured:
${stepsText}

Generate polished markdown documentation that:
1. Has a clear title and introduction
2. Lists prerequisites if any
3. Walks through each step with clear instructions
4. Uses proper markdown formatting (headers, bold, code blocks where appropriate)
5. Includes a summary or next steps section
6. Is written for end users, not developers

Return ONLY the markdown content, no preamble or explanation.`
}

export function buildStepEnrichmentPrompt(
  stepTitle: string,
  stepDescription: string,
  productName: string
): string {
  return `Enrich this documentation step for ${productName}:

Title: ${stepTitle}
Description: ${stepDescription}

Expand this into a more detailed, helpful description (2-3 sentences).
Include what the user should see and any important details.
Return only the enriched description text, nothing else.`
}
