import { existsSync } from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';
import { config } from '../config.js';

const NAV_TIMEOUT_MS = 15_000;
const RENDER_SETTLE_MS = 700;
const VIEWPORT = { width: 1280, height: 800 };

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Common local install locations, checked only outside serverless (CHROME_PATH always wins).
const LOCAL_CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function findLocalChrome(): string | undefined {
  if (config.chromePath) return config.chromePath;
  return LOCAL_CHROME_CANDIDATES.find((p) => existsSync(p));
}

let browserPromise: Promise<Browser> | undefined;

async function launchBrowser(): Promise<Browser> {
  if (isServerless) {
    const { default: chromium } = await import('@sparticuz/chromium');
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const executablePath = findLocalChrome();
  if (!executablePath) {
    throw new Error(
      'No local Chrome/Edge found for screenshot capture. Set CHROME_PATH in .env to a Chrome/Chromium/Edge executable.',
    );
  }
  return puppeteer.launch({ executablePath, headless: true });
}

/** One shared browser per warm process; relaunches if it has crashed or disconnected. */
async function getBrowser(): Promise<Browser> {
  browserPromise ??= launchBrowser().catch((err) => {
    browserPromise = undefined;
    throw err;
  });
  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = undefined;
    return getBrowser();
  }
  return browser;
}

/** Navigates directly to `url` and captures a real screenshot — bypasses X-Frame-Options/CSP entirely since nothing is embedded. */
export async function captureScreenshot(url: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport(VIEWPORT);
    await page.setUserAgent(config.userAgent);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await new Promise((r) => setTimeout(r, RENDER_SETTLE_MS));
    return (await page.screenshot({ type: 'png' })) as Buffer;
  } finally {
    await page.close();
  }
}
