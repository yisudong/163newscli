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

export async function replyComment(
  docid: string,
  replyToIndex: number,
  content: string,
  onStatus: (msg: string) => void
): Promise<{ ok: boolean; message: string }> {
  const { chromium } = await import('playwright');
  const { loadAuth } = await import('../auth/index.js');

  const auth = loadAuth();
  if (!auth?.cookies?.length) {
    return { ok: false, message: '未登录，请先登录' };
  }
  if (content.length < 2 || content.length > 1000) {
    return { ok: false, message: '回复内容需在 2~1000 字之间' };
  }

  onStatus('正在打开评论页...');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addCookies(auth.cookies.map(c => ({
      name: c.name, value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
      path: c.path || '/', expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? false, secure: c.secure ?? false,
      sameSite: 'Lax' as const,
    })));

    const page = await context.newPage();
    await page.goto(`https://comment.tie.163.com/${docid}.html`, {
      waitUntil: 'networkidle', timeout: 20000,
    });

    onStatus('加载评论中...');
    await page.waitForSelector('.reply-btn', { timeout: 10000 });

    const replyBtns = page.locator('.reply-btn');
    const count = await replyBtns.count();
    const targetIdx = Math.min(replyToIndex, count - 1);

    await replyBtns.nth(targetIdx).click();
    await page.waitForTimeout(400);

    const textarea = page.locator('textarea').first();
    await textarea.fill(content);
    await page.waitForTimeout(200);

    onStatus('正在提交回复...');
    let result: { ok: boolean; message: string } | null = null;

    const responseHandler = async (res: import('playwright').Response) => {
      if (res.url().includes('/comments') && res.request().method() === 'POST') {
        const body = await res.text().catch(() => '{}');
        try {
          const json = JSON.parse(body);
          if (json.content || json.commentId || res.status() === 200) {
            result = { ok: true, message: '回复成功！' };
          } else {
            result = { ok: false, message: json.message || `失败（${res.status()}）` };
          }
        } catch {
          result = res.status() < 300
            ? { ok: true, message: '回复成功！' }
            : { ok: false, message: `请求失败（${res.status()}）` };
        }
      }
    };
    page.on('response', responseHandler);

    await page.locator('.submit').first().click();
    await page.waitForTimeout(3000);

    return result ?? { ok: false, message: '提交超时，请重试' };
  } finally {
    await browser.close().catch(() => {});
  }
}
