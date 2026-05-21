# GuidanceStudio

AI-powered documentation generation for your product. Point GuidanceStudio at any web app, describe what you want to document, and get step-by-step guides — automatically.

## Download

Go to the [Releases page](https://github.com/michaelfburke/guidance-studio/releases/latest) and grab the installer for your platform:

| Platform | File |
|---|---|
| Windows | `guidance-studio-*-Setup.exe` |
| macOS | `guidance-studio-*.dmg` |
| Linux | `guidance-studio-*.AppImage` |

> **Note on security warnings**: The app is currently unsigned. On macOS, right-click the app and choose Open to bypass Gatekeeper. On Windows, click "More info → Run anyway" on the SmartScreen prompt.

## How it works

GuidanceStudio has two modes:

**Agent** — Give it a URL, a feature name, and a goal. An AI agent navigates the product automatically, captures screenshots at each step, and drafts the documentation for you.

**Assisted** — You drive. Navigate through a feature yourself, capturing screenshots at key moments. The AI writes the step descriptions from what it sees.

Either way, the output is an editable, step-by-step guide with annotated screenshots stored locally on your machine.

## Getting started

1. Download and install the app for your platform
2. Open **Settings** and add an API key for your chosen LLM provider
3. Click **New Run**, pick a mode, and fill in the details
4. Click **Start** — Agent runs are fully automatic; Assisted runs follow your navigation

### LLM providers

GuidanceStudio supports five providers. OpenRouter and GitHub Copilot use OAuth — no API key to copy.

| Provider | Setup |
|---|---|
| **Claude** (Anthropic) | Paste an API key from [console.anthropic.com](https://console.anthropic.com) |
| **Gemini** (Google) | Paste an API key from [aistudio.google.com](https://aistudio.google.com) |
| **OpenRouter** | Click **Connect with OpenRouter** — a browser window opens, you authorise, done. Your existing OpenRouter credits are used. Access Claude, GPT, Gemini, and open-source models from one balance. |
| **GitHub Copilot** | Click **Connect with GitHub** — a short code appears in the app. Visit the displayed URL on github.com, enter the code, and authorise. Your Copilot subscription is used directly; no proxy required. |
| **OpenAI-compatible** | Set a custom base URL (e.g. a local Ollama instance). API key is optional. |

All credentials are stored securely in your OS keychain (macOS Keychain, Windows Credential Manager, or libsecret on Linux) and never written to disk.

> **GitHub Copilot note:** This feature requires the app to be built with a registered GitHub OAuth App client ID (`GITHUB_COPILOT_CLIENT_ID`). If you are building from source, [register an OAuth App](https://github.com/settings/developers) and set that environment variable before building.

### Login credentials for Agent mode

If the product you want to document requires a login, add credentials in **Settings → Saved Logins**. The agent will sign in automatically when it reaches that domain.

## Development

**Requirements**: Node.js 20+, npm

```bash
git clone https://github.com/michaelfburke/guidance-studio.git
cd guidance-studio
npm install
npm run dev
```

**Build a distributable:**

```bash
npm run build   # compile TypeScript via electron-vite
npm run dist    # package with electron-builder → release/
```

The packaged installer lands in `release/`.

### Project layout

```
src/
├── main/
│   ├── auth/      # OAuth helpers (OpenRouter PKCE, GitHub Device Flow)
│   ├── llm/       # LLM provider implementations and retry logic
│   └── ...        # IPC handlers, storage, browser automation
├── preload/       # Context bridge between main and renderer
└── renderer/      # React UI (pages, components)
```

## License

MIT
