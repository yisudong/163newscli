import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { loginWithBrowser, clearAuth, isLoggedIn } from '../auth/index.js';
import type { AuthState } from '../auth/index.js';

interface LoginModalProps {
  auth: AuthState | null;
  onDone: (auth: AuthState | null) => void;
  onClose: () => void;
}

type LoginPhase = 'idle' | 'launching' | 'waiting' | 'success' | 'cancelled' | 'error';

export function LoginModal({ auth, onDone, onClose }: LoginModalProps) {
  const [phase, setPhase] = useState<LoginPhase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const { stdout } = useStdout();
  const termWidth = stdout.columns || 80;
  const termHeight = stdout.rows || 30;

  const already = isLoggedIn(auth);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      if (phase === 'launching' || phase === 'waiting') return;
      onClose();
      return;
    }

    if (input === 'l' || input === 'L') {
      if (!already && phase === 'idle') startLogin();
      return;
    }

    if ((input === 'o' || input === 'O') && already) {
      clearAuth();
      onDone(null);
      return;
    }
  });

  const startLogin = async () => {
    setPhase('launching');
    const result = await loginWithBrowser((msg) => {
      setPhase('waiting');
      setStatusMsg(msg);
    });
    if (result) {
      setPhase('success');
      setStatusMsg(`登录成功！${result.nickname ? `欢迎，${result.nickname}` : ''}`);
      setTimeout(() => onDone(result), 1500);
    } else {
      setPhase('cancelled');
      setStatusMsg('已取消登录');
      setTimeout(() => onClose(), 1500);
    }
  };

  useEffect(() => {
    if (!already && phase === 'idle') {
      startLogin();
    }
  }, []);

  const boxW = Math.min(60, termWidth - 4);

  return (
    <Box
      flexDirection="column"
      width={termWidth}
      height={termHeight}
      alignItems="center"
      justifyContent="center"
    >
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={already ? 'green' : phase === 'success' ? 'green' : phase === 'cancelled' || phase === 'error' ? 'red' : 'yellow'}
        paddingX={3}
        paddingY={1}
        width={boxW}
      >
        <Box marginBottom={1} justifyContent="center">
          <Text bold color="white">
            {already ? '🔐 登录状态' : '🔑 登录网易账号'}
          </Text>
        </Box>

        {already ? (
          <>
            <Box justifyContent="center" marginBottom={1}>
              <Text color="green">✅ 已登录</Text>
              {auth?.nickname ? <Text color="cyan"> — {auth.nickname}</Text> : null}
            </Box>
            <Box justifyContent="center">
              <Text color="gray">o 退出登录  q/Esc 关闭</Text>
            </Box>
          </>
        ) : (
          <>
            <Box justifyContent="center" marginBottom={1}>
              {phase === 'launching' && <Text color="yellow">⏳ 正在启动浏览器...</Text>}
              {phase === 'waiting' && <Text color="yellow">⏳ {statusMsg || '等待登录...'}</Text>}
              {phase === 'success' && <Text color="green">✅ {statusMsg}</Text>}
              {phase === 'cancelled' && <Text color="gray">✖ {statusMsg || '已取消'}</Text>}
              {phase === 'idle' && <Text color="gray">准备中...</Text>}
            </Box>

            {(phase === 'launching' || phase === 'waiting') && (
              <Box flexDirection="column" alignItems="center">
                <Text color="gray">浏览器窗口已打开，请：</Text>
                <Text color="white">1. 在页面中完成网易账号登录</Text>
                <Text color="white">2. 登录成功后 CLI 自动检测</Text>
                <Box marginTop={1}>
                  <Text color="gray">关闭浏览器窗口可取消登录</Text>
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
