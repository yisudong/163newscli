import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { exec } from 'child_process';
import type { ArticleDetail } from '../types.js';
import { htmlToText, wrapText, formatTime } from '../utils/text.js';

interface ArticleViewProps {
  article: ArticleDetail | null;
  loading: boolean;
  onBack: () => void;
}

export function ArticleView({ article, loading, onBack }: ArticleViewProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const { stdout } = useStdout();
  const termWidth = stdout.columns || 80;
  const termHeight = stdout.rows || 30;
  // 顶部信息区(4行) + 底部提示(2行)
  const contentHeight = Math.max(5, termHeight - 7);
  const contentWidth = Math.max(40, termWidth - 4);

  const [lines, setLines] = useState<string[]>([]);

  // ⚡ ref 持有最新值，解决 useInput stale closure
  const linesRef = useRef(lines);
  const loadingRef = useRef(loading);
  const articleRef = useRef(article);
  const contentHeightRef = useRef(contentHeight);

  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { articleRef.current = article; }, [article]);
  useEffect(() => { contentHeightRef.current = contentHeight; }, [contentHeight]);

  useEffect(() => {
    setScrollTop(0);
    if (article) {
      const text = htmlToText(article.body);
      setLines(wrapText(text, contentWidth));
    } else {
      setLines([]);
    }
  }, [article, contentWidth]);

  useInput((input, key) => {
    if (loadingRef.current) return;
    const ls = linesRef.current;
    const ch = contentHeightRef.current;
    const maxScroll = Math.max(0, ls.length - ch);

    if (input === 'q' || key.escape) {
      onBack();
    } else if (key.upArrow || input === 'k') {
      setScrollTop(s => Math.max(0, s - 1));
    } else if (key.downArrow || input === 'j') {
      setScrollTop(s => Math.min(maxScroll, s + 1));
    } else if (key.pageDown || input === 'd') {
      setScrollTop(s => Math.min(maxScroll, s + Math.floor(ch / 2)));
    } else if (key.pageUp || input === 'u') {
      setScrollTop(s => Math.max(0, s - Math.floor(ch / 2)));
    } else if (input === 'o') {
      const link = articleRef.current?.shareLink;
      if (link) exec(`open "${link}"`);
    } else if (input === 'g') {
      setScrollTop(0);
    } else if (input === 'G') {
      setScrollTop(maxScroll);
    }
  });

  const visibleLines = lines.slice(scrollTop, scrollTop + contentHeight);
  const progress = lines.length > contentHeight
    ? Math.round((scrollTop / Math.max(1, lines.length - contentHeight)) * 100)
    : 100;

  return (
    <Box flexDirection="column" width={termWidth}>
      {loading ? (
        <Box paddingX={2} paddingY={1}>
          <Text color="yellow">⏳ 加载中...</Text>
        </Box>
      ) : article ? (
        <>
          {/* 文章头部 */}
          <Box borderStyle="round" borderColor="green" flexDirection="column" paddingX={1}>
            <Text bold color="white" wrap="wrap">{article.title}</Text>
            <Box>
              <Text color="gray">{article.source}</Text>
              {article.ipLocation ? <Text color="gray"> · {article.ipLocation}</Text> : null}
              <Text color="gray"> · {formatTime(article.ptime)}</Text>
              {article.wordsCount ? <Text color="gray"> · {article.wordsCount}字</Text> : null}
            </Box>
          </Box>

          {/* 正文区 */}
          <Box flexDirection="column" paddingX={2}>
            {visibleLines.map((line, i) => (
              <Text key={i}>{line || ' '}</Text>
            ))}
          </Box>
        </>
      ) : (
        <Box paddingX={2} paddingY={1}>
          <Text color="red">❌ 文章加载失败，按 q 返回</Text>
        </Box>
      )}

      {/* 底部状态栏 */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">↑↓/jk 滚动  d/u 半页  g/G 首尾  o 浏览器  q/Esc 返回</Text>
        {lines.length > contentHeight && (
          <Text color="gray">  [{scrollTop + 1}/{lines.length}行 {progress}%]</Text>
        )}
      </Box>
    </Box>
  );
}
