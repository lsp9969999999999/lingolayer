/**
 * DeepSeek 双语翻译 - 后台服务 (Service Worker)
 * 职责：调用 DeepSeek API、批量翻译调度、并发控制、重试、缓存、右键菜单、快捷键。
 */
'use strict';

const DEFAULTS = {
  apiKey: '',
  endpoint: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  thinkingMode: false,       // 翻译默认关闭深度思考：更快更省
  targetLang: '中文（简体）',
  temperature: 0.2,
  enabled: true,
  autoMode: 'off',          // off = 手动启用（默认）；allowlist = 仅名单内自动；all = 所有站点自动
  allowlist: [],
  blocklist: [],
  style: 'dashed',          // dashed | underline | highlight | plain | quote
  showLoading: true,
  batchSize: 10,            // 每次请求最多多少段
  batchChars: 2000,         // 每次请求最多多少字符
  concurrency: 5,           // 并发请求数（更快出结果）
  onlyVisible: true,        // 仅翻译进入视口的内容
  cacheEnabled: true,
  fontScale: 92,            // 译文比原文小一号
  skipCode: true            // 智能跳过代码 / 命令行 / 文件名
};

const CACHE_KEY = 'dsx_cache_v1';
const CACHE_MAX = 3000;

/* ------------------------------------------------------------------ 设置 */

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return Object.assign({}, DEFAULTS, stored);
}

/* ------------------------------------------------------------------ 缓存 */

let memCache = null;
let cacheDirty = false;
let cacheTimer = null;

async function loadCache() {
  if (memCache) return memCache;
  try {
    const got = await chrome.storage.local.get(CACHE_KEY);
    memCache = new Map(Object.entries(got[CACHE_KEY] || {}));
  } catch (_) {
    memCache = new Map();
  }
  return memCache;
}

function scheduleCacheSave() {
  cacheDirty = true;
  if (cacheTimer) return;
  cacheTimer = setTimeout(async () => {
    cacheTimer = null;
    if (!cacheDirty || !memCache) return;
    cacheDirty = false;
    // 超出上限时丢弃最早写入的条目
    if (memCache.size > CACHE_MAX) {
      const drop = memCache.size - CACHE_MAX;
      let i = 0;
      for (const k of memCache.keys()) {
        if (i++ >= drop) break;
        memCache.delete(k);
      }
    }
    try {
      await chrome.storage.local.set({ [CACHE_KEY]: Object.fromEntries(memCache) });
    } catch (_) { /* 存储超限时忽略 */ }
  }, 3000);
}

function cacheKey(text, target, model) {
  return model + '\u0001' + target + '\u0001' + text;
}

/* ------------------------------------------------------------ 并发调度器 */

let active = 0;
const waiters = [];

function acquire(limit) {
  if (active < limit) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push({ resolve, limit }));
}

function release() {
  active--;
  const next = waiters.shift();
  if (next) {
    active++;
    next.resolve();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------- API 调用 */

const SYSTEM_PROMPT = (target) =>
  '你是一个专业、精准的翻译引擎，服务于网页双语对照阅读。\n' +
  '任务：把用户给出的 JSON 对象中每一个值翻译成' + target + '。\n' +
  '规则：\n' +
  '1. 只输出译文，不要解释、不要添加原文中没有的信息、不要输出注释。\n' +
  '2. 自动识别源语言，任何语言都翻译成' + target + '。\n' +
  '3. 保留人名、地名、品牌名、专业术语、代码、变量名、URL、邮箱、数字与单位的正确形式；\n' +
  '   技术术语可采用"中文（English）"的形式，但不要滥用。\n' +
  '4. 保持原文的语气与文体（标题简洁、正文流畅），符合中文表达习惯，不要逐字直译。\n' +
  '5. 保留原文首尾的空格语义；不要合并或拆分条目。\n' +
  '6. 如果某个值已经是' + target + '，或是纯数字/符号/代码，则原样返回。\n' +
  '7. 必须严格返回一个 json 对象，键与输入完全一致（字符串形式的序号），值为译文字符串。\n' +
  '   不要输出 json 以外的任何字符。\n\n' +
  '示例输入：\n{"1": "Hello world", "2": "Machine learning is powerful."}\n' +
  '示例输出：\n{"1": "你好，世界", "2": "机器学习非常强大。"}';

async function callDeepSeek(items, settings) {
  const payload = {};
  items.forEach((it, i) => { payload[String(i + 1)] = it; });

  const inputChars = items.reduce((n, t) => n + t.length, 0);

  const body = {
    model: settings.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT(settings.targetLang) },
      {
        role: 'user',
        content:
          '请把下面 json 中的每个值翻译成' + settings.targetLang +
          '，并以同样的 json 结构返回：\n' + JSON.stringify(payload)
      }
    ],
    stream: false,
    response_format: { type: 'json_object' },
    // 预留足够的输出空间，避免 json 被截断
    max_tokens: Math.min(32000, Math.max(1024, Math.ceil(inputChars * 3) + 256))
  };

  // 思考模式默认关闭：翻译场景更快更省；开启时 temperature 无效，故不下发
  if (settings.thinkingMode) {
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = 'low';
  } else {
    body.thinking = { type: 'disabled' };
    body.temperature = Number(settings.temperature) || 0.2;
  }

  // 支持 https://api.deepseek.com、.../v1、.../chat/completions 三种写法
  const base = String(settings.endpoint || DEFAULTS.endpoint).replace(/\/+$/, '');
  const fixedUrl = base.endsWith('/chat/completions') ? base : base + '/chat/completions';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let res;
  try {
    res = await fetch(fixedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errJson = await res.json();
      detail = errJson?.error?.message || JSON.stringify(errJson).slice(0, 200);
    } catch (_) {
      detail = (await res.text().catch(() => '')).slice(0, 200);
    }
    const err = new Error('HTTP ' + res.status + (detail ? ' - ' + detail : ''));
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  let content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('接口返回内容为空');

  content = content.trim();
  const fence = content.match(/^\u0060\u0060\u0060(?:json)?\s*([\s\S]*?)\s*\u0060\u0060\u0060$/);
  if (fence) content = fence[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    const s = content.indexOf('{');
    const e = content.lastIndexOf('}');
    if (s >= 0 && e > s) parsed = JSON.parse(content.slice(s, e + 1));
    else throw new Error('无法解析模型返回的 JSON');
  }

  return items.map((orig, i) => {
    const v = parsed[String(i + 1)];
    return typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '');
  });
}

async function callWithRetry(items, settings) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callDeepSeek(items, settings);
    } catch (err) {
      lastErr = err;
      const status = err.status;
      const retriable = !status || status === 429 || status >= 500;
      if (status === 401 || status === 402 || status === 403) break;
      if (!retriable || attempt === 2) break;
      await sleep(700 * Math.pow(2, attempt) + Math.random() * 400);
    }
  }
  throw lastErr;
}

/**
 * 翻译一批文本，带缓存与逐条降级。
 * @returns {Promise<Array<{text:string, error?:string}>>}
 */
async function translateItems(texts, settings) {
  const out = new Array(texts.length).fill(null);
  const cache = settings.cacheEnabled ? await loadCache() : null;
  const todoIdx = [];

  texts.forEach((t, i) => {
    if (cache) {
      const hit = cache.get(cacheKey(t, settings.targetLang, settings.model));
      if (typeof hit === 'string') {
        out[i] = { text: hit, cached: true };
        return;
      }
    }
    todoIdx.push(i);
  });

  if (todoIdx.length === 0) return out;

  await acquire(Math.max(1, Number(settings.concurrency) || 3));
  try {
    const pending = todoIdx.map((i) => texts[i]);
    let results;
    try {
      results = await callWithRetry(pending, settings);
    } catch (err) {
      // 整批失败 -> 逐条降级重试，避免一条脏数据毁掉整批
      if (pending.length > 1) {
        results = [];
        for (const one of pending) {
          try {
            const r = await callWithRetry([one], settings);
            results.push(r[0] || '');
          } catch (_e2) {
            results.push(null);
          }
        }
        if (results.every((r) => r === null)) throw err;
      } else {
        throw err;
      }
    }

    todoIdx.forEach((origIdx, k) => {
      const translated = results[k];
      if (typeof translated === 'string' && translated.trim()) {
        out[origIdx] = { text: translated };
        if (cache) {
          cache.set(cacheKey(texts[origIdx], settings.targetLang, settings.model), translated);
          scheduleCacheSave();
        }
      } else {
        out[origIdx] = { text: '', error: '未返回译文' };
      }
    });
  } finally {
    release();
  }

  return out.map((r) => r || { text: '', error: '翻译失败' });
}

/* ------------------------------------------------------------ 消息路由 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'DSX_TRANSLATE') {
    (async () => {
      try {
        const settings = await getSettings();
        if (!settings.apiKey) {
          sendResponse({ ok: false, error: 'NO_API_KEY', message: '尚未设置 DeepSeek API Key' });
          return;
        }
        const texts = Array.isArray(msg.texts) ? msg.texts : [];
        if (!texts.length) {
          sendResponse({ ok: true, results: [] });
          return;
        }
        const results = await translateItems(texts, settings);
        sendResponse({ ok: true, results });
      } catch (err) {
        sendResponse({ ok: false, error: 'REQUEST_FAILED', message: String(err && err.message || err) });
      }
    })();
    return true;
  }

  if (msg.type === 'DSX_TEST') {
    (async () => {
      try {
        const settings = Object.assign(await getSettings(), msg.override || {});
        if (!settings.apiKey) {
          sendResponse({ ok: false, message: '请先填写 API Key' });
          return;
        }
        const r = await callDeepSeek(['Hello, world! This is a connection test.'], settings);
        sendResponse({ ok: true, message: r[0] || '(空)' });
      } catch (err) {
        sendResponse({ ok: false, message: String(err && err.message || err) });
      }
    })();
    return true;
  }

  if (msg.type === 'DSX_CLEAR_CACHE') {
    (async () => {
      memCache = new Map();
      await chrome.storage.local.remove(CACHE_KEY);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'DSX_CACHE_INFO') {
    (async () => {
      const c = await loadCache();
      sendResponse({ ok: true, size: c.size });
    })();
    return true;
  }

  if (msg.type === 'DSX_BADGE') {
    const tabId = sender?.tab?.id;
    if (typeof tabId === 'number') setBadge(tabId, msg.active, msg.count);
    return;
  }
});

/* ------------------------------------------------------------ 角标 / 菜单 */

function setBadge(tabId, isActive, count) {
  const text = isActive ? (count > 999 ? '999+' : String(count || '')) : '';
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#4D6BFE' }).catch(() => {});
}

async function sendToActiveTab(payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch (_) {
    // 内容脚本未注入（如 chrome:// 页面）时忽略
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-translate') sendToActiveTab({ type: 'DSX_CMD', cmd: 'toggle' });
  else if (command === 'translate-selection') sendToActiveTab({ type: 'DSX_CMD', cmd: 'translateSelection' });
});

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (cur[k] === undefined) patch[k] = v;
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);

  chrome.contextMenus.removeAll(() => {
    // 选中文字时：只翻译选中内容
    chrome.contextMenus.create({
      id: 'dsx-selection',
      title: '深译：翻译选中内容「%s」',
      contexts: ['selection']
    });
    // 没有选中时：整页翻译
    chrome.contextMenus.create({
      id: 'dsx-toggle',
      title: '深译：翻译此页面 / 恢复原文',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'dsx-options',
      title: '深译设置…',
      contexts: ['action']
    });
  });

  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) {
    if (info.menuItemId === 'dsx-options') chrome.runtime.openOptionsPage();
    return;
  }
  if (info.menuItemId === 'dsx-selection') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'DSX_CMD',
      cmd: 'translateSelection',
      text: info.selectionText || ''
    }, { frameId: info.frameId }).catch(() => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'DSX_CMD', cmd: 'translateSelection', text: info.selectionText || ''
      }).catch(() => {});
    });
  } else if (info.menuItemId === 'dsx-toggle') {
    chrome.tabs.sendMessage(tab.id, { type: 'DSX_CMD', cmd: 'toggle' }).catch(() => {});
  } else if (info.menuItemId === 'dsx-options') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.tabs.onRemoved.addListener(() => { /* 角标随标签页销毁 */ });
