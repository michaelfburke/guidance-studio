# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GuidanceStudio is an AI-powered documentation generation tool—a cross-platform Electron desktop application that automatically creates step-by-step user guides. It operates in two modes:

- **Agent mode**: An autonomous browser agent navigates a web app, captures screenshots, and drafts documentation
- **Assisted mode**: Manual navigation where users capture key steps and AI writes descriptions

The app is built with Electron, React, TypeScript, and supports three LLM providers (Claude, Gemini, OpenAI-compatible).

## Tech Stack

**Framework & Build:**
- Electron 31 + electron-vite for main/renderer/preload bundling
- React 18 + React Router v6 for the UI
- TypeScript 5.4 (strict mode)
- Vite 5.3 for dev server and bundling
- Playwright for browser automation (Chromium)

**Styling & UI:**
- Tailwind CSS 3.4 + PostCSS
- Custom brand color palette defined in tailwind.config.js

**Storage & Security:**
- keytar (native OS keychain) for secure credential storage
- electron-store for settings persistence
- File-based JSON storage for run metadata/steps in ~/GuidanceStudio/runs/
- Custom `gsasset://` protocol for serving local screenshot files with content isolation

**LLM Integration:**
- @anthropic-ai/sdk for Claude (default: claude-sonnet-4-6)
- @google/generative-ai for Gemini (default: gemini-2.5-flash)
- Generic OpenAI-compatible client for local endpoints (e.g., GitHub Copilot proxy, Ollama)
- Base64 image encoding for all providers
- Image compression to JPEG before sending to LLMs (max 1000px width, 55% quality)

**Distribution:**
- electron-builder for packaging (NSIS/Windows, DMG/macOS, AppImage/Linux)
- GitHub Actions for automated releases on git tags

## Architecture

### Directory Structure

```
src/
├── main/               # Electron main process (IPC, orchestration, LLM calls)
│   ├── main.ts         # App initialization, window setup, protocol handlers
│   ├── ipc-handlers.ts # IPC endpoints exposed to renderer
│   ├── agent-orchestrator.ts  # Agent loop & state management
│   ├── browser/
│   │   └── browser-agent.ts   # Playwright-based browser control
│   ├── llm/
│   │   ├── provider.ts        # LLM interface
│   │   ├── claude.ts          # Claude implementation
│   │   ├── gemini.ts          # Gemini implementation
│   │   ├── openai.ts          # OpenAI-compatible implementation
│   │   ├── retry.ts           # Exponential backoff wrapper
│   │   └── agent-prompts.ts   # System prompts & action schema
│   ├── storage.ts      # Run metadata/steps/events persistence
│   ├── asset-manager.ts # Screenshot & recording management
│   ├── credentials.ts  # Login credential handling (keychain)
│   └── preload.ts      # (legacy, see preload/preload.ts)
├── preload/            # Context bridge & IPC renderer
│   └── preload.ts      # Exposes electronAPI to renderer (contextIsolation mode)
└── renderer/           # React UI
    ├── App.tsx         # Router setup
    ├── main.tsx        # ReactDOM mount
    ├── types.ts        # Shared TypeScript interfaces
    ├── providers.ts    # LLM provider metadata
    ├── pages/
    │   ├── HomePage.tsx         # Run list & filtering
    │   ├── NewRunPage.tsx        # Create new run (agent or assisted)
    │   ├── RunDetailPage.tsx     # View/edit run, view activity log
    │   └── SettingsPage.tsx      # API keys, credentials, preferences
    └── components/
        ├── Layout.tsx            # Navigation sidebar
        ├── RunCard.tsx           # Run list item
        ├── StepCard.tsx          # Step display with screenshot
        ├── ActivityLog.tsx        # Real-time agent event feed
        ├── DocEditor.tsx         # Markdown editor for final output
        ├── ScreenRecorder.tsx    # WebRTC recording (assisted mode)
        └── StepCaptureModal.tsx  # Screenshot annotation UI
```

### Main Data Flows

**Agent Mode:**
1. User creates a run (URL, product name, feature, goal)
2. `runAgent()` in agent-orchestrator launches Playwright browser
3. Loop (max 16 steps):
   - BrowserAgent captures page screenshot & interactive element list
   - Images & context sent to LLM with AGENT_SYSTEM_PROMPT
   - LLM returns JSON action (click/type/navigate/scroll/done)
   - Action executed; events emitted to renderer in real-time via IPC
   - Step recorded with title, description, screenshot
4. On completion, LLM generates full markdown documentation
5. All data (meta.json, steps.json, events.json, output.md, screenshots) saved to disk

**Assisted Mode:**
1. User navigates manually, captures screenshots with StepCaptureModal
2. Annotations stored locally
3. On generation, steps sent to LLM with SYSTEM_PROMPT to write descriptions
4. Markdown generated and saved

**IPC Bridge:**
- Preload process exposes `window.electronAPI` (contextIsolation: true, sandbox: false)
- Renderer calls methods; main process handles via ipcMain.handle()
- Events streamed back to renderer via ipcRenderer.send() (agent:event, agent:step)
- No direct file access from renderer; all I/O goes through main process

### Key Patterns & Conventions

**LLM Provider Pattern:**
All LLM classes (ClaudeProvider, GeminiProvider, OpenAIProvider) implement the `LLMProvider` interface:
```typescript
call(options: LLMCallOptions): Promise<string>
```
Images are always passed as Buffers; providers handle base64 encoding. System prompts are optional per-call. RetryingProvider wraps any provider with exponential backoff (1s, 2s, 4s, 8s).

**Agent Action Schema:**
LLM responds with JSON strictly matching:
```json
{
  "title": "step title for docs",
  "description": "user-facing description",
  "action": "click|type|navigate|scroll|done",
  "index": <element index from page snapshot>,
  "value": "<text to type or URL for navigate>"
}
```
LLM never sees actual credential values—placeholders like `{{username}}` are substituted server-side.

**Settings & Credentials:**
- Settings: JSON file in app userData (not encrypted; excludes API keys)
- API keys: Stored in OS keychain under service "guidance-studio"
- Credentials (site logins): Keyed by normalized domain in keychain as "cred:<domain>" with username+password JSON value
- Domain normalization removes scheme, www, and trailing paths

**Screenshot Asset Management:**
- Raw PNGs saved to disk in `~/GuidanceStudio/runs/{runId}/step-000.png` etc.
- Thumbnails generated for UI preview
- Before sending to LLM, images compressed via nativeImage to JPEG (1000px max width, 55% quality)
- In markdown, screenshots embedded via custom `gsasset://` URLs, which resolve through Electron's protocol handler to local files

**Element Indexing:**
BrowserAgent injects `COLLECT_SCRIPT` which:
1. Tags interactive elements (buttons, links, inputs, etc.) with `data-gs-idx` attribute
2. Filters by visibility and size (>4px), opacity, disabled state
3. Returns compact list of visible indices; LLM references actions by index only
4. Prevents DOM interaction; purely observational

## Build & Run Commands

**Development:**
```bash
npm install                    # Install dependencies
npm run dev                    # Start electron-vite dev server with hot reload & DevTools
```

**Production Build:**
```bash
npm run build                  # Compile TypeScript (main, preload, renderer) via electron-vite
npm run dist                   # Package for all platforms via electron-builder → release/
npm run pack                   # Quick package (no signing/notarization)
npm run preview               # Preview the built app without packaging
```

**Platform-specific output:**
- Windows: `release/GuidanceStudio-{version}-Setup.exe` (NSIS installer)
- macOS: `release/GuidanceStudio-{version}.dmg` (unsigned; requires manual allow in Gatekeeper)
- Linux: `release/GuidanceStudio-{version}.AppImage`

## Testing & Verification

Currently no automated test suite. Manual verification should cover:
- Agent mode: Navigate a public web app (e.g., a demo site), verify screenshots are captured and steps recorded correctly
- Assisted mode: Manually capture steps, verify annotation and markdown generation
- LLM provider switching: Test each provider (Claude, Gemini, OpenAI) with API key configuration
- Credential storage: Save and retrieve login credentials; verify placeholder substitution in agent navigation
- Cross-platform: Build and test on Windows, macOS, Linux if making platform-specific changes

## Configuration Files

**tsconfig.json** — Meta config referencing tsconfig.node.json (main) and tsconfig.web.json (renderer)

**tsconfig.node.json** — Main process compilation (target: ESNext, module: ESNext, rootDir: src/main)

**tsconfig.web.json** — Renderer compilation (jsx: react-jsx, lib: ESNext + DOM)

**electron.vite.config.ts** — Entry points for main, preload, and renderer; path alias `@renderer` → src/renderer

**tailwind.config.js** — Custom brand color palette (brand-50 to brand-900 sky-blue scale); dark mode enabled

**electron-builder.yml** — Packaging config; publish provider is GitHub with automatic release on tags

**index.html** — Single entry point; includes CSP allowing Anthropic/Google API calls

**.gitignore** — Excludes node_modules, build outputs (out/, dist/, dist-electron/, release/), .DS_Store, *.local

## Important Details

- **Dark Mode Only**: nativeTheme.themeSource = 'dark'; UI assumes dark background (#0f172a)
- **No Test Framework**: Validation happens manually or via user feedback
- **Memory Management**: Agent state per run stored in Map (activeAgents, runEventLogs); survives reloads until cleaned
- **Image Optimization**: Large screenshots are critical to LLM performance; JPEG compression (1000px, 55% quality) balances fidelity and request size
- **Secure Context**: API keys never logged or sent to renderer; only presence flags (claudeApiKeySet, etc.) exposed to UI
- **Cross-platform Keychain**: keytar abstracts Windows Credential Manager, macOS Keychain, and libsecret (Linux)

## Release Process

Releases are triggered by pushing a git tag (e.g., `git tag v1.0.0 && git push origin v1.0.0`). GitHub Actions:
1. Checks out code
2. Installs dependencies
3. Runs `npm run build`
4. Runs `electron-builder --publish always` (creates installers and auto-publishes to GitHub Releases)
5. All three platforms (Windows, macOS, Linux) build in parallel

Releases appear at https://github.com/michaelfburke/guidance-studio/releases/

