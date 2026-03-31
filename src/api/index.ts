import axios from 'axios';
import type { NewsItem, ArticleDetail, Channel, ChannelKey } from '../types.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const http = axios.create({
  headers: { 'User-Agent': UA },
  timeout: 10000,
});

export const CHANNELS: Channel[] = [
  { key: 'hot',    label: '🔥 热搜榜', path: 'hot',    storeKey: 'hotFlowNews' },
  { key: 'news',   label: '📰 要闻',   path: 'news',   storeKey: 'homeArticleList' },
  { key: 'ent',    label: '🎬 娱乐',   path: 'ent',    storeKey: 'homeArticleList' },
  { key: 'sports', label: '🏅 体育',   path: 'sports', storeKey: 'homeArticleList' },
  { key: 'money',  label: '💰 财经',   path: 'money',  storeKey: 'homeArticleList' },
  { key: 'auto',   label: '🚗 汽车',   path: 'auto',   storeKey: 'homeArticleList' },
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
    };
  } catch {
    return null;
  }
}
