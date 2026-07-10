/** 오류 로그 — localStorage 영속, UI 연동 */
(function () {
  const ERROR_LOG_KEY = 'dididit-error-log-v1';
  const ERROR_LOG_MAX = 80;

  const entries = [];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('ko-KR');
    } catch {
      return iso;
    }
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
      entries.length = 0;
      if (Array.isArray(saved)) entries.push(...saved.slice(-ERROR_LOG_MAX));
    } catch {
      entries.length = 0;
    }
  }

  function save() {
    try {
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(entries.slice(-ERROR_LOG_MAX)));
    } catch {
      /* quota */
    }
  }

  function log(context, error, meta = {}) {
    const message = error?.message || String(error || '알 수 없는 오류');
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
      context: context || 'unknown',
      message,
      stack: error?.stack || '',
      meta: meta && typeof meta === 'object' ? meta : {},
    };
    entries.push(entry);
    if (entries.length > ERROR_LOG_MAX) {
      entries.splice(0, entries.length - ERROR_LOG_MAX);
    }
    save();
    render();
    updateBadge();
    console.error(`[${entry.context}]`, message, meta, error);
    return entry;
  }

  function getEntries() {
    return entries.slice();
  }

  function clear() {
    entries.length = 0;
    save();
    render();
    updateBadge();
  }

  function toExportText() {
    if (!entries.length) return '';
    return entries
      .map((e) => {
        const meta =
          e.meta && Object.keys(e.meta).length
            ? `\nmeta: ${JSON.stringify(e.meta)}`
            : '';
        const stack = e.stack ? `\n${e.stack}` : '';
        return `[${formatTime(e.time)}] ${e.context}\n${e.message}${meta}${stack}`;
      })
      .join('\n\n---\n\n');
  }

  function render() {
    const list = document.getElementById('error-log-list');
    const empty = document.getElementById('error-log-empty');
    const countEl = document.getElementById('error-log-count');
    if (!list) return;

    if (countEl) countEl.textContent = `${entries.length}건`;

    if (!entries.length) {
      list.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    list.innerHTML = entries
      .slice()
      .reverse()
      .map((e) => {
        const metaBits = [];
        if (e.meta.model) metaBits.push(`모델: ${esc(e.meta.model)}`);
        if (e.meta.part) metaBits.push(`파트: ${esc(e.meta.part)}`);
        if (e.meta.status) metaBits.push(`HTTP ${esc(e.meta.status)}`);
        const metaHtml = metaBits.length
          ? `<div class="error-log-meta">${metaBits.join(' · ')}</div>`
          : '';
        const stackHtml = e.stack
          ? `<details class="error-log-stack"><summary>스택</summary><pre>${esc(e.stack)}</pre></details>`
          : '';
        return `<li class="error-log-item">
        <div class="error-log-head">
          <time>${esc(formatTime(e.time))}</time>
          <span class="error-log-ctx">${esc(e.context)}</span>
        </div>
        <p class="error-log-msg">${esc(e.message)}</p>
        ${metaHtml}
        ${stackHtml}
      </li>`;
      })
      .join('');
  }

  function updateBadge() {
    const badge = document.getElementById('error-log-badge');
    if (!badge) return;
    if (entries.length) {
      badge.textContent = entries.length > 99 ? '99+' : String(entries.length);
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  }

  function downloadTxt() {
    const text = toExportText();
    if (!text) return false;
    const blob = new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dididit-error-log_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  }

  window.DIDIDIT_LOG = {
    load,
    log,
    clear,
    render,
    updateBadge,
    getEntries,
    toExportText,
    downloadTxt,
  };
})();
