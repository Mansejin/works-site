/**
 * 스타일 앵커 컨펌 페이지 — 대표님 검토용
 */
(function () {
  const STORAGE_KEY = 'dididit-style-anchor-confirm-v1';

  const GROUPS = [
    { id: 'common', label: '공통' },
    { id: 'prologue', label: '프롤로그' },
    { id: 'body', label: '본문 챕터' },
    { id: 'closing', label: '클로징' },
    { id: 'rules', label: '추가 규칙' },
  ];

  const SECTION_META = {
    '문장 습관': { group: 'common', tag: '공통 규칙' },
    '챕터별 요약': { group: 'common', tag: '한눈에 보기', isTable: true },
    '프롤로그 · 기본형': { group: 'prologue', tag: '짧게 · 한 줄 훅' },
    '프롤로그 · 결론 선행형': { group: 'prologue', tag: '타겟·포지션 먼저' },
    '프롤로그 · 후속·비교형': { group: 'prologue', tag: '시리즈·업그레이드' },
    디자인: { group: 'body', tag: '형태·배치·재질' },
    '성능·제원': { group: 'body', tag: '스펙 덩어리' },
    실사용: { group: 'body', tag: '체감·단점 ★' },
    '가격 · 단독': { group: 'body', tag: '라인업·구매 주의' },
    '총평 · 가격 엮음': { group: 'body', tag: '가격+추천+단점' },
    '총평 · 가격 비교': { group: 'body', tag: '경쟁·비추천' },
    '클로징 · 단일 제품': { group: 'closing', tag: '장단점·평점' },
    '클로징 · 라운드업': { group: 'closing', tag: 'N개 · 정보 정리' },
    '프롤로그 규칙': { group: 'rules', tag: '패턴 선택' },
    '가격·총평 규칙': { group: 'rules', tag: '챕터 분기' },
    '디자인·성능 규칙': { group: 'rules', tag: '챕터 분기' },
  };

  let sections = [];
  let checked = loadChecked();

  function loadChecked() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveChecked() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
  }

  function parseStyleAnchor(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    let current = null;
    let body = [];

    function flush() {
      if (!current) return;
      result.push({ title: current, body: body.join('\n').trim() });
      body = [];
    }

    for (const line of lines) {
      if (line.startsWith('## ')) {
        flush();
        current = line.slice(3).trim();
      } else if (current && !line.startsWith('# ═') && !line.startsWith('# ─')) {
        if (line.startsWith('# ') && !line.startsWith('## ')) continue;
        body.push(line);
      }
    }
    flush();
    return result;
  }

  function renderTable(md) {
    const rows = md.split('\n').filter((l) => l.trim().startsWith('|'));
    if (rows.length < 2) return `<pre>${escapeHtml(md)}</pre>`;
    const parseRow = (r) =>
      r
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
    const header = parseRow(rows[0]);
    const data = rows.slice(2).map(parseRow);
    let html = '<table><thead><tr>';
    header.forEach((h) => { html += `<th>${escapeHtml(h)}</th>`; });
    html += '</tr></thead><tbody>';
    data.forEach((row) => {
      html += '<tr>';
      row.forEach((c) => { html += `<td>${escapeHtml(c)}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function sectionId(title) {
    return title.replace(/\s+/g, '-');
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    let html = '<h2>목차</h2>';
    GROUPS.forEach((g) => {
      const items = sections.filter((s) => SECTION_META[s.title]?.group === g.id);
      if (!items.length) return;
      html += `<div style="margin:10px 0 4px;font-weight:600;font-size:.75rem;color:#94a3b8">${g.label}</div>`;
      items.forEach((s) => {
        const id = sectionId(s.title);
        const ok = checked[id] ? ' ✓' : '';
        html += `<a href="#${id}" data-id="${id}">${s.title}${ok}</a>`;
      });
    });
    html += `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0"><a href="#roundup-note" id="roundup-note">라운드업 안내</a></div>`;
    nav.innerHTML = html;
  }

  function renderSections() {
    const box = document.getElementById('sections');
    let html = '';
    let lastGroup = '';

    sections.forEach((s) => {
      const meta = SECTION_META[s.title] || { group: 'common', tag: '' };
      const g = GROUPS.find((x) => x.id === meta.group);
      if (g && g.label !== lastGroup) {
        html += `<h2 class="group-title">${g.label}</h2>`;
        lastGroup = g.label;
      }
      const id = sectionId(s.title);
      const isOk = checked[id];
      const bodyHtml = meta.isTable ? renderTable(s.body) : `<pre>${escapeHtml(s.body)}</pre>`;
      html += `
        <article class="section${isOk ? ' ok' : ''}" id="${id}">
          <label class="section-head">
            <input type="checkbox" data-id="${id}" ${isOk ? 'checked' : ''} />
            <span class="meta">
              <h3>${escapeHtml(s.title)}</h3>
              ${meta.tag ? `<span class="tag">${escapeHtml(meta.tag)}</span>` : ''}
            </span>
          </label>
          <div class="section-body">${bodyHtml}</div>
        </article>`;
    });

    html += `
      <h2 class="group-title" id="roundup-note">라운드업 (별도 포맷)</h2>
      <article class="section">
        <div class="section-body" style="padding:16px">
          <p class="rules">N개 아이템 영상(다이소·쿠팡·무인양품 등)은 이 스타일 앵커와 <strong>별도</strong>입니다.</p>
          <ul style="font-size:.88rem;color:#475569;padding-left:18px">
            <li>구조: 오프닝 → <code>[제품명]</code> 블록 반복 → 라운드업 클로징</li>
            <li>감지: <code>N가지</code>·<code>꿀템 N</code>·<code>베스트 N</code> 등 개수 신호 필요</li>
            <li>브랜드만으로는 단일 제품 리뷰로 처리</li>
          </ul>
        </div>
      </article>`;

    box.innerHTML = html;

    box.querySelectorAll('input[type=checkbox]').forEach((inp) => {
      inp.addEventListener('change', () => {
        checked[inp.dataset.id] = inp.checked;
        saveChecked();
        updateProgress();
        inp.closest('.section').classList.toggle('ok', inp.checked);
        renderNav();
      });
    });
  }

  function updateProgress() {
    const total = sections.length;
    const done = sections.filter((s) => checked[sectionId(s.title)]).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('progress-text').textContent = `${done} / ${total} 확인 (${pct}%)`;
    document.getElementById('progress-bar').style.width = `${pct}%`;
    document.getElementById('done-banner').classList.toggle('show', done === total && total > 0);
  }

  function copySummary() {
    const lines = ['[디디딧 스타일 앵커 컨펌]', `일시: ${new Date().toLocaleString('ko-KR')}`, ''];
    sections.forEach((s) => {
      const id = sectionId(s.title);
      lines.push(`${checked[id] ? '✅' : '⬜'} ${s.title}`);
    });
    const done = sections.every((s) => checked[sectionId(s.title)]);
    lines.push('', done ? '상태: 전체 컨펌 완료' : '상태: 검토 중');
    navigator.clipboard.writeText(lines.join('\n'));
    alert('컨펌 요약을 클립보드에 복사했습니다.');
  }

  async function init() {
    const res = await fetch('../../prompts/style-anchor.txt');
    if (!res.ok) throw new Error('style-anchor.txt 로드 실패 — 로컬 서버에서 열어주세요.');
    const text = await res.text();
    sections = parseStyleAnchor(text);
    renderNav();
    renderSections();
    updateProgress();

    document.getElementById('btn-all').addEventListener('click', () => {
      sections.forEach((s) => { checked[sectionId(s.title)] = true; });
      saveChecked();
      renderSections();
      renderNav();
      updateProgress();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (!confirm('확인 체크를 모두 초기화할까요?')) return;
      checked = {};
      saveChecked();
      renderSections();
      renderNav();
      updateProgress();
    });

    document.getElementById('btn-copy').addEventListener('click', copySummary);

    document.getElementById('nav').addEventListener('click', (e) => {
      const a = e.target.closest('a[data-id]');
      if (!a) return;
      document.querySelectorAll('.nav a').forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
    });
  }

  init().catch((e) => {
    document.body.innerHTML = `<p style="padding:32px;color:#b91c1c;font-family:sans-serif">로드 실패: ${e.message}<br><br>works-site 루트에서 HTTP 서버 실행 후<br><code>dddit/script/dev/qc/style-anchor.html</code> 을 열어주세요.</p>`;
  });
})();
