---
name: run-guidance-studio
description: Build, run, and drive the GuidanceStudio Electron desktop app. Use when asked to start the app, take screenshots, test workflows, or interact with the UI.
---

# run-guidance-studio

Launch, drive, and screenshot the GuidanceStudio Electron desktop app in a headless Linux environment using `driver.mjs` — a Playwright-based REPL.

## Prerequisites

Install apt packages (one-time, needs sudo):

```bash
sudo apt-get install -y \
  libsecret-1-0 dbus-x11 xvfb \
  libnss3 libgbm1 libasound2t64 \
  libgtk-3-0 libxss1 libxkbcommon0 \
  libatk-bridge2.0-0 libcups2 libdrm2
```

## Build

From the project root:

```bash
cd /home/user/guidance-studio
npm install
npm run build
```

The compiled app lands in `out/`. The Electron binary is at `node_modules/electron/dist/electron`.

## Run (agent path — use tmux)

Because the driver is interactive, run it in a tmux pane so you can send commands and read output:

```bash
# 1. Start a dbus session (keytar/libsecret needs it)
eval $(dbus-launch --sh-syntax)

# 2. Launch the driver inside Xvfb (headless display)
xvfb-run -a node .claude/skills/run-guidance-studio/driver.mjs
```

You can pipe commands non-interactively too:

```bash
printf 'launch\nss home\nquit\n' | \
  xvfb-run -a node .claude/skills/run-guidance-studio/driver.mjs
```

Screenshots land in `/tmp/shots/<name>.png`.

## Commands

| Command | Description |
|---|---|
| `launch` | Launch the Electron app; waits for window to be ready |
| `ss [name]` | Screenshot to `/tmp/shots/<name>.png` (auto-names if omitted) |
| `click <css-sel>` | DOM click by CSS selector |
| `click-text <text>` | Click first button/link/div whose text contains `<text>` |
| `fill <css-sel> <value>` | Fill a React-controlled input using native value setter + input event |
| `type <text>` | Keyboard-type text into the focused element |
| `press <key>` | Keyboard press (e.g. `Enter`, `Tab`, `Escape`) |
| `wait <css-sel>` | Wait up to 10 s for a selector to appear |
| `sleep <ms>` | Pause for N milliseconds |
| `eval <expr>` | Evaluate JS in the page; prints JSON result |
| `text [css-sel]` | Print innerText of selector (defaults to `body`) |
| `windows` | List all open Electron windows |
| `quit` | Close the app and exit the driver |

## Gotchas

**Single-instance lock** — `app.requestSingleInstanceLock()` in `main.ts` prevents a second Electron instance from starting. Kill stale processes before launching:
```bash
pkill -f 'electron.*guidance' || true
```
The driver does this automatically on `launch`, but if the driver itself crashes, clean up manually.

**`--no-sandbox --disable-gpu`** — Required when running in a container/CI. The driver passes these automatically.

**Window is hidden until `ready-to-show`** — `main.ts` uses `show: false` and emits `ready-to-show` to show the window. The driver polls `app.windows()` rather than calling `firstWindow()` (which would timeout) and waits for `domcontentloaded`.

**keytar / libsecret** — Needs both the `libsecret-1-0` package AND a running dbus session. Always `eval $(dbus-launch --sh-syntax)` before `xvfb-run`.

**Run cards are `div.cursor-pointer`** — The home page run list uses `<div class="... cursor-pointer ...">` not `<a>` tags. Use `div.cursor-pointer` or `click-text` to navigate to a run.

**Two "Generate Docs" buttons** — One in the run detail header (disabled when no steps), one in the DocEditor toolbar. Target the toolbar one when steps exist.

**Assisted mode button** — On the New Run form, mode switching uses `<button type="button">`. Find the Assisted mode button by text: `click-text Human-guided recording`.

**React inputs need native setter** — Plain `element.value = x` does not trigger React's synthetic events. The `fill` command uses `HTMLInputElement.prototype` value setter + dispatches `input`/`change` events.

**DBUS_SESSION_BUS_ADDRESS** — Must be exported into the environment before `xvfb-run`. The `eval $(dbus-launch --sh-syntax)` one-liner handles this in the same shell session.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `App already running` on launch | Run `pkill -f 'electron.*guidance'` then retry |
| `libsecret` / keychain errors | Make sure dbus is running: `echo $DBUS_SESSION_BUS_ADDRESS` should be non-empty |
| Black/blank screenshot | Xvfb not running, or GPU issue — ensure `--disable-gpu` and `xvfb-run -a` |
| `No element matched` | Use `eval document.body.innerHTML` to inspect the current DOM |
| Build errors | Run `npm install && npm run build` from project root; check `out/` exists |
| Timeout waiting for window | Check `out/main/main.js` exists; the build may not have run |
