const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { JSDOM } = require('jsdom');

const CONTENT = fs.readFileSync(path.resolve(__dirname, '../src/content.js'), 'utf8');
const HTML = `<!DOCTYPE html><html><body><p>Hello world, this is a test paragraph.</p><p>Another English paragraph here.</p></body></html>`;

function boot(settings, url) {
  const dom = new JSDOM(HTML, { url: url || 'https://example.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const sent = [];
  let listener = null;
  dom.window.chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener: (fn) => { listener = fn; } },
      sendMessage: (msg, cb) => {
        if (msg.type === 'DSX_TRANSLATE') {
          sent.push(msg.texts);
          setTimeout(() => cb({ ok: true, results: msg.texts.map(t => ({ text: '[译]' + t })) }), 5);
        }
        return Promise.resolve();
      }
    },
    storage: { local: { get: async () => JSON.parse(JSON.stringify(settings)) }, onChanged: { addListener: () => {} } }
  };
  vm.runInContext(CONTENT, dom.getInternalVMContext(), { filename: 'content.js' });
  return { dom, sent, cmd: (c) => new Promise(r => listener({ type: 'DSX_CMD', cmd: c }, {}, r)) };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, c, e) => results.push([n, !!c, e]);
const count = (d) => d.window.document.querySelectorAll('.dsx-translation').length;

(async () => {
  // 场景 1：默认设置（未指定 autoMode）-> 应当完全不翻译
  const base = { enabled: true, targetLang: '中文（简体）', onlyVisible: false, style: 'dashed' };
  const a = boot(Object.assign({}, base));
  await wait(350);
  check('默认不自动翻译：没有发出任何请求', a.sent.length === 0, '请求数 ' + a.sent.length);
  check('默认不自动翻译：页面没有被插入译文', count(a.dom) === 0, '译文节点 ' + count(a.dom));

  // 手动启用后才翻译
  const st = await a.cmd('on');
  await wait(350);
  check('手动启用后开始翻译', a.sent.length > 0 && count(a.dom) === 2, '请求 ' + a.sent.length + ' 译文 ' + count(a.dom));
  check('状态回报 active=true', st && st.active === true);
  const off = await a.cmd('off');
  check('再次点击恢复原文', off.active === false && count(a.dom) === 0);
  check('原文始终保留', a.dom.window.document.body.textContent.indexOf('Hello world, this is a test paragraph.') >= 0);

  // 场景 2：显式设为 all -> 自动翻译
  const b = boot(Object.assign({}, base, { autoMode: 'all' }));
  await wait(350);
  check('设为「全部网站」时自动翻译', b.sent.length > 0 && count(b.dom) === 2);

  // 场景 3：白名单模式，命中/未命中
  const c = boot(Object.assign({}, base, { autoMode: 'allowlist', allowlist: ['example.com'] }), 'https://news.example.com/x');
  await wait(350);
  check('白名单模式：子域名命中则自动翻译', c.sent.length > 0);
  const d = boot(Object.assign({}, base, { autoMode: 'allowlist', allowlist: ['other.com'] }));
  await wait(350);
  check('白名单模式：未命中不翻译', d.sent.length === 0);

  // 场景 4：全站模式 + 黑名单
  const e = boot(Object.assign({}, base, { autoMode: 'all', blocklist: ['example.com'] }));
  await wait(350);
  check('黑名单站点不自动翻译', e.sent.length === 0);

  let fail = 0;
  results.forEach(([n, ok, extra]) => { if (!ok) fail++; console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (ok ? '' : '  <- ' + extra)); });
  console.log('');
  console.log('启用模式测试: ' + (fail ? fail + ' 项失败' : '全部通过'));
  process.exit(fail ? 1 : 0);
})();
