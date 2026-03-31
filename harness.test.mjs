// HARNESS 测试套件
const PASS = '✅';
const FAIL = '❌';
let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
  if (cond) { console.log(PASS, name); passed++; }
  else { console.log(FAIL, name, detail); failed++; }
}

(async () => {
  const { fetchHot, fetchChannel, fetchArticle, CHANNELS } = await import('./dist/api/index.js');
  const { htmlToText, wrapText, formatTime, truncate } = await import('./dist/utils/text.js');
  const fs = await import('fs');

  // ---- TEST 1: Banner 验证 ----
  console.log('\n📋 [1] Banner 验证');
  const menuSrc = fs.readFileSync('./dist/components/Menu.js', 'utf8');
  assert('Banner 163-第1行以空格开头', menuSrc.includes(' \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557'));
  assert('Banner 163-第4行含正确3字形', menuSrc.includes('\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557'));
  assert('Banner 163-第5行含正确3字形', menuSrc.includes('\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d'));

  // ---- TEST 2: API - 热搜榜 ----
  console.log('\n📋 [2] API: 热搜榜');
  const hot = await fetchHot();
  assert('热搜条数 > 10', hot.length > 10, `实际: ${hot.length}`);
  assert('热搜有 docid', (hot[0]?.docid?.length ?? 0) > 0);
  assert('热搜有标题', (hot[0]?.title?.length ?? 0) > 0);
  assert('热搜时间含2026', (hot[0]?.ptime ?? '').includes('2026'));

  // ---- TEST 3: API - 各频道 ----
  console.log('\n📋 [3] API: 频道数据');
  for (const ch of CHANNELS.slice(1, 4)) {
    const items = await fetchChannel(ch);
    assert(`频道[${ch.label}]条数>5`, items.length > 5, `实际:${items.length}`);
    assert(`频道[${ch.label}]标题非空`, (items[0]?.title?.length ?? 0) > 0);
  }

  // ---- TEST 4: API - 文章详情 ----
  console.log('\n📋 [4] API: 文章详情');
  const art = await fetchArticle(hot[0].docid);
  assert('文章详情非null', art !== null);
  assert('文章有标题', (art?.title?.length ?? 0) > 0);
  assert('文章有正文body', (art?.body?.length ?? 0) > 100, `body长度: ${art?.body?.length}`);
  assert('文章有来源', (art?.source?.length ?? 0) > 0);
  assert('文章有链接', (art?.shareLink?.length ?? 0) > 0);

  // ---- TEST 5: 工具函数 ----
  console.log('\n📋 [5] 工具函数');
  assert('htmlToText 去除标签', !htmlToText('<p>你好<b>世界</b></p>').includes('<'));
  assert('htmlToText 保留文字', htmlToText('<p>你好世界</p>').includes('你好世界'));
  assert('htmlToText 图片占位', htmlToText('<!--IMG#0-->').includes('[图片]'));
  assert('formatTime 标准格式', formatTime('2026-03-31 12:37:00') === '03-31 12:37');
  assert('formatTime 逗号格式', formatTime('2026-03-31 12,37,00') === '03-31 12:37');
  assert('truncate 中文截断', truncate('这是一段很长的标题文字内容', 10).endsWith('…'));
  assert('wrapText 不超过宽度', wrapText('hello world这是中文测试', 10).every(l => {
    let w = 0;
    for (const c of l) w += c.charCodeAt(0) > 127 ? 2 : 1;
    return w <= 10;
  }));

  // ---- TEST 6: stale closure 修复验证（静态分析）----
  console.log('\n📋 [6] stale closure 修复验证');
  const listSrc = fs.readFileSync('./dist/components/NewsList.js', 'utf8');
  assert('NewsList 使用 itemsRef', listSrc.includes('itemsRef'));
  assert('NewsList 使用 loadingRef', listSrc.includes('loadingRef'));
  assert('NewsList loading完成后cursor归零', listSrc.includes('setCursor(0)'));
  const articleSrc = fs.readFileSync('./dist/components/ArticleView.js', 'utf8');
  assert('ArticleView 使用 linesRef', articleSrc.includes('linesRef'));
  assert('ArticleView 使用 loadingRef', articleSrc.includes('loadingRef'));

  // ---- 汇总 ----
  console.log('\n' + '='.repeat(50));
  console.log(`结果: ${PASS} 通过 ${passed}  ${FAIL} 失败 ${failed}  总计 ${passed + failed}`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('测试异常:', e.message); process.exit(1); });
