/**
 * 디디딧 콘티 ↔ Google 시트 (Apps Script Web App)
 */
window.DdditSheetSync = (function () {
  const HEADERS = ['대본', '장면', '사이즈', '자막', '코멘트'];

  const PROJECT_TABS = {
    xenics: 'Xenics',
    default: '콘티',
  };

  function normalizeApiUrl(url) {
    return String(url || '').trim().replace(/\/$/, '');
  }

  function projectSlug() {
    return new URLSearchParams(location.search).get('project') || 'default';
  }

  function tabLabel(project) {
    return PROJECT_TABS[project] || project;
  }

  function buildUrl(base, params) {
    const u = new URL(base);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') u.searchParams.set(k, v);
    });
    return u.toString();
  }

  async function request(config, method, params, body) {
    const base = normalizeApiUrl(config.apiUrl);
    const token = String(config.token || '').trim();
    if (!base || !token) {
      throw new Error('시트 API URL과 토큰을 API 설정에서 입력해 주세요.');
    }

    const url =
      method === 'GET'
        ? buildUrl(base, { ...params, token })
        : base;

    const res = await fetch(url, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined,
      body:
        method === 'POST'
          ? JSON.stringify({ ...body, token, action: params.action })
          : undefined,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('시트 API 응답을 읽을 수 없습니다.');
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `시트 API 오류 (${res.status})`);
    }
    return data;
  }

  function rowsFromState(allRows) {
    return (allRows || []).map((r) => ({
      대본: r.대본 || '',
      장면: r.장면 || '',
      사이즈: r.사이즈 || '',
      자막: r.자막 || '',
      코멘트: r.코멘트 || '',
    }));
  }

  return {
    HEADERS,
    PROJECT_TABS,
    projectSlug,
    tabLabel,

    async fetchMeta(config) {
      return request(config, 'GET', { action: 'meta' });
    },

    async pull(config, project) {
      const slug = project || projectSlug();
      const data = await request(config, 'GET', { action: 'get', project: slug });
      return { project: slug, tab: data.tab || tabLabel(slug), rows: data.rows || [] };
    },

    async pushReplace(config, allRows, project) {
      const slug = project || projectSlug();
      const rows = rowsFromState(allRows);
      return request(config, 'POST', { action: 'replace' }, { project: slug, rows });
    },

    async pushAppend(config, allRows, project) {
      const slug = project || projectSlug();
      const rows = rowsFromState(allRows);
      return request(config, 'POST', { action: 'append' }, { project: slug, rows });
    },
  };
})();
