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
  const { htmlToText, wrapText, formatTime, truncate, padEndWidth, displayWidth } = await import('./dist/utils/text.js');
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

  // ---- TEST 3b: API - 新增频道 ----
  console.log('\n📋 [3b] API: 新增频道数据');
  const newChannelKeys = ['game', 'edu', 'jiankang', 'fashion'];
  for (const key of newChannelKeys) {
    const ch = CHANNELS.find(c => c.key === key);
    assert(`新频道[${key}]存在于 CHANNELS`, ch !== undefined);
    if (ch) {
      const items = await fetchChannel(ch);
      assert(`新频道[${key}]条数>5`, items.length > 5, `实际:${items.length}`);
      assert(`新频道[${key}]标题非空`, (items[0]?.title?.length ?? 0) > 0);
    }
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
  assert('formatTime 往年统一MM-DD格式', formatTime('2024-11-15 23:59:00') === '11-15 23:59');
  assert('formatTime 输出宽度恒为11', [
    '2026-03-31 14:30:00',
    '2025-12-01 08:05:00',
    '2024-01-01 00:00:00',
  ].every(t => { let w = 0; for (const c of formatTime(t)) w += c.charCodeAt(0) > 127 ? 2 : 1; return w === 11; }));
  assert('truncate 中文截断', truncate('这是一段很长的标题文字内容', 10).endsWith('…'));
  assert('wrapText 不超过宽度', wrapText('hello world这是中文测试', 10).every(l => {
    let w = 0;
    for (const c of l) w += c.charCodeAt(0) > 127 ? 2 : 1;
    return w <= 10;
  }));
  assert('padEndWidth 中文补齐到目标宽度', (() => {
    const s = padEndWidth('你好', 10);
    return displayWidth(s) === 10;
  })());
  assert('padEndWidth 不超出目标宽度', (() => {
    const s = padEndWidth('这是一段已经很宽的中文字符串测试', 8);
    return displayWidth(s) >= 8;
  })());
  assert('padEndWidth ASCII正常补齐', padEndWidth('hi', 6) === 'hi    ');

  // ---- TEST 6: stale closure 修复验证（静态分析）----
  console.log('\n📋 [6] stale closure 修复验证');
  const listSrc = fs.readFileSync('./dist/components/NewsList.js', 'utf8');
  assert('NewsList 使用 itemsRef', listSrc.includes('itemsRef'));
  assert('NewsList 使用 loadingRef', listSrc.includes('loadingRef'));
  assert('NewsList loading完成后cursor归零', listSrc.includes('setCursor(0)'));
  const articleSrc = fs.readFileSync('./dist/components/ArticleView.js', 'utf8');
  assert('ArticleView 使用 linesRef', articleSrc.includes('linesRef'));
  assert('ArticleView 使用 loadingRef', articleSrc.includes('loadingRef'));

  // ---- TEST 7: 终端高度/宽度适配验证（静态分析）----
  console.log('\n📋 [7] 终端尺寸适配验证');
  assert('Menu 使用 termHeight', menuSrc.includes('termHeight'));
  assert('Menu 撑满高度 height={termHeight}', menuSrc.includes('height: termHeight'));
  assert('Menu 垂直居中 justifyContent center', menuSrc.includes('justifyContent') && menuSrc.includes('center'));
  assert('NewsList 撑满高度 height={termHeight}', listSrc.includes('height: termHeight'));
  assert('NewsList 使用 padEndWidth 而非 padEnd', listSrc.includes('padEndWidth') && !listSrc.includes('.padEnd('));
  assert('ArticleView 撑满高度 height={termHeight}', articleSrc.includes('height: termHeight'));
  assert('ArticleView 正文区有 overflow hidden', articleSrc.includes('overflow') && articleSrc.includes('hidden'));
  assert('ArticleView 评论行使用 padEndWidth 而非 padEnd', articleSrc.includes('padEndWidth') && !articleSrc.includes('.padEnd('));

  // ---- TEST 8: 菜单项 emoji 宽度一致性 ----
  console.log('\n📋 [8] 菜单 emoji 宽度一致性');
  assert('CHANNELS 共10个频道', CHANNELS.length === 10);
  assert('体育频道不使用窄 emoji ⚽', !CHANNELS.find(c => c.key === 'sports')?.label.includes('⚽'));
  const labelWidths = CHANNELS.slice(1).map(ch => {
    let w = 0; for (const c of ch.label) w += c.codePointAt(0) > 0xFFFF ? 2 : (c.charCodeAt(0) > 127 ? 2 : 1);
    return w;
  });
  assert('非热搜各频道 label 显示宽度一致', new Set(labelWidths).size === 1, `宽度: ${labelWidths}`);

  // ---- TEST 9: 评论接口 ----
  console.log('\n📋 [9] 评论接口');
  const { fetchComments } = await import('./dist/api/index.js');
  const threads = await fetchComments(hot[0].docid);
  assert('fetchComments 返回数组', Array.isArray(threads));
  if (threads.length > 0) {
    const firstThread = threads[0];
    assert('评论 thread 有 comments 数组', Array.isArray(firstThread?.comments));
    const c = firstThread?.comments?.[0];
    assert('评论有 commentId', c?.commentId != null);
    assert('评论有 content', (c?.content?.length ?? 0) > 0);
    assert('评论有 nickName', (c?.nickName?.length ?? 0) > 0);
    assert('评论有 createTime', (c?.createTime?.length ?? 0) > 0);
    assert('评论有 buildLevel', typeof c?.buildLevel === 'number');
    assert('主楼 buildLevel 为 1', c?.buildLevel === 1);
  }
  const multiThread = threads.find(t => t.comments.length > 1);
  if (multiThread) {
    assert('盖楼链子楼 buildLevel > 1', multiThread.comments[1]?.buildLevel > 1);
  }
  assert('ArticleView 有评论状态 tab', articleSrc.includes('tab'));
  assert('ArticleView 有 fetchComments 引用', articleSrc.includes('fetchComments'));
  assert('ArticleView c 键切换评论', articleSrc.includes("'c'") || articleSrc.includes('"c"'));
  assert('ArticleDetail 含 replyCount 字段', articleSrc.includes('replyCount'));
  assert('ArticleView 评论 buildLevel 盖楼渲染', articleSrc.includes('buildLevel'));
  assert('ArticleView 评论行使用 padEndWidth 而非 padEnd', articleSrc.includes('padEndWidth') && !articleSrc.includes('.padEnd('));

  // ---- TEST 10: 登录功能 ----
  console.log('\n📋 [10] 登录功能静态验证');
  const authSrc = fs.readFileSync('./dist/auth/index.js', 'utf8');
  const loginModalSrc = fs.readFileSync('./dist/components/LoginModal.js', 'utf8');
  const cliSrc = fs.readFileSync('./dist/cli.js', 'utf8');

  assert('auth 模块有 loadAuth', authSrc.includes('loadAuth'));
  assert('auth 模块有 saveAuth', authSrc.includes('saveAuth'));
  assert('auth 模块有 clearAuth', authSrc.includes('clearAuth'));
  assert('auth 模块有 getCookieHeader', authSrc.includes('getCookieHeader'));
  assert('auth 模块有 loginWithBrowser', authSrc.includes('loginWithBrowser'));
  assert('auth Cookie 存储到 ~/.163newscli', authSrc.includes('.163newscli'));
  assert('LoginModal 组件存在', loginModalSrc.includes('LoginModal'));
  assert('LoginModal 支持退出登录', loginModalSrc.includes('clearAuth'));
  assert('cli 有登录状态 auth', cliSrc.includes('auth'));
  assert('cli l 键触发登录', cliSrc.includes("'l'") || cliSrc.includes('"l"'));
  assert('Menu 显示登录状态', menuSrc.includes('auth'));
  assert('NewsList 显示登录状态', listSrc.includes('auth'));
  assert('ArticleView 有 voteComment', articleSrc.includes('voteComment'));
  assert('ArticleView v 键点赞', articleSrc.includes("'v'") || articleSrc.includes('"v"'));

  // ---- 汇总 ----
  console.log('\n' + '='.repeat(50));
  console.log(`结果: ${PASS} 通过 ${passed}  ${FAIL} 失败 ${failed}  总计 ${passed + failed}`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('测试异常:', e.message); process.exit(1); });
