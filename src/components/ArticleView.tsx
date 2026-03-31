import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { exec } from 'child_process';
import type { ArticleDetail, CommentThread } from '../types.js';
import type { AuthState } from '../auth/index.js';
import { htmlToText, wrapText, formatTime, truncate, padEndWidth } from '../utils/text.js';
import { fetchComments, replyComment } from '../api/index.js';

interface ArticleViewProps {
  article: ArticleDetail | null;
  loading: boolean;
  onBack: () => void;
  auth: AuthState | null;
  onLogin: () => void;
}

export function ArticleView({ article, loading, onBack, auth, onLogin }: ArticleViewProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [tab, setTab] = useState<'article' | 'comments'>('article');
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [cmtLoading, setCmtLoading] = useState(false);
  const [cmtScroll, setCmtScroll] = useState(0);
  const [replyMode, setReplyMode] = useState(false);
  const [replyInput, setReplyInput] = useState('');
  const [replyStatus, setReplyStatus] = useState('');
  const [replying, setReplying] = useState(false);

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
  const threadsRef = useRef(threads);
  const cmtLoadingRef = useRef(cmtLoading);
  const cmtScrollRef = useRef(cmtScroll);

  const replyModeRef = useRef(replyMode);
  const replyingRef = useRef(replying);
  useEffect(() => { replyModeRef.current = replyMode; }, [replyMode]);
  useEffect(() => { replyingRef.current = replying; }, [replying]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { articleRef.current = article; }, [article]);
  useEffect(() => { contentHeightRef.current = contentHeight; }, [contentHeight]);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { threadsRef.current = threads; }, [threads]);
  useEffect(() => { cmtLoadingRef.current = cmtLoading; }, [cmtLoading]);
  useEffect(() => { cmtScrollRef.current = cmtScroll; }, [cmtScroll]);

  useEffect(() => {
    setScrollTop(0);
    setTab('article');
    setThreads([]);
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
    setThreads([]);
    setCmtScroll(0);
    const list = await fetchComments(art.docid);
    setThreads(list);
    setCmtLoading(false);
  };

  useInput((input, key) => {
    if (replyingRef.current) return;
    if (replyModeRef.current) {
      if (key.escape) { setReplyMode(false); setReplyInput(''); setReplyStatus(''); }
      return;
    }
  });

  useInput((input, key) => {
    if (loadingRef.current) return;
    if (replyModeRef.current || replyingRef.current) return;

    if (input === 'q' || key.escape) {
      onBack();
      return;
    }

    if (input === 'c') {
      const nextTab = tabRef.current === 'article' ? 'comments' : 'article';
      setTab(nextTab);
      if (nextTab === 'comments' && threadsRef.current.length === 0 && !cmtLoadingRef.current) {
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
      const ts = threadsRef.current;
      const maxScroll = Math.max(0, ts.length - 1);
      if (key.upArrow || input === 'k') setCmtScroll(s => Math.max(0, s - 1));
      else if (key.downArrow || input === 'j') setCmtScroll(s => Math.min(maxScroll, s + 1));
      else if (key.pageDown || input === 'd') setCmtScroll(s => Math.min(maxScroll, s + 5));
      else if (key.pageUp || input === 'u') setCmtScroll(s => Math.max(0, s - 5));
      else if (input === 'g') setCmtScroll(0);
      else if (input === 'G') setCmtScroll(maxScroll);
      else if (input === 'R') loadComments();
      else if (input === 'r') {
        if (!auth) { setReplyStatus('请先登录后再回复'); setTimeout(() => setReplyStatus(''), 2000); return; }
        setReplyInput('');
        setReplyStatus('');
        setReplyMode(true);
      }
    }
  });

  const visibleLines = lines.slice(scrollTop, scrollTop + contentHeight);
  const progress = lines.length > contentHeight
    ? Math.round((scrollTop / Math.max(1, lines.length - contentHeight)) * 100)
    : 100;

  const nameWidth = 10;
  const voteWidth = 7;
  const timeWidth = 11;

  const renderThreads = () => {
    const rows: React.ReactNode[] = [];
    const visible = threads.slice(cmtScroll, cmtScroll + contentHeight);

    for (let ti = 0; ti < visible.length; ti++) {
      const thread = visible[ti];
      const isMulti = thread.comments.length > 1;

      for (let ci = 0; ci < thread.comments.length; ci++) {
        const c = thread.comments[ci];
        const level = c.buildLevel ?? 1;
        const indent = (level - 1) * 2;
        const isLast = ci === thread.comments.length - 1;
        const indentStr = ' '.repeat(indent);

        if (level === 1) {
          const mainContentW = Math.max(10, contentWidth - nameWidth - voteWidth - timeWidth - 3);
          rows.push(
            <Box key={`${ti}-${ci}`} paddingX={1}>
              <Text color="cyan">{padEndWidth(truncate(c.nickName, nameWidth), nameWidth)}</Text>
              <Text> </Text>
              <Text bold={false}>{padEndWidth(truncate(c.content, mainContentW), mainContentW)}</Text>
              <Text> </Text>
              <Text color="yellow">{padEndWidth(c.vote > 0 ? `👍${c.vote}` : '', voteWidth)}</Text>
              <Text color="gray"> {c.createTime.slice(5, 16)}</Text>
            </Box>
          );
        } else {
          const prefix = isLast ? '└' : '├';
          const levelStr = `${level}F`;
          const prefixFull = `${indentStr}${prefix}${levelStr} `;
          const prefixW = indent + 1 + levelStr.length + 1;
          const replyContentW = Math.max(10, contentWidth - prefixW - nameWidth - 3);
          rows.push(
            <Box key={`${ti}-${ci}`} paddingX={1}>
              <Text color="gray">{prefixFull}</Text>
              <Text color="cyan">{padEndWidth(truncate(c.nickName, nameWidth), nameWidth)}</Text>
              <Text> </Text>
              <Text color="white">{truncate(c.content, replyContentW)}</Text>
            </Box>
          );
        }
      }

      if (isMulti && ti < visible.length - 1) {
        rows.push(
          <Box key={`sep-${ti}`} paddingX={1}>
            <Text color="gray">{'─'.repeat(Math.max(0, contentWidth - 2))}</Text>
          </Box>
        );
      }
    }

    return rows;
  };

  const statusBar = tab === 'article'
    ? `↑↓/jk 滚动  d/u 半页  g/G 首尾  o 浏览器  c 评论  l 登录  q 返回`
    : `↑↓/jk 滚动  d/u 半页  r 回复  R 刷新  c 正文  l 登录  q 返回`;

  const submitReply = async () => {
    const art = articleRef.current;
    const scroll = cmtScrollRef.current;
    if (!art || replyInput.trim().length < 2) return;
    setReplyMode(false);
    setReplying(true);
    setReplyStatus('正在打开评论页...');
    const result = await replyComment(art.docid, scroll, replyInput.trim(), setReplyStatus);
    setReplying(false);
    setReplyStatus(result.message);
    if (result.ok) {
      setTimeout(() => { setReplyStatus(''); loadComments(); }, 1500);
    } else {
      setTimeout(() => setReplyStatus(''), 3000);
    }
  };

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
              ) : threads.length === 0 ? (
                <Box paddingX={2} paddingY={1}>
                  <Text color="gray">暂无评论，按 R 刷新</Text>
                </Box>
              ) : renderThreads()}
            </Box>
          )}

          {replyMode && (
            <Box borderStyle="single" borderColor="cyan" paddingX={1}>
              <Text color="cyan">回复 › </Text>
              <TextInput
                value={replyInput}
                onChange={setReplyInput}
                onSubmit={submitReply}
                placeholder="输入回复内容，Enter 提交，Esc 取消..."
              />
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
        {tab === 'comments' && threads.length > 0 && (
          <Text color="gray">  [{cmtScroll + 1}/{threads.length}条]</Text>
        )}
        <Text color={auth ? 'green' : 'gray'}>{'  '}{auth ? `🔐 ${auth.nickname || '已登录'}` : '⬜ 未登录'}</Text>
      </Box>
    </Box>
  );
}
