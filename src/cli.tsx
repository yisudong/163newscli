#!/usr/bin/env node
import React, { useState, useEffect } from 'react';
import { render, useApp, useInput } from 'ink';
import { Menu } from './components/Menu.js';
import { NewsList } from './components/NewsList.js';
import { ArticleView } from './components/ArticleView.js';
import { fetchChannel, fetchArticle } from './api/index.js';
import type { NewsItem, ArticleDetail, Channel } from './types.js';

type Screen = 'menu' | 'list' | 'article';

function App() {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('menu');
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  // 全局退出键（仅在菜单页）
  useInput((input) => {
    if (screen === 'menu' && (input === 'q' || input === 'Q')) {
      exit();
    }
  });

  const loadChannel = async (channel: Channel) => {
    setCurrentChannel(channel);
    setScreen('list');
    setListLoading(true);
    setNewsList([]);
    try {
      const items = await fetchChannel(channel);
      setNewsList(items);
    } catch (e) {
      setNewsList([]);
    } finally {
      setListLoading(false);
    }
  };

  const loadArticle = async (item: NewsItem) => {
    setScreen('article');
    setArticleLoading(true);
    setArticle(null);
    try {
      const detail = await fetchArticle(item.docid);
      setArticle(detail);
    } catch {
      setArticle(null);
    } finally {
      setArticleLoading(false);
    }
  };

  if (screen === 'menu') {
    return <Menu onSelect={loadChannel} />;
  }

  if (screen === 'list' && currentChannel) {
    return (
      <NewsList
        title={currentChannel.label}
        items={newsList}
        loading={listLoading}
        onSelect={loadArticle}
        onBack={() => setScreen('menu')}
        onRefresh={() => loadChannel(currentChannel)}
      />
    );
  }

  if (screen === 'article') {
    return (
      <ArticleView
        article={article}
        loading={articleLoading}
        onBack={() => setScreen('list')}
      />
    );
  }

  return null;
}

render(<App />);
