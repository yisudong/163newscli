import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';

const CONFIG_DIR = path.join(os.homedir(), '.163newscli');
const COOKIE_FILE = path.join(CONFIG_DIR, 'cookies.json');

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
}

export interface AuthState {
  cookies: StoredCookie[];
  nickname?: string;
  savedAt: number;
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadAuth(): AuthState | null {
  try {
    if (!fs.existsSync(COOKIE_FILE)) return null;
    const raw = fs.readFileSync(COOKIE_FILE, 'utf-8');
    const state: AuthState = JSON.parse(raw);
    if (!state.cookies?.length) return null;
    return state;
  } catch {
    return null;
  }
}

export function saveAuth(state: AuthState) {
  ensureConfigDir();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export function clearAuth() {
  try {
    if (fs.existsSync(COOKIE_FILE)) fs.unlinkSync(COOKIE_FILE);
  } catch { }
}

export function getCookieHeader(auth: AuthState | null): string {
  if (!auth?.cookies?.length) return '';
  return auth.cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

export function isLoggedIn(auth: AuthState | null): boolean {
  return !!(auth?.cookies?.length);
}

const LOGIN_URL = 'https://news.163.com/';
const PASSPORT_DOMAINS = ['.163.com', '.126.com', '.yeah.net'];
const KEY_COOKIES = ['NTES_SESS', 'P_INFO', 'NTES_P_UTID', 'S_INFO'];

export async function loginWithBrowser(
  onStatus: (msg: string) => void
): Promise<AuthState | null> {
  onStatus('正在启动浏览器...');

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let resolved = false;

  const cleanup = async () => {
    if (poll !== null) { clearInterval(poll); poll = null; }
    if (timeoutHandle !== null) { clearTimeout(timeoutHandle); timeoutHandle = null; }
    if (browser !== null) {
      try { await browser.close(); } catch { }
      browser = null;
    }
  };

  try {
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('https://news.163.com/', {
        timeout: 15000,
        waitUntil: 'domcontentloaded',
      });
      onStatus('浏览器已打开 news.163.com，请点击右上角"登录"完成账号登录...');
    } catch {
      try {
        await page.goto('about:blank');
        await page.setContent(
          '<body style="font:20px sans-serif;padding:40px">' +
          '<h2>请手动导航到 <a href="https://news.163.com">news.163.com</a> 并登录账号</h2>' +
          '</body>'
        );
      } catch { }
      onStatus('首页加载失败，请在浏览器地址栏手动输入 news.163.com 后登录...');
    }

    return await new Promise<AuthState | null>((resolve) => {
      const finish = async (result: AuthState | null) => {
        if (resolved) return;
        resolved = true;
        await cleanup();
        resolve(result);
      };

      const checkCookies = async () => {
        if (resolved) return;
        try {
          const cookies = await context.cookies();
          const hasAuth = cookies.some(c => KEY_COOKIES.includes(c.name));
          if (!hasAuth) return;

          const stored: StoredCookie[] = cookies
            .filter(c => PASSPORT_DOMAINS.some(d => c.domain.endsWith(d.replace(/^\./, ''))))
            .map(c => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              expires: c.expires,
              httpOnly: c.httpOnly,
              secure: c.secure,
            }));

          let nickname = '';
          try {
            nickname = await page.evaluate(() => {
              const el = document.querySelector(
                '.username, .loginname, [class*="nick"], [class*="user-name"], .ntes-icn-login'
              );
              return el?.textContent?.trim() || '';
            });
          } catch { }

          const authState: AuthState = { cookies: stored, nickname, savedAt: Date.now() };
          saveAuth(authState);
          onStatus(`登录成功！${nickname ? `欢迎，${nickname}` : ''}`);

          setTimeout(() => finish(authState), 1500);
        } catch { }
      };

      poll = setInterval(checkCookies, 2000);

      browser!.on('disconnected', () => {
        if (!resolved) {
          onStatus('浏览器已关闭');
          finish(null);
        }
      });

      timeoutHandle = setTimeout(() => {
        onStatus('登录超时（3分钟），已取消');
        finish(null);
      }, 180000);
    });
  } catch (err) {
    await cleanup();
    onStatus(`启动浏览器失败：${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
