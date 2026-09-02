'use strict';

const DEFAULTS = {
  apiKey: '', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', thinkingMode: false,
  targetLang: 'Chinese (Simplified)', customTargetLang: '', autoMode: 'off', allowlist: [], blocklist: [], replaceModeSites: [],
  siteGlossaries: [],
  style: 'dashed', showLoading: true, batchSize: 10, batchChars: 2000,
  concurrency: 5, onlyVisible: true, cacheEnabled: true, fontScale: 92, skipCode: true
};

const $ = (id) => document.getElementById(id);
const TEXTS = ['apiKey', 'endpoint', 'model', 'targetLang', 'customTargetLang', 'autoMode', 'style'];
const CHECKS = ['showLoading', 'onlyVisible', 'cacheEnabled', 'thinkingMode', 'skipCode'];
const RANGES = ['batchSize', 'batchChars', 'concurrency', 'fontScale'];

function linesToList(v) {
  return String(v || '')
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
}

function parseGlossaries(value) {
  return String(value || '').split('\n').map((line) => {
    const [domainPart, rulePart] = line.split('|', 2);
    const equals = (rulePart || '').indexOf('=');
    if (equals < 1) return null;
    const domain = domainPart.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const source = rulePart.slice(0, equals).trim();
    const target = rulePart.slice(equals + 1).trim();
    return domain && source && target ? { domain, source, target } : null;
  }).filter(Boolean);
}

function formatGlossaries(entries) {
  return (entries || []).map((entry) => entry.domain + ' | ' + entry.source + ' = ' + entry.target).join('\n');
}

function normalizeTargetLang(value) {
  const legacy = {
    '中文（简体）': 'Chinese (Simplified)',
    '中文（繁體）': 'Chinese (Traditional)',
    '中文（繁体）': 'Chinese (Traditional)'
  };
  return legacy[String(value || '').trim()] || String(value || '').trim() || DEFAULTS.targetLang;
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
  s.targetLang = normalizeTargetLang(s.targetLang);
  for (const id of TEXTS) $(id).value = s[id];
  for (const id of CHECKS) $(id).checked = !!s[id];
  for (const id of RANGES) $(id).value = s[id];
  $('allowlist').value = (s.allowlist || []).join('\n');
  $('blocklist').value = (s.blocklist || []).join('\n');
  $('replaceModeSites').value = (s.replaceModeSites || []).join('\n');
  $('siteGlossaries').value = formatGlossaries(s.siteGlossaries);
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
  patch.replaceModeSites = linesToList($('replaceModeSites').value);
  patch.siteGlossaries = parseGlossaries($('siteGlossaries').value);
  if (patch.endpoint === '') patch.endpoint = DEFAULTS.endpoint;
  await chrome.storage.local.set(patch);
  flash($('saveResult'), 'Saved ✓', 'ok');
}

function flash(el, msg, cls) {
  el.textContent = msg;
  el.className = 'result ' + (cls || '');
  setTimeout(() => { el.textContent = ''; el.className = 'result'; }, 3000);
}

async function refreshCacheInfo() {
  chrome.runtime.sendMessage({ type: 'DSX_CACHE_INFO' }, (r) => {
    if (chrome.runtime.lastError || !r) return;
    $('cacheInfo').textContent = r.size + ' cached translations';
  });
}

$('save').addEventListener('click', save);

$('eye').addEventListener('click', () => {
  const el = $('apiKey');
  const show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  $('eye').textContent = show ? 'Hide' : 'Show';
});

$('test').addEventListener('click', async () => {
  const res = $('testResult');
  res.textContent = 'Testing…';
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
      flash(res, 'Failed: ' + chrome.runtime.lastError.message, 'err');
      return;
    }
    if (r && r.ok) flash(res, 'Connected. Translation sample: ' + r.message, 'ok');
    else flash(res, 'Failed: ' + ((r && r.message) || 'Unknown error'), 'err');
  });
});

$('clearCache').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'DSX_CLEAR_CACHE' }, () => {
    flash($('cacheInfo'), 'Cache cleared', 'ok');
    setTimeout(refreshCacheInfo, 1200);
  });
});

for (const id of RANGES.concat(['style'])) {
  $(id).addEventListener('input', syncRangeLabels);
}

load();
