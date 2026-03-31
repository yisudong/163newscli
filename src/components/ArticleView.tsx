import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { exec } from 'child_process';
import type { ArticleDetail, CommentThread } from '../types.js';
import type { AuthState } from '../auth/index.js';
import { htmlToText, wrapText, formatTime, truncate, padEndWidth } from '../utils/text.js';
import { fetchComments, replyComment, likeComment, postComment } from '../api/index.js';

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
  const [cmtCursor, setCmtCursor] = useState(0);
  const [cmtViewport, setCmtViewport] = useState(0);
  const [replyMode, setReplyMode] = useState(false);
  const [newCommentMode, setNewCommentMode] = useState(false);
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
  const cmtCursorRef = useRef(cmtCursor);
  const cmtViewportRef = useRef(cmtViewport);

  const replyModeRef = useRef(replyMode);
  const newCommentModeRef = useRef(newCommentMode);
  const replyingRef = useRef(replying);
  useEffect(() => { replyModeRef.current = replyMode; }, [replyMode]);
  useEffect(() => { newCommentModeRef.current = newCommentMode; }, [newCommentMode]);
  useEffect(() => { replyingRef.current = replying; }, [replying]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { articleRef.current = article; }, [article]);
  useEffect(() => { contentHeightRef.current = contentHeight; }, [contentHeight]);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { threadsRef.current = threads; }, [threads]);
  useEffect(() => { cmtLoadingRef.current = cmtLoading; }, [cmtLoading]);
  useEffect(() => { cmtCursorRef.current = cmtCursor; }, [cmtCursor]);
  useEffect(() => { cmtViewportRef.current = cmtViewport; }, [cmtViewport]);

  useEffect(() => {
    setScrollTop(0);
    setTab('article');
    setThreads([]);
    setCmtCursor(0);
    setCmtViewport(0);
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
    setCmtCursor(0);
    setCmtViewport(0);
    const list = await fetchComments(art.docid);
    setThreads(list);
    setCmtLoading(false);
  };

  useInput((input, key) => {
    if (replyingRef.current) return;
    if (replyModeRef.current || newCommentModeRef.current) {
      if (key.escape) { setReplyMode(false); setNewCommentMode(false); setReplyInput(''); setReplyStatus(''); }
      return;
    }
  });

  useInput((input, key) => {
    if (loadingRef.current) return;
    if (replyModeRef.current || newCommentModeRef.current || replyingRef.current) return;

    if (input === 'q' || key.escape) {
      onBack();
      return;
    }

    if (input === 'n') {
      if (!auth) { setReplyStatus('请先登录后再评论'); setTimeout(() => setReplyStatus(''), 2000); return; }
      setReplyInput('');
      setReplyStatus('');
      setReplyMode(false);
      setNewCommentMode(true);
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
      const maxCursor = Math.max(0, ts.length - 1);
      const ch = contentHeightRef.current;

      const moveCursor = (next: number) => {
        const clamped = Math.max(0, Math.min(maxCursor, next));
        setCmtCursor(clamped);
        setCmtViewport(vp => {
          if (clamped < vp) return clamped;
          if (clamped >= vp + ch) return clamped - ch + 1;
          return vp;
        });
      };

      if (key.upArrow || input === 'k') moveCursor(cmtCursorRef.current - 1);
      else if (key.downArrow || input === 'j') moveCursor(cmtCursorRef.current + 1);
      else if (key.pageDown || input === 'd') moveCursor(cmtCursorRef.current + 5);
      else if (key.pageUp || input === 'u') moveCursor(cmtCursorRef.current - 5);
      else if (input === 'g') moveCursor(0);
      else if (input === 'G') moveCursor(maxCursor);
      else if (input === 'f') loadComments();
      else if (input === 'r') {
        if (!auth) { setReplyStatus('请先登录后再回复'); setTimeout(() => setReplyStatus(''), 2000); return; }
        setReplyInput('');
        setReplyStatus('');
        setNewCommentMode(false);
        setReplyMode(true);
      }
      else if (input === 'v') {
        if (!auth) { setReplyStatus('请先登录后再点赞'); setTimeout(() => setReplyStatus(''), 2000); return; }
        const art = articleRef.current;
        if (!art) return;
        const cursor = cmtCursorRef.current;
        setReplying(true);
        setReplyStatus('正在打开评论页...');
        likeComment(art.docid, cursor, setReplyStatus).then(result => {
          setReplying(false);
          setReplyStatus(result.message);
          setTimeout(() => setReplyStatus(''), 2500);
        });
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
    const visible = threads.slice(cmtViewport, cmtViewport + contentHeight);
    const selectedInView = cmtCursor - cmtViewport;

    for (let ti = 0; ti < visible.length; ti++) {
      const thread = visible[ti];
      const isSelected = ti === selectedInView;
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
              <Text color="cyan" inverse={isSelected} bold={isSelected}>{padEndWidth(truncate(c.nickName, nameWidth), nameWidth)}</Text>
              <Text inverse={isSelected}> </Text>
              <Text inverse={isSelected} bold={false}>{padEndWidth(truncate(c.content, mainContentW), mainContentW)}</Text>
              <Text inverse={isSelected}> </Text>
              <Text color={isSelected ? undefined : 'yellow'} inverse={isSelected}>{padEndWidth(c.vote > 0 ? `👍${c.vote}` : '', voteWidth)}</Text>
              <Text color={isSelected ? undefined : 'gray'} inverse={isSelected}> {c.createTime.slice(5, 16)}</Text>
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
              <Text color={isSelected ? undefined : 'gray'} inverse={isSelected}>{prefixFull}</Text>
              <Text color="cyan" inverse={isSelected}>{padEndWidth(truncate(c.nickName, nameWidth), nameWidth)}</Text>
              <Text inverse={isSelected}> </Text>
              <Text color={isSelected ? undefined : 'white'} inverse={isSelected}>{truncate(c.content, replyContentW)}</Text>
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
    ? `↑↓/jk 滚动  d/u 半页  g/G 首尾  o 浏览器  n 评论  c 评论  l 登录  q 返回`
    : `↑↓/jk 滚动  d/u 半页  n 评论  r 回复  v 点赞  f 刷新  c 正文  l 登录  q 返回`;

  const submitReply = async () => {
    const art = articleRef.current;
    if (!art || replyInput.trim().length < 2) return;
    const isNewComment = newCommentModeRef.current;
    setReplyMode(false);
    setNewCommentMode(false);
    setReplying(true);
    setReplyStatus(isNewComment ? '正在打开跟贴页...' : '正在打开评论页...');
    const result = isNewComment
      ? await postComment(art.docid, replyInput.trim(), setReplyStatus)
      : await replyComment(art.docid, cmtCursorRef.current, replyInput.trim(), setReplyStatus);
    setReplyStatus(result.message);
    if (result.ok) {
      setTimeout(() => { setReplying(false); setReplyStatus(''); loadComments(); }, 1500);
    } else {
      setTimeout(() => { setReplying(false); setReplyStatus(''); }, 3000);
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
                  <Text color="gray">暂无评论，按 f 刷新</Text>
                </Box>
              ) : renderThreads()}
            </Box>
          )}

          {(replyMode || newCommentMode) ? (
            <Box borderStyle="single" borderColor="cyan" paddingX={1}>
              <Text color="cyan">{newCommentMode ? '评论 › ' : '回复 › '}</Text>
              <TextInput
                value={replyInput}
                onChange={setReplyInput}
                onSubmit={submitReply}
                placeholder={newCommentMode ? '输入评论内容，Enter 提交，Esc 取消...' : '输入回复内容，Enter 提交，Esc 取消...'}
              />
            </Box>
          ) : replying ? (
            <Box borderStyle="single" borderColor={replyStatus.includes('成功') ? 'green' : 'cyan'} paddingX={1}>
              <Text color={replyStatus.includes('成功') ? 'green' : 'cyan'}>{replyStatus || '处理中...'}</Text>
            </Box>
          ) : null}
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
          <Text color="gray">  [{cmtCursor + 1}/{threads.length}条]</Text>
        )}
        {replyStatus && !replying ? (
          <Text color={replyStatus.startsWith('👍') || replyStatus.includes('成功') ? 'green' : replyStatus.startsWith('请') ? 'yellow' : 'cyan'}>{'  '}{replyStatus}</Text>
        ) : (
          <Text color={auth ? 'green' : 'gray'}>{'  '}{auth ? `🔐 ${auth.nickname || '已登录'}` : '⬜ 未登录'}</Text>
        )}
      </Box>
    </Box>
  );
}
