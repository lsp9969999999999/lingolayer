const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const CONTENT = fs.readFileSync(path.resolve(__dirname, '../src/content.js'), 'utf8');
const settings = { enabled: true, autoMode: 'all', onlyVisible: false, targetLang: 'Chinese (Simplified)', skippedTexts: [] };
const dom = new JSDOM('<!doctype html><body><p>Free shipping on all orders.</p></body>', { url: 'https://shop.example.com', pretendToBeVisual: true, runScripts: 'outside-only' });
const requests = [];
let listener = null;

dom.window.chrome = {
  runtime: {
    lastError: null,
    onMessage: { addListener: (fn) => { listener = fn; } },
    sendMessage: (message, callback) => {
      if (message.type === 'DSX_TRANSLATE') {
        requests.push(message);
        setTimeout(() => callback({ ok: true, results: message.texts.map((text) => ({ text: (message.feedback === 'natural' ? '[natural] ' : '[translated] ') + text })) }), 5);
      }
      return Promise.resolve();
    }
  },
  storage: {
    local: {
      get: async () => settings,
      set: async (patch) => Object.assign(settings, patch)
    },
    onChanged: { addListener: () => {} }
  }
};
vm.runInContext(CONTENT, dom.getInternalVMContext(), { filename: 'content.js' });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  await wait(250);
  const document = dom.window.document;
  const holder = document.querySelector('.dsx-translation');
  const checks = [['initial translation is rendered', !!holder]];

  holder.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  checks.push(['feedback card appears on double click', !!document.querySelector('.dsx-feedback-card')]);
  document.querySelector('[data-action="natural"]').click();
  await wait(120);
  checks.push(['natural feedback sends a refinement request', requests.some((request) => request.feedback === 'natural')]);
  checks.push(['natural feedback updates the translation', holder.textContent.startsWith('[natural] ')]);

  holder.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  document.querySelector('[data-action="skip"]').click();
  await wait(30);
  checks.push(['skip feedback removes the current translation', document.querySelector('.dsx-translation') === null]);
  checks.push(['skip feedback persists the source text', settings.skippedTexts.includes('Free shipping on all orders.')]);

  const failures = checks.filter(([, ok]) => !ok);
  checks.forEach(([name, ok]) => console.log((ok ? '  PASS  ' : '  FAIL  ') + name));
  console.log('\nFeedback test: ' + (failures.length ? failures.length + ' failures' : 'all passed'));
  process.exit(failures.length ? 1 : 0);
})();
