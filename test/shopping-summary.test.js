const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const CONTENT = fs.readFileSync(path.resolve(__dirname, '../src/content.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body>
  <h1>Wireless headphones</h1><div class="product-card"><span class="price">$39.99</span><p class="shipping">Free delivery tomorrow</p><p class="returns">30-day returns</p></div>
</body>`, { url: 'https://shop.example.com', pretendToBeVisual: true, runScripts: 'outside-only' });
let listener = null;
let summaryRequests = 0;
dom.window.chrome = {
  runtime: {
    lastError: null,
    onMessage: { addListener: (fn) => { listener = fn; } },
    sendMessage: (message, callback) => {
      if (message.type === 'DSX_SHOPPING_SUMMARY') {
        summaryRequests++;
        setTimeout(() => callback({ ok: true, summary: { summary: 'Travel-ready headphones.', price: '$39.99', delivery: 'Free delivery tomorrow', returns: '30-day returns', highlights: ['Noise cancelling'] } }), 5);
      }
      return Promise.resolve();
    }
  },
  storage: { local: { get: async () => ({ enabled: true, autoMode: 'off' }) }, onChanged: { addListener: () => {} } }
};
vm.runInContext(CONTENT, dom.getInternalVMContext(), { filename: 'content.js' });
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  await wait(30);
  const checks = [['summary does not run automatically', summaryRequests === 0]];
  await new Promise((resolve) => listener({ type: 'DSX_CMD', cmd: 'summarizeShopping' }, {}, resolve));
  checks.push(['summary loading card appears immediately', dom.window.document.querySelector('.dsx-shopping-card')?.textContent.includes('Creating your shopping summary')]);
  await wait(50);
  const card = dom.window.document.querySelector('.dsx-shopping-card');
  checks.push(['summary request contains shopping page content', summaryRequests === 1]);
  checks.push(['summary card is rendered', !!card && card.textContent.includes('$39.99') && card.textContent.includes('Noise cancelling')]);
  card.querySelector('button').click();
  checks.push(['summary card can close', dom.window.document.querySelector('.dsx-shopping-card') === null]);
  const failures = checks.filter(([, ok]) => !ok);
  checks.forEach(([name, ok]) => console.log((ok ? '  PASS  ' : '  FAIL  ') + name));
  console.log('\nShopping summary test: ' + (failures.length ? failures.length + ' failures' : 'all passed'));
  process.exit(failures.length ? 1 : 0);
})();
