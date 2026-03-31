import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { NewsItem } from '../types.js';
import { formatTime, truncate, padEndWidth } from '../utils/text.js';

interface NewsListProps {
  title: string;
  items: NewsItem[];
  loading: boolean;
  onSelect: (item: NewsItem) => void;
  onBack: () => void;
  onRefresh: () => void;
}

export function NewsList({ title, items, loading, onSelect, onBack, onRefresh }: NewsListProps) {
  const [cursor, setCursor] = useState(0);
  const [offset, setOffset] = useState(0);
  const { stdout } = useStdout();
  const termHeight = stdout.rows || 30;
  const termWidth = stdout.columns || 80;
  // 减去顶部标题栏(3行) + 底部提示栏(2行)
  const visibleCount = Math.max(5, termHeight - 6);

  // ⚡ 用 ref 持有最新值，解决 useInput stale closure 问题
  const itemsRef = useRef(items);
  const cursorRef = useRef(cursor);
  const loadingRef = useRef(loading);
  const visibleCountRef = useRef(visibleCount);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { visibleCountRef.current = visibleCount; }, [visibleCount]);

  // cursor 变化时自动滚动
  useEffect(() => {
    if (cursor < offset) setOffset(cursor);
    else if (cursor >= offset + visibleCount) setOffset(cursor - visibleCount + 1);
  }, [cursor, visibleCount, offset]);

  // 数据加载完成后 cursor 归零
  useEffect(() => {
    if (!loading && items.length > 0) {
      setCursor(0);
      setOffset(0);
    }
  }, [loading]);

  useInput((input, key) => {
    // 用 ref 读取最新状态，避免 stale closure
    if (loadingRef.current) return;
    const currentItems = itemsRef.current;
    const currentCursor = cursorRef.current;
    const vc = visibleCountRef.current;

    if (key.upArrow || input === 'k') {
      setCursor(Math.max(0, currentCursor - 1));
    } else if (key.downArrow || input === 'j') {
      setCursor(Math.min(currentItems.length - 1, currentCursor + 1));
    } else if (key.return) {
      if (currentItems[currentCursor]) onSelect(currentItems[currentCursor]);
    } else if (input === 'q' || key.escape) {
      onBack();
    } else if (input === 'r') {
      setCursor(0);
      setOffset(0);
      onRefresh();
    } else if (key.pageDown || input === 'd') {
      setCursor(Math.min(currentItems.length - 1, currentCursor + vc));
    } else if (key.pageUp || input === 'u') {
      setCursor(Math.max(0, currentCursor - vc));
    }
  });

  const visibleItems = items.slice(offset, offset + visibleCount);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* 标题栏 */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">{title}</Text>
        {!loading && items.length > 0 && (
          <Text color="gray"> ({cursor + 1}/{items.length})</Text>
        )}
      </Box>

      {/* 内容区 */}
      <Box flexDirection="column" flexGrow={1}>
        {loading ? (
          <Box paddingX={2} paddingY={1}>
            <Text color="yellow">⏳ 加载中...</Text>
          </Box>
        ) : items.length === 0 ? (
          <Box paddingX={2} paddingY={1}>
            <Text color="red">暂无数据，按 r 重试</Text>
          </Box>
        ) : (
          visibleItems.map((item, i) => {
            const realIndex = offset + i;
            const isSelected = realIndex === cursor;
            const timeStr = formatTime(item.ptime);
            const indexStr = String(realIndex + 1).padStart(3, ' ');
            // 固定列：paddingX(2) + index+space(4) + source(10) + time(9) = 25
            const titleWidth = Math.max(10, termWidth - 25);
            const titleStr = truncate(item.title, titleWidth);
            const sourceStr = truncate(item.source, 8);

            return (
              <Box key={item.docid} paddingX={1}>
                <Text
                  color={isSelected ? 'black' : undefined}
                  backgroundColor={isSelected ? 'cyan' : undefined}
                >
                  <Text color={isSelected ? 'black' : 'gray'}>{indexStr} </Text>
                  <Text bold={isSelected}>{padEndWidth(titleStr, titleWidth)}</Text>
                  <Text color={isSelected ? 'black' : 'gray'}>
                    {' '}{padEndWidth(sourceStr, 9)}
                  </Text>
                  <Text color={isSelected ? 'black' : 'gray'}>
                    {' '}{timeStr}
                  </Text>
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* 底部提示 */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          ↑↓/jk 选择  PgDn/u 翻页  Enter 阅读  r 刷新  q/Esc 返回
        </Text>
      </Box>
    </Box>
  );
}
