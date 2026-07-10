/**
 * 브랜드 포털 대본 뷰 — 시트/콘티 데이터에서 대본 열만 읽기 전용 표시
 */
window.DdditScriptView = (function () {
  const IS_WEB_HOSTED =
    location.protocol === 'https:' && /^works\.mansejin\.com$/i.test(location.hostname);
  const API_BASE = IS_WEB_HOSTED ? 'https://works-api.mansejin.com' : 'http://localhost:8788';

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function extractScriptLines(rows) {
    return (rows || [])
      .map((row) => String(row?.대본 || row?.script || '').trim())
      .filter(Boolean);
  }

  function renderProse(container, lines, options = {}) {
    if (!container) return;
    if (!lines.length) {
      container.innerHTML = `<p class="script-empty">${esc(options.emptyText || '등록된 대본이 없습니다.')}</p>`;
      return;
    }
    container.innerHTML = lines
      .map((line) => `<p class="script-line">${esc(line)}</p>`)
      .join('');
  }

  async function loadProjectData(project, api) {
    if (IS_WEB_HOSTED) {
      const res = await fetch(`${API_BASE}/api/dddit/sheet/get?project=${encodeURIComponent(project)}`);
      if (res.ok) {
        const data = await res.json();
        return {
          project: data.project || project,
          title: data.title || '',
          rows: data.rows || [],
        };
      }
    }
    return api.load(project);
  }

  async function mount(options) {
    const {
      project,
      api = window.DdditContiApi,
      titleEl,
      statusEl,
      proseEl,
      emptyEl,
      tableEl,
      defaultTitle = '대본',
      hubLabel,
    } = options;

    if (!api?.load) throw new Error('DdditContiApi가 필요합니다.');

    try {
      const data = await loadProjectData(project, api);
      const title = data.title || defaultTitle;
      const lines = extractScriptLines(data.rows);

      if (titleEl) titleEl.textContent = title;
      if (statusEl) {
        statusEl.textContent = lines.length
          ? `${lines.length}행 · 대본만 · 읽기 전용`
          : '대본 없음 · 읽기 전용';
        statusEl.classList.remove('error');
      }
      if (hubLabel && options.hubEl) options.hubEl.textContent = hubLabel;

      if (tableEl) tableEl.hidden = true;
      if (emptyEl) emptyEl.hidden = lines.length > 0;
      renderProse(proseEl, lines, { emptyText: '등록된 대본이 없습니다.' });

      return { ...data, scriptLines: lines };
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = '대본을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
        statusEl.classList.add('error');
      }
      if (proseEl) proseEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      throw err;
    }
  }

  return { esc, extractScriptLines, renderProse, mount };
})();
