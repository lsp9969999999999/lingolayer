/**
 * DeepSeek 双语翻译 - 内容脚本
 * 职责：按段落切分网页文本 -> 批量送翻译 -> 在原文下方插入译文（保留原文）。
 */
(function () {
  'use strict';
  if (window.__DSX_TRANSLATOR_LOADED__) return;
  window.__DSX_TRANSLATOR_LOADED__ = true;

  const DEFAULTS = {
    enabled: true,
    autoMode: 'off',
    allowlist: [],
    blocklist: [],
    targetLang: '中文（简体）',
    style: 'dashed',
    showLoading: true,
    batchSize: 10,
    batchChars: 2000,
    onlyVisible: true,
    fontScale: 92,        // 译文默认比原文小一号
    skipCode: true        // 智能跳过代码 / 命令行 / 文件名
  };

  const TRANS_CLASS = 'dsx-translation';
  const STATE_ATTR = 'data-dsx-state';
  const ID_ATTR = 'data-dsx-id';

  // 不进入的容器
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'PRE', 'CODE', 'KBD', 'SAMP', 'VAR',
    'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'OPTGROUP', 'BUTTON',
    'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO',
    'MATH', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE', 'MAP', 'AREA', 'PICTURE', 'SOURCE'
  ]);

  // 视为行内、可与文本合并成同一段的标签
  const INLINE_TAGS = new Set([
    'A', 'ABBR', 'B', 'BDI', 'BDO', 'BIG', 'CITE', 'DATA', 'DEL', 'DFN', 'EM',
    'FONT', 'I', 'INS', 'MARK', 'NOBR', 'Q', 'RP', 'RT', 'RUBY', 'S', 'SMALL',
    'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TIME', 'TT', 'U', 'WBR', 'BR', 'LABEL'
  ]);

  // 各语系字符集合（注意不要让区间互相重叠）
  // 代码 / 终端 / 编辑器类容器的 class 或 id 特征
  const CODE_CLASS_RE = /(?:^|[\s_-])(?:code|codeblock|codemirror|cm-|ace_|monaco|highlight|hljs|prism|token|snippet|terminal|console|shell|cli|command|cmd|mono|monospace|blob|diff|syntax|linenos|line-number|gutter|katex|mathjax|editor|repl|sourcecode)/i;

  // 常见目录 / 工程文件名，单独出现时不该被翻译
  const CODE_WORDS = new Set([
    'src', 'dist', 'lib', 'libs', 'bin', 'doc', 'docs', 'test', 'tests', 'spec', 'specs',
    'build', 'public', 'static', 'assets', 'config', 'configs', 'scripts', 'examples', 'example',
    'node_modules', 'vendor', 'target', 'out', 'tmp', 'temp', 'log', 'logs', 'api', 'apis',
    'utils', 'util', 'types', 'components', 'component', 'pages', 'page', 'styles', 'style',
    'images', 'image', 'img', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java',
    'readme', 'license', 'changelog', 'contributing', 'makefile', 'dockerfile', 'gitignore',
    'index', 'main', 'app', 'core', 'common', 'shared', 'internal', 'pkg', 'cmd', 'server',
    'client', 'model', 'models', 'view', 'views', 'controller', 'controllers', 'router', 'routes'
  ]);

  const SHELL_CMD_RE = /^(?:npm|npx|yarn|pnpm|bun|deno|git|cd|ls|pwd|sudo|apt|apt-get|yum|brew|pip|pip3|conda|python|python3|node|deno|docker|docker-compose|kubectl|helm|curl|wget|make|cmake|cargo|go|rustc|java|javac|mvn|gradle|ssh|scp|rsync|chmod|chown|mkdir|rmdir|rm|cp|mv|cat|less|tail|head|grep|sed|awk|find|echo|export|source|bash|sh|zsh|systemctl|service|ps|kill|top|df|du|tar|zip|unzip|openssl|psql|mysql|redis-cli|terraform|ansible)\s+[\w./~-]/i;

  const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;          // 汉字
  const KANA_RE = /[\u3040-\u30ff]/;                                       // 日文假名
  const HANGUL_RE = /[\u1100-\u11ff\uac00-\ud7af]/;                       // 韩文谚文
  // 拉丁 / 希腊 / 西里尔 / 希伯来 / 阿拉伯 / 天城 / 泰文等表音文字
  const LATIN_RE = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f]/g;
  const EN_STOPWORDS = /\b(the|and|of|to|is|are|was|were|in|on|for|with|that|this|from|have|has|will|would|about|which|their|there)\b/gi;

  const state = {
    settings: Object.assign({}, DEFAULTS),
    active: false,
    seq: 0,
    units: new Map(),        // id -> unit
    unitByAnchor: new WeakMap(),
    anchors: new WeakMap(),  // element -> Set<id>
    queue: [],
    inflight: 0,
    maxInflight: 3,
    firstBatchDone: false,
    flushTimer: null,
    io: null,
    mo: null,
    scanTimer: null,
    scanRoot: null,
    stats: { total: 0, done: 0, failed: 0 },
    lastError: ''
  };

  /* ------------------------------------------------------------- 工具函数 */

  function hostMatches(host, list) {
    if (!Array.isArray(list)) return false;
    host = String(host || '').toLowerCase();
    return list.some((raw) => {
      const p = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!p) return false;
      return host === p || host.endsWith('.' + p);
    });
  }

  function shouldAutoStart(s) {
    if (!s.enabled) return false;
    const host = location.hostname;
    if (hostMatches(host, s.blocklist)) return false;
    if (s.autoMode === 'off') return false;
    if (s.autoMode === 'allowlist') return hostMatches(host, s.allowlist);
    return true; // all
  }

  /**
   * 一次取样同时判断：是否隐藏、是否等宽字体。
   * 等宽字体是代码块/终端/文件名最可靠的通用信号，比逐个网站写规则更稳。
   */
  function inspectStyle(el) {
    let st = null;
    try {
      st = el.ownerDocument.defaultView.getComputedStyle(el);
    } catch (_) { /* ignore */ }
    if (!st) return { hidden: false, mono: false };
    const hidden =
      el.hidden ||
      el.getAttribute('aria-hidden') === 'true' ||
      st.display === 'none' ||
      st.visibility === 'hidden' ||
      (st.opacity !== '' && Number(st.opacity) === 0);
    const ff = (st.fontFamily || '').toLowerCase();
    const mono =
      ff.indexOf('mono') >= 0 ||
      ff.indexOf('consolas') >= 0 ||
      ff.indexOf('menlo') >= 0 ||
      ff.indexOf('courier') >= 0 ||
      ff.indexOf('source code') >= 0 ||
      ff.indexOf('fira code') >= 0 ||
      ff.indexOf('jetbrains') >= 0;
    return { hidden, mono };
  }

  function shouldSkipElement(el) {
    const tag = el.tagName;
    if (!tag || SKIP_TAGS.has(tag)) return true;
    if (el.classList && (el.classList.contains(TRANS_CLASS) || el.classList.contains('notranslate'))) return true;
    if (el.getAttribute('translate') === 'no') return true;
    if (el.getAttribute('data-dsx') === '1') return true;            // 自己插入的节点
    if (el.isContentEditable) return true;
    if (el.closest && el.closest('.' + TRANS_CLASS)) return true;

    // 代码 / 终端 / 编辑器类容器（按 class、id 特征识别）
    if (state.settings.skipCode !== false) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (cls && CODE_CLASS_RE.test(cls)) return true;
      if (el.id && CODE_CLASS_RE.test(el.id)) return true;
      const role = el.getAttribute('role');
      if (role === 'code' || el.hasAttribute('data-lang') || el.hasAttribute('data-language')) return true;
    }
    return false;
  }

  function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  /** 判断一段文本是不是代码 / 命令行 / 文件名 / 标识符 */
  function looksLikeCode(t) {
    if (!t) return false;

    // 命令行：以提示符开头，或以常见命令开头
    if (/^[$>#%]\s*\S/.test(t)) return true;
    if (SHELL_CMD_RE.test(t)) return true;

    if (!/\s/.test(t)) {
      // 单个 token（不含空格）——文件名、路径、标识符
      const lower = t.toLowerCase().replace(/^[./\\]+/, '');
      if (CODE_WORDS.has(lower)) return true;
      if (/^[\w$@~-][\w$@./\\:~-]*\.[A-Za-z0-9]{1,8}$/.test(t)) return true;   // a.ts / src/b.py / README.md
      if (/[_/\\:={}()<>;|#$]/.test(t)) return true;                            // 含代码符号
      if (/^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(t)) return true;           // camelCase
      if (/^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+$/.test(t)) return true;           // PascalCase
      if (/^[A-Z][A-Z0-9_]{2,}$/.test(t)) return true;                          // CONST_CASE
      if (/^-{1,2}[a-z0-9][\w-]*$/i.test(t)) return true;                       // --flag
      if (/^#[0-9a-fA-F]{3,8}$/.test(t)) return true;                           // 颜色值
      if (/^v?\d+(?:\.\d+){1,}/.test(t)) return true;                          // 版本号
      return false;
    }

    // 多词：按代码符号密度判断
    const symbols = (t.match(/[{}()[\]<>;=+*/\\|&^%$#@~\u0060_]/g) || []).length;
    if (t.length >= 8 && symbols / t.length > 0.12) return true;
    if (/[;{}]\s*$/.test(t) && /[(){}=]/.test(t)) return true;                   // 以 ; } 结尾的语句
    if (/\b(?:function|const|let|var|import|export|class|def|return|public|private|static|void|null|undefined)\b.*[(){}=;]/.test(t)) return true;
    return false;
  }

  /** 归一化目标语言 */
  function targetKind() {
    const t = String(state.settings.targetLang || '');
    if (/繁體|繁体|Traditional/i.test(t)) return 'zh-hant';
    if (/中文|Chinese|zh/i.test(t)) return 'zh-hans';
    if (/English|英文|英语/i.test(t)) return 'en';
    if (/日本語|Japanese|日文|日语/i.test(t)) return 'ja';
    if (/한국|Korean|韩文|韩语/i.test(t)) return 'ko';
    return 'other';
  }

  /** 判断这段文字值不值得翻译（已是目标语言 / 纯符号 / 太短则跳过） */
  function needsTranslation(raw) {
    const s = normalize(raw);
    if (s.length < 2) return false;
    if (s.length > 5000) return false;
    if (/^https?:\/\/\S+$/i.test(s)) return false;                    // 纯链接
    if (state.settings.skipCode !== false && looksLikeCode(s)) return false; // 代码 / 命令 / 文件名

    // 下面按各语系字符统计判断；纯数字 / 符号 / emoji 会因为没有任何字母而被跳过
    const cjk = (s.match(CJK_RE) || []).length;
    const latin = (s.match(LATIN_RE) || []).length;
    const hasKana = KANA_RE.test(s);
    const hasHangul = HANGUL_RE.test(s);
    if (cjk + latin === 0 && !hasKana && !hasHangul) return false;
    if (cjk === 0 && !hasKana && !hasHangul && latin < 2) return false; // 单个字母

    const kind = targetKind();
    if (kind === 'zh-hans') {
      if (hasKana || hasHangul) return true;                           // 日/韩仍需翻译
      if (cjk > 0 && cjk / (cjk + latin) > 0.55) return false;         // 已经是中文
    } else if (kind === 'zh-hant') {
      if (hasKana || hasHangul) return true;
    } else if (kind === 'en') {
      if (cjk > 0 || hasKana || hasHangul) return true;
      const stops = (s.match(EN_STOPWORDS) || []).length;
      if (latin > 0 && stops >= 2) return false;                       // 已经是英文
    } else if (kind === 'ja') {
      if (hasKana && !hasHangul && cjk / Math.max(1, cjk + latin) < 0.9) return false;
    } else if (kind === 'ko') {
      if (hasHangul && cjk === 0) return false;
    }
    return true;
  }

  function isInlineTag(el) {
    return INLINE_TAGS.has(el.tagName);
  }

  /* --------------------------------------------------------------- 段落切分 */

  function collectUnits(root) {
    const found = [];
    const stack = [root];

    while (stack.length) {
      const el = stack.pop();
      if (!el || el.nodeType !== 1) continue;
      if (shouldSkipElement(el)) continue;
      if (el.hasAttribute(STATE_ATTR)) continue;
      // 先做廉价剪枝：整棵子树没有可见文字就直接跳过，避免大量 getComputedStyle
      const rawText = el.textContent;
      if (!rawText || !rawText.trim()) continue;
      const look = inspectStyle(el);
      if (look.hidden) continue;
      // 等宽字体渲染的内容（代码块、命令行、GitHub 文件名等）整棵跳过
      if (look.mono && state.settings.skipCode !== false) continue;

      const children = el.childNodes;
      let hasBlockChild = false;
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c.nodeType === 1 && !isInlineTag(c)) { hasBlockChild = true; break; }
      }

      if (!hasBlockChild) {
        // 叶子块：整块作为一个翻译单元
        if (needsTranslation(rawText)) {
          found.push({ kind: 'element', el, text: normalize(rawText) });
        }
        continue;
      }

      // 混合容器：把连续的文本/行内节点合并成一段，块级子节点继续下钻
      let run = [];
      const flushRun = () => {
        if (!run.length) return;
        const text = run.map((n) => n.textContent).join('');
        if (needsTranslation(text)) {
          found.push({ kind: 'run', parent: el, nodes: run.slice(), text: normalize(text) });
        }
        run = [];
      };

      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c.nodeType === 3) {
          run.push(c);
        } else if (c.nodeType === 1) {
          if (isInlineTag(c) && !shouldSkipElement(c)) {
            run.push(c);
          } else {
            flushRun();
            if (!SKIP_TAGS.has(c.tagName)) stack.push(c);
          }
        }
      }
      flushRun();
    }

    return found;
  }

  /* --------------------------------------------------------------- 译文注入 */

  function isInlineContext(el) {
    try {
      const disp = getComputedStyle(el).display;
      return disp === 'inline' || disp === 'ruby' || disp === 'contents';
    } catch (_) {
      return false;
    }
  }

  function makeHolder(unit) {
    const inline = unit.kind === 'run' || (unit.kind === 'element' && isInlineContext(unit.el));
    const holder = document.createElement(inline ? 'span' : 'div');
    holder.className =
      TRANS_CLASS + ' dsx-style-' + (state.settings.style || 'dashed') + (inline ? ' dsx-inline' : '');
    holder.setAttribute('data-dsx', '1');
    holder.setAttribute('translate', 'no');
    holder.setAttribute('dir', 'auto');
    holder.classList.add('notranslate');
    const scale = Number(state.settings.fontScale) || 92;
    holder.style.fontSize = scale + '%';
    if (!inline && unit.kind === 'element') {
      try {
        const disp = getComputedStyle(unit.el).display;
        if (disp.includes('flex') || disp.includes('grid')) {
          holder.style.width = '100%';
          holder.style.flexBasis = '100%';
        }
      } catch (_) { /* ignore */ }
    }
    return holder;
  }

  function mountHolder(unit, holder) {
    if (unit.kind === 'element') {
      unit.el.appendChild(holder);
      unit.el.setAttribute(STATE_ATTR, 'pending');
      unit.el.setAttribute(ID_ATTR, String(unit.id));
    } else {
      const last = unit.nodes[unit.nodes.length - 1];
      if (!last || !last.parentNode) return false;
      last.parentNode.insertBefore(holder, last.nextSibling);
    }
    unit.holder = holder;
    return true;
  }

  function setLoading(unit) {
    if (!unit.holder) return;
    unit.holder.textContent = '';                       // 不写文字，避免满屏"翻译中"
    unit.holder.classList.remove('dsx-error');
    // 占位条由 CSS 延迟 0.45s 才淡入：响应快时用户根本看不到闪烁
    unit.holder.classList.toggle('dsx-loading', state.settings.showLoading !== false);
  }

  function setTranslated(unit, text) {
    if (!unit.holder) return;
    unit.holder.classList.remove('dsx-loading', 'dsx-error');
    unit.holder.classList.add('dsx-done');
    unit.holder.textContent = text;
    if (unit.kind === 'element') unit.el.setAttribute(STATE_ATTR, 'done');
    state.stats.done++;
    reportBadge();
  }

  function setError(unit, message) {
    if (!unit.holder) return;
    unit.holder.classList.remove('dsx-loading');
    unit.holder.classList.add('dsx-error');
    unit.holder.textContent = '译文获取失败，点击重试';
    unit.holder.title = message || '';
    unit.holder.style.cursor = 'pointer';
    unit.holder.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      unit.holder.onclick = null;
      unit.holder.style.cursor = '';
      setLoading(unit);
      state.queue.push(unit);
      scheduleFlush(0);
    };
    if (unit.kind === 'element') unit.el.setAttribute(STATE_ATTR, 'error');
    state.stats.failed++;
    state.lastError = message || '';
  }

  /**
   * 稳定插入：以视口顶部的元素为锚点，插入译文后把滚动位置补偿回去。
   * 这样即使视口上方不断插入译文，用户正在读的那一行也不会往下跑。
   */
  function stableApply(mutate) {
    let anchor = null;
    let before = 0;
    try {
      const x = Math.max(1, Math.floor(window.innerWidth / 2));
      anchor = document.elementFromPoint(x, 2) || document.elementFromPoint(x, 12);
      // 锚点不能是我们自己插入的节点
      while (anchor && anchor.getAttribute && anchor.getAttribute('data-dsx') === '1') {
        anchor = anchor.parentElement;
      }
      if (anchor) before = anchor.getBoundingClientRect().top;
    } catch (_) {
      anchor = null;
    }

    mutate();

    if (!anchor || !anchor.isConnected) return;
    try {
      const delta = anchor.getBoundingClientRect().top - before;
      // 只补偿明显的位移，且页面确实可滚动时才补偿
      if (Math.abs(delta) > 0.5 && Math.abs(delta) < 20000) {
        const se = document.scrollingElement || document.documentElement;
        if (se && se.scrollTop > 0) window.scrollBy(0, delta);
      }
    } catch (_) { /* ignore */ }
  }

  /* ----------------------------------------------------------- 队列与请求 */

  function enqueue(unit) {
    if (unit.queued) return;
    unit.queued = true;
    setLoading(unit);
    state.queue.push(unit);
    // 首批立即发出，让第一屏尽快出译文；之后小幅合批以减少请求数
    scheduleFlush(state.firstBatchDone ? 150 : 0);
  }

  function scheduleFlush(delay) {
    if (state.flushTimer) return;
    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      flush();
    }, delay);
  }

  function flush() {
    if (!state.active) return;
    while (state.queue.length && state.inflight < state.maxInflight) {
      const batch = [];
      let chars = 0;
      const maxItems = Math.max(1, Number(state.settings.batchSize) || 12);
      const maxChars = Math.max(200, Number(state.settings.batchChars) || 2400);
      while (
        state.queue.length &&
        batch.length < maxItems &&
        (batch.length === 0 || chars + state.queue[0].text.length <= maxChars)
      ) {
        const u = state.queue.shift();
        if (!u.holder || !u.holder.isConnected) continue;
        batch.push(u);
        chars += u.text.length;
      }
      if (!batch.length) break;
      sendBatch(batch);
    }
    if (state.queue.length) scheduleFlush(300);
  }

  function sendBatch(batch) {
    state.inflight++;
    const texts = batch.map((u) => u.text);
    let settled = false;
    const done = (resp) => {
      if (settled) return;
      settled = true;
      state.inflight--;
      state.firstBatchDone = true;

      const paint = () => stableApply(() => {
        if (!resp || !resp.ok) {
          const msg =
            resp && resp.error === 'NO_API_KEY'
              ? '尚未设置 DeepSeek API Key，请点击扩展图标进行设置'
              : (resp && resp.message) || '与后台通信失败';
          batch.forEach((u) => setError(u, msg));
        } else {
          batch.forEach((u, i) => {
            const r = resp.results[i];
            if (r && r.text && !r.error) setTranslated(u, r.text);
            else setError(u, (r && r.error) || '未返回译文');
          });
        }
        reportBadge();
      });

      // 整批结果在同一帧写入，避免逐条插入造成连续回流
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paint);
      else paint();

      if (state.queue.length) scheduleFlush(0);
    };

    try {
      chrome.runtime.sendMessage({ type: 'DSX_TRANSLATE', texts }, (resp) => {
        if (chrome.runtime.lastError) {
          done({ ok: false, message: chrome.runtime.lastError.message });
          return;
        }
        done(resp);
      });
    } catch (err) {
      done({ ok: false, message: String(err && err.message || err) });
    }
  }

  /* ------------------------------------------------------------ 扫描与观察 */

  function registerUnits(units) {
    for (const unit of units) {
      const anchor = unit.kind === 'element' ? unit.el : unit.nodes[0];
      const existing = anchor && state.unitByAnchor.get(anchor);
      if (existing && existing.text === unit.text && existing.holder?.isConnected) continue;
      unit.id = ++state.seq;
      const holder = makeHolder(unit);
      if (!mountHolder(unit, holder)) continue;
      state.units.set(unit.id, unit);
      if (anchor) state.unitByAnchor.set(anchor, unit);
      state.stats.total++;

      if (state.settings.onlyVisible && state.io) {
        const anchor = unit.kind === 'element' ? unit.el : unit.parent;
        let set = state.anchors.get(anchor);
        if (!set) {
          set = new Set();
          state.anchors.set(anchor, set);
          state.io.observe(anchor);
        }
        set.add(unit.id);
      } else {
        enqueue(unit);
      }
    }
    reportBadge();
  }

  function scan(root) {
    if (!state.active) return;
    const target = root && root.nodeType === 1 ? root : document.body;
    if (!target) return;
    try {
      registerUnits(collectUnits(target));
    } catch (err) {
      console.warn('[DeepSeek 翻译] 扫描失败:', err);
    }
  }

  function scheduleScan(root) {
    if (root) {
      if (!state.scanRoot) state.scanRoot = root;
      else if (state.scanRoot !== root) state.scanRoot = document.body;
    }
    if (state.scanTimer) clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      const target = state.scanRoot || root || document.body;
      state.scanRoot = null;
      scan(target);
    }, 600);
  }

  function setupObservers() {
    if (state.settings.onlyVisible) {
      state.io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const set = state.anchors.get(entry.target);
          state.io.unobserve(entry.target);
          if (!set) continue;
          for (const id of set) {
            const u = state.units.get(id);
            if (u) enqueue(u);
          }
          state.anchors.delete(entry.target);
        }
      }, { rootMargin: '900px 0px', threshold: 0 });   // 提前预取，滚动时译文已就位
    }

    state.mo = new MutationObserver((mutations) => {
      if (!state.active) return;
      let dirty = false;
      let scanRoot = null;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && n.getAttribute && n.getAttribute('data-dsx') === '1') continue;
            if (n.nodeType === 1 || n.nodeType === 3) {
              dirty = true;
              const candidate = n.nodeType === 1 ? n : (m.target || document.body);
              scanRoot = scanRoot && scanRoot !== candidate ? document.body : (scanRoot || candidate);
              break;
            }
          }
        } else if (m.type === 'characterData') {
          if (m.target.parentElement?.closest('.' + TRANS_CLASS)) continue;
          dirty = true;
          scanRoot = scanRoot && scanRoot !== m.target.parentElement ? document.body : (scanRoot || m.target.parentElement || document.body);
        } else if (m.type === 'attributes') {
          if (m.target.getAttribute('data-dsx') === '1' || m.target.closest?.('.' + TRANS_CLASS)) continue;
          dirty = true;
          scanRoot = scanRoot && scanRoot !== m.target ? document.body : (scanRoot || m.target);
        }
        if (dirty && scanRoot === document.body) break;
      }
      if (dirty) scheduleScan(scanRoot || document.body);
    });
    state.mo.observe(document.documentElement, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
      subtree: true
    });

    startUrlWatcher();
  }

  // 单页应用路由变化监听（全局只启动一次，避免反复开关时叠加定时器）
  let urlWatcherStarted = false;
  function startUrlWatcher() {
    if (urlWatcherStarted) return;
    urlWatcherStarted = true;
    let lastUrl = location.href;
    const checkUrl = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (state.active) scheduleScan(document.body);
      }
    };
    try {
      const originalPushState = window.history.pushState;
      const originalReplaceState = window.history.replaceState;
      window.history.pushState = function () { const result = originalPushState.apply(this, arguments); checkUrl(); return result; };
      window.history.replaceState = function () { const result = originalReplaceState.apply(this, arguments); checkUrl(); return result; };
      window.addEventListener('popstate', checkUrl);
      window.addEventListener('hashchange', checkUrl);
    } catch (_) { /* 某些受限页面禁止改写 history */ }
  }

  /* --------------------------------------------------------------- 开 / 关 */

  function start() {
    if (state.active) return;
    state.active = true;
    document.documentElement.setAttribute('data-dsx-on', '1');
    if (!state.mo) {
      try { setupObservers(); } catch (err) { console.error('[DeepSeek 翻译] observer setup failed', err); }
    }
    scan(document.body);
    reportBadge();
  }

  function stop() {
    state.active = false;
    document.documentElement.removeAttribute('data-dsx-on');
    if (state.io) { state.io.disconnect(); state.io = null; }
    if (state.mo) { state.mo.disconnect(); state.mo = null; }
    if (state.flushTimer) { clearTimeout(state.flushTimer); state.flushTimer = null; }
    if (state.scanTimer) { clearTimeout(state.scanTimer); state.scanTimer = null; }
    state.scanRoot = null;
    state.queue = [];
    state.firstBatchDone = false;
    state.units.clear();
    state.unitByAnchor = new WeakMap();
    state.anchors = new WeakMap();
    state.seq = 0;
    state.stats = { total: 0, done: 0, failed: 0 };
    document.querySelectorAll('.' + TRANS_CLASS + '[data-dsx="1"]').forEach((n) => n.remove());
    document.querySelectorAll('[' + STATE_ATTR + ']').forEach((n) => {
      n.removeAttribute(STATE_ATTR);
      n.removeAttribute(ID_ATTR);
    });
    reportBadge();
  }

  function restyle() {
    const cls = 'dsx-style-' + (state.settings.style || 'dashed');
    document.querySelectorAll('.' + TRANS_CLASS).forEach((n) => {
      n.className = n.className.replace(/dsx-style-\w+/g, cls);
      const scale = Number(state.settings.fontScale) || 92;
      n.style.fontSize = scale + '%';
    });
  }

  function reportBadge() {
    try {
      const p = chrome.runtime.sendMessage({
        type: 'DSX_BADGE',
        active: state.active,
        count: state.stats.done
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  /* --------------------------------------------------------- 划词翻译 */

  /** 找到节点最近的块级祖先，作为译文的落点 */
  function blockAncestor(node) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== document.body) {
      if (!INLINE_TAGS.has(el.tagName)) {
        let disp = '';
        try {
          disp = getComputedStyle(el).display;
        } catch (_) { /* ignore */ }
        if (disp && disp.indexOf('inline') !== 0 && disp !== 'contents') return el;
      }
      el = el.parentElement;
    }
    return document.body;
  }

  /**
   * 只翻译选中的文字，并把译文嵌入该段文字下方 —— 与整页翻译完全一致的呈现方式。
   */
  function translateSelection(fallbackText) {
    const sel = window.getSelection();
    let text = (sel && String(sel)) || fallbackText || '';
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) return;

    let target = null;
    if (sel && sel.rangeCount) {
      try {
        target = blockAncestor(sel.getRangeAt(0).endContainer);
      } catch (_) { /* ignore */ }
    }
    if (!target || !target.isConnected) target = document.body;

    // 同一段落重复划词翻译时，先移除上一条译文，避免堆叠
    const existing = target.querySelector(':scope > .' + TRANS_CLASS + '[data-dsx="1"]');
    if (existing) existing.remove();

    const unit = { kind: 'element', el: target, text: text, id: ++state.seq, selection: true };
    const holder = makeHolder(unit);
    holder.classList.add('dsx-selection');
    if (!mountHolder(unit, holder)) return;
    state.units.set(unit.id, unit);
    state.stats.total++;
    setLoading(unit);
    sendBatch([unit]);
  }

  /* ------------------------------------------------------------- 消息接口 */

  function handleCommand(msg) {
    switch (msg.cmd) {
      case 'toggle':
        state.active ? stop() : start();
        break;
      case 'on':
        start();
        break;
      case 'off':
        stop();
        break;
      case 'translateSelection':
        translateSelection(msg.text);
        break;
      case 'rescan':
        scan(document.body);
        break;
      case 'restyle':
        loadSettings().then(restyle);
        break;
      case 'status':
        break;
    }
    return {
      ok: true,
      active: state.active,
      host: location.hostname,
      stats: Object.assign({ pending: state.queue.length }, state.stats),
      lastError: state.lastError
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'DSX_CMD') return;
    sendResponse(handleCommand(msg));
    return true;
  });

  // 演示页在扩展内部直接引入本脚本，通过这个入口驱动
  window.__DSX_CMD__ = (cmd, extra) => handleCommand(Object.assign({ cmd: cmd }, extra || {}));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let needRestyle = false;
    for (const key of Object.keys(changes)) {
      if (key in DEFAULTS) {
        state.settings[key] = changes[key].newValue;
        if (key === 'style' || key === 'fontScale') needRestyle = true;
        if (key === 'enabled' && changes[key].newValue === false && state.active) stop();
      }
    }
    if (needRestyle) restyle();
  });

  async function loadSettings() {
    const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
    state.settings = Object.assign({}, DEFAULTS, stored);
    return state.settings;
  }

  /* ------------------------------------------------------------------ 启动 */

  (async function init() {
    try {
      await loadSettings();
    } catch (_) { /* 使用默认值 */ }
    if (shouldAutoStart(state.settings)) {
      if (document.body) start();
      else window.addEventListener('DOMContentLoaded', start, { once: true });
    }
  })();
})();
