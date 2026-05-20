import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

export interface ElementInfo {
  index: number
  tag: string
  type: string
  text: string
}

export interface PageSnapshot {
  screenshot: Buffer
  url: string
  title: string
  elements: ElementInfo[]
}

/**
 * In-page script (runs in the browser context, so it is kept as a string to
 * avoid pulling DOM types into the main-process tsconfig). It tags every
 * visible, interactive element with a `data-gs-idx` attribute and returns a
 * compact description the LLM can reference by index.
 */
const COLLECT_SCRIPT = `(() => {
  var SEL = [
    'a[href]', 'button', 'input', 'textarea', 'select',
    '[role="button"]', '[role="link"]', '[role="tab"]',
    '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]',
    '[contenteditable="true"]', '[onclick]'
  ].join(',');
  document.querySelectorAll('[data-gs-idx]').forEach(function (el) {
    el.removeAttribute('data-gs-idx');
  });
  var nodes = Array.prototype.slice.call(document.querySelectorAll(SEL));
  var out = [];
  var i = 0;
  for (var n = 0; n < nodes.length; n++) {
    var el = nodes[n];
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    if (r.right < 0 || r.left > window.innerWidth) continue;
    var st = window.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) continue;
    if (el.disabled) continue;
    var raw = el.getAttribute('aria-label') || el.innerText || el.value ||
      el.getAttribute('placeholder') || el.getAttribute('title') ||
      el.getAttribute('name') || '';
    var label = String(raw).replace(/\\s+/g, ' ').trim();
    if (label.length > 120) label = label.slice(0, 120) + '...';
    el.setAttribute('data-gs-idx', String(i));
    out.push({
      index: i,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || el.getAttribute('role') || '',
      text: label
    });
    i++;
  }
  return out;
})()`

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/** Drives a real Chromium browser via Playwright for an agent run. */
export class BrowserAgent {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: false, slowMo: 150 })
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 }
    })
    this.page = await this.context.newPage()
  }

  private requirePage(): Page {
    if (!this.page) throw new Error('Browser not launched')
    return this.page
  }

  async goto(url: string): Promise<void> {
    const page = this.requirePage()
    await page.goto(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(1200)
  }

  async snapshot(): Promise<PageSnapshot> {
    const page = this.requirePage()
    const elements = (await page.evaluate(COLLECT_SCRIPT)) as ElementInfo[]
    const screenshot = await page.screenshot({ type: 'png' })
    let title = ''
    try {
      title = await page.title()
    } catch {
      title = ''
    }
    return { screenshot, url: page.url(), title, elements }
  }

  async click(index: number): Promise<void> {
    const locator = this.requirePage().locator(`[data-gs-idx="${index}"]`)
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
    await locator.click({ timeout: 10000 })
    await this.settle()
  }

  async type(index: number, text: string): Promise<void> {
    const locator = this.requirePage().locator(`[data-gs-idx="${index}"]`)
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
    await locator.fill(text, { timeout: 10000 })
    await this.settle()
  }

  async scroll(): Promise<void> {
    const page = this.requirePage()
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(600)
  }

  /** Waits for the page to settle after an action that may trigger navigation. */
  private async settle(): Promise<void> {
    const page = this.requirePage()
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(900)
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {})
    await this.browser?.close().catch(() => {})
    this.browser = null
    this.context = null
    this.page = null
  }
}
