const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const HTML = `<!DOCTYPE html><html><head><title>t</title></head><body>
<h1>Breaking News Today</h1>
<p>The quick brown fox jumps over the lazy dog.</p>
<p>这是一段已经是中文的内容，不应该被翻译。</p>
<div id="mixed">Leading text here.<p>Nested paragraph text.</p>Trailing text node.</div>
<ul><li>First <a href="#">item link</a> tail</li><li>Second item</li></ul>
<pre><code>const x = 1; // should not translate</code></pre>
<script>var noop = 'do not translate me';</script>
<div style="display:none">Hidden content should be skipped</div>
<p class="notranslate">Skip this one please</p>
<p>123 456 789</p>
<p>a</p>
<table><tr><td>Revenue</td><td>Growth rate</td></tr></table>
<blockquote>To be or not to be, that is the question.</blockquote>
<p>これは日本語のテキストです。翻訳が必要です。</p>
<p>이것은 한국어 문장입니다.</p>
<p>Bonjour le monde, ceci est un test en français.</p>
<p>Привет мир, это тест на русском языке.</p>
<p>混合 content with 中文 and English words here.</p>
<p>🎉🎉🎉</p>
</body></html>`;

const dom = new JSDOM(HTML, { url: 'https://example.com/article', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
const SETTINGS = { enabled: true, autoMode: 'all', allowlist: [], blocklist: [], targetLang: '中文（简体）', style: 'dashed', showLoading: true, batchSize: 12, batchChars: 2400, onlyVisible: false, fontScale: 100 };
const sentBatches = [];
let contentListener = null;
const chrome = {
  runtime: {
    lastError: null,
    onMessage: { addListener: (fn) => { contentListener = fn; } },
    sendMessage: (msg, cb) => {
      if (msg.type === 'DSX_TRANSLATE') {
        sentBatches.push(msg.texts);
        setTimeout(() => cb({ ok: true, results: msg.texts.map(t => ({ text: '[译]' + t })) }), 5);
        return undefined;
      }
      return Promise.resolve();
    }
  },
  storage: { local: { get: async () => JSON.parse(JSON.stringify(SETTINGS)) }, onChanged: { addListener: () => {} } }
};
window.chrome = chrome;
const code = fs.readFileSync(require('path').resolve(__dirname, '../src/content.js'), 'utf8');
vm.runInContext(code, dom.getInternalVMContext(), { filename: 'content.js' });

setTimeout(() => {
  const holders = [...window.document.querySelectorAll('.dsx-translation')];
  const all = sentBatches.flat();
  console.log('=== 送去翻译的段落 (' + all.length + ' 段) ===');
  all.forEach((t, i) => console.log('  ' + (i + 1) + '. ' + JSON.stringify(t)));
  console.log('');
  console.log('=== 译文注入位置 ===');
  holders.forEach(h => {
    const p = h.parentElement;
    const tag = p.tagName.toLowerCase() + (p.id ? '#' + p.id : '');
    console.log('  <' + tag + '> [' + (h.tagName === 'SPAN' ? 'inline' : 'block') + '] => ' + JSON.stringify(h.textContent));
  });
  console.log('');
  console.log('=== 关键检查 ===');
  const joined = all.join(' | ');
  const checks = [
    ['跳过纯中文段落', joined.indexOf('这是一段已经是中文') < 0],
    ['跳过 script 内容', joined.indexOf('do not translate me') < 0],
    ['跳过 pre/code 代码块', joined.indexOf('const x = 1') < 0],
    ['跳过 display:none 隐藏内容', joined.indexOf('Hidden content') < 0],
    ['跳过 .notranslate', joined.indexOf('Skip this one') < 0],
    ['跳过纯数字段落', joined.indexOf('123 456 789') < 0],
    ['跳过过短文本', all.indexOf('a') < 0],
    ['翻译 h1 标题', joined.indexOf('Breaking News Today') >= 0],
    ['翻译普通段落', joined.indexOf('The quick brown fox') >= 0],
    ['li 含行内链接合并成一段', joined.indexOf('First item link tail') >= 0],
    ['混合容器裸文本单独成段', joined.indexOf('Leading text here.') >= 0 && joined.indexOf('Nested paragraph text.') >= 0],
    ['表格单元格分别翻译', joined.indexOf('Revenue') >= 0 && joined.indexOf('Growth rate') >= 0],
    ['blockquote 被翻译', joined.indexOf('To be or not to be') >= 0],
    ['日语被翻译', joined.indexOf('これは日本語') >= 0],
    ['韩语被翻译', joined.indexOf('이것은 한국어') >= 0],
    ['法语被翻译', joined.indexOf('Bonjour le monde') >= 0],
    ['俄语被翻译', joined.indexOf('Привет мир') >= 0],
    ['中英混排被翻译', joined.indexOf('混合 content with') >= 0],
    ['纯 emoji 被跳过', joined.indexOf('🎉') < 0],
    ['原文完整保留', window.document.body.textContent.indexOf('The quick brown fox jumps over the lazy dog.') >= 0],
    ['译文已插入 DOM', holders.length > 0 && holders.every(h => h.textContent.indexOf('[译]') === 0)]
  ];
  let fail = 0;
  checks.forEach(c => { if (!c[1]) fail++; console.log((c[1] ? '  PASS  ' : '  FAIL  ') + c[0]); });
  contentListener({ type: 'DSX_CMD', cmd: 'off' }, {}, () => {});
  const left = window.document.querySelectorAll('.dsx-translation, [data-dsx-state]').length;
  console.log((left === 0 ? '  PASS  ' : '  FAIL  ') + '恢复原文后无残留节点 (剩余 ' + left + ')');
  console.log('');
  console.log('结果: ' + (fail === 0 && left === 0 ? '全部通过' : fail + ' 项失败'));
  process.exit(fail === 0 && left === 0 ? 0 : 1);
}, 400);
