/** 서치 감사 로그 — Cursor 리뷰·링크 검증 추적 */
(function () {
  const RESEARCH_LOG_KEY = 'dididit-research-log-v1';
  const RESEARCH_LOG_MAX = 30;

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
      const saved = JSON.parse(localStorage.getItem(RESEARCH_LOG_KEY) || '[]');
      entries.length = 0;
      if (Array.isArray(saved)) entries.push(...saved.slice(-RESEARCH_LOG_MAX));
    } catch {
      entries.length = 0;
    }
  }

  function save() {
    try {
      localStorage.setItem(RESEARCH_LOG_KEY, JSON.stringify(entries.slice(-RESEARCH_LOG_MAX)));
    } catch {
      /* quota */
    }
  }

  function logRun(audit) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
      ...audit,
    };
    entries.push(entry);
    if (entries.length > RESEARCH_LOG_MAX) {
      entries.splice(0, entries.length - RESEARCH_LOG_MAX);
    }
    save();
    render();
    updateBadge();
    console.info('[research-audit]', entry);
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
        const header = `[${formatTime(e.time)}] ${e.deviceLabel || e.deviceId || '서치'} · ${e.model || '?'}`;
        const summary = e.summary
          ? `\nsummary: ${JSON.stringify(e.summary, null, 2)}`
          : '';
        const phases = e.phases?.length
          ? `\nphases:\n${JSON.stringify(e.phases, null, 2)}`
          : '';
        const products = e.finalProducts?.length
          ? `\nfinalProducts:\n${JSON.stringify(e.finalProducts, null, 2)}`
          : '';
        const criteria = e.criteria
          ? `\ncriteria: ${JSON.stringify(e.criteria, null, 2)}`
          : '';
        return `${header}${criteria}${summary}${phases}${products}`;
      })
      .join('\n\n==========\n\n');
  }

  function render() {
    const list = document.getElementById('research-log-list');
    const empty = document.getElementById('research-log-empty');
    const countEl = document.getElementById('research-log-count');
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
        const sum = e.summary || {};
        const verified = sum.verifiedCount ?? '?';
        const total = sum.totalProducts ?? '?';
        const stripped = sum.strippedLinks ?? 0;
        const model = esc(e.model || '?');
        const issues = (e.finalProducts || [])
          .filter((p) => p.verificationStatus !== 'verified' || p.linkWarnings?.length)
          .map(
            (p) =>
              `${esc(p.brand)} ${esc(p.model)}: ${esc(p.verificationStatus || (p.verified ? 'verified' : 'unverified'))}${p.linkWarnings?.length ? ` (${p.linkWarnings.join(', ')})` : ''}`
          )
          .join('<br/>');
        const issuesHtml = issues
          ? `<details class="error-log-stack"><summary>링크·모델 이슈</summary><p class="hint">${issues}</p></details>`
          : '';
        const phasesHtml = e.phases?.length
          ? `<details class="error-log-stack"><summary>단계별 raw (${e.phases.length})</summary><pre>${esc(JSON.stringify(e.phases, null, 2).slice(0, 12000))}</pre></details>`
          : '';
        return `<li class="error-log-item">
        <div class="error-log-head">
          <time>${esc(formatTime(e.time))}</time>
          <span class="error-log-ctx">${esc(e.deviceLabel || e.deviceId)}</span>
        </div>
        <p class="error-log-msg">검증 ${verified}/${total} · 링크 제거 ${stripped} · ${model}</p>
        ${issuesHtml}
        ${phasesHtml}
      </li>`;
      })
      .join('');
  }

  function updateBadge() {
    const badge = document.getElementById('research-log-badge');
    if (!badge) return;
    const issueCount = entries.filter((e) => {
      const sum = e.summary || {};
      return (sum.verifiedCount ?? 0) < (sum.totalProducts ?? 0) || (sum.strippedLinks ?? 0) > 0;
    }).length;
    if (issueCount) {
      badge.textContent = issueCount > 99 ? '99+' : String(issueCount);
      badge.classList.remove('hidden');
    } else if (entries.length) {
      badge.textContent = String(entries.length);
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
    a.download = `dididit-research-log_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  }

  window.DIDIDIT_RESEARCH_LOG = {
    load,
    logRun,
    clear,
    render,
    updateBadge,
    getEntries,
    toExportText,
    downloadTxt,
  };
})();
