#!/usr/bin/env node
/**
 * GuidanceStudio Electron Driver — interactive REPL for headless Linux testing
 *
 * Usage (from project root, inside xvfb-run):
 *   xvfb-run -a node .claude/skills/run-guidance-studio/driver.mjs
 *
 * Commands:
 *   launch                  — launch the app, wait for window
 *   ss [name]               — screenshot to /tmp/shots/<name>.png
 *   click <css-sel>         — DOM click by CSS selector
 *   click-text <text>       — click first button/a/div containing text
 *   fill <css-sel> <value>  — fill React-controlled input
 *   type <text>             — keyboard type text
 *   press <key>             — keyboard press a key (e.g. Enter, Tab)
 *   wait <css-sel>          — waitForSelector (10s timeout)
 *   sleep <ms>              — wait N milliseconds
 *   eval <expr>             — evaluate JS in page and print result
 *   text [css-sel]          — print innerText of selector (or body)
 *   windows                 — list all open windows + webContents IDs
 *   quit                    — close app and exit driver
 */

import { _electron as electron } from 'playwright';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const ELECTRON_BIN = path.join(PROJECT_ROOT, 'node_modules/electron/dist/electron');
const APP_MAIN = path.join(PROJECT_ROOT, 'out/main/main.js');
const SHOTS_DIR = '/tmp/shots';

let app = null;
let win = null;
let shotCounter = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureShotsDir() {
  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

function killStaleInstances() {
  try {
    execSync('pkill -f "electron.*guidance" 2>/dev/null || true', { shell: true });
    // Give processes a moment to die
    execSync('sleep 0.5', { shell: true });
  } catch {
    // ignore
  }
}

async function waitForWindow(electronApp, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const windows = electronApp.windows();
    if (windows.length > 0) {
      // Wait for the window to actually be visible/ready
      const w = windows[0];
      try {
        await w.waitForLoadState('domcontentloaded', { timeout: 5000 });
        return w;
      } catch {
        // not ready yet, keep polling
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Timed out waiting for Electron window');
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdLaunch() {
  if (app) {
    console.log('[driver] App already running. Use "quit" first if you want to restart.');
    return;
  }

  killStaleInstances();

  console.log('[driver] Launching GuidanceStudio...');
  app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: [APP_MAIN, '--no-sandbox', '--disable-gpu'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    timeout: 30000,
  });

  win = await waitForWindow(app);
  console.log('[driver] Window ready.');
}

async function cmdScreenshot(name) {
  if (!win) throw new Error('No window open — run "launch" first');
  ensureShotsDir();
  const label = name || `shot-${String(++shotCounter).padStart(3, '0')}`;
  const outPath = path.join(SHOTS_DIR, `${label}.png`);
  await win.screenshot({ path: outPath, fullPage: false });
  console.log(`[driver] Screenshot saved: ${outPath}`);
}

async function cmdClick(selector) {
  if (!win) throw new Error('No window open — run "launch" first');
  await win.click(selector, { timeout: 10000 });
  console.log(`[driver] Clicked: ${selector}`);
}

async function cmdClickText(text) {
  if (!win) throw new Error('No window open — run "launch" first');
  // Try button, a, then any element with matching text
  const handle = await win.evaluateHandle((searchText) => {
    const candidates = [...document.querySelectorAll('button, a, [role="button"], div[class*="cursor-pointer"]')];
    return candidates.find(el => el.textContent && el.textContent.trim().includes(searchText)) || null;
  }, text);

  if (!handle || handle.asElement() === null) {
    throw new Error(`No clickable element found with text: "${text}"`);
  }
  await handle.asElement().click();
  console.log(`[driver] Clicked element with text: "${text}"`);
}

async function cmdFill(selector, value) {
  if (!win) throw new Error('No window open — run "launch" first');
  // Use native value setter to work with React-controlled inputs
  await win.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Element not found: ${sel}`);
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    nativeInputValueSetter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel: selector, val: value });
  console.log(`[driver] Filled "${selector}" with value`);
}

async function cmdType(text) {
  if (!win) throw new Error('No window open — run "launch" first');
  await win.keyboard.type(text);
  console.log(`[driver] Typed: ${JSON.stringify(text)}`);
}

async function cmdPress(key) {
  if (!win) throw new Error('No window open — run "launch" first');
  await win.keyboard.press(key);
  console.log(`[driver] Pressed: ${key}`);
}

async function cmdWait(selector) {
  if (!win) throw new Error('No window open — run "launch" first');
  await win.waitForSelector(selector, { timeout: 10000 });
  console.log(`[driver] Selector found: ${selector}`);
}

async function cmdSleep(ms) {
  const n = parseInt(ms, 10);
  if (isNaN(n) || n < 0) throw new Error(`Invalid sleep duration: ${ms}`);
  await new Promise(r => setTimeout(r, n));
  console.log(`[driver] Slept ${n}ms`);
}

async function cmdEval(expr) {
  if (!win) throw new Error('No window open — run "launch" first');
  const result = await win.evaluate(expr);
  console.log('[driver] eval result:', JSON.stringify(result, null, 2));
}

async function cmdText(selector) {
  if (!win) throw new Error('No window open — run "launch" first');
  const sel = selector || 'body';
  const text = await win.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? el.innerText : null;
  }, sel);
  if (text === null) {
    console.log(`[driver] No element matched: ${sel}`);
  } else {
    console.log(text);
  }
}

async function cmdWindows() {
  if (!app) {
    console.log('[driver] No app running.');
    return;
  }
  const windows = app.windows();
  console.log(`[driver] Open windows: ${windows.length}`);
  for (let i = 0; i < windows.length; i++) {
    const url = win === windows[i] ? windows[i].url() : '(not current)';
    console.log(`  [${i}] url=${url}`);
  }
}

async function cmdQuit() {
  if (app) {
    await app.close();
    app = null;
    win = null;
    console.log('[driver] App closed.');
  } else {
    console.log('[driver] No app running.');
  }
  process.exit(0);
}

// ── REPL ─────────────────────────────────────────────────────────────────────

async function dispatch(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;

  // Split respecting the first token as command, rest as args
  const spaceIdx = trimmed.indexOf(' ');
  const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

  switch (cmd) {
    case 'launch':
      await cmdLaunch();
      break;

    case 'ss':
      await cmdScreenshot(rest || undefined);
      break;

    case 'click': {
      if (!rest) throw new Error('Usage: click <css-selector>');
      await cmdClick(rest);
      break;
    }

    case 'click-text': {
      if (!rest) throw new Error('Usage: click-text <text>');
      await cmdClickText(rest);
      break;
    }

    case 'fill': {
      // Split on first space to get selector, rest is value
      const fillSpace = rest.indexOf(' ');
      if (fillSpace === -1) throw new Error('Usage: fill <css-selector> <value>');
      const fillSel = rest.slice(0, fillSpace);
      const fillVal = rest.slice(fillSpace + 1);
      await cmdFill(fillSel, fillVal);
      break;
    }

    case 'type': {
      if (!rest) throw new Error('Usage: type <text>');
      await cmdType(rest);
      break;
    }

    case 'press': {
      if (!rest) throw new Error('Usage: press <key>');
      await cmdPress(rest);
      break;
    }

    case 'wait': {
      if (!rest) throw new Error('Usage: wait <css-selector>');
      await cmdWait(rest);
      break;
    }

    case 'sleep': {
      if (!rest) throw new Error('Usage: sleep <ms>');
      await cmdSleep(rest);
      break;
    }

    case 'eval': {
      if (!rest) throw new Error('Usage: eval <js-expression>');
      await cmdEval(rest);
      break;
    }

    case 'text': {
      await cmdText(rest || undefined);
      break;
    }

    case 'windows':
      await cmdWindows();
      break;

    case 'quit':
    case 'exit':
      await cmdQuit();
      break;

    default:
      console.log(`[driver] Unknown command: "${cmd}". Type "quit" to exit.`);
  }
}

async function main() {
  console.log('[driver] GuidanceStudio driver ready. Commands: launch, ss, click, click-text, fill, type, press, wait, sleep, eval, text, windows, quit');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
    prompt: 'gs> ',
  });

  if (process.stdin.isTTY) {
    rl.prompt();
  }

  rl.on('line', async (line) => {
    try {
      await dispatch(line);
    } catch (err) {
      console.error(`[driver] Error: ${err.message}`);
    }
    if (process.stdin.isTTY) {
      rl.prompt();
    }
  });

  rl.on('close', async () => {
    console.log('[driver] stdin closed — quitting.');
    if (app) await app.close().catch(() => {});
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[driver] Fatal:', err);
  process.exit(1);
});
