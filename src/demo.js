'use strict';
/**
 * 演示页脚本。
 * 本页是扩展内部页面，内容脚本不会自动注入，因此 demo.html 直接引入了 content.js，
 * 并通过它暴露的 window.__DSX_CMD__ 驱动翻译，行为与真实网页完全一致。
 */

const $ = (id) => document.getElementById(id);

function cmd(name, extra) {
  if (typeof window.__DSX_CMD__ !== 'function') return null;
  try {
    return window.__DSX_CMD__(name, extra);
  } catch (err) {
    console.warn('[LingoLayer Demo] 命令执行失败', err);
    return null;
  }
}

/* ------------------------------------------------------- API Key 状态 */

async function refreshKeyStatus() {
  const el = $('keyStatus');
  try {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (apiKey) {
      el.textContent = '✓ API key is set. You can start translating.';
      el.className = 'status ok';
      $('step1').classList.add('done');
    } else {
      el.textContent = '! No API key is set. Complete step 1 before translating.';
      el.className = 'status warn';
      $('step1').classList.remove('done');
    }
  } catch (_) {
    el.textContent = 'Unable to read settings';
    el.className = 'status warn';
  }
}

/* ------------------------------------------------------------- 交互 */

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('btnTranslate').addEventListener('click', () => {
  const st = cmd('on');
  $('step2').classList.add('done');
  if (!st) $('liveStat').textContent = 'The demo is not ready. Reload this page and try again.';
});

$('btnRestore').addEventListener('click', () => {
  cmd('off');
  $('step2').classList.remove('done');
  $('liveStat').textContent = 'Original text restored';
});

$('btnSelection').addEventListener('click', () => {
  const sel = String(window.getSelection() || '').trim();
  const hint = $('selHint');
  if (!sel) {
    hint.textContent = 'Select a sentence in the sample content first';
    hint.className = 'live err';
    return;
  }
  cmd('translateSelection');
  hint.textContent = 'Translated ' + sel.length + ' selected characters. The translation is below the paragraph.';
  hint.className = 'live ok';
  $('step3').classList.add('done');
});

/* --------------------------------------------------------- 样式调节 */

async function initTuning() {
  const s = await chrome.storage.local.get(['style', 'fontScale']);
  $('styleSel').value = s.style || 'dashed';
  const scale = Number(s.fontScale) || 92;
  $('scaleRange').value = scale;
  $('scaleVal').textContent = scale;
}

$('styleSel').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ style: e.target.value });
  cmd('restyle');
});

$('scaleRange').addEventListener('input', async (e) => {
  const v = Number(e.target.value);
  $('scaleVal').textContent = v;
  await chrome.storage.local.set({ fontScale: v });
  cmd('restyle');
});

/* --------------------------------------------------------- 实时状态 */

setInterval(() => {
  const st = cmd('status');
  if (!st) return;
  const stat = st.stats || {};
  if (!st.active) {
    $('liveStat').textContent = '';
    return;
  }
  let txt = 'Translated ' + (stat.done || 0) + ' / ' + (stat.total || 0) + ' segments';
  if (stat.pending) txt += ' · ' + stat.pending + ' queued';
  if (stat.failed) txt += ' · ' + stat.failed + ' failed';
  $('liveStat').textContent = txt;
  $('liveStat').className = stat.failed ? 'live err' : 'live';
}, 700);

chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && c.apiKey) refreshKeyStatus();
});

refreshKeyStatus();
initTuning();
