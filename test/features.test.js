const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { JSDOM } = require('jsdom');

const CONTENT = fs.readFileSync(path.resolve(__dirname, '../src/content.js'), 'utf8');

function boot(html, settings, delayMs) {
  const dom = new JSDOM(html, { url: 'https://github.com/acme/repo', pretendToBeVisual: true, runScripts: 'outside-only' });
  const sent = [];
  let listener = null;
  dom.window.chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener: (fn) => { listener = fn; } },
      sendMessage: (msg, cb) => {
        if (msg.type === 'DSX_TRANSLATE') {
          sent.push(...msg.texts);
          setTimeout(() => cb({ ok: true, results: msg.texts.map(t => ({ text: '[译]' + t })) }), delayMs === undefined ? 5 : delayMs);
        }
        return Promise.resolve();
      }
    },
    storage: { local: { get: async () => JSON.parse(JSON.stringify(settings)) }, onChanged: { addListener: () => {} } }
  };
  vm.runInContext(CONTENT, dom.getInternalVMContext(), { filename: 'content.js' });
  return { dom, sent, cmd: (c, extra) => new Promise(r => listener(Object.assign({ type: 'DSX_CMD', cmd: c }, extra || {}), {}, r)) };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, c, e) => results.push([n, !!c, e]);
const BASE = { enabled: true, autoMode: 'all', targetLang: '中文（简体）', onlyVisible: false, style: 'dashed', skipCode: true, fontScale: 92, showLoading: true };

(async () => {
  // ---------- 组 1：技术文档 / 代码仓库场景 ----------
  const html = `<!DOCTYPE html><html><body>
    <h1>Getting Started Guide</h1>
    <p>Install the package before you continue.</p>
    <p style='font-family: Menlo, monospace'>npm install --save-dev webpack</p>
    <div class='highlight'><span>export default function App() { return null; }</span></div>
    <div class='code-block'><span>const server = http.createServer(handler);</span></div>
    <p>$ git clone https://github.com/acme/repo.git</p>
    <p>docker run -p 8080:80 nginx</p>
    <table><tr><td>README.md</td><td>Project documentation and setup notes</td></tr>
    <tr><td>src</td><td>Application source code</td></tr>
    <tr><td>package.json</td><td>Dependency manifest</td></tr></table>
    <p>getUserProfile</p>
    <p>MAX_RETRY_COUNT</p>
    <p>--verbose</p>
    <p>v2.14.0</p>
    <p>Use the config file to change this behaviour.</p>
    <p role='code'>SELECT * FROM users WHERE id = 1;</p>
  </body></html>`;

  const a = boot(html, BASE);
  await wait(400);
  const got = a.sent.join(' || ');
  const has = (s) => got.indexOf(s) >= 0;

  check('等宽字体的命令行被跳过', !has('npm install'), got);
  check('.highlight 代码容器被跳过', !has('export default function'));
  check('.code-block 代码容器被跳过', !has('const server ='));
  check('$ 开头的命令被跳过', !has('git clone'));
  check('docker 命令被跳过', !has('docker run'));
  check('文件名 README.md 被跳过', !has('README.md'));
  check('文件名 package.json 被跳过', !has('package.json'));
  check('目录名 src 被跳过', a.sent.indexOf('src') < 0);
  check('camelCase 标识符被跳过', !has('getUserProfile'));
  check('CONST_CASE 常量被跳过', !has('MAX_RETRY_COUNT'));
  check('命令行参数 --verbose 被跳过', !has('--verbose'));
  check('版本号 v2.14.0 被跳过', !has('v2.14.0'));
  check('role=code 的 SQL 被跳过', !has('SELECT * FROM'));
  check('正文标题仍被翻译', has('Getting Started Guide'));
  check('正文说明仍被翻译', has('Install the package before you continue.'));
  check('表格里的说明文字仍被翻译', has('Project documentation and setup notes'));
  check('含 config 一词的正常句子仍被翻译', has('Use the config file'));

  const b = boot(html, Object.assign({}, BASE, { skipCode: false }));
  await wait(400);
  check('关闭开关后代码会被送翻译（开关确实生效）', b.sent.join(' || ').indexOf('npm install') >= 0);

  // ---------- 组 2：加载态视觉 ----------
  const slow = `<!DOCTYPE html><html><body><p>A paragraph waiting for the network.</p></body></html>`;
  const c = boot(slow, BASE, 400);   // 模拟慢接口，观察加载态
  await wait(80);
  check('首批请求立即发出（不等合批延迟）', c.sent.length > 0, '已发出 ' + c.sent.length);
  const holder = c.dom.window.document.querySelector('.dsx-translation');
  check('等待时不显示任何占位文字', holder && holder.textContent === '', JSON.stringify(holder && holder.textContent));
  check('等待时只挂占位条样式类', holder && holder.classList.contains('dsx-loading'));
  await wait(500);
  check('返回后显示译文并带淡入类', holder.textContent.indexOf('[译]') === 0 && holder.classList.contains('dsx-done'));
  check('译文字号为 92% 小一号', holder.style.fontSize === '92%', holder.style.fontSize);

  // ---------- 组 3：划词翻译 ----------
  const page = `<!DOCTYPE html><html><body><p>First paragraph of the page.</p><p>Second paragraph of the page.</p></body></html>`;
  const d = boot(page, Object.assign({}, BASE, { autoMode: 'off' }));
  await wait(200);
  check('划词前整页未被翻译', d.sent.length === 0);
  // 构造真实选区，落在第二段中间
  const doc = d.dom.window.document;
  const p2 = doc.querySelectorAll('p')[1];
  const range = doc.createRange();
  range.selectNodeContents(p2);
  const expected = 'Second paragraph of the page.';
  const sel = d.dom.window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  await d.cmd('translateSelection');
  await wait(300);
  check('没有浮窗（已改为内嵌）', d.dom.window.document.querySelector('.dsx-panel') === null);
  const holders = d.dom.window.document.querySelectorAll('.dsx-translation');
  check('译文以内嵌方式插入页面', holders.length === 1, '节点数 ' + holders.length);
  const h = holders[0];
  check('译文内容正确', h && h.textContent === '[译]' + expected, h && h.textContent);
  check('译文带划词标记类', h && h.classList.contains('dsx-selection'));
  check('译文插在选中文字所在段落内（下方）', h && h.parentElement.tagName === 'P' && h.previousSibling !== null, h && h.parentElement.tagName);
  check('与整页翻译同样的样式类', h && h.classList.contains('dsx-translation') && h.classList.contains('dsx-style-dashed'));
  check('原文完整保留', d.dom.window.document.body.textContent.indexOf('First paragraph of the page.') >= 0);
  check('只翻译选中内容，未触发整页', d.sent.length === 1 && d.sent[0] === expected, JSON.stringify(d.sent));
  check('其他段落未被翻译', d.dom.window.document.querySelectorAll('.dsx-translation').length === 1);

  // 同一段落再次划词：替换而不是堆叠
  await d.cmd('translateSelection', { text: 'Another selected sentence.' });
  await wait(300);
  check('同段落重复划词不会堆叠译文', d.dom.window.document.querySelectorAll('.dsx-translation').length === 1);

  // 恢复原文应清除划词译文
  await d.cmd('off');
  check('恢复原文会清除划词译文', d.dom.window.document.querySelectorAll('.dsx-translation').length === 0);

  let fail = 0;
  results.forEach(([n, ok, extra]) => { if (!ok) fail++; console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (ok ? '' : '  <- ' + extra)); });
  console.log('');
  console.log('智能跳过 / 视觉 / 划词测试: ' + (fail ? fail + ' 项失败' : '全部通过'));
  process.exit(fail ? 1 : 0);
})();