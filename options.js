'use strict';

const DEFAULTS = {
  apiKey: '', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', thinkingMode: false,
  targetLang: '中文（简体）', autoMode: 'off', allowlist: [], blocklist: [],
  style: 'dashed', showLoading: true, batchSize: 10, batchChars: 2000,
  concurrency: 5, onlyVisible: true, cacheEnabled: true, fontScale: 92, skipCode: true
};

const $ = (id) => document.getElementById(id);
const TEXTS = ['apiKey', 'endpoint', 'model', 'targetLang', 'autoMode', 'style'];
const CHECKS = ['showLoading', 'onlyVisible', 'cacheEnabled', 'thinkingMode', 'skipCode'];
const RANGES = ['batchSize', 'batchChars', 'concurrency', 'fontScale'];

function linesToList(v) {
  return String(v || '')
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
}

function syncRangeLabels() {
  for (const id of RANGES) {
    const lbl = $(id + 'Val');
    if (lbl) lbl.textContent = $(id).value;
  }
  const pv = $('preview');
  pv.className = 'pv-dst ' + $('style').value;
  pv.style.fontSize = $('fontScale').value + '%';
}

async function load() {
  const s = Object.assign({}, DEFAULTS, await chrome.storage.local.get(Object.keys(DEFAULTS)));
  for (const id of TEXTS) $(id).value = s[id];
  for (const id of CHECKS) $(id).checked = !!s[id];
  for (const id of RANGES) $(id).value = s[id];
  $('allowlist').value = (s.allowlist || []).join('\n');
  $('blocklist').value = (s.blocklist || []).join('\n');
  syncRangeLabels();
  refreshCacheInfo();
}

async function save() {
  const patch = {};
  for (const id of TEXTS) patch[id] = $(id).value.trim();
  for (const id of CHECKS) patch[id] = $(id).checked;
  for (const id of RANGES) patch[id] = Number($(id).value);
  patch.allowlist = linesToList($('allowlist').value);
  patch.blocklist = linesToList($('blocklist').value);
  if (patch.endpoint === '') patch.endpoint = DEFAULTS.endpoint;
  await chrome.storage.local.set(patch);
  flash($('saveResult'), '已保存 ✓', 'ok');
}

function flash(el, msg, cls) {
  el.textContent = msg;
  el.className = 'result ' + (cls || '');
  setTimeout(() => { el.textContent = ''; el.className = 'result'; }, 3000);
}

async function refreshCacheInfo() {
  chrome.runtime.sendMessage({ type: 'DSX_CACHE_INFO' }, (r) => {
    if (chrome.runtime.lastError || !r) return;
    $('cacheInfo').textContent = '当前缓存 ' + r.size + ' 条';
  });
}

$('save').addEventListener('click', save);

$('eye').addEventListener('click', () => {
  const el = $('apiKey');
  const show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  $('eye').textContent = show ? '隐藏' : '显示';
});

$('test').addEventListener('click', async () => {
  const res = $('testResult');
  res.textContent = '测试中…';
  res.className = 'result';
  await save();
  chrome.runtime.sendMessage({
    type: 'DSX_TEST',
    override: {
      apiKey: $('apiKey').value.trim(),
      endpoint: $('endpoint').value.trim() || DEFAULTS.endpoint,
      model: $('model').value,
      targetLang: $('targetLang').value,
      thinkingMode: $('thinkingMode').checked
    }
  }, (r) => {
    if (chrome.runtime.lastError) {
      flash(res, '失败：' + chrome.runtime.lastError.message, 'err');
      return;
    }
    if (r && r.ok) flash(res, '连接成功，译文示例：' + r.message, 'ok');
    else flash(res, '失败：' + ((r && r.message) || '未知错误'), 'err');
  });
});

$('clearCache').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'DSX_CLEAR_CACHE' }, () => {
    flash($('cacheInfo'), '缓存已清空', 'ok');
    setTimeout(refreshCacheInfo, 1200);
  });
});

for (const id of RANGES.concat(['style'])) {
  $(id).addEventListener('input', syncRangeLabels);
}

load();
