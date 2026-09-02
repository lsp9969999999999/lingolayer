const fs = require('fs');
const vm = require('vm');

const store = { apiKey: 'sk-test', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', targetLang: '中文（简体）', cacheEnabled: true, concurrency: 3 };
let listeners = [];
const calls = [];
let scenario = 'ok';
let attempt = 0;

function makeResp(content) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
}

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval, JSON, Math, Date, Object, Array, String, Number, Boolean, Error, Promise, AbortController, URL,
  fetch: async (url, opts) => {
    calls.push({ url, opts });
    const body = JSON.parse(opts.body);
    if (body.messages[0].content.includes('shopping-page analyst')) {
      return makeResp(JSON.stringify({ summary: 'Compact headphones for travel.', price: '$39.99', delivery: 'Free delivery', returns: '30-day returns', highlights: ['Noise cancelling'] }));
    }
    const payload = JSON.parse(body.messages[1].content.slice(body.messages[1].content.indexOf('\n') + 1) || '{}');
    if (scenario === 'ok') {
      const out = {};
      Object.keys(payload).forEach(k => { out[k] = '译文-' + payload[k]; });
      return makeResp(JSON.stringify(out));
    }
    if (scenario === 'fenced') {
      const out = {};
      Object.keys(payload).forEach(k => { out[k] = '译文-' + payload[k]; });
      return makeResp('```json' + String.fromCharCode(10) + JSON.stringify(out) + String.fromCharCode(10) + '```');
    }
    if (scenario === 'retry429') {
      attempt++;
      if (attempt === 1) return { ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }), text: async () => 'rate limited' };
      const out = {}; Object.keys(payload).forEach(k => { out[k] = '译文-' + payload[k]; });
      return makeResp(JSON.stringify(out));
    }
    if (scenario === 'badjson') {
      // 整批返回坏数据，单条请求返回正常 -> 触发逐条降级
      if (Object.keys(payload).length > 1) return makeResp('这不是 JSON');
      const out = {}; Object.keys(payload).forEach(k => { out[k] = '单条-' + payload[k]; });
      return makeResp(JSON.stringify(out));
    }
    if (scenario === 'auth') {
      return { ok: false, status: 401, json: async () => ({ error: { message: 'Authentication Fails' } }), text: async () => 'auth' };
    }
    return makeResp('{}');
  },
  chrome: {
    runtime: {
      onMessage: { addListener: (fn) => listeners.push(fn) },
      onInstalled: { addListener: () => {} },
      openOptionsPage: () => {}
    },
    storage: { local: {
      get: async (keys) => { const o = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) o[k] = store[k]; }); return o; },
      set: async (obj) => { Object.assign(store, obj); },
      remove: async (k) => { delete store[k]; }
    } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    contextMenus: { removeAll: (cb) => cb && cb(), create: () => {}, onClicked: { addListener: () => {} } },
    commands: { onCommand: { addListener: () => {} } },
    tabs: { query: async () => [], sendMessage: async () => {}, onRemoved: { addListener: () => {} } }
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require('path').resolve(__dirname, '../src/background.js'), 'utf8'), sandbox, { filename: 'background.js' });

function ask(msg, sender) {
  return new Promise((resolve) => {
    let done = false;
    for (const fn of listeners) {
      const r = fn(msg, sender || {}, (resp) => { if (!done) { done = true; resolve(resp); } });
      if (r === true) return;
    }
  });
}

const results = [];
function check(name, cond, extra) { results.push([name, !!cond, extra]); }

(async () => {
  let r = await ask({ type: 'DSX_TRANSLATE', texts: ['Hello world', 'Good morning'] });
  check('正常批量翻译返回 2 条', r.ok && r.results.length === 2);
  check('译文内容正确', r.results[0].text === '译文-Hello world' && r.results[1].text === '译文-Good morning', JSON.stringify(r.results));
  check('请求地址正确', calls[0].url === 'https://api.deepseek.com/chat/completions', calls[0].url);
  check('携带 Authorization 头', calls[0].opts.headers.Authorization === 'Bearer sk-test');
  const body0 = JSON.parse(calls[0].opts.body);
  check('使用 json 输出模式', body0.response_format && body0.response_format.type === 'json_object');
  check('模型参数正确', body0.model === 'deepseek-v4-flash', body0.model);
  check('默认关闭深度思考模式', body0.thinking && body0.thinking.type === 'disabled', JSON.stringify(body0.thinking));
  check('非思考模式下传 temperature', typeof body0.temperature === 'number');
  check('设置了 max_tokens 防止截断', body0.max_tokens >= 1024, String(body0.max_tokens));
  check('系统提示含 JSON 示例', /Example output/.test(body0.messages[0].content));
  check('单次请求合并为一次调用', calls.length === 1, '调用次数 ' + calls.length);

  const before = calls.length;
  r = await ask({ type: 'DSX_TRANSLATE', texts: ['Hello world'] });
  check('命中缓存不再发请求', calls.length === before && r.results[0].text === '译文-Hello world');

  store.siteGlossaries = [{ domain: 'shop.example.com', source: 'Add to cart', target: '加入购物车' }];
  const glossaryCalls = calls.length;
  r = await ask({ type: 'DSX_TRANSLATE', texts: ['Add to cart'] }, { tab: { url: 'https://shop.example.com/product/1' } });
  check('站点词表精确匹配无需调用 API', calls.length === glossaryCalls && r.results[0].text === '加入购物车', JSON.stringify(r.results));
  r = await ask({ type: 'DSX_TRANSLATE', texts: ['Add to cart details'] }, { tab: { url: 'https://shop.example.com/product/1' } });
  const glossaryBody = JSON.parse(calls[calls.length - 1].opts.body);
  check('站点词表会写入模型规则', glossaryBody.messages[0].content.includes('Add to cart => 加入购物车'));
  store.siteGlossaries = [];
  r = await ask({ type: 'DSX_TRANSLATE', texts: ['Natural wording case'], feedback: 'natural' });
  const naturalBody = JSON.parse(calls[calls.length - 1].opts.body);
  check('自然化反馈会写入模型规则', naturalBody.messages[0].content.includes('shopper-friendly wording'));

  scenario = 'fenced';
  r = await ask({ type: 'DSX_TRANSLATE', texts: ['Fenced case'] });
  check('能解析 ``` 包裹的 JSON', r.ok && r.results[0].text === '译文-Fenced case', JSON.stringify(r.results));

  scenario = 'retry429';
  r = await ask({ type: 'DSX_TRANSLATE', texts: ['Rate limited case'] });
  check('429 后自动重试成功', r.ok && r.results[0].text === '译文-Rate limited case', JSON.stringify(r.results));

  scenario = 'badjson';
  r = await ask({ type: 'DSX_TRANSLATE', texts: ['Alpha one', 'Beta two'] });
  check('整批解析失败后逐条降级成功', r.ok && r.results[0].text === '单条-Alpha one' && r.results[1].text === '单条-Beta two', JSON.stringify(r.results));

  scenario = 'auth';
  r = await ask({ type: 'DSX_TRANSLATE', texts: ['Auth failure case'] });
  check('401 立即返回错误不重试', !r.ok && /401/.test(r.message || ''), JSON.stringify(r));

  const savedKey = store.apiKey; store.apiKey = '';
  r = await ask({ type: 'DSX_TRANSLATE', texts: ['No key'] });
  check('缺少 API Key 时给出明确错误', !r.ok && r.error === 'NO_API_KEY', JSON.stringify(r));
  store.apiKey = savedKey;

  store.endpoint = 'https://api.deepseek.com/v1'; scenario = 'ok';
  const n = calls.length;
  await ask({ type: 'DSX_TRANSLATE', texts: ['Endpoint variant test'] });
  check('用户填写 /v1 结尾也兼容', calls[n].url === 'https://api.deepseek.com/v1/chat/completions', calls[n].url);

  store.thinkingMode = true; store.endpoint = 'https://api.deepseek.com';
  const m = calls.length;
  await ask({ type: 'DSX_TRANSLATE', texts: ['Thinking mode enabled case'] });
  const bodyT = JSON.parse(calls[m].opts.body);
  check('开启思考模式时下发 enabled 且不带 temperature', bodyT.thinking.type === 'enabled' && bodyT.temperature === undefined, JSON.stringify(bodyT.thinking));
  store.thinkingMode = false;

  r = await ask({ type: 'DSX_SHOPPING_SUMMARY', pageText: 'Wireless headphones $39.99. Free delivery. 30-day returns.' });
  check('购物摘要返回结构化信息', r.ok && r.summary.price === '$39.99' && r.summary.highlights[0] === 'Noise cancelling', JSON.stringify(r));

  let fail = 0;
  results.forEach(([name, ok, extra]) => { if (!ok) fail++; console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (ok ? '' : '  <- ' + extra)); });
  console.log('');
  console.log('后台逻辑测试: ' + (fail ? fail + ' 项失败' : '全部通过'));
  process.exit(fail ? 1 : 0);
})();
