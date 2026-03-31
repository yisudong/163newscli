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
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  onStatus('浏览器已打开，请在页面右上角登录网易账号...');
  await page.goto('https://passport.163.com/login/');

  let resolved = false;
  let authState: AuthState | null = null;

  return new Promise(async (resolve) => {
    const checkCookies = async () => {
      if (resolved) return;
      const cookies = await context.cookies();
      const hasAuth = cookies.some(c => KEY_COOKIES.includes(c.name));
      if (hasAuth) {
        resolved = true;
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
            const el = document.querySelector('.username, .loginname, [class*="nick"], [class*="user-name"]');
            return el?.textContent?.trim() || '';
          });
        } catch { }

        authState = { cookies: stored, nickname, savedAt: Date.now() };
        saveAuth(authState);
        onStatus(`登录成功！${nickname ? `欢迎，${nickname}` : ''}`);
        setTimeout(async () => {
          try { await browser.close(); } catch { }
          resolve(authState);
        }, 1500);
      }
    };

    page.on('response', async () => {
      setTimeout(checkCookies, 500);
    });

    page.on('close', async () => {
      if (!resolved) {
        resolved = true;
        try { await browser.close(); } catch { }
        resolve(null);
      }
    });

    browser.on('disconnected', () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    const poll = setInterval(async () => {
      if (resolved) { clearInterval(poll); return; }
      await checkCookies();
    }, 2000);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(poll);
        onStatus('登录超时（3分钟），已取消');
        browser.close().catch(() => { });
        resolve(null);
      }
    }, 180000);
  });
}
