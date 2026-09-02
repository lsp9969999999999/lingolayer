'use strict';

const $ = (id) => document.getElementById(id);
let tab = null;
let settings = {};

const DEFAULTS = {
  apiKey: '', enabled: true, autoMode: 'off', allowlist: [], blocklist: [], replaceModeSites: [],
  targetLang: 'Chinese (Simplified)', customTargetLang: '', style: 'dashed'
};

function normalizeTargetLang(value) {
  const legacy = {
    '中文（简体）': 'Chinese (Simplified)',
    '中文（繁體）': 'Chinese (Traditional)',
    '中文（繁体）': 'Chinese (Traditional)'
  };
  return legacy[String(value || '').trim()] || String(value || '').trim() || DEFAULTS.targetLang;
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch (_) { return ''; }
}

function inList(host, list) {
  return (list || []).some((p) => {
    p = String(p).toLowerCase();
    return host === p || host.endsWith('.' + p);
  });
}

async function send(cmd, extra) {
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, Object.assign({ type: 'DSX_CMD', cmd }, extra || {}));
  } catch (_) {
    return null;
  }
}

function renderStatus(st) {
  const btn = $('toggle');
  if (!st) {
    $('stat').textContent = 'Translation is unavailable here. Refresh the page if needed.';
    btn.textContent = 'Translate this page';
    btn.classList.remove('on');
    return;
  }
  btn.textContent = st.active ? 'Restore original' : 'Translate this page';
  btn.classList.toggle('on', !!st.active);
  const s = st.stats || {};
  if (!st.active) {
    $('stat').textContent = 'Not started';
  } else {
    let txt = 'Translated ' + (s.done || 0) + ' / ' + (s.total || 0) + ' segments';
    if (s.pending) txt += ' · ' + s.pending + ' queued';
    if (s.failed) txt += ' · ' + s.failed + ' failed';
    $('stat').textContent = txt;
  }
  if (st.lastError) $('stat').title = st.lastError;
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = hostOf(tab?.url || '');
  $('host').textContent = host || 'Current page';

  settings = Object.assign({}, DEFAULTS, await chrome.storage.local.get(Object.keys(DEFAULTS)));
  settings.targetLang = normalizeTargetLang(settings.targetLang);
  $('targetLang').value = settings.customTargetLang ? '__custom__' : settings.targetLang;
  $('style').value = settings.style;
  $('autoMode').value = settings.autoMode;
  $('warn').classList.toggle('hidden', !!settings.apiKey);

  // 开关反映"这个站点是否会自动翻译"
  const blocked = inList(host, settings.blocklist);
  const allowed = inList(host, settings.allowlist);
  if (settings.autoMode === 'all') $('siteAuto').checked = !blocked;
  else if (settings.autoMode === 'allowlist') $('siteAuto').checked = allowed;
  else $('siteAuto').checked = false;   // 手动模式下不自动翻译任何站点
  $('replaceOriginal').checked = inList(host, settings.replaceModeSites);

  renderStatus(await send('status'));
  const statusTimer = setInterval(async () => renderStatus(await send('status')), 1000);
  window.addEventListener('unload', () => clearInterval(statusTimer), { once: true });
}

$('toggle').addEventListener('click', async () => {
  const st = await send('toggle');
  if (!st) {
    // 内容脚本可能尚未注入，尝试即时注入
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['src/content.css'] });
      renderStatus(await send('on'));
      return;
    } catch (e) {
      $('stat').textContent = 'This page cannot be translated (for example, chrome:// pages).';
      return;
    }
  }
  renderStatus(st);
});

$('siteAuto').addEventListener('change', async (e) => {
  const host = hostOf(tab?.url || '');
  if (!host) return;
  const s = await chrome.storage.local.get(['allowlist', 'blocklist', 'autoMode']);
  const mode = s.autoMode || 'off';
  const allowlist = new Set(s.allowlist || []);
  const blocklist = new Set(s.blocklist || []);
  const patch = {};

  if (e.target.checked) {
    allowlist.add(host);
    blocklist.delete(host);
    // 手动模式下开启本站自动翻译 -> 自动切换到"仅白名单"模式，其他站点仍保持手动
    if (mode === 'off') {
      patch.autoMode = 'allowlist';
      $('autoMode').value = 'allowlist';
    }
  } else {
    allowlist.delete(host);
    if (mode === 'all') blocklist.add(host);
  }

  patch.allowlist = [...allowlist];
  patch.blocklist = [...blocklist];
  await chrome.storage.local.set(patch);
  if (e.target.checked) renderStatus(await send('on'));
});

$('replaceOriginal').addEventListener('change', async (e) => {
  const host = hostOf(tab?.url || '');
  if (!host) return;
  const sites = new Set(settings.replaceModeSites || []);
  if (e.target.checked) sites.add(host);
  else sites.delete(host);
  settings.replaceModeSites = [...sites];
  await chrome.storage.local.set({ replaceModeSites: settings.replaceModeSites });
  const status = await send('status');
  if (status?.active) {
    renderStatus(await send('restart', { settings: { replaceModeSites: settings.replaceModeSites } }));
  }
});

$('targetLang').addEventListener('change', async (e) => {
  if (e.target.value === '__custom__') {
    chrome.runtime.openOptionsPage();
    return;
  }
  settings.customTargetLang = '';
  await chrome.storage.local.set({ targetLang: e.target.value });
  const status = await send('status');
  if (status?.active) {
    renderStatus(await send('restart', { settings: { targetLang: e.target.value, customTargetLang: '' } }));
  }
});

$('style').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ style: e.target.value });
  await send('restyle');
});

$('autoMode').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ autoMode: e.target.value });
});

for (const id of ['toOptions', 'toOptions2']) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
}

// 操作演示页：内置示例网页 + 引导步骤
$('toDemo').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('src/demo.html') });
  window.close();
});

init();
