import axios from 'axios';
import type { NewsItem, ArticleDetail, Comment, CommentThread, Channel, ChannelKey } from '../types.js';
import { loadAuth, getCookieHeader } from '../auth/index.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const http = axios.create({
  headers: { 'User-Agent': UA },
  timeout: 10000,
});

http.interceptors.request.use((config) => {
  const auth = loadAuth();
  const cookie = getCookieHeader(auth);
  if (cookie) {
    config.headers = config.headers ?? {};
    config.headers['Cookie'] = cookie;
  }
  return config;
});

export const CHANNELS: Channel[] = [
  { key: 'hot',      label: '🔥 热搜榜', path: 'hot',      storeKey: 'hotFlowNews' },
  { key: 'news',     label: '📰 要闻',   path: 'news',     storeKey: 'homeArticleList' },
  { key: 'ent',      label: '🎬 娱乐',   path: 'ent',      storeKey: 'homeArticleList' },
  { key: 'sports',   label: '🏅 体育',   path: 'sports',   storeKey: 'homeArticleList' },
  { key: 'money',    label: '💰 财经',   path: 'money',    storeKey: 'homeArticleList' },
  { key: 'auto',     label: '🚗 汽车',   path: 'auto',     storeKey: 'homeArticleList' },
  { key: 'game',     label: '🎮 游戏',   path: 'game',     storeKey: 'homeArticleList' },
  { key: 'edu',      label: '🎓 教育',   path: 'edu',      storeKey: 'homeArticleList' },
  { key: 'jiankang', label: '💊 健康',   path: 'jiankang', storeKey: 'homeArticleList' },
  { key: 'fashion',  label: '👗 时尚',   path: 'fashion',  storeKey: 'homeArticleList' },
];

/**
 * 从 m.163.com 页面提取 __INITIAL_STATE__ 数据
 */
function extractInitialState(html: string): Record<string, any> | null {
  const idx = html.indexOf('window.__INITIAL_STATE__=');
  if (idx === -1) return null;

  const start = idx + 'window.__INITIAL_STATE__='.length;
  let depth = 0;
  let end = start;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }

  try {
    return JSON.parse(html.slice(start, end));
  } catch {
    return null;
  }
}

/**
 * 从 store 中找出指定 key 的新闻列表
 */
function extractNewsFromStore(store: Record<string, any>, storeKey: string): NewsItem[] {
  const target = store[storeKey];
  if (!target?.data) return [];

  const data = target.data;
  const list: any[] = data.list ?? data.auto ?? data.items ?? [];

  return list
    .filter((item: any) => item?.title && item?.docid)
    .map((item: any): NewsItem => ({
      docid: item.docid,
      title: item.title,
      digest: item.digest || '',
      source: item.source || '',
      ptime: item.ptime || '',
      imgsrc: item.imgsrc || item.imgsrc3g || '',
      replyCount: item.replyCount ?? 0,
    }));
}

/**
 * 获取首页推荐新闻（hotNews + recommendNews 混合）
 */
export async function fetchHome(): Promise<NewsItem[]> {
  const { data: html } = await http.get('https://m.163.com/');
  const state = extractInitialState(html);
  if (!state?.store) return [];
  const store = state.store;

  const hot = extractNewsFromStore(store, 'hotNews');
  const recommend = extractNewsFromStore(store, 'recommendNews');

  // 合并去重
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of [...hot, ...recommend]) {
    if (!seen.has(item.docid)) {
      seen.add(item.docid);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * 获取热搜榜（100条）
 */
export async function fetchHot(): Promise<NewsItem[]> {
  const { data: html } = await http.get('https://m.163.com/hot/');
  const state = extractInitialState(html);
  if (!state?.store) return [];
  return extractNewsFromStore(state.store, 'hotFlowNews');
}

/**
 * 获取频道新闻列表
 */
export async function fetchChannel(channel: Channel): Promise<NewsItem[]> {
  if (channel.key === 'hot') return fetchHot();

  const { data: html } = await http.get(`https://m.163.com/${channel.path}/`);
  const state = extractInitialState(html);
  if (!state?.store) return [];
  return extractNewsFromStore(state.store, channel.storeKey);
}

/**
 * 获取文章详情
 */
export async function fetchArticle(docid: string): Promise<ArticleDetail | null> {
  try {
    const { data } = await http.get<Record<string, any>>(
      `https://c.m.163.com/nc/article/${docid}/full.html`
    );
    const article = data[docid];
    if (!article) return null;

    return {
      docid,
      title: article.title || '',
      source: article.source || '',
      ptime: article.ptime || '',
      body: article.body || '',
      digest: article.digest || article.shareDigest || '',
      shareLink: article.shareLink || `https://c.m.163.com/news/a/${docid}.html`,
      ipLocation: article.ipLocation || '',
      wordsCount: article.wordsCount || 0,
      replyCount: article.replyCount || 0,
      replyBoard: article.replyBoard || '',
    };
  } catch {
    return null;
  }
}

const COMMENT_PRODUCT_ID = 'a2869674571f77b5a0867c3d71db5856';

function parseComment(c: any): Comment {
  return {
    commentId: c.commentId,
    content: (c.content || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(),
    nickName: c.user?.nickname || c.user?.nickName || c.user?.name || '匿名',
    vote: c.vote ?? 0,
    createTime: c.createTime || '',
    ip: c.ip || '',
    branches: typeof c.branches === 'number' ? c.branches : 0,
    buildLevel: typeof c.buildLevel === 'number' ? c.buildLevel : 1,
    location: c.user?.location || '',
  };
}

export async function fetchComments(docid: string, limit = 20): Promise<CommentThread[]> {
  try {
    const { data } = await http.get<Record<string, any>>(
      `https://comment.api.163.com/api/v1/products/${COMMENT_PRODUCT_ID}/threads/${docid}/comments/hotList?limit=${limit}`
    );
    const ids: string[] = data.commentIds ?? [];
    const map: Record<string, any> = data.comments ?? {};
    return ids
      .map(idStr => {
        const parts = idStr.split(',');
        const comments = parts.map(id => map[id]).filter(Boolean).map(parseComment);
        return { comments };
      })
      .filter(t => t.comments.length > 0);
  } catch {
    return [];
  }
}

async function openCommentPage(docid: string) {
  const { chromium } = await import('playwright');
  const { loadAuth } = await import('../auth/index.js');
  const auth = loadAuth();
  if (!auth?.cookies?.length) return null;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(auth.cookies.map(c => ({
    name: c.name, value: c.value,
    domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
    path: c.path || '/', expires: c.expires ?? -1,
    httpOnly: c.httpOnly ?? false, secure: c.secure ?? false,
    sameSite: 'Lax' as const,
  })));
  const page = await context.newPage();
  await page.goto(`https://www.163.com/dy/article/${docid}.html`, {
    waitUntil: 'networkidle', timeout: 25000,
  });
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }
  return { browser, page };
}

export async function replyComment(
  docid: string,
  replyToIndex: number,
  content: string,
  onStatus: (msg: string) => void
): Promise<{ ok: boolean; message: string }> {
  try {
    const { loadAuth } = await import('../auth/index.js');
    if (!loadAuth()?.cookies?.length) return { ok: false, message: '未登录，请先登录' };
    if (content.length < 2 || content.length > 1000) return { ok: false, message: '回复内容需在 2~1000 字之间' };

    onStatus('正在打开评论页...');
    const session = await openCommentPage(docid);
    if (!session) return { ok: false, message: '未登录，请先登录' };
    const { browser, page } = session;
    try {
      onStatus('加载评论中...');
      await page.waitForSelector('.reply-btn', { state: 'attached', timeout: 15000 });

      const replyBtns = page.locator('.reply-btn');
      const count = await replyBtns.count();
      const targetBtn = replyBtns.nth(Math.min(replyToIndex, count - 1));
      await targetBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await targetBtn.click();
      await page.waitForTimeout(800);

      // 点击 reply-btn 后页面动态追加回复表单，取最后一个 textarea 即刚展开的回复框
      const replyTextarea = page.locator('textarea.js-cnt-box').last();
      const submitBtn = page.locator('.js-submit-btn').last();

      await replyTextarea.scrollIntoViewIfNeeded();
      await replyTextarea.fill(content);
      await page.waitForTimeout(200);

      onStatus('正在提交回复...');
      let result: { ok: boolean; message: string } | null = null;

      page.on('response', async res => {
        if (res.url().includes('/comments') && res.request().method() === 'POST') {
          const body = await res.text().catch(() => '{}');
          try {
            const json = JSON.parse(body);
            result = (json.content || json.commentId || res.status() === 200 || res.status() === 201)
              ? { ok: true, message: '回复成功！' }
              : { ok: false, message: json.message || `失败（${res.status()}）` };
          } catch {
            result = res.status() < 300
              ? { ok: true, message: '回复成功！' }
              : { ok: false, message: `请求失败（${res.status()}）` };
          }
        }
      });

      await submitBtn.click();
      await page.waitForTimeout(3000);
      return result ?? { ok: false, message: '提交超时，请重试' };
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? '操作失败' };
  }
}

export async function likeComment(
  docid: string,
  likeIndex: number,
  onStatus: (msg: string) => void
): Promise<{ ok: boolean; message: string }> {
  try {
    const { loadAuth } = await import('../auth/index.js');
    if (!loadAuth()?.cookies?.length) return { ok: false, message: '未登录，请先登录' };

    onStatus('正在打开评论页...');
    const session = await openCommentPage(docid);
    if (!session) return { ok: false, message: '未登录，请先登录' };
    const { browser, page } = session;
    try {
      onStatus('加载评论中...');
      await page.waitForSelector('.up-btn', { state: 'attached', timeout: 15000 });

      const upBtns = page.locator('.up-btn');
      const count = await upBtns.count();
      const targetBtn = upBtns.nth(Math.min(likeIndex, count - 1));
      await targetBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      onStatus('正在点赞...');

      let result: { ok: boolean; message: string } | null = null;
      page.on('response', async res => {
        if (res.url().includes('upvote') || res.url().includes('/up')) {
          const body = await res.text().catch(() => '{}');
          try {
            const json = JSON.parse(body);
            result = (res.status() === 200 && !json.message)
              ? { ok: true, message: '👍 点赞成功！' }
              : { ok: false, message: json.message || `失败（${res.status()}）` };
          } catch {
            result = res.status() === 200
              ? { ok: true, message: '👍 点赞成功！' }
              : { ok: false, message: `请求失败（${res.status()}）` };
          }
        }
      });

      await targetBtn.click();
      await page.waitForTimeout(2000);
      return result ?? { ok: false, message: '点赞超时，请重试' };
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? '操作失败' };
  }
}

export async function postComment(
  docid: string,
  content: string,
  onStatus: (msg: string) => void
): Promise<{ ok: boolean; message: string }> {
  try {
    const { loadAuth } = await import('../auth/index.js');
    if (!loadAuth()?.cookies?.length) return { ok: false, message: '未登录，请先登录' };
    if (content.length < 2 || content.length > 1000) return { ok: false, message: '评论内容需在 2~1000 字之间' };

    onStatus('正在打开跟贴页...');
    const { chromium } = await import('playwright');
    const auth = loadAuth();
    if (!auth?.cookies?.length) return { ok: false, message: '未登录，请先登录' };

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(auth.cookies.map(c => ({
      name: c.name, value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
      path: c.path || '/', expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? false, secure: c.secure ?? false,
      sameSite: 'Lax' as const,
    })));
    const page = await context.newPage();

    try {
      // 使用跟贴独立页（comment.tie.163.com），而非 dy/article，底部有独立发帖区
      await page.goto(`https://comment.tie.163.com/${docid}.html`, {
        waitUntil: 'networkidle', timeout: 25000,
      });

      onStatus('等待评论区加载...');
      await page.waitForSelector('.tie-input', { timeout: 15000 });
      await page.locator('.tie-input').scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // .submit.no-login 表示 cookie 未被识别
      const noLogin = await page.locator('.tie-input .submit.no-login').count();
      if (noLogin > 0) {
        await browser.close().catch(() => {});
        return { ok: false, message: '登录态未生效，请重新登录' };
      }

      const textarea = page.locator('.tie-input textarea').first();
      const textareaCount = await textarea.count();
      if (textareaCount === 0) {
        await browser.close().catch(() => {});
        return { ok: false, message: '未找到评论输入框' };
      }
      await textarea.click();
      await page.waitForTimeout(300);
      await textarea.fill(content);
      await page.waitForTimeout(300);

      onStatus('正在提交评论...');
      let result: { ok: boolean; message: string } | null = null;

      page.on('response', async res => {
        if (res.url().includes('/comments') && res.request().method() === 'POST') {
          const body = await res.text().catch(() => '{}');
          try {
            const json = JSON.parse(body);
            result = (json.content || json.commentId || res.status() === 200 || res.status() === 201)
              ? { ok: true, message: '✅ 评论发表成功！' }
              : { ok: false, message: json.message || `失败（${res.status()}）` };
          } catch {
            result = res.status() < 300
              ? { ok: true, message: '✅ 评论发表成功！' }
              : { ok: false, message: `请求失败（${res.status()}）` };
          }
        }
      });

      // 登录态下按钮为 span.submit（不带 .no-login）
      const submitBtn = page.locator('.tie-input .submit').first();
      await submitBtn.click();
      await page.waitForTimeout(3000);
      return result ?? { ok: false, message: '提交超时，请重试' };
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? '操作失败' };
  }
}
