/**
 * 스타일 앵커 컨펌 페이지 — 대표님 검토용
 * 수정 하이라이트 + 섹션별 우측 메모
 */
(function () {
  const STORAGE_CHECK = 'dididit-style-anchor-confirm-v1';
  const STORAGE_EDITS = 'dididit-style-anchor-edits-v1';
  const STORAGE_NOTES = 'dididit-style-anchor-notes-v1';

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
  let checked = loadJson(STORAGE_CHECK, {});
  let edits = loadJson(STORAGE_EDITS, {});
  let notes = loadJson(STORAGE_NOTES, {});

  function loadJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
    } catch {
      return fallback;
    }
  }

  function saveChecked() {
    localStorage.setItem(STORAGE_CHECK, JSON.stringify(checked));
  }

  function saveEdits() {
    localStorage.setItem(STORAGE_EDITS, JSON.stringify(edits));
  }

  function saveNotes() {
    localStorage.setItem(STORAGE_NOTES, JSON.stringify(notes));
  }

  function parseStyleAnchor(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    let current = null;
    let body = [];

    function flush() {
      if (!current) return;
      const content = body.join('\n').trim();
      result.push({ title: current, originalBody: content, body: content });
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function sectionId(title) {
    return title.replace(/\s+/g, '-');
  }

  function getBody(s) {
    const id = sectionId(s.title);
    return edits[id] !== undefined ? edits[id] : s.originalBody;
  }

  function isEdited(s) {
    return getBody(s) !== s.originalBody;
  }

  function hasNote(s) {
    const n = notes[sectionId(s.title)];
    return Boolean(n && n.trim());
  }

  function renderDiffHtml(original, edited) {
    if (original === edited) return '';
    const oLines = original.split('\n');
    const eLines = edited.split('\n');
    const max = Math.max(oLines.length, eLines.length);
    const parts = [];
    for (let i = 0; i < max; i++) {
      const o = oLines[i] ?? '';
      const e = eLines[i] ?? '';
      if (o === e) {
        if (e) parts.push(`<div class="diff-line diff-same">${escapeHtml(e)}</div>`);
      } else {
        if (o) parts.push(`<div class="diff-line diff-del">${escapeHtml(o)}</div>`);
        if (e) parts.push(`<div class="diff-line diff-ins">${escapeHtml(e)}</div>`);
      }
    }
    return parts.join('');
  }

  function renderTablePreview(md) {
    const rows = md.split('\n').filter((l) => l.trim().startsWith('|'));
    if (rows.length < 2) return '';
    const parseRow = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
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

  function renderNav() {
    const nav = document.getElementById('nav');
    let html = '<h2>목차</h2>';
    GROUPS.forEach((g) => {
      const items = sections.filter((s) => SECTION_META[s.title]?.group === g.id);
      if (!items.length) return;
      html += `<div style="margin:10px 0 4px;font-weight:600;font-size:.75rem;color:#94a3b8">${g.label}</div>`;
      items.forEach((s) => {
        const id = sectionId(s.title);
        const flags = [];
        if (checked[id]) flags.push('✓');
        if (isEdited(s)) flags.push('✎');
        if (hasNote(s)) flags.push('💬');
        const flagStr = flags.length ? `<span class="flags">${flags.join('')}</span>` : '';
        html += `<a href="#${id}" data-id="${id}">${escapeHtml(s.title)}${flagStr}</a>`;
      });
    });
    html += '<div style="margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0"><a href="#roundup-note">라운드업 안내</a></div>';
    nav.innerHTML = html;
  }

  function bindSectionEvents(article, s) {
    const id = sectionId(s.title);
    const editor = article.querySelector('.section-editor');
    const diffBox = article.querySelector('.diff-box');
    const diffLines = article.querySelector('.diff-lines');
    const memo = article.querySelector('.memo-input');
    const btnRevert = article.querySelector('.btn-revert');
    const checkbox = article.querySelector('input[type=checkbox]');

    function refreshSectionUi() {
      const body = getBody(s);
      const edited = isEdited(s);
      const note = hasNote(s);
      article.classList.toggle('edited', edited);
      article.classList.toggle('has-memo', note);
      article.classList.toggle('ok', checked[id]);
      const badge = article.querySelector('.badge-edit');
      if (badge) badge.hidden = !edited;

      const diffHtml = renderDiffHtml(s.originalBody, body);
      if (diffHtml) {
        diffBox.hidden = false;
        diffLines.innerHTML = diffHtml;
      } else {
        diffBox.hidden = true;
        diffLines.innerHTML = '';
      }
      btnRevert.hidden = !edited;

      const tablePreview = article.querySelector('.table-preview');
      if (tablePreview && SECTION_META[s.title]?.isTable) {
        tablePreview.innerHTML = renderTablePreview(body);
      }
    }

    editor.addEventListener('input', () => {
      const val = editor.value;
      if (val === s.originalBody) {
        delete edits[id];
      } else {
        edits[id] = val;
      }
      saveEdits();
      refreshSectionUi();
      renderNav();
    });

    memo.addEventListener('input', () => {
      const val = memo.value.trim();
      if (val) notes[id] = memo.value;
      else delete notes[id];
      saveNotes();
      refreshSectionUi();
      renderNav();
    });

    btnRevert.addEventListener('click', () => {
      if (!confirm('이 섹션을 원문으로 되돌릴까요?')) return;
      delete edits[id];
      editor.value = s.originalBody;
      saveEdits();
      refreshSectionUi();
      renderNav();
    });

    checkbox.addEventListener('change', () => {
      checked[id] = checkbox.checked;
      saveChecked();
      updateProgress();
      refreshSectionUi();
      renderNav();
    });
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
      const body = getBody(s);
      const edited = isEdited(s);
      const note = notes[id] || '';
      const diffHtml = renderDiffHtml(s.originalBody, body);
      const classes = ['section'];
      if (checked[id]) classes.push('ok');
      if (edited) classes.push('edited');
      if (note.trim()) classes.push('has-memo');

      html += `
        <article class="${classes.join(' ')}" id="${id}" data-id="${id}">
          <div class="section-head">
            <input type="checkbox" data-id="${id}" ${checked[id] ? 'checked' : ''} />
            <span class="meta">
              <h3>${escapeHtml(s.title)}</h3>
              ${meta.tag ? `<span class="tag">${escapeHtml(meta.tag)}</span>` : ''}
              <span class="badge-edit" ${edited ? '' : 'hidden'}>수정됨</span>
            </span>
          </div>
          <div class="section-grid">
            <div class="section-main">
              <div class="diff-box" ${diffHtml ? '' : 'hidden'}>
                <div class="diff-box-head">변경된 부분</div>
                <div class="diff-lines">${diffHtml}</div>
              </div>
              ${meta.isTable ? `<div class="table-preview section-body">${renderTablePreview(body)}</div>` : ''}
              <textarea class="section-editor" data-id="${id}" spellcheck="false">${escapeHtml(body)}</textarea>
              <div class="section-toolbar">
                <button type="button" class="btn-revert small" ${edited ? '' : 'hidden'}>원문 복원</button>
                <span class="hint">본문을 수정하면 위에 변경 줄이 표시됩니다</span>
              </div>
            </div>
            <aside class="section-memo">
              <label for="memo-${id}">메모</label>
              <textarea id="memo-${id}" class="memo-input" data-id="${id}" placeholder="수정 의견·컨펌 코멘트…">${escapeHtml(note)}</textarea>
            </aside>
          </div>
        </article>`;
    });

    html += `
      <h2 class="group-title" id="roundup-note">라운드업 (별도 포맷)</h2>
      <article class="section">
        <div class="section-grid">
          <div class="section-main" style="border-right:0;padding-left:16px">
            <p style="font-size:.88rem;color:#475569;margin-bottom:8px">N개 아이템 영상은 이 스타일 앵커와 <strong>별도</strong>입니다.</p>
            <ul style="font-size:.88rem;color:#475569;padding-left:18px">
              <li>구조: 오프닝 → <code>[제품명]</code> 블록 반복 → 라운드업 클로징</li>
              <li>감지: <code>N가지</code>·<code>꿀템 N</code>·<code>베스트 N</code> 등 개수 신호 필요</li>
            </ul>
          </div>
          <aside class="section-memo">
            <label>메모</label>
            <textarea class="memo-input" id="memo-roundup" placeholder="라운드업 관련 의견…">${escapeHtml(notes['roundup-note'] || '')}</textarea>
          </aside>
        </div>
      </article>`;

    box.innerHTML = html;

    sections.forEach((s) => {
      const article = document.getElementById(sectionId(s.title));
      if (article) bindSectionEvents(article, s);
    });

    const roundupMemo = document.getElementById('memo-roundup');
    if (roundupMemo) {
      roundupMemo.addEventListener('input', () => {
        const val = roundupMemo.value.trim();
        if (val) notes['roundup-note'] = roundupMemo.value;
        else delete notes['roundup-note'];
        saveNotes();
      });
    }
  }

  function updateProgress() {
    const total = sections.length;
    const done = sections.filter((s) => checked[sectionId(s.title)]).length;
    const editedCount = sections.filter((s) => isEdited(s)).length;
    const noteCount = sections.filter((s) => hasNote(s)).length + (notes['roundup-note']?.trim() ? 1 : 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('progress-text').textContent =
      `${done} / ${total} 확인 (${pct}%)` +
      (editedCount ? ` · 수정 ${editedCount}` : '') +
      (noteCount ? ` · 메모 ${noteCount}` : '');
    document.getElementById('progress-bar').style.width = `${pct}%`;
    document.getElementById('done-banner').classList.toggle('show', done === total && total > 0);
  }

  function copySummary() {
    const lines = ['[디디딧 스타일 앵커 컨펌]', `일시: ${new Date().toLocaleString('ko-KR')}`, ''];
    sections.forEach((s) => {
      const id = sectionId(s.title);
      const flags = [];
      if (checked[id]) flags.push('확인');
      if (isEdited(s)) flags.push('수정');
      if (hasNote(s)) flags.push('메모');
      lines.push(`${flags.length ? `[${flags.join(',')}]` : '[ ]'} ${s.title}`);
      if (hasNote(s)) lines.push(`  메모: ${notes[id].trim()}`);
      if (isEdited(s)) {
        lines.push('  --- 수정본 ---');
        lines.push(getBody(s).split('\n').map((l) => `  ${l}`).join('\n'));
      }
    });
    if (notes['roundup-note']?.trim()) {
      lines.push('', '[메모] 라운드업', notes['roundup-note'].trim());
    }
    const done = sections.every((s) => checked[sectionId(s.title)]);
    lines.push('', done ? '상태: 전체 컨펌 완료' : '상태: 검토 중');
    navigator.clipboard.writeText(lines.join('\n'));
    alert('컨펌 요약(메모·수정 포함)을 클립보드에 복사했습니다.');
  }

  function resetAll() {
    if (!confirm('확인 체크·수정·메모를 모두 초기화할까요?')) return;
    checked = {};
    edits = {};
    notes = {};
    saveChecked();
    saveEdits();
    saveNotes();
    renderSections();
    renderNav();
    updateProgress();
  }

  async function init() {
    const res = await fetch('../../prompts/style-anchor.txt');
    if (!res.ok) throw new Error('style-anchor.txt 로드 실패');
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

    document.getElementById('btn-reset').addEventListener('click', resetAll);
    document.getElementById('btn-copy').addEventListener('click', copySummary);

    document.getElementById('nav').addEventListener('click', (e) => {
      const a = e.target.closest('a[data-id]');
      if (!a) return;
      document.querySelectorAll('.nav a').forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
    });
  }

  init().catch((e) => {
    document.body.innerHTML = `<p style="padding:32px;color:#b91c1c;font-family:sans-serif">로드 실패: ${e.message}</p>`;
  });
})();
