import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Channel } from '../types.js';
import type { AuthState } from '../auth/index.js';
import { CHANNELS } from '../api/index.js';

interface MenuProps {
  onSelect: (channel: Channel) => void;
  auth: AuthState | null;
  onLogin: () => void;
}

export function Menu({ onSelect, auth, onLogin }: MenuProps) {
  const [cursor, setCursor] = useState(0);
  const { stdout } = useStdout();
  const termWidth = stdout.columns || 80;
  const termHeight = stdout.rows || 30;

  const menuItems = CHANNELS;

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor(c => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor(c => Math.min(menuItems.length - 1, c + 1));
    } else if (key.return) {
      onSelect(menuItems[cursor]);
    } else {
      const n = parseInt(input, 10);
      if (n >= 1 && n <= menuItems.length) {
        onSelect(menuItems[n - 1]);
      }
    }
  });
  const banner = [
    ' ██╗ ██████╗ ██████╗     ███╗   ██╗███████╗██╗    ██╗███████╗',
    '███║██╔════╝ ╚════██╗    ████╗  ██║██╔════╝██║    ██║██╔════╝',
    '╚██║███████╗  █████╔╝    ██╔██╗ ██║█████╗  ██║ █╗ ██║███████╗',
    ' ██║██╔═══██╗ ╚═══██╗    ██║╚██╗██║██╔══╝  ██║███╗██║╚════██║',
    ' ██║╚██████╔╝██████╔╝    ██║ ╚████║███████╗╚███╔███╔╝███████║',
    ' ╚═╝ ╚═════╝ ╚═════╝     ╚═╝  ╚═══╝╚══════╝ ╚══╝╚══╝ ╚══════╝',
  ].join('\n');

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} alignItems="center" justifyContent="center">
      {/* Banner */}
      <Box marginTop={1} marginBottom={1} flexDirection="column" alignItems="center">
        {banner.split('\n').map((line, i) => (
          <Text key={i} color="cyan">{line}</Text>
        ))}
      </Box>

      <Box marginBottom={1}>
        <Text color="gray" italic>网易新闻命令行版  v0.1.0</Text>
      </Box>

      {/* 菜单 */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={4}
        paddingY={1}
        width={40}
      >
        {menuItems.map((item, i) => {
          const isSelected = i === cursor;
          return (
            <Box key={item.key} paddingY={0}>
              <Text
                color={isSelected ? 'black' : 'white'}
                backgroundColor={isSelected ? 'cyan' : undefined}
                bold={isSelected}
              >
                {` ${i + 1}. ${item.label}${isSelected ? ' ◀' : '  '} `}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color="gray">↑↓ 移动  Enter/数字 选择  l 登录  q 退出</Text>
        <Text color={auth ? 'green' : 'gray'}>{'  '}{auth ? `🔐 ${auth.nickname || '已登录'}` : '⬜ 未登录'}</Text>
      </Box>
    </Box>
  );
}
