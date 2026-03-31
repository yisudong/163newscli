import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  fetchHot,
  fetchChannel,
  fetchArticle,
  fetchComments,
  CHANNELS,
} from './api/index.js';

const server = new McpServer({
  name: '163news',
  version: '0.1.0',
});

server.registerTool(
  'get_hot_news',
  {
    title: '网易热搜榜',
    description: '获取网易新闻实时热搜榜，返回最多100条热门新闻列表，包含标题、来源、时间和评论数',
    inputSchema: {},
  },
  async () => {
    const items = await fetchHot();
    const lines = items.map((item, i) =>
      `${i + 1}. [${item.docid}] ${item.title}（${item.source}｜${item.ptime?.slice(5, 16) ?? ''}｜💬${item.replyCount}）`
    );
    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }
);

server.registerTool(
  'get_channel_news',
  {
    title: '获取频道新闻',
    description: '获取指定频道的新闻列表。可选频道：hot（热搜）、news（要闻）、ent（娱乐）、sports（体育）、money（财经）、auto（汽车）、game（游戏）、edu（教育）、jiankang（健康）、fashion（时尚）',
    inputSchema: {
      channel: z.enum(['hot', 'news', 'ent', 'sports', 'money', 'auto', 'game', 'edu', 'jiankang', 'fashion'])
        .describe('频道 key'),
    },
  },
  async ({ channel }) => {
    const ch = CHANNELS.find(c => c.key === channel);
    if (!ch) {
      return { content: [{ type: 'text', text: `未知频道: ${channel}` }], isError: true };
    }
    const items = await fetchChannel(ch);
    const lines = items.map((item, i) =>
      `${i + 1}. [${item.docid}] ${item.title}（${item.source}｜${item.ptime?.slice(5, 16) ?? ''}｜💬${item.replyCount}）`
    );
    return {
      content: [{ type: 'text', text: `${ch.label} 频道新闻：\n\n${lines.join('\n')}` }],
    };
  }
);

server.registerTool(
  'get_article',
  {
    title: '读取文章全文',
    description: '根据 docid 获取文章完整正文、标题、来源、发布时间等信息。docid 从新闻列表的方括号中获取，例如 KPC9R8BG0001899O',
    inputSchema: {
      docid: z.string().describe('文章 docid，例如 KPC9R8BG0001899O'),
    },
  },
  async ({ docid }) => {
    const article = await fetchArticle(docid);
    if (!article) {
      return { content: [{ type: 'text', text: `找不到文章: ${docid}` }], isError: true };
    }
    const { htmlToText } = await import('./utils/text.js');
    const body = htmlToText(article.body);
    const text = [
      `标题：${article.title}`,
      `来源：${article.source}  发布：${article.ptime}  ${article.ipLocation ? '📍' + article.ipLocation : ''}`,
      `字数：${article.wordsCount}  评论数：${article.replyCount}`,
      `链接：${article.shareLink}`,
      '',
      body,
    ].join('\n');
    return {
      content: [{ type: 'text', text }],
    };
  }
);

server.registerTool(
  'get_comments',
  {
    title: '获取文章评论',
    description: '获取指定文章的热门评论列表，包含评论内容、作者昵称、点赞数、时间等信息',
    inputSchema: {
      docid: z.string().describe('文章 docid'),
      limit: z.number().int().min(1).max(50).default(20).describe('返回评论数量，默认20，最多50'),
    },
  },
  async ({ docid, limit }) => {
    const threads = await fetchComments(docid, limit);
    if (threads.length === 0) {
      return { content: [{ type: 'text', text: '暂无评论' }] };
    }
    const lines: string[] = [];
    let idx = 1;
    for (const thread of threads) {
      for (const c of thread.comments) {
        const indent = (c.buildLevel ?? 1) > 1 ? '  └ ' : '';
        lines.push(`${indent}${idx}. ${c.nickName}${c.location ? '（' + c.location + '）' : ''}：${c.content}  👍${c.vote}`);
        idx++;
      }
    }
    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  process.stderr.write(`163news MCP Server 启动失败: ${err.message}\n`);
  process.exit(1);
});
