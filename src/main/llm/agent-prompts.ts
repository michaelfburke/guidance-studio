export const SYSTEM_PROMPT = `You are GuidanceStudio, an expert technical writer and UX analyst.
You help teams create clear, actionable documentation for software products.
Your documentation is structured, precise, and written from the user's perspective.
Always use active voice and clear, concise language.`

export const AGENT_SYSTEM_PROMPT = `You are GuidanceStudio's autonomous web navigation agent.
You operate a real web browser to explore software features and produce accurate,
step-by-step user documentation. You only reference interactive elements that
actually exist on the page you are shown. You are careful and methodical, and you
stop as soon as the goal is achieved or you are genuinely blocked.
You always respond with a single valid JSON object and nothing else.`

export interface AgentActionContext {
  productName: string
  feature: string
  goal: string
  url: string
  pageTitle: string
  stepNumber: number
  maxSteps: number
  elements: Array<{ index: number; tag: string; type: string; text: string }>
  history: string[]
  /** True when stored login credentials are available for this site. */
  hasCredentials: boolean
}

export function buildAgentActionPrompt(ctx: AgentActionContext): string {
  const elementList = ctx.elements.length > 0
    ? ctx.elements
        .map(e => `  [${e.index}] <${e.tag}${e.type ? ` ${e.type}` : ''}> ${e.text || '(no label)'}`)
        .join('\n')
    : '  (no interactive elements detected on the visible area — try scrolling)'

  const historyText = ctx.history.length > 0
    ? ctx.history.map((h, i) => `  ${i + 1}. ${h}`).join('\n')
    : '  (none yet)'

  const credentialsSection = ctx.hasCredentials
    ? `

Login credentials for this site are available. If you reach a sign-in form, log
in instead of stopping: emit a "type" action with the literal value "{{username}}"
for the username or email field, then "type" "{{password}}" into the password
field, then "click" the submit button. The real values are substituted locally
before typing — you only ever see these placeholders, never the actual secrets.`
    : ''

  const doneGuidance = ctx.hasCredentials
    ? `Use "done" when the goal is complete, or when you are genuinely blocked
  (for example login failed, or a step needs data you were not given).`
    : `Use "done" when the goal is complete, OR when the next step requires
  credentials or account data you do not have.`

  return `You are documenting how to use a feature of a real web app by driving a real browser.

Product: ${ctx.productName}
Feature being documented: ${ctx.feature}
Goal: ${ctx.goal}

Current page: "${ctx.pageTitle}"
URL: ${ctx.url}
This is step ${ctx.stepNumber} of at most ${ctx.maxSteps}.

A screenshot of the current page is attached. The interactive elements currently
visible on the page are (reference them by their index):
${elementList}

Steps already recorded:
${historyText}
${credentialsSection}

Decide the SINGLE next action that makes meaningful progress toward the goal.
Respond with ONLY a JSON object, no markdown fences and no commentary:
{
  "title": "short imperative title for this documentation step",
  "description": "1-2 sentences, written for an end user, describing what they do here and what they see on screen",
  "action": "click" | "type" | "navigate" | "scroll" | "done",
  "index": <number — required for click and type; must be an index from the list above>,
  "value": "<text to type, or absolute URL for navigate — omit for click, scroll and done>"
}

Guidance:
- Use "click" or "type" only with an index that appears in the element list above.
- Use "scroll" if the element you need is not visible yet.
- Use "navigate" only when you must jump directly to a specific URL.
- ${doneGuidance} Describe the end state in the description.
- The "description" becomes published documentation — make it clear, specific, and
  grounded in what is actually visible in the screenshot.`
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
5. After the instructions for each numbered step, place the token [[screenshot:N]]
   on its own line, where N is that step's number (Step 1 -> [[screenshot:1]]).
   These tokens are automatically replaced with the captured screenshot, so do
   not write your own image markdown.
6. Includes a summary or next steps section
7. Is written for end users, not developers

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
