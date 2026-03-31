// 类型定义
export interface Comment {
  commentId: string | number;
  content: string;
  nickName: string;
  vote: number;
  createTime: string;
  ip?: string;
  branches?: number;
  buildLevel?: number;
  location?: string;
}

export interface CommentThread {
  comments: Comment[];
}

export interface NewsItem {
  docid: string;
  title: string;
  digest: string;
  source: string;
  ptime: string;
  imgsrc?: string;
  url?: string;
  replyCount?: number;
}

export interface ArticleDetail {
  docid: string;
  title: string;
  source: string;
  ptime: string;
  body: string;
  digest?: string;
  shareLink?: string;
  ipLocation?: string;
  wordsCount?: number;
  replyCount?: number;
  replyBoard?: string;
}

export type ChannelKey = 'hot' | 'news' | 'ent' | 'sports' | 'money' | 'auto' | 'game' | 'edu' | 'jiankang' | 'fashion';

export interface Channel {
  key: ChannelKey;
  label: string;
  path: string;
  storeKey: string;
}
