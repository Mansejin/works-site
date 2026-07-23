/**
 * 디디딧 콘티 ↔ Google 시트
 * 브랜드(프로젝트)마다 스프레드시트 1개 · works.mansejin.com 은 NAS works-api 경유
 */
window.DdditSheetSync = (function () {
  const HEADERS = ['대본', '장면', '자막', '코멘트'];

  const PROJECT_LABELS = {
    xenics: 'Xenics',
    vendict: '벤딕트',
    inic: '아이닉',
    galaxy: '갤럭시 Z 폴드8',
    default: '기본',
  };

  function normalizeApiUrl(url) {
    return String(url || '').trim().replace(/\/$/, '');
  }

  function projectSlug() {
    return new URLSearchParams(location.search).get('project') || 'default';
  }

  function projectLabel(project) {
    return PROJECT_LABELS[project] || project;
  }

  function useBackend() {
    return window.DdditWorksApi?.isBackendMode?.() === true;
  }

  function backendBase() {
    return window.DdditWorksApi.baseUrl();
  }

  function buildUrl(base, params) {
    const u = new URL(base);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') u.searchParams.set(k, v);
    });
    return u.toString();
  }

  async function directRequest(config, method, params, body) {
    const base = normalizeApiUrl(config.apiUrl);
    const token = String(config.token || '').trim();
    if (!base || !token) {
      throw new Error('시트 API URL과 토큰을 API 설정에서 입력해 주세요.');
    }

    const url = method === 'GET' ? buildUrl(base, { ...params, token }) : base;

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

  async function backendRequest(method, path, params, body) {
    const base = `${backendBase()}/api/dddit/sheet`;
    let url = `${base}${path}`;
    if (method === 'GET' && params) {
      url = buildUrl(url, params);
    }

    let res;
    try {
      res = await fetch(url, {
        method,
        headers:
          method === "POST"
            ? window.DdditApiAuth?.authHeaders?.({ "Content-Type": "application/json" }) || {
                "Content-Type": "application/json",
              }
            : window.DdditApiAuth?.authHeaders?.() || {},
        body: method === "POST" ? JSON.stringify(body || {}) : undefined,
      });
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (/failed to fetch|networkerror|load failed|네트워크/i.test(msg)) {
        throw new Error(
          "시트 서버에 연결하지 못했습니다 (Failed to fetch). 네트워크·works-api 상태를 확인한 뒤 다시 시도해 주세요.",
        );
      }
      throw err;
    }

    if (window.DdditApiAuth?.handleUnauthorized?.(res)) {
      throw new Error("Team authentication required");
    }

    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      if (!res.ok) {
        throw new Error(
          `시트 API 오류 (${res.status}). 서버가 JSON 대신 오류 페이지를 반환했습니다.`,
        );
      }
      throw new Error('시트 API 응답을 읽을 수 없습니다.');
    }
    if (!res.ok) {
      const detail = data.detail || data.error || `works-api 오류 (${res.status})`;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return data;
  }

  async function request(config, method, action, extraParams, body) {
    if (useBackend()) {
      if (action === 'meta') return backendRequest('GET', '/meta');
      if (action === 'ensure') {
        return backendRequest('GET', '/ensure', { project: extraParams.project });
      }
      if (action === 'get') {
        return backendRequest('GET', '/get', { project: extraParams.project });
      }
      if (action === 'replace') {
        return backendRequest('POST', '/replace', null, {
          project: body.project,
          rows: body.rows,
        });
      }
      if (action === 'append') {
        return backendRequest('POST', '/append', null, {
          project: body.project,
          rows: body.rows,
        });
      }
    }
    return directRequest(config, method, { action, ...extraParams }, body);
  }

  function rowsFromState(allRows) {
    return (allRows || []).map((r) => ({
      대본: r.대본 || '',
      장면: r.장면 || '',
      자막: r.자막 || '',
      코멘트: r.코멘트 || '',
    }));
  }

  return {
    HEADERS,
    PROJECT_LABELS,
    projectSlug,
    projectLabel,
    useBackend,

    async fetchMeta(config) {
      return request(config, 'GET', 'meta', {}, null);
    },

    async lookup(config, project) {
      const slug = project || projectSlug();
      const meta = await request(config, 'GET', 'meta', {}, null);
      const found = (meta.projects || []).find((item) => item.project === slug);
      if (!found) {
        return { ok: true, exists: false, project: slug };
      }
      return { ok: true, exists: true, project: slug, ...found };
    },

    async ensure(config, project) {
      const slug = project || projectSlug();
      return request(config, 'GET', 'ensure', { project: slug }, null);
    },

    async pull(config, project) {
      const slug = project || projectSlug();
      const data = await request(config, 'GET', 'get', { project: slug }, null);
      return {
        project: slug,
        tab: data.tab || '콘티',
        title: data.title || '',
        spreadsheetId: data.spreadsheetId,
        spreadsheetUrl: data.spreadsheetUrl,
        rows: data.rows || [],
      };
    },

    async pushReplace(config, allRows, project) {
      const slug = project || projectSlug();
      const rows = rowsFromState(allRows);
      const data = await request(config, 'POST', 'replace', {}, { project: slug, rows });
      return data;
    },

    async pushAppend(config, allRows, project) {
      const slug = project || projectSlug();
      const rows = rowsFromState(allRows);
      return request(config, 'POST', 'append', {}, { project: slug, rows });
    },

    /** 프로젝트 시트가 없으면 디디딧 Drive에 생성 후 덮어쓰기 */
    async exportToSheet(config, allRows, project) {
      const slug = project || projectSlug();
      const ensured = await request(config, 'GET', 'ensure', { project: slug }, null);
      const replaced = await request(
        config,
        'POST',
        'replace',
        {},
        { project: slug, rows: rowsFromState(allRows) }
      );
      return {
        ...replaced,
        created: ensured.created,
        title: replaced.title || ensured.title,
        spreadsheetId: replaced.spreadsheetId || ensured.spreadsheetId,
        spreadsheetUrl: replaced.spreadsheetUrl || ensured.spreadsheetUrl,
      };
    },
  };
})();
