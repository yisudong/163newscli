import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { exec } from 'child_process';
import type { ArticleDetail, Comment } from '../types.js';
import { htmlToText, wrapText, formatTime, truncate } from '../utils/text.js';
import { fetchComments } from '../api/index.js';

interface ArticleViewProps {
  article: ArticleDetail | null;
  loading: boolean;
  onBack: () => void;
}

export function ArticleView({ article, loading, onBack }: ArticleViewProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [tab, setTab] = useState<'article' | 'comments'>('article');
  const [comments, setComments] = useState<Comment[]>([]);
  const [cmtLoading, setCmtLoading] = useState(false);
  const [cmtScroll, setCmtScroll] = useState(0);

  const { stdout } = useStdout();
  const termWidth = stdout.columns || 80;
  const termHeight = stdout.rows || 30;
  const contentHeight = Math.max(5, termHeight - 7);
  const contentWidth = Math.max(40, termWidth - 4);

  const [lines, setLines] = useState<string[]>([]);

  const linesRef = useRef(lines);
  const loadingRef = useRef(loading);
  const articleRef = useRef(article);
  const contentHeightRef = useRef(contentHeight);
  const tabRef = useRef(tab);
  const commentsRef = useRef(comments);
  const cmtLoadingRef = useRef(cmtLoading);
  const cmtScrollRef = useRef(cmtScroll);

  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { articleRef.current = article; }, [article]);
  useEffect(() => { contentHeightRef.current = contentHeight; }, [contentHeight]);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { commentsRef.current = comments; }, [comments]);
  useEffect(() => { cmtLoadingRef.current = cmtLoading; }, [cmtLoading]);
  useEffect(() => { cmtScrollRef.current = cmtScroll; }, [cmtScroll]);

  useEffect(() => {
    setScrollTop(0);
    setTab('article');
    setComments([]);
    setCmtScroll(0);
    if (article) {
      const text = htmlToText(article.body);
      setLines(wrapText(text, contentWidth));
    } else {
      setLines([]);
    }
  }, [article, contentWidth]);

  const loadComments = async () => {
    const art = articleRef.current;
    if (!art || cmtLoadingRef.current) return;
    setCmtLoading(true);
    setComments([]);
    setCmtScroll(0);
    const list = await fetchComments(art.docid);
    setComments(list);
    setCmtLoading(false);
  };

  useInput((input, key) => {
    if (loadingRef.current) return;

    if (input === 'q' || key.escape) {
      onBack();
      return;
    }

    if (input === 'c') {
      const nextTab = tabRef.current === 'article' ? 'comments' : 'article';
      setTab(nextTab);
      if (nextTab === 'comments' && commentsRef.current.length === 0 && !cmtLoadingRef.current) {
        loadComments();
      }
      return;
    }

    if (tabRef.current === 'article') {
      const ls = linesRef.current;
      const ch = contentHeightRef.current;
      const maxScroll = Math.max(0, ls.length - ch);
      if (key.upArrow || input === 'k') setScrollTop(s => Math.max(0, s - 1));
      else if (key.downArrow || input === 'j') setScrollTop(s => Math.min(maxScroll, s + 1));
      else if (key.pageDown || input === 'd') setScrollTop(s => Math.min(maxScroll, s + Math.floor(ch / 2)));
      else if (key.pageUp || input === 'u') setScrollTop(s => Math.max(0, s - Math.floor(ch / 2)));
      else if (input === 'g') setScrollTop(0);
      else if (input === 'G') setScrollTop(maxScroll);
      else if (input === 'o') { const link = articleRef.current?.shareLink; if (link) exec(`open "${link}"`); }
    } else {
      const ch = contentHeightRef.current;
      const maxScroll = Math.max(0, commentsRef.current.length - ch);
      if (key.upArrow || input === 'k') setCmtScroll(s => Math.max(0, s - 1));
      else if (key.downArrow || input === 'j') setCmtScroll(s => Math.min(maxScroll, s + 1));
      else if (key.pageDown || input === 'd') setCmtScroll(s => Math.min(maxScroll, s + Math.floor(ch / 2)));
      else if (key.pageUp || input === 'u') setCmtScroll(s => Math.max(0, s - Math.floor(ch / 2)));
      else if (input === 'r') loadComments();
    }
  });

  const visibleLines = lines.slice(scrollTop, scrollTop + contentHeight);
  const progress = lines.length > contentHeight
    ? Math.round((scrollTop / Math.max(1, lines.length - contentHeight)) * 100)
    : 100;

  const visibleComments = comments.slice(cmtScroll, cmtScroll + contentHeight);
  const nameWidth = 10;
  const voteWidth = 6;
  const timeWidth = 11;
  const cmtContentWidth = Math.max(10, contentWidth - nameWidth - voteWidth - timeWidth - 3);

  const statusBar = tab === 'article'
    ? `↑↓/jk 滚动  d/u 半页  g/G 首尾  o 浏览器  c 评论  q 返回`
    : `↑↓/jk 滚动  d/u 半页  r 刷新  c 正文  q 返回`;

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {loading ? (
        <Box paddingX={2} paddingY={1} flexGrow={1}>
          <Text color="yellow">⏳ 加载中...</Text>
        </Box>
      ) : article ? (
        <>
          <Box borderStyle="round" borderColor={tab === 'article' ? 'green' : 'yellow'} flexDirection="column" paddingX={1}>
            <Text bold color="white" wrap="wrap">{article.title}</Text>
            <Box>
              <Text color="gray">{article.source}</Text>
              {article.ipLocation ? <Text color="gray"> · {article.ipLocation}</Text> : null}
              <Text color="gray"> · {formatTime(article.ptime)}</Text>
              {article.wordsCount ? <Text color="gray"> · {article.wordsCount}字</Text> : null}
              {article.replyCount ? <Text color="gray"> · 💬{article.replyCount}</Text> : null}
              <Text color={tab === 'article' ? 'green' : 'yellow'}> [{tab === 'article' ? '正文' : '评论'}]</Text>
            </Box>
          </Box>

          {tab === 'article' ? (
            <Box flexDirection="column" paddingX={2} height={contentHeight} overflow="hidden">
              {visibleLines.map((line, i) => (
                <Text key={i}>{line || ' '}</Text>
              ))}
            </Box>
          ) : (
            <Box flexDirection="column" height={contentHeight} overflow="hidden">
              {cmtLoading ? (
                <Box paddingX={2} paddingY={1}>
                  <Text color="yellow">⏳ 加载评论...</Text>
                </Box>
              ) : comments.length === 0 ? (
                <Box paddingX={2} paddingY={1}>
                  <Text color="gray">暂无评论，按 r 重试</Text>
                </Box>
              ) : (
                visibleComments.map((c, i) => (
                  <Box key={c.commentId} paddingX={1}>
                    <Text color="cyan">{truncate(c.nickName, nameWidth).padEnd(nameWidth, ' ')}</Text>
                    <Text> </Text>
                    <Text>{truncate(c.content, cmtContentWidth).padEnd(cmtContentWidth, ' ')}</Text>
                    <Text> </Text>
                    <Text color="gray">{String(c.vote > 0 ? `👍${c.vote}` : '').padEnd(voteWidth, ' ')}</Text>
                    <Text color="gray"> {c.createTime.slice(5, 16)}</Text>
                  </Box>
                ))
              )}
            </Box>
          )}
        </>
      ) : (
        <Box paddingX={2} paddingY={1} flexGrow={1}>
          <Text color="red">❌ 文章加载失败，按 q 返回</Text>
        </Box>
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">{statusBar}</Text>
        {tab === 'article' && lines.length > contentHeight && (
          <Text color="gray">  [{scrollTop + 1}/{lines.length}行 {progress}%]</Text>
        )}
        {tab === 'comments' && comments.length > 0 && (
          <Text color="gray">  [{cmtScroll + 1}/{comments.length}条]</Text>
        )}
      </Box>
    </Box>
  );
}
