const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const CONTENT = fs.readFileSync(path.resolve(__dirname, '../src/content.js'), 'utf8');

function boot(settings) {
  const dom = new JSDOM(`<!doctype html><body>
    <nav><a href="/women">Women's fashion</a><button>New arrivals</button></nav>
    <div class="card"><span>Wireless headphones</span><span>$39.99</span></div>
  </body>`, { url: 'https://shop.example.com', pretendToBeVisual: true, runScripts: 'outside-only' });
  let listener = null;
  dom.window.chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener: (fn) => { listener = fn; } },
      sendMessage: (message, callback) => {
        if (message.type === 'DSX_TRANSLATE') {
          setTimeout(() => callback({ ok: true, results: message.texts.map((text) => ({ text: '[translated] ' + text })) }), 5);
        }
        return Promise.resolve();
      }
    },
    storage: { local: { get: async () => settings }, onChanged: { addListener: () => {} } }
  };
  vm.runInContext(CONTENT, dom.getInternalVMContext(), { filename: 'content.js' });
  return { dom, command: (cmd, extra) => new Promise((resolve) => listener(Object.assign({ type: 'DSX_CMD', cmd }, extra || {}), {}, resolve)) };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  const app = boot({
    enabled: true,
    autoMode: 'all',
    targetLang: 'Chinese (Simplified)',
    replaceModeSites: [],
    onlyVisible: false,
    skipCode: true
  });
  await wait(250);

  const document = app.dom.window.document;
  const checks = [
    ['bilingual mode starts with inserted translations', document.querySelectorAll('.dsx-translation').length > 0]
  ];
  await app.command('restart', { settings: { replaceModeSites: ['example.com'] } });
  await wait(250);
  checks.push(
    ['menu link is translated', document.querySelector('a').textContent === '[translated] Women\'s fashion'],
    ['menu button is translated', document.querySelector('button').textContent === '[translated] New arrivals'],
    ['product label is translated', document.querySelector('.card span').textContent === '[translated] Wireless headphones'],
    ['price remains unchanged', document.querySelectorAll('.card span')[1].textContent === '$39.99'],
    ['no bilingual holder is added', document.querySelectorAll('.dsx-translation').length === 0]
  );

  await app.command('off');
  checks.push(['restore returns original link text', document.querySelector('a').textContent === "Women's fashion"]);
  checks.push(['restore returns original button text', document.querySelector('button').textContent === 'New arrivals']);

  const failures = checks.filter(([, ok]) => !ok);
  checks.forEach(([name, ok]) => console.log((ok ? '  PASS  ' : '  FAIL  ') + name));
  console.log('\nReplace mode test: ' + (failures.length ? failures.length + ' failures' : 'all passed'));
  process.exit(failures.length ? 1 : 0);
})();
