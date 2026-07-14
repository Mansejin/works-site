(function () {
'use strict';

const STORAGE_KEY = 'dididit-script-machine-v2';
const PROJECT_STORAGE_PREFIX = 'dididit-project-v2';
const SHEET_SETTINGS_KEY = 'dididit-sheet-settings-v1';

let PM = null;
let REF = null;
let LOG = null;
let BRIEF = null;
let PIPE = null;
let SESSION = null;

const state = {
  apiKey: '',
  modelPro: 'gemini-3.1-pro-preview',
  productSpecs: {},
  priceInfo: '',
  categoryId: 'other',
  referenceScripts: [],
  chapters: [],
  proseDraft: '',
  allRows: [],
  pipelineStep: 1,
  sheetOpenUrl: '',
};

const $ = (sel) => document.querySelector(sel);

function getSheetSlug() {
  return window.DdditSheetSync?.projectSlug?.() || 'default';
}

function projectStorageKey() {
  return `${PROJECT_STORAGE_PREFIX}-${getSheetSlug()}`;
}

function isApiReady() {
  const api = window.DdditWorksApi;
  if (api?.isBackendMode?.()) return api.isApiReady(state.apiKey);
  return Boolean(String(state.apiKey || '').trim());
}

function requireApiReady() {
  if (isApiReady()) return true;
  showToast(window.DdditWorksApi?.isBackendMode?.() ? 'works-api 연결을 확인하세요.' : 'API 키를 입력하세요.', true);
  return false;
}

function applyHostedMode() {
  if (window.DdditWorksApi?.isBackendMode?.()) document.body.classList.add('hosted');
}

function bindModules() {
  PM = window.DIDIDIT_PROMPT;
  REF = window.DIDIDIT_REF;
  LOG = window.DIDIDIT_LOG;
  BRIEF = window.DIDIDIT_BRIEF;
  PIPE = window.DIDIDIT_PIPELINE;
  SESSION = window.DIDIDIT_SESSION;
  if (!PM || !REF || !BRIEF || !PIPE || !SESSION) throw new Error('스크립트 모듈 로드 실패');
}

function getSystemRules(stage) {
  if (stage && PM.getSystemRulesForStage) return PM.getSystemRulesForStage(stage);
  return PM.getActiveSystemRules();
}

function getCategories() {
  return window.DIDIDIT_CONFIG?.CATEGORIES || [];
}

function getCategory(id) {
  const cats = getCategories();
  return cats.find((c) => c.id === id) || cats.find((c) => c.id === 'other') || { id: 'other', name: '기타', focusHints: '' };
}

function loadPlanData() {
  const project = getSheetSlug();
  if (!project || project === 'default') return null;
  return window.DdditPlanBriefSync?.loadPlan(project) || null;
}

function formatPlanUpdatedAt(ts) {
  const n = Number(ts) || 0;
  if (!n) return '기본 기획안';
  try {
    return new Date(n).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '저장됨';
  }
}

function renderPlanProjectPicker() {
  const SYNC = window.DdditPlanBriefSync;
  const select = $('#plan-project-select');
  const list = $('#plan-project-list');
  const hint = $('#plan-load-hint');
  if (!SYNC?.listProjects || !select) return;

  const current = getSheetSlug();
  const projects = SYNC.listProjects();
  const previous = select.value;

  select.innerHTML = [
    '<option value="">프로젝트 선택…</option>',
    ...projects.map((p) => {
      const mark = p.hasSaved ? '저장됨' : (p.source === 'default' ? '기본' : '');
      const title = p.title ? ` — ${p.title}` : '';
      const suffix = mark ? ` (${mark})` : '';
      return `<option value="${esc(p.slug)}">${esc(p.label)}${esc(title)}${esc(suffix)}</option>`;
    }),
  ].join('');

  const preferred = projects.some((p) => p.slug === current && current !== 'default')
    ? current
    : (projects.some((p) => p.slug === previous) ? previous : '');
  select.value = preferred;

  if (list) {
    list.innerHTML = projects.map((p) => {
      const active = p.slug === current && current !== 'default';
      const status = p.hasSaved
        ? `로컬 저장 · ${formatPlanUpdatedAt(p.updatedAt)}`
        : (p.hasPlan ? '기본 기획안' : '기획안 없음');
      return `
        <li>
          <button type="button" class="plan-project-item${active ? ' is-active' : ''}" data-plan-project="${esc(p.slug)}">
            <span class="plan-project-item-label">${esc(p.label)}</span>
            <span class="plan-project-item-title">${esc(p.title || '제목 없음')}</span>
            <span class="plan-project-item-meta">${esc(status)}${active ? ' · 현재' : ''}</span>
          </button>
        </li>`;
    }).join('');
  }

  if (hint) {
    if (current && current !== 'default') {
      const active = projects.find((p) => p.slug === current);
      hint.textContent = active?.hasPlan
        ? `${SYNC.projectLabel(current)} 기획안을 사용 중입니다.`
        : `${SYNC.projectLabel(current)}에 저장된 기획안이 없습니다.`;
    } else {
      hint.textContent = '프로젝트를 고른 뒤 「기획안 불러오기」를 누르세요.';
    }
  }
}

function setProjectSlug(slug) {
  const next = String(slug || '').trim().toLowerCase();
  const url = new URL(location.href);
  if (!next || next === 'default') url.searchParams.delete('project');
  else url.searchParams.set('project', next);
  history.replaceState({}, '', url);
}

function switchToProject(slug, options = {}) {
  const next = String(slug || '').trim().toLowerCase();
  if (!next) {
    showToast('프로젝트를 선택하세요.', true);
    return false;
  }
  const current = getSheetSlug();
  if (next === current && !options.forceReload) {
    renderPlanSummary();
    renderChapters();
    updateProjectChrome();
    showToast(`${window.DdditPlanBriefSync?.projectLabel?.(next) || next} 기획안을 확인했습니다.`);
    return true;
  }

  saveProject();
  setProjectSlug(next);
  loadProject();
  // 기획안 구성으로 챕터 제목 QC 강제 적용 (로컬에 긴 제목이 남아 있어도 덮어씀)
  applyChaptersFromPlan({ force: true });
  state.pipelineStep = 1;
  applyBriefToDOM();
  updateProjectChrome();
  updatePipelineUI();
  renderPlanProjectPicker();

  const plan = loadPlanData();
  const label = window.DdditPlanBriefSync?.projectLabel?.(next) || next;
  if (plan?.title) {
    const n = state.chapters.length;
    showToast(n ? `${label} 기획안 · 챕터 ${n}개 짧은 제목 적용` : `${label} 기획안을 불러왔습니다.`);
  } else showToast(`${label}에 기획안이 없습니다. 「기획안 편집」에서 작성하세요.`, true);
  return true;
}

function loadSelectedPlanProject() {
  const slug = $('#plan-project-select')?.value || '';
  switchToProject(slug, { forceReload: true });
}

function chaptersNeedQc(chapters) {
  const QC = window.DdditChapterTitleQc;
  if (!Array.isArray(chapters) || !chapters.length) return true;
  if (!QC) return false;
  return chapters.some((ch) => {
    const title = String(ch?.title || '');
    if (QC.looksTooLong?.(title)) return true;
    if ((QC.qcIssues?.(ch) || []).length) return true;
    if (ch.sourceTitle && ch.sourceTitle === title && /[（(]/.test(title)) return true;
    return false;
  });
}

function chaptersFromPlanStructure(structure) {
  const SYNC = window.DdditPlanBriefSync;
  if (!structure || !SYNC?.parseStructureToChapters) return [];
  return SYNC.parseStructureToChapters(structure);
}

/** 기획안 구성 → QC된 챕터 제목 적용 */
function applyChaptersFromPlan(options = {}) {
  const plan = loadPlanData();
  const structure = plan?.structure;
  if (!structure) return { ok: false, reason: 'empty' };
  const next = chaptersFromPlanStructure(structure);
  if (!next.length) return { ok: false, reason: 'empty' };
  if (!options.force && state.chapters.length && !chaptersNeedQc(state.chapters)) {
    return { ok: true, skipped: true, chapters: state.chapters };
  }
  state.chapters = next;
  // DOM 동기화 전에 렌더해야 saveProject가 챕터를 지우지 않음
  renderChapters();
  saveProject();
  return { ok: true, chapters: next };
}

function renderChapterQcPreview(chapters) {
  const list = $('#chapter-qc-preview');
  const empty = $('#chapter-qc-empty');
  const panel = $('#chapter-qc-panel');
  if (!list) return;
  const plan = loadPlanData();
  const preview = Array.isArray(chapters) ? chapters : state.chapters;
  if (!preview.length) {
    // 제안 미리보기: 아직 적용 전이면 구성에서 계산한 단축안을 보여 줌
    const proposed = chaptersFromPlanStructure(plan?.structure);
    if (proposed.length) {
      empty?.classList.add('hidden');
      panel?.classList.remove('hidden');
      list.innerHTML = proposed.map((ch) => {
        const noCard = ch.titleCard === false || window.DdditChapterTitleQc?.isIntroTitle?.(ch.title);
        const notes = String(ch.notes || '').trim();
        return `<li>
          <span class="chapter-qc-title">${esc(ch.title)}${noCard ? '<span class="chapter-qc-badge">타이틀 카드 없음</span>' : ''}</span>
          ${notes ? `<span class="chapter-qc-notes">${esc(notes)}</span>` : ''}
        </li>`;
      }).join('');
      return;
    }
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    panel?.classList.toggle('hidden', !plan?.structure);
    return;
  }
  empty?.classList.add('hidden');
  panel?.classList.remove('hidden');
  list.innerHTML = preview.map((ch) => {
    const noCard = ch.titleCard === false || window.DdditChapterTitleQc?.isIntroTitle?.(ch.title);
    const notes = String(ch.notes || '').trim();
    return `<li>
      <span class="chapter-qc-title">${esc(ch.title)}${noCard ? '<span class="chapter-qc-badge">타이틀 카드 없음</span>' : ''}</span>
      ${notes ? `<span class="chapter-qc-notes">${esc(notes)}</span>` : ''}
    </li>`;
  }).join('');
}

function reloadChaptersFromPlanQc(options = {}) {
  const plan = loadPlanData();
  if (!plan?.structure) return showToast('기획안 구성이 없습니다.', true);
  if (
    !options.silent
    && state.chapters.length
    && !chaptersNeedQc(state.chapters)
    && !confirm('현재 챕터 목록을 기획안 구성 기준 짧은 제목으로 바꿀까요?')
  ) {
    return;
  }
  const result = applyChaptersFromPlan({ force: true });
  if (!result.ok) return showToast('구성에서 챕터를 만들 수 없습니다.', true);
  renderChapterQcPreview(state.chapters);
  renderChapters();
  saveProject();
  const count = state.chapters.length;
  if (!options.silent) {
    showToast(`챕터 ${count}개 · 짧은 제목 적용`);
    if (count > 0 && options.goNext !== false) navigatePipeline(2);
  }
}

function renderPlanSummary() {
  const project = getSheetSlug();
  const SYNC = window.DdditPlanBriefSync;
  const container = $('#plan-summary');
  const missing = $('#plan-missing');
  const link = $('#plan-edit-link');

  renderPlanProjectPicker();

  if (link && SYNC) {
    const url = SYNC.planEditUrl(project);
    if (url) link.href = url;
    link.classList.toggle('hidden', !url || project === 'default');
  }

  const plan = loadPlanData();
  if (!plan || !container) {
    container && (container.innerHTML = '');
    missing?.classList.remove('hidden');
    renderChapterQcPreview([]);
    return;
  }
  missing?.classList.add('hidden');

  const rows = [
    ['제목', plan.title],
    ['요약', plan.summary],
    ['콘셉트', plan.concept],
    ['핵심 메시지', plan.keyMessage],
    ['타깃', plan.targetAudience],
    ['톤', plan.tone],
    ['구성', plan.structure],
    ['필수 언급', plan.brandMust],
    ['지양', plan.brandAvoid],
  ].filter(([, v]) => String(v || '').trim());

  const envelope = SYNC?.loadPlanEnvelope?.(project);
  const sourceNote = envelope?.source === 'default'
    ? '<p class="hint muted">기본 기획안입니다. 수정 내용은 기획안 페이지에 저장됩니다.</p>'
    : '';

  container.innerHTML = sourceNote + rows.map(([k, v]) => `
    <div class="plan-summary-row">
      <span class="plan-summary-key">${esc(k)}</span>
      <div class="plan-summary-val">${esc(v)}</div>
    </div>`).join('');

  // 기획안 구성 → 챕터: 비어 있거나 긴 제목이면 자동 QC
  if (plan.structure && (!state.chapters.length || chaptersNeedQc(state.chapters))) {
    applyChaptersFromPlan({ force: true });
  }
  renderChapterQcPreview(state.chapters);
}

function getEffectiveState() {
  const project = getSheetSlug();
  const plan = loadPlanData();
  const fromPlan = plan && window.DdditPlanBriefSync
    ? window.DdditPlanBriefSync.planToBriefState(plan, project)
    : {};
  const chapters = state.chapters.length ? state.chapters : (fromPlan.chapters || []);
  return {
    ...fromPlan,
    productSpecs: state.productSpecs,
    priceInfo: state.priceInfo,
    categoryId: state.categoryId,
    referenceScripts: state.referenceScripts,
    chapters,
  };
}

function hasPlanTitle() {
  const plan = loadPlanData();
  return Boolean(String(plan?.title || '').trim());
}

function buildProductContext() {
  const effective = getEffectiveState();
  const refBlock = REF?.buildReferenceContext?.(state.referenceScripts) || '';
  return BRIEF.buildPromptContext(effective, getCategory(effective.categoryId), refBlock);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, isError) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-error', !!isError);
  el.setAttribute('aria-hidden', 'false');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.setAttribute('aria-hidden', 'true'), 3200);
}

function setLoading(on, text) {
  const el = $('#loading-overlay');
  if (!el) return;
  el.classList.toggle('hidden', !on);
  el.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (text) $('#loading-text').textContent = text;
}

async function callGeminiTextSession(userPrompt, temperature = 0.75, stage = 'prose') {
  SESSION.push('user', userPrompt);
  const model = state.modelPro;
  const body = {
    systemInstruction: { parts: [{ text: getSystemRules(stage) }] },
    contents: SESSION.getContents(),
    generationConfig: { temperature },
  };
  const text = await postGeminiAndExtractText(model, body);
  SESSION.push('model', text);
  return text;
}

async function postGeminiAndExtractText(model, body) {
  let data;
  if (window.DdditWorksApi?.isBackendMode?.()) {
    data = await window.DdditWorksApi.postGemini(model, body, state.apiKey);
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message || `API ${res.status}`);
    data = await res.json();
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('응답이 비어 있습니다.');
  return text.trim();
}

async function callGeminiJson(userPrompt, temperature = 0.4, stage = 'convert') {
  const cfg = window.DIDIDIT_CONFIG || {};
  // Convert / scene / caption: Flash for speed. Pro stays for prose draft only.
  const model = cfg.FAST_GEMINI_MODEL || 'gemini-3.5-flash';
  const body = {
    systemInstruction: { parts: [{ text: getSystemRules(stage) }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: PIPE.ROWS_SCHEMA,
    },
  };
  let data;
  if (window.DdditWorksApi?.isBackendMode?.()) {
    data = await window.DdditWorksApi.postGemini(model, body, state.apiKey);
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message || `API ${res.status}`);
    data = await res.json();
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('JSON 응답이 비어 있습니다.');
  return PIPE.parseRowsJson(text);
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: state.apiKey, modelPro: state.modelPro }));
}

function saveProject() {
  try {
    syncSupplementsFromDOM();
    syncChaptersFromDOM();
    state.proseDraft = $('#prose-draft')?.value || state.proseDraft;
    localStorage.setItem(projectStorageKey(), JSON.stringify({
      productSpecs: state.productSpecs,
      priceInfo: state.priceInfo,
      categoryId: state.categoryId,
      referenceScripts: state.referenceScripts,
      chapters: state.chapters,
      proseDraft: state.proseDraft,
      pipelineStep: state.pipelineStep,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* quota */ }
}

function loadProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(projectStorageKey()) || '{}');
    state.priceInfo = saved.priceInfo || '';
    state.categoryId = saved.categoryId || 'other';
    state.productSpecs = saved.productSpecs || {};
    state.referenceScripts = saved.referenceScripts || [];
    state.chapters = saved.chapters || [];
    state.proseDraft = saved.proseDraft || '';
    state.pipelineStep = saved.pipelineStep || 1;
  } catch { /* ignore */ }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.apiKey) state.apiKey = saved.apiKey;
    if (saved.modelPro) state.modelPro = saved.modelPro;
  } catch { /* ignore */ }
}

function applyBriefToDOM() {
  renderPlanSummary();
  $('#price-info').value = state.priceInfo;
  $('#category').value = state.categoryId;
  $('#prose-draft').value = state.proseDraft || '';
  renderSpecFields();
  renderChapters();
  renderReferenceList();
}

function syncSupplementsFromDOM() {
  state.priceInfo = $('#price-info')?.value || '';
  state.categoryId = $('#category')?.value || state.categoryId;
}

function syncChaptersFromDOM() {
  const nodes = document.querySelectorAll('#chapter-list .chapter-item');
  // 1단계에서는 챕터 목록이 display:none + 미렌더라 항목이 없음.
  // 빈 DOM으로 state.chapters를 []로 덮어쓰지 않는다.
  if (!nodes.length) return;
  const items = [];
  nodes.forEach((el) => {
    const title = el.querySelector('.chapter-title')?.value.trim();
    const notes = el.querySelector('.chapter-notes')?.value.trim() || '';
    if (!title) return;
    const prev = state.chapters.find((c) => c.id === el.dataset.id);
    const titleCard = window.DdditChapterTitleQc?.isIntroTitle?.(title)
      ? false
      : (prev?.titleCard !== false);
    items.push({
      id: el.dataset.id,
      title,
      notes,
      titleCard,
      sourceTitle: prev?.sourceTitle,
    });
  });
  state.chapters = items;
}

function renderSpecFields() {
  const container = $('#spec-fields');
  if (!container || !BRIEF) return;
  const fields = BRIEF.getSpecFields(state.categoryId, 'other');
  const merged = { ...BRIEF.emptySpecsForCategory(state.categoryId, 'other'), ...state.productSpecs };
  state.productSpecs = merged;
  container.innerHTML = fields.map((f) => `
    <label>${esc(f.label)}
      <input type="text" data-spec-key="${esc(f.key)}" value="${esc(merged[f.key] || '')}" placeholder="${esc(f.placeholder || '')}" />
    </label>`).join('');
  container.querySelectorAll('[data-spec-key]').forEach((inp) => {
    inp.addEventListener('input', () => { state.productSpecs[inp.dataset.specKey] = inp.value; saveProject(); });
  });
}

function reorderChapters(fromId, toId) {
  const fromIdx = state.chapters.findIndex((c) => c.id === fromId);
  const toIdx = state.chapters.findIndex((c) => c.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
  const next = [...state.chapters];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  state.chapters = next;
  renderChapters();
  saveProject();
}

function bindChapterDragDrop(list) {
  let dragId = null;

  function startChapterDrag(e) {
    if (e.target.closest('.btn-chapter-remove')) {
      e.preventDefault();
      return;
    }
    const item = e.currentTarget.closest('.chapter-item');
    dragId = item?.dataset.id || '';
    if (!dragId) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    item.classList.add('is-dragging');
  }

  function endChapterDrag() {
    dragId = null;
    list.querySelectorAll('.chapter-item').forEach((el) => {
      el.classList.remove('is-dragging', 'is-drag-over');
    });
  }

  list.querySelectorAll('.chapter-item-head').forEach((head) => {
    head.addEventListener('dragstart', startChapterDrag);
    head.addEventListener('dragend', endChapterDrag);
  });

  list.querySelectorAll('.chapter-item').forEach((item) => {
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('is-drag-over');
    });
    item.addEventListener('dragleave', (e) => {
      if (!item.contains(e.relatedTarget)) item.classList.remove('is-drag-over');
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('is-drag-over');
      const fromId = e.dataTransfer.getData('text/plain') || dragId;
      reorderChapters(fromId, item.dataset.id);
    });
  });
}

function renderChapters() {
  const list = $('#chapter-list');
  if (!list) return;
  if (!state.chapters.length) {
    list.innerHTML = '<p class="hint muted">챕터 없이 한 번에 작성하거나, 아래에서 챕터를 추가하세요.</p>';
    return;
  }
  list.innerHTML = state.chapters.map((ch, i) => {
    const issues = window.DdditChapterTitleQc?.qcIssues?.(ch) || [];
    const noCard = ch.titleCard === false || window.DdditChapterTitleQc?.isIntroTitle?.(ch.title);
    const hint = noCard
      ? '<p class="hint muted">인트로 — 영상 타이틀 카드 없음 (더보기 타임라인만)</p>'
      : (issues.length ? `<p class="hint muted">QC: ${esc(issues.join(' · '))}</p>` : '');
    return `
    <div class="chapter-item" data-id="${esc(ch.id)}">
      <div class="chapter-item-head" draggable="true" title="드래그하여 순서 변경">
        <span class="chapter-drag-handle" aria-hidden="true">⋮⋮</span>
        <span class="chapter-item-num">챕터 ${i + 1}${noCard ? ' · 인트로' : ''}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-chapter-remove">삭제</button>
      </div>
      <label class="field">제목<input class="chapter-title" type="text" value="${esc(ch.title)}" /></label>
      ${hint}
      <label class="field">메모<textarea class="chapter-notes" rows="2" placeholder="이 챕터에서 다룰 내용">${esc(ch.notes)}</textarea></label>
    </div>`;
  }).join('');
  list.querySelectorAll('.chapter-item').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('.chapter-title')?.addEventListener('input', (e) => {
      const ch = state.chapters.find((c) => c.id === id);
      if (ch) {
        ch.title = e.target.value;
        if (window.DdditChapterTitleQc?.isIntroTitle?.(ch.title)) ch.titleCard = false;
        else if (ch.titleCard === false) ch.titleCard = true;
      }
      saveProject();
    });
    el.querySelector('.chapter-notes')?.addEventListener('input', (e) => {
      const ch = state.chapters.find((c) => c.id === id);
      if (ch) ch.notes = e.target.value;
      saveProject();
    });
  });
  list.querySelectorAll('.btn-chapter-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.chapter-item')?.dataset.id;
      state.chapters = state.chapters.filter((c) => c.id !== id);
      renderChapters();
      saveProject();
    });
  });
  bindChapterDragDrop(list);
}

function addChapter() {
  const title = $('#new-chapter-title')?.value.trim();
  if (!title) return showToast('챕터 제목을 입력하세요.', true);
  const qc = window.DdditChapterTitleQc?.normalizeChapterSegment?.(title, state.chapters.length);
  state.chapters.push({
    id: `ch-${Date.now()}`,
    title: qc?.title || title,
    notes: ($('#new-chapter-notes')?.value.trim() || '') || (qc?.notes || ''),
    titleCard: qc ? qc.titleCard : true,
    sourceTitle: title,
  });
  $('#new-chapter-title').value = '';
  $('#new-chapter-notes').value = '';
  renderChapterQcPreview(state.chapters);
  renderChapters();
  saveProject();
}

function navigatePipeline(step) {
  state.pipelineStep = Math.max(1, Math.min(5, step));
  document.querySelectorAll('.step-rail-item').forEach((el) => {
    const n = Number(el.dataset.rail);
    el.classList.toggle('active', n === state.pipelineStep);
    el.classList.toggle('done', n < state.pipelineStep);
  });
  document.querySelectorAll('.step-section').forEach((sec) => {
    const n = Number(sec.dataset.step);
    sec.classList.toggle('step-active', n === state.pipelineStep);
    sec.classList.toggle('page-visible', n === state.pipelineStep);
    sec.classList.toggle('step-collapsed', n !== state.pipelineStep);
  });
  document.body.dataset.workflowPage = String(state.pipelineStep);
  document.querySelector('.app-shell')?.setAttribute('data-page', String(state.pipelineStep));
  document.querySelector('.app-shell')?.classList.toggle('page-preview', state.pipelineStep >= 2);
  updatePipelineUI();
  saveProject();
  document.querySelector('.step-section.step-active')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updatePipelineUI() {
  const labels = ['', '기획안', '줄글 초안', '시트 변환', '장면·사이즈', '자막·공유'];
  const hints = [
    '',
    '기획안 확인 후 줄글 단계로',
    '챕터 지정 후 AI 생성, 또는 직접 작성',
    '줄글을 5열 대본으로 변환',
    '장면·사이즈 열 자동 생성',
    '자막·코멘트 추가 후 시트 전송',
  ];
  const effective = getEffectiveState();
  const stage = $('#pipeline-stage-label');
  if (stage) stage.textContent = labels[state.pipelineStep] || '';
  const toolbarHint = $('#toolbar-stage-hint');
  if (toolbarHint) toolbarHint.textContent = hints[state.pipelineStep] || '';
  const productEl = $('#header-product');
  if (productEl) {
    const name = String(effective.productName || '').trim();
    productEl.textContent = name;
    productEl.classList.toggle('hidden', !name);
  }
  $('#btn-pipeline-prev')?.toggleAttribute('disabled', state.pipelineStep <= 1);
  $('#btn-pipeline-next')?.toggleAttribute('disabled', state.pipelineStep >= 5);
  const ready = hasPlanTitle();
  $('#btn-gen-prose')?.toggleAttribute('disabled', !isApiReady() || !ready);
  $('#btn-convert-sheet')?.toggleAttribute('disabled', !isApiReady() || !state.proseDraft.trim());
  $('#btn-add-scenes')?.toggleAttribute('disabled', !isApiReady() || !state.allRows.length);
  $('#btn-add-captions')?.toggleAttribute('disabled', !isApiReady() || !state.allRows.length);
  if (state.pipelineStep === 1) renderPlanSummary();
  updateProjectChrome();
}

async function runProseDraft() {
  if (!requireApiReady()) return;
  if (!hasPlanTitle()) return showToast('기획안에 제목을 입력하세요.', true);
  syncSupplementsFromDOM();
  syncChaptersFromDOM();
  const effective = getEffectiveState();
  const ctx = buildProductContext();
  const styleAnchor = await PM.getStyleAnchorBlock?.();
  const isRoundup = PM.isRoundupFormat ? PM.isRoundupFormat(ctx) : window.DIDIDIT_CONFIG?.isRoundupFormat?.(ctx);
  const formatAnchor = isRoundup ? await PM.getFormatAnchorBlock?.() : '';
  const ctxWithStyle = [ctx, styleAnchor, formatAnchor].filter(Boolean).join('\n\n');
  const existingProse = ($('#prose-draft')?.value || state.proseDraft || '').trim();
  const continueFromEdit = existingProse && confirm(
    '기존 줄글을 스타일 기준으로 이어 쓸까요?\n\n확인 = 다듬은 톤 유지 · 취소 = 처음부터 새로 생성',
  );

  SESSION.reset();
  if (continueFromEdit) {
    SESSION.seedApprovedProse(
      existingProse,
      `${ctxWithStyle}\n\n[승인된 줄글] 작성자가 다듬은 줄글입니다. 이 톤·호흡·리듬을 그대로 유지하세요.`,
    );
  }

  setLoading(true, '줄글 초안 작성 중…');
  try {
    let prose = continueFromEdit ? existingProse : '';
    const chapters = state.chapters.length ? state.chapters : [{ title: '전체', notes: effective.contentDirection, titleCard: true }];
    const chapterMarker = (ch) => {
      const heading = PIPE.proseHeading?.(ch) ?? (ch?.titleCard === false ? '' : ch?.title);
      return heading ? `## ${heading}` : null;
    };
    const startIndex = prose
      ? chapters.findIndex((ch) => {
          const marker = chapterMarker(ch);
          if (!marker) {
            // intro: consider done if prose already has opening greeting
            return !/안녕하세요,\s*디디딧입니다/.test(prose);
          }
          return !prose.includes(marker);
        })
      : 0;
    const from = startIndex < 0 ? chapters.length : Math.max(0, startIndex);
    if (from >= chapters.length) {
      showToast('이미 모든 챕터가 작성되어 있습니다.');
      return;
    }

    for (let i = from; i < chapters.length; i++) {
      setLoading(true, `줄글 작성 중… (${i + 1}/${chapters.length}, 대화 ${SESSION.turnCount()}턴)`);
      const prompt = PIPE.buildProsePrompt(ctxWithStyle, chapters[i], i, chapters.length, {
        includeContext: i === from && !SESSION.hasHistory(),
        hasSession: SESSION.turnCount() > 0,
      });
      let chunk = await callGeminiTextSession(prompt, 0.72, 'prose');
      const marker = chapterMarker(chapters[i]);
      // model sometimes echoes ## heading — strip duplicate
      if (marker) {
        chunk = String(chunk || '').replace(new RegExp(`^\\s*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?`), '').trim();
        prose = prose ? `${prose}\n\n${marker}\n${chunk}` : `${marker}\n${chunk}`;
      } else {
        chunk = String(chunk || '').replace(/^\s*##\s+.+\n?/, '').trim();
        prose = prose ? `${prose}\n\n${chunk}` : chunk;
      }
    }
    state.proseDraft = prose;
    $('#prose-draft').value = prose;
    SESSION.save(getSheetSlug());
    saveProject();
    showToast(`줄글 완성 (대화 ${SESSION.turnCount()}턴 — 스타일 맥락 유지)`);
    navigatePipeline(3);
  } catch (e) {
    reportError('runProseDraft', e);
    showToast(e.message || '줄글 작성 실패', true);
  } finally {
    setLoading(false);
  }
}

async function runConvertToSheet() {
  if (!requireApiReady()) return;
  const prose = ($('#prose-draft')?.value || state.proseDraft).trim();
  if (!prose) return showToast('줄글 초안이 없습니다.', true);
  state.proseDraft = prose;
  const ctx = buildProductContext();
  setLoading(true, '5열 대본으로 변환 중…');
  try {
    const chunks = PIPE.splitProseChunks(prose, 14000);
    let rows = [];
    for (let i = 0; i < chunks.length; i++) {
      setLoading(true, `변환 중… (${i + 1}/${chunks.length})`);
      let part = [];
      let retryHint = '';
      // At most 2 API attempts; heal locally instead of soft-issue retries.
      for (let attempt = 0; attempt < 2; attempt++) {
        part = await callGeminiJson(
          PIPE.buildConvertPrompt(ctx, chunks[i], retryHint),
          attempt > 0 ? 0.2 : 0.3,
          'convert',
        );
        part = PIPE.healSentenceRows(part);
        const hard = PIPE.validateHardIssues(part);
        if (!hard.length) break;
        retryHint = PIPE.buildConvertRetryHint(hard);
        if (attempt === 1) {
          reportError('runConvertToSheet.validate', new Error(hard.join('; ')), { chunk: i + 1 }, { silent: true });
        }
      }
      part = PIPE.healSentenceRows(part);
      rows = rows.concat(part);
    }
    state.allRows = PIPE.normalizeRows(rows);
    renderTable();
    saveProject();
    showToast(`${state.allRows.length}행으로 변환했습니다.`);
    navigatePipeline(4);
  } catch (e) {
    reportError('runConvertToSheet', e);
    showToast(e.message || '변환 실패', true);
  } finally {
    setLoading(false);
  }
}

async function runAddScenes() {
  if (!requireApiReady() || !state.allRows.length) return;
  setLoading(true, '장면·사이즈 추가 중…');
  try {
    state.allRows = await callGeminiJson(PIPE.buildScenePrompt(buildProductContext(), state.allRows), 0.4, 'scene');
    renderTable();
    showToast('장면·사이즈를 반영했습니다.');
    navigatePipeline(5);
  } catch (e) {
    reportError('runAddScenes', e);
    showToast(e.message || '장면 추가 실패', true);
  } finally {
    setLoading(false);
  }
}

async function runAddCaptions() {
  if (!requireApiReady() || !state.allRows.length) return;
  setLoading(true, '자막·코멘트 추가 중…');
  try {
    state.allRows = await callGeminiJson(PIPE.buildCaptionPrompt(buildProductContext(), state.allRows), 0.4, 'caption');
    renderTable();
    showToast('자막·코멘트를 반영했습니다.');
  } catch (e) {
    reportError('runAddCaptions', e);
    showToast(e.message || '자막 추가 실패', true);
  } finally {
    setLoading(false);
  }
}

function renderTable() {
  const tbody = $('#script-table tbody');
  const mode = state.pipelineStep >= 4 ? 'full' : 'script';
  const cols = mode === 'full' ? PIPE.HEADERS : ['대본', '장면'];
  if (!state.allRows.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" class="empty">아직 표 데이터가 없습니다</td></tr>`;
    $('#stat-rows').textContent = '0';
    return;
  }
  tbody.innerHTML = state.allRows.map((r) => {
    if (mode === 'full') {
      return `<tr>${PIPE.HEADERS.map((h) => `<td><span class="cell-preview">${esc(r[h]) || '<span class="is-empty">—</span>'}</span></td>`).join('')}</tr>`;
    }
    return `<tr><td><span class="cell-preview">${esc(r.대본)}</span></td><td><span class="cell-preview">${esc(r.장면) || '—'}</span></td></tr>`;
  }).join('');
  $('#stat-rows').textContent = state.allRows.length;
  const bytes = state.allRows.reduce((s, r) => s + new TextEncoder().encode(r.대본).length, 0);
  $('#stat-bytes').textContent = bytes.toLocaleString();
  updateTableHead(mode);
}

function updateTableHead(mode) {
  const thead = $('#script-table thead tr');
  if (!thead) return;
  const cols = mode === 'full' ? PIPE.HEADERS : ['대본', '장면'];
  thead.innerHTML = cols.map((h) => `<th>${h}</th>`).join('');
}

function reportError(tag, err) {
  LOG?.log(tag, err);
}

/* ── Sheet (from previous app, trimmed) ── */
function getSheetConfig() {
  if (window.DdditSheetSync?.useBackend?.()) return {};
  try {
    const store = JSON.parse(localStorage.getItem(SHEET_SETTINGS_KEY) || '{}');
    return { apiUrl: store.apiUrl || '', token: store.token || '' };
  } catch { return {}; }
}

function rememberSheetUrl(project, url) {
  if (!url) return;
  try {
    const store = JSON.parse(localStorage.getItem(SHEET_SETTINGS_KEY) || '{}');
    store.projects = store.projects || {};
    store.projects[project] = { url, updatedAt: new Date().toISOString() };
    localStorage.setItem(SHEET_SETTINGS_KEY, JSON.stringify(store));
    state.sheetOpenUrl = url;
    const bar = $('#sheet-link-bar');
    const link = $('#sheet-open-link');
    if (bar && link) { bar.classList.remove('hidden'); link.href = url; link.textContent = '시트 열기'; }
  } catch { /* ignore */ }
}

async function pushToSheet() {
  const sync = window.DdditSheetSync;
  if (!sync || !state.allRows.length) return showToast('보낼 데이터가 없습니다.', true);
  setLoading(true, '시트로 보내는 중…');
  try {
    const project = getSheetSlug();
    const result = await sync.exportToSheet(getSheetConfig(), state.allRows, project);
    if (result.spreadsheetUrl) rememberSheetUrl(project, result.spreadsheetUrl);
    showToast('시트에 반영했습니다. 브랜드 페이지에서 대본을 공유할 수 있습니다.');
  } catch (e) {
    showToast(e.message || '시트 전송 실패', true);
  } finally {
    setLoading(false);
  }
}

async function pullFromSheet() {
  const sync = window.DdditSheetSync;
  if (!sync) return;
  setLoading(true, '시트에서 불러오는 중…');
  try {
    const data = await sync.pull(getSheetConfig(), getSheetSlug());
    state.allRows = PIPE.normalizeRows(data.rows || []);
    if (data.spreadsheetUrl) rememberSheetUrl(getSheetSlug(), data.spreadsheetUrl);
    renderTable();
    showToast(`시트에서 ${state.allRows.length}행 불러옴`);
  } catch (e) {
    showToast(e.message || '불러오기 실패', true);
  } finally {
    setLoading(false);
  }
}

function updateProjectChrome() {
  const effective = getEffectiveState();
  const project = getSheetSlug();
  const badge = $('#workspace-project-badge');
  if (badge) {
    if (project && project !== 'default') {
      badge.textContent = window.DdditPlanBriefSync?.projectLabel?.(project) || project;
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  }
  $('#ad-mode-badge')?.classList.toggle('hidden', !effective.adMode);
}

async function initSheetIntegration() {
  const project = getSheetSlug();
  try {
    const store = JSON.parse(localStorage.getItem(SHEET_SETTINGS_KEY) || '{}');
    const savedUrl = store.projects?.[project]?.url;
    if (savedUrl) rememberSheetUrl(project, savedUrl);
  } catch { /* ignore */ }
  if (window.DdditWorksApi?.isBackendMode?.()) {
    $('#backend-settings-note')?.removeAttribute('hidden');
    await window.DdditWorksApi.loadConfig().catch(() => null);
  }
  updateProjectChrome();
}

function renderReferenceList() {
  const list = $('#ref-file-list');
  if (!list) return;
  list.innerHTML = state.referenceScripts.length
    ? state.referenceScripts.map((s) => `<li>${esc(s.name)} (${s.text.length}자)</li>`).join('')
    : '<li class="muted">없음</li>';
  $('#ref-stats').textContent = `${state.referenceScripts.length}개`;
}

function syncModelSelect() {
  const cfg = window.DIDIDIT_CONFIG;
  const select = $('#model-pro');
  if (!select || !cfg?.GEMINI_MODELS?.length) return;
  select.innerHTML = cfg.GEMINI_MODELS.map((m) => `<option value="${esc(m.id)}">${esc(m.label || m.id)}</option>`).join('');
  const value = cfg.isSupportedGeminiModel?.(state.modelPro) ? state.modelPro : cfg.PRO_GEMINI_MODEL;
  state.modelPro = value;
  select.value = value;
}

const TOOL_MODALS = [
  { panel: '#error-log-panel', btn: '#toggle-error-log' },
  { panel: '#settings-panel', btn: '#toggle-settings' },
  { panel: '#prompt-panel', btn: '#toggle-prompt' },
];

function syncToolModalChrome() {
  const anyOpen = TOOL_MODALS.some(({ panel }) => {
    const el = $(panel);
    return el && !el.classList.contains('collapsed');
  });
  document.body.classList.toggle('tool-modal-open', anyOpen);
  TOOL_MODALS.forEach(({ panel, btn }) => {
    const el = $(panel);
    const open = Boolean(el && !el.classList.contains('collapsed'));
    $(btn)?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (el) {
      el.hidden = !open;
      el.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
  });
}

function closeAllToolModals() {
  TOOL_MODALS.forEach(({ panel }) => $(panel)?.classList.add('collapsed'));
  syncToolModalChrome();
}

function openToolModal(panelSel) {
  TOOL_MODALS.forEach(({ panel }) => {
    const el = $(panel);
    if (!el) return;
    el.classList.toggle('collapsed', panel !== panelSel);
  });
  syncToolModalChrome();
}

function togglePanel(panelSel) {
  const panel = $(panelSel);
  if (!panel) return;
  const isOpen = !panel.classList.contains('collapsed');
  if (isOpen) closeAllToolModals();
  else openToolModal(panelSel);
}

async function addReferenceFromPaste() {
  const text = $('#ref-paste')?.value.trim();
  if (!text) return showToast('참고 대본을 붙여넣으세요.', true);
  state.referenceScripts.push({ id: `ref-${Date.now()}`, name: '붙여넣기', source: 'paste', text, chars: text.length });
  $('#ref-paste').value = '';
  renderReferenceList();
  saveProject();
}

async function addReferenceFiles(fileList) {
  if (!fileList?.length || !REF) return;
  for (const file of fileList) {
    try {
      state.referenceScripts.push(await REF.parseReferenceFile(file));
    } catch (e) {
      showToast(e.message, true);
    }
  }
  renderReferenceList();
  saveProject();
}

function clearReferences() {
  state.referenceScripts = [];
  renderReferenceList();
  saveProject();
}

function bindDrawerPanels() {
  $('#toggle-settings')?.addEventListener('click', () => togglePanel('#settings-panel'));
  $('#toggle-prompt')?.addEventListener('click', () => togglePanel('#prompt-panel'));
  $('#toggle-error-log')?.addEventListener('click', () => togglePanel('#error-log-panel'));
  document.querySelectorAll('[data-close-tool-modal]').forEach((el) => {
    el.addEventListener('click', closeAllToolModals);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('tool-modal-open')) {
      closeAllToolModals();
    }
  });
  syncToolModalChrome();
  $('#btn-log-clear')?.addEventListener('click', () => LOG?.clear());
  $('#btn-log-copy')?.addEventListener('click', async () => {
    const text = LOG?.toExportText?.();
    if (!text) return showToast('복사할 로그가 없습니다.', true);
    try {
      await navigator.clipboard.writeText(text);
      showToast('로그를 복사했습니다.');
    } catch {
      showToast('복사 실패', true);
    }
  });
  $('#btn-log-export')?.addEventListener('click', () => {
    if (!LOG?.downloadTxt?.()) showToast('저장할 로그가 없습니다.', true);
  });
  $('#btn-prompt-apply')?.addEventListener('click', () => {
    const text = $('#prompt-editor')?.value || '';
    const filename = $('#prompt-filename')?.value || 'custom.txt';
    PM?.setActivePrompt?.(text, filename);
    $('#active-prompt-label').textContent = PM?.getActivePromptSource?.() || filename;
    showToast('프롬프트를 적용했습니다.');
  });
  $('#btn-prompt-reset')?.addEventListener('click', async () => {
    await PM?.loadDefaultPromptFile?.();
    $('#prompt-editor').value = PM?.getActiveSystemRules?.() || '';
    showToast('내장 프롬프트로 복원했습니다.');
  });
  $('#btn-prompt-load-default')?.addEventListener('click', async () => {
    await PM?.loadDefaultPromptFile?.();
    $('#prompt-editor').value = PM?.getActiveSystemRules?.() || '';
  });
  $('#btn-prompt-export')?.addEventListener('click', () => {
    const text = $('#prompt-editor')?.value || '';
    if (!text.trim()) return showToast('프롬프트 내용이 비어 있습니다.', true);
    const filename = $('#prompt-filename')?.value || `dididit-prompt-v${PM.PROMPT_VERSION}.txt`;
    PM?.downloadPromptTxt?.(text, filename);
  });
  $('#prompt-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      $('#prompt-editor').value = text;
      $('#prompt-filename').value = file.name;
      showToast(`${file.name} 불러옴 — [적용]으로 반영하세요.`);
    } catch (err) {
      showToast(err.message || '파일 읽기 실패', true);
    }
    e.target.value = '';
  });
}

function renderCategoryOptions() {
  const sel = $('#category');
  const cats = getCategories();
  if (!sel || !cats.length) return;
  sel.innerHTML = cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  sel.value = cats.some((c) => c.id === state.categoryId) ? state.categoryId : 'other';
}

function bindEvents() {
  document.querySelectorAll('.step-rail-item').forEach((btn) => {
    btn.addEventListener('click', () => navigatePipeline(Number(btn.dataset.rail)));
  });
  $('#btn-pipeline-prev')?.addEventListener('click', () => navigatePipeline(state.pipelineStep - 1));
  $('#btn-pipeline-next')?.addEventListener('click', () => navigatePipeline(state.pipelineStep + 1));
  $('#btn-gen-prose')?.addEventListener('click', runProseDraft);
  $('#btn-convert-sheet')?.addEventListener('click', runConvertToSheet);
  $('#btn-add-scenes')?.addEventListener('click', runAddScenes);
  $('#btn-add-captions')?.addEventListener('click', runAddCaptions);
  $('#btn-add-chapter')?.addEventListener('click', addChapter);
  $('#btn-chapter-qc')?.addEventListener('click', () => reloadChaptersFromPlanQc());
  $('#btn-chapter-qc-step2')?.addEventListener('click', () => reloadChaptersFromPlanQc());
  $('#btn-sheet-push')?.addEventListener('click', pushToSheet);
  $('#btn-sheet-pull')?.addEventListener('click', pullFromSheet);
  $('#btn-pipeline-next-brief')?.addEventListener('click', () => navigatePipeline(2));
  $('#btn-plan-load')?.addEventListener('click', loadSelectedPlanProject);
  $('#plan-project-select')?.addEventListener('change', () => {
    const slug = $('#plan-project-select')?.value || '';
    if (slug) switchToProject(slug);
  });
  $('#plan-project-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-plan-project]');
    if (!btn) return;
    const slug = btn.getAttribute('data-plan-project') || '';
    const select = $('#plan-project-select');
    if (select && slug) select.value = slug;
    switchToProject(slug);
  });
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => navigatePipeline(Number(btn.dataset.goto)));
  });
  $('#btn-sheet-open')?.addEventListener('click', openSheetUrl);
  $('#prose-draft')?.addEventListener('input', (e) => { state.proseDraft = e.target.value; saveProject(); updatePipelineUI(); });
  $('#price-info')?.addEventListener('input', (e) => { state.priceInfo = e.target.value; saveProject(); });
  $('#category')?.addEventListener('change', (e) => { state.categoryId = e.target.value; renderSpecFields(); saveProject(); });
  $('#api-key')?.addEventListener('input', (e) => { state.apiKey = e.target.value.trim(); saveSettings(); updatePipelineUI(); });
  $('#model-pro')?.addEventListener('change', (e) => { state.modelPro = e.target.value; saveSettings(); });
  $('#btn-ref-add-paste')?.addEventListener('click', addReferenceFromPaste);
  $('#ref-file-input')?.addEventListener('change', (e) => addReferenceFiles(e.target.files));
  $('#btn-ref-clear')?.addEventListener('click', clearReferences);
  bindDrawerPanels();
}

function openSheetUrl() {
  if (state.sheetOpenUrl) window.open(state.sheetOpenUrl, '_blank');
  else showToast('시트 URL이 없습니다. 먼저 시트로 보내기를 실행하세요.', true);
}

async function initPromptOnBoot() {
  if (!PM.loadPromptState()?.text) await PM.loadDefaultPromptFile();
  else if (String(PM.getActivePromptSource?.() || '').includes('v1.0.0')) {
    await PM.loadDefaultPromptFile();
    showToast('프롬프트 v1.1.0으로 갱신했습니다. (단계별 규칙 분리)');
  }
  $('#prompt-editor').value = PM.getActiveSystemRules();
  $('#active-prompt-label').textContent = PM.getActivePromptSource?.() || '';
}

async function boot() {
  try {
    bindModules();
    applyHostedMode();
    LOG?.load?.();
    LOG?.render?.();
    LOG?.updateBadge?.();
    loadState();
    loadProject();
    syncModelSelect();
    renderCategoryOptions();
    applyBriefToDOM();
    $('#api-key').value = state.apiKey;
    bindEvents();
    if (window.DdditWorksApi?.isBackendMode?.()) await window.DdditWorksApi.loadConfig().catch(() => null);
    await initSheetIntegration();
    await initPromptOnBoot();
    navigatePipeline(state.pipelineStep || 1);
    renderTable();
    if (!isApiReady() && !window.DdditWorksApi?.isBackendMode?.()) {
      openToolModal('#settings-panel');
    }
  } catch (e) {
    $('#boot-error')?.classList.remove('hidden');
    $('#boot-error').textContent = `초기화 오류: ${e.message}`;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
