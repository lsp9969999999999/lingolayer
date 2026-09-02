const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const CONTENT = fs.readFileSync(path.resolve(__dirname, '../src/content.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body>
  <p id="outside">This introduction must remain untranslated.</p>
  <article class="product-card"><h2 id="product">Wireless headphones</h2><p>Noise cancelling audio.</p><span>$39.99</span></article>
</body>`, { url: 'https://shop.example.com', pretendToBeVisual: true, runScripts: 'outside-only' });

let listener = null;
const sent = [];
dom.window.chrome = {
  runtime: {
    lastError: null,
    onMessage: { addListener: (fn) => { listener = fn; } },
    sendMessage: (message, callback) => {
      if (message.type === 'DSX_TRANSLATE') {
        sent.push(...message.texts);
        setTimeout(() => callback({ ok: true, results: message.texts.map((text) => ({ text: '[translated] ' + text })) }), 5);
      }
      return Promise.resolve();
    }
  },
  storage: { local: { get: async () => ({ enabled: true, autoMode: 'off', onlyVisible: false, targetLang: 'Chinese (Simplified)' }) }, onChanged: { addListener: () => {} } }
};
vm.runInContext(CONTENT, dom.getInternalVMContext(), { filename: 'content.js' });

const command = (cmd) => new Promise((resolve) => listener({ type: 'DSX_CMD', cmd }, {}, resolve));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  const checks = [];
  await wait(30);
  const selected = await command('selectRegion');
  checks.push(['region picker starts', selected.selectingRegion === true]);

  const product = dom.window.document.getElementById('product');
  product.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true }));
  checks.push(['product title receives picker outline before its container', product.classList.contains('dsx-region-candidate')]);
  product.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(250);

  checks.push(['only selected product region is sent', sent.length > 0 && !sent.some((text) => text.includes('This introduction'))]);
  checks.push(['outside content has no translation', dom.window.document.getElementById('outside').querySelector('.dsx-translation') === null]);
  checks.push(['selected title has a translation', product.querySelector('.dsx-translation') !== null]);

  const failures = checks.filter(([, ok]) => !ok);
  checks.forEach(([name, ok]) => console.log((ok ? '  PASS  ' : '  FAIL  ') + name));
  console.log('\nArea mode test: ' + (failures.length ? failures.length + ' failures' : 'all passed'));
  process.exit(failures.length ? 1 : 0);
})();
