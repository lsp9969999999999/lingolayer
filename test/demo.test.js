const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.resolve(__dirname, '../src');
const html = fs.readFileSync(path.join(SRC, 'demo.html'), 'utf8');
const results = [];
const check = (n, c, e) => results.push([n, !!c, e]);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // 静态完整性：demo.js 里用到的元素必须都存在于 demo.html
  const demoJs = fs.readFileSync(path.join(SRC, 'demo.js'), 'utf8');
  const ids = [...html.matchAll(/id="([\w]+)"/g)].map(m => m[1]);
  const used = [...demoJs.matchAll(/\$\('([\w]+)'\)/g)].map(m => m[1]);
  const missing = [...new Set(used)].filter(u => ids.indexOf(u) < 0);
  check('demo.js 引用的元素都存在', missing.length === 0, missing.join(','));
  ['content.css', 'demo.css', 'content.js', 'demo.js'].forEach(f => {
    check('demo.html 正确引用 ' + f, html.indexOf(f) >= 0);
    check(f + ' 文件存在', fs.existsSync(path.join(SRC, f)));
  });

  // 端到端：加载演示页，点击「翻译本页」
  const dom = new JSDOM(html, { url: 'chrome-extension://abc/src/demo.html', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  const sent = [];
  const store = { apiKey: 'sk-demo', enabled: true, autoMode: 'off', targetLang: '中文（简体）', style: 'dashed', fontScale: 92, onlyVisible: false, skipCode: true, showLoading: true };
  win.chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener: () => {} },
      openOptionsPage: () => {},
      getURL: (p) => 'chrome-extension://abc/' + p,
      sendMessage: (msg, cb) => {
        if (msg.type === 'DSX_TRANSLATE') {
          sent.push(...msg.texts);
          setTimeout(() => cb({ ok: true, results: msg.texts.map(t => ({ text: '[译]' + t })) }), 5);
        }
        return Promise.resolve();
      }
    },
    storage: {
      local: {
        get: async (keys) => { const o = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) o[k] = store[k]; }); return o; },
        set: async (o) => Object.assign(store, o)
      },
      onChanged: { addListener: () => {} }
    }
  };
  const ctx = dom.getInternalVMContext();
  vm.runInContext(fs.readFileSync(path.join(SRC, 'content.js'), 'utf8'), ctx, { filename: 'content.js' });
  vm.runInContext(demoJs, ctx, { filename: 'demo.js' });
  await wait(120);

  check('演示页加载后未自动翻译（默认手动）', sent.length === 0, JSON.stringify(sent.slice(0, 2)));
  check('API key status is rendered', /API key is set/.test(win.document.getElementById('keyStatus').textContent));

  win.document.getElementById('btnTranslate').click();
  await wait(400);
  const got = sent.join(' || ');
  const has = (s) => got.indexOf(s) >= 0;

  check('点击后开始翻译示例正文', has('The Quiet Revolution in Everyday Software'));
  check('英文段落被翻译', has('For most of the past decade'));
  check('法语段落被翻译', has('La lecture bilingue'));
  check('日语段落被翻译', has('この拡張機能は'));
  check('引用块被翻译', has('The best interface'));
  check('中文段落被跳过', !has('这一段本来就是中文'));
  check('代码块被跳过', !has('export function createTranslator'));
  check('npm 命令被跳过', !has('npm install lingolayer'));
  check('docker 命令被跳过', !has('docker run'));
  check('文件名 README.md 被跳过', !has('README.md'));
  check('文件名 src/index.ts 被跳过', !has('src/index.ts'));
  check('标识符行被跳过', !has('MAX_RETRY_COUNT'));
  check('表格说明列仍被翻译', has('Project overview and installation'));
  check('guide text is not translated', !has('Get started in three steps'));

  const holders = win.document.querySelectorAll('.dsx-translation');
  check('译文已内嵌到页面', holders.length > 0, '节点数 ' + holders.length);
  check('译文字号为 92%', holders[0] && holders[0].style.fontSize === '92%');
  check('原文完整保留', win.document.body.textContent.indexOf('For most of the past decade') >= 0);
  check('step 2 is marked complete', win.document.getElementById('step2').classList.contains('done'));

  win.document.getElementById('btnRestore').click();
  await wait(50);
  check('恢复原文后无残留译文', win.document.querySelectorAll('.dsx-translation').length === 0);

  let fail = 0;
  results.forEach(([n, ok, extra]) => { if (!ok) fail++; console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (ok ? '' : '  <- ' + extra)); });
  console.log('');
  console.log('演示页测试: ' + (fail ? fail + ' 项失败' : '全部通过'));
  process.exit(fail ? 1 : 0);
})();
