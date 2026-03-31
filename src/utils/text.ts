import { parse } from 'node-html-parser';

/**
 * 将 HTML 正文转换为适合终端显示的纯文本
 */
export function htmlToText(html: string): string {
  if (!html) return '';

  // 替换图片占位符
  let text = html.replace(/<!--IMG#\d+-->/g, '[图片]');

  const root = parse(text);

  // 递归提取文本，保留段落结构
  function extractText(node: ReturnType<typeof parse>): string {
    const tag = (node as any).rawTagName?.toLowerCase() || '';
    const children = (node as any).childNodes || [];

    // 块级元素前后加换行
    const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br', 'blockquote', 'section', 'article', 'strong', 'b'];

    if (tag === 'br') return '\n';
    if (tag === 'img') return '[图片]';

    const childText = children.map((c: any) => extractText(c)).join('');

    if (blockTags.includes(tag)) {
      return childText.trim() ? '\n' + childText.trim() + '\n' : '';
    }

    // 文本节点
    if (children.length === 0) {
      return (node as any).text || '';
    }

    return childText;
  }

  let result = extractText(root);

  // 清理多余空行
  result = result
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');

  return result;
}

/**
 * 格式化时间：2026-03-31 12:37:00 -> 03-31 12:37
 */
export function formatTime(ptime: string): string {
  if (!ptime) return '';
  // 网易时间里有时用逗号替代冒号
  const normalized = ptime.replace(/,/g, ':');
  const match = normalized.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) return ptime.slice(0, 16);
  const [, year, month, day, hour, min] = match;
  const now = new Date();
  const nowYear = now.getFullYear().toString();
  if (year === nowYear) {
    return `${month}-${day} ${hour}:${min}`;
  }
  return `${year}-${month}-${day}`;
}

/**
 * 截断字符串到指定显示宽度（中文算2个宽度）
 */
export function truncate(str: string, maxWidth: number): string {
  let width = 0;
  let result = '';
  for (const ch of str) {
    const w = ch.charCodeAt(0) > 127 ? 2 : 1;
    if (width + w > maxWidth) {
      result += '…';
      break;
    }
    width += w;
    result += ch;
  }
  return result;
}

/**
 * 计算字符串显示宽度
 */
export function displayWidth(str: string): number {
  let width = 0;
  for (const ch of str) {
    width += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  return width;
}

/**
 * 将文章正文按终端宽度折行
 */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    let lineWidth = 0;
    for (const ch of para) {
      const w = ch.charCodeAt(0) > 127 ? 2 : 1;
      if (lineWidth + w > width) {
        lines.push(line);
        line = ch;
        lineWidth = w;
      } else {
        line += ch;
        lineWidth += w;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
