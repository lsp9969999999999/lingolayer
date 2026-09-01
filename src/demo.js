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
      el.textContent = '✓ 已配置 API Key，可以直接开始翻译';
      el.className = 'status ok';
      $('step1').classList.add('done');
    } else {
      el.textContent = '! 尚未配置 API Key，翻译会失败，请先完成第 1 步';
      el.className = 'status warn';
      $('step1').classList.remove('done');
    }
  } catch (_) {
    el.textContent = '无法读取配置';
    el.className = 'status warn';
  }
}

/* ------------------------------------------------------------- 交互 */

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('btnTranslate').addEventListener('click', () => {
  const st = cmd('on');
  $('step2').classList.add('done');
  if (!st) $('liveStat').textContent = '演示环境未就绪，请重新加载页面';
});

$('btnRestore').addEventListener('click', () => {
  cmd('off');
  $('step2').classList.remove('done');
  $('liveStat').textContent = '已恢复原文';
});

$('btnSelection').addEventListener('click', () => {
  const sel = String(window.getSelection() || '').trim();
  const hint = $('selHint');
  if (!sel) {
    hint.textContent = '请先用鼠标选中下面示例里的一句话';
    hint.className = 'live err';
    return;
  }
  cmd('translateSelection');
  hint.textContent = '已翻译选中的 ' + sel.length + ' 个字符，译文就在该段下方';
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
  let txt = '已翻译 ' + (stat.done || 0) + ' / ' + (stat.total || 0) + ' 段';
  if (stat.pending) txt += '，队列 ' + stat.pending;
  if (stat.failed) txt += '，失败 ' + stat.failed;
  $('liveStat').textContent = txt;
  $('liveStat').className = stat.failed ? 'live err' : 'live';
}, 700);

chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && c.apiKey) refreshKeyStatus();
});

refreshKeyStatus();
initTuning();
