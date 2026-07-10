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

const state = {
  apiKey: '',
  modelPro: 'gemini-3.1-pro-preview',
  productName: '',
  contentDirection: '',
  productNotes: '',
  productSpecs: {},
  reviewBrief: { thesis: '', targetScenario: '', mustHighlight: '', carefulPoints: '', compareWith: '' },
  priceInfo: '',
  categoryId: 'other',
  referenceScripts: [],
  adMode: false,
  adBrand: '',
  adToneLevel: 'balanced',
  adDisclosure: true,
  adGuides: [],
  teamBriefNotes: '',
  briefSource: '',
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
  if (!PM || !REF || !BRIEF || !PIPE) throw new Error('스크립트 모듈 로드 실패');
}

function getSystemRules() {
  return PM.getActiveSystemRules();
}

function buildProductContext() {
  const refBlock = REF?.buildReferenceContext?.(state.referenceScripts) || '';
  const adBlock = state.adMode ? (REF?.buildAdGuideContext?.(state.adGuides) || '') : '';
  return BRIEF.buildPromptContext(state, BRIEF.getCategory(state.categoryId), refBlock, adBlock);
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

async function callGeminiText(userPrompt, temperature = 0.75) {
  const model = state.modelPro;
  const body = {
    systemInstruction: { parts: [{ text: getSystemRules() }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature },
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
  if (!text) throw new Error('응답이 비어 있습니다.');
  return text.trim();
}

async function callGeminiJson(userPrompt, temperature = 0.4) {
  const model = state.modelPro;
  const body = {
    systemInstruction: { parts: [{ text: getSystemRules() }] },
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
    syncBriefFromDOM();
    syncChaptersFromDOM();
    state.proseDraft = $('#prose-draft')?.value || state.proseDraft;
    localStorage.setItem(projectStorageKey(), JSON.stringify({
      productName: state.productName,
      contentDirection: state.contentDirection,
      productNotes: state.productNotes,
      productSpecs: state.productSpecs,
      reviewBrief: state.reviewBrief,
      priceInfo: state.priceInfo,
      categoryId: state.categoryId,
      referenceScripts: state.referenceScripts,
      adMode: state.adMode,
      adBrand: state.adBrand,
      adToneLevel: state.adToneLevel,
      adDisclosure: state.adDisclosure,
      adGuides: state.adGuides,
      teamBriefNotes: state.teamBriefNotes,
      briefSource: state.briefSource,
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
    Object.assign(state, {
      productName: saved.productName || state.productName,
      contentDirection: saved.contentDirection || '',
      productNotes: saved.productNotes || '',
      priceInfo: saved.priceInfo || '',
      categoryId: saved.categoryId || 'other',
      productSpecs: saved.productSpecs || {},
      reviewBrief: { ...state.reviewBrief, ...(saved.reviewBrief || {}) },
      referenceScripts: saved.referenceScripts || [],
      adMode: !!saved.adMode,
      adBrand: saved.adBrand || '',
      adToneLevel: saved.adToneLevel || 'balanced',
      adDisclosure: saved.adDisclosure !== false,
      adGuides: saved.adGuides || [],
      teamBriefNotes: saved.teamBriefNotes || '',
      briefSource: saved.briefSource || '',
      chapters: saved.chapters || [],
      proseDraft: saved.proseDraft || '',
      pipelineStep: saved.pipelineStep || 1,
    });
  } catch { /* ignore */ }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.apiKey) state.apiKey = saved.apiKey;
    if (saved.modelPro) state.modelPro = saved.modelPro;
  } catch { /* ignore */ }
}

async function importProjectSeed(project) {
  if (!project || project === 'default') return;
  try {
    const res = await fetch(`data/project-seeds/${encodeURIComponent(project)}.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const seed = await res.json();
    if (seed.productName && !state.productName) state.productName = seed.productName;
    if (seed.contentDirection && !state.contentDirection) state.contentDirection = seed.contentDirection;
    if (seed.teamBriefNotes && !state.teamBriefNotes) state.teamBriefNotes = seed.teamBriefNotes;
    if (seed.briefSource) state.briefSource = seed.briefSource;
    if (seed.reviewBrief) state.reviewBrief = { ...state.reviewBrief, ...seed.reviewBrief };
    if (seed.adMode) state.adMode = true;
    if (seed.adBrand) state.adBrand = seed.adBrand;
    if (seed.adGuides?.length) state.adGuides = seed.adGuides;
    if (seed.categoryId) state.categoryId = seed.categoryId;
  } catch { /* ignore */ }
}

function applyBriefToDOM() {
  $('#product-name').value = state.productName;
  $('#content-direction').value = state.contentDirection;
  $('#product-notes').value = state.productNotes;
  $('#price-info').value = state.priceInfo;
  $('#category').value = state.categoryId;
  $('#brief-thesis').value = state.reviewBrief.thesis || '';
  $('#brief-scenario').value = state.reviewBrief.targetScenario || '';
  $('#brief-must').value = state.reviewBrief.mustHighlight || '';
  $('#brief-careful').value = state.reviewBrief.carefulPoints || '';
  $('#brief-compare').value = state.reviewBrief.compareWith || '';
  $('#team-brief-notes').value = state.teamBriefNotes || '';
  $('#prose-draft').value = state.proseDraft || '';
  renderSpecFields();
  renderChapters();
  updateAdModeUI();
  renderReferenceList();
  renderAdGuideList();
}

function syncBriefFromDOM() {
  state.productName = $('#product-name')?.value || '';
  state.contentDirection = $('#content-direction')?.value || '';
  state.productNotes = $('#product-notes')?.value || '';
  state.priceInfo = $('#price-info')?.value || '';
  state.teamBriefNotes = $('#team-brief-notes')?.value || '';
  state.reviewBrief = {
    thesis: $('#brief-thesis')?.value.trim() || '',
    targetScenario: $('#brief-scenario')?.value.trim() || '',
    mustHighlight: $('#brief-must')?.value.trim() || '',
    carefulPoints: $('#brief-careful')?.value.trim() || '',
    compareWith: $('#brief-compare')?.value.trim() || '',
  };
}

function syncChaptersFromDOM() {
  const items = [];
  document.querySelectorAll('#chapter-list .chapter-item').forEach((el) => {
    const title = el.querySelector('.chapter-title')?.value.trim();
    const notes = el.querySelector('.chapter-notes')?.value.trim() || '';
    if (title) items.push({ id: el.dataset.id, title, notes });
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

function renderChapters() {
  const list = $('#chapter-list');
  if (!list) return;
  if (!state.chapters.length) {
    list.innerHTML = '<p class="hint muted">챕터 없이 한 번에 작성하거나, 아래에서 챕터를 추가하세요.</p>';
    return;
  }
  list.innerHTML = state.chapters.map((ch, i) => `
    <div class="chapter-item" data-id="${esc(ch.id)}">
      <label>챕터 ${i + 1} 제목<input class="chapter-title" type="text" value="${esc(ch.title)}" /></label>
      <label>메모<textarea class="chapter-notes" rows="2" placeholder="이 챕터에서 다룰 내용">${esc(ch.notes)}</textarea></label>
      <button type="button" class="btn btn-ghost btn-sm btn-chapter-remove">삭제</button>
    </div>`).join('');
  list.querySelectorAll('.btn-chapter-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.chapter-item')?.dataset.id;
      state.chapters = state.chapters.filter((c) => c.id !== id);
      renderChapters();
      saveProject();
    });
  });
}

function addChapter() {
  const title = $('#new-chapter-title')?.value.trim();
  if (!title) return showToast('챕터 제목을 입력하세요.', true);
  state.chapters.push({ id: `ch-${Date.now()}`, title, notes: $('#new-chapter-notes')?.value.trim() || '' });
  $('#new-chapter-title').value = '';
  $('#new-chapter-notes').value = '';
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
  const labels = ['', '브리프', '줄글 초안', '시트 변환', '장면·사이즈', '자막·공유'];
  const hints = [
    '',
    '제품명·브리프 입력 후 줄글 단계로',
    '챕터 지정 후 AI 생성, 또는 직접 작성',
    '줄글을 5열 대본으로 변환',
    '장면·사이즈 열 자동 생성',
    '자막·코멘트 추가 후 시트 전송',
  ];
  const stage = $('#pipeline-stage-label');
  if (stage) stage.textContent = labels[state.pipelineStep] || '';
  const toolbarHint = $('#toolbar-stage-hint');
  if (toolbarHint) toolbarHint.textContent = hints[state.pipelineStep] || '';
  const productEl = $('#header-product');
  if (productEl) {
    const name = state.productName.trim();
    productEl.textContent = name;
    productEl.classList.toggle('hidden', !name);
  }
  $('#btn-pipeline-prev')?.toggleAttribute('disabled', state.pipelineStep <= 1);
  $('#btn-pipeline-next')?.toggleAttribute('disabled', state.pipelineStep >= 5);
  $('#btn-gen-prose')?.toggleAttribute('disabled', !isApiReady() || !state.productName.trim());
  $('#btn-convert-sheet')?.toggleAttribute('disabled', !isApiReady() || !state.proseDraft.trim());
  $('#btn-add-scenes')?.toggleAttribute('disabled', !isApiReady() || !state.allRows.length);
  $('#btn-add-captions')?.toggleAttribute('disabled', !isApiReady() || !state.allRows.length);
}

async function runProseDraft() {
  if (!requireApiReady() || !state.productName.trim()) return showToast('제품명을 입력하세요.', true);
  syncBriefFromDOM();
  syncChaptersFromDOM();
  const ctx = buildProductContext();
  setLoading(true, '줄글 초안 작성 중…');
  try {
    let prose = '';
    const chapters = state.chapters.length ? state.chapters : [{ title: '전체', notes: state.contentDirection }];
    for (let i = 0; i < chapters.length; i++) {
      setLoading(true, `줄글 작성 중… (${i + 1}/${chapters.length})`);
      const prompt = PIPE.buildProsePrompt(ctx, chapters[i], i, chapters.length) +
        (prose ? `\n\n## 지금까지 작성된 줄글\n${prose.slice(-12000)}` : '');
      const chunk = await callGeminiText(prompt, 0.75);
      prose = prose ? `${prose}\n\n## ${chapters[i].title}\n${chunk}` : chunk;
    }
    state.proseDraft = prose;
    $('#prose-draft').value = prose;
    saveProject();
    showToast('줄글 초안이 완성되었습니다.');
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
      const part = await callGeminiJson(PIPE.buildConvertPrompt(ctx, chunks[i]), 0.35);
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
    state.allRows = await callGeminiJson(PIPE.buildScenePrompt(buildProductContext(), state.allRows), 0.4);
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
    state.allRows = await callGeminiJson(PIPE.buildCaptionPrompt(buildProductContext(), state.allRows), 0.4);
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

async function initSheetIntegration() {
  const project = getSheetSlug();
  const badge = $('#workspace-project-badge');
  if (badge && project !== 'default') {
    badge.textContent = `프로젝트: ${project}`;
    badge.classList.remove('hidden');
  }
  try {
    const store = JSON.parse(localStorage.getItem(SHEET_SETTINGS_KEY) || '{}');
    const savedUrl = store.projects?.[project]?.url;
    if (savedUrl) rememberSheetUrl(project, savedUrl);
  } catch { /* ignore */ }
  if (window.DdditWorksApi?.isBackendMode?.()) {
    $('#backend-settings-note')?.removeAttribute('hidden');
    await window.DdditWorksApi.loadConfig().catch(() => null);
  }
}

/* ── Ad / ref UI (minimal) ── */
function updateAdModeUI() {
  $('#ad-mode').checked = state.adMode;
  const fields = $('#ad-mode-fields');
  fields?.classList.toggle('hidden', !state.adMode);
  if (state.adMode) document.querySelector('#ad-mode-panel')?.setAttribute('open', '');
  $('#ad-mode-badge')?.classList.toggle('hidden', !state.adMode);
  $('#ad-brand').value = state.adBrand || '';
  $('#ad-tone-level').value = state.adToneLevel || 'balanced';
  $('#ad-disclosure').checked = state.adDisclosure !== false;
}

function renderReferenceList() {
  const list = $('#ref-file-list');
  if (!list) return;
  list.innerHTML = state.referenceScripts.length
    ? state.referenceScripts.map((s) => `<li>${esc(s.name)} (${s.text.length}자)</li>`).join('')
    : '<li class="muted">없음</li>';
  $('#ref-stats').textContent = `${state.referenceScripts.length}개`;
}

function renderAdGuideList() {
  const list = $('#ad-guide-list');
  if (!list) return;
  list.innerHTML = state.adGuides.length
    ? state.adGuides.map((g) => `<li>${esc(g.name)}</li>`).join('')
    : '<li class="muted">없음</li>';
  const totalChars = state.adGuides.reduce((n, s) => n + (s.text?.length || 0), 0);
  const stats = $('#ad-guide-stats');
  if (stats) stats.textContent = state.adGuides.length ? `${state.adGuides.length}개 · ${totalChars.toLocaleString()}자` : '0개';
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

function togglePanel(panelSel, btnSel) {
  const panel = $(panelSel);
  const btn = $(btnSel);
  if (!panel) return;
  const collapsed = panel.classList.toggle('collapsed');
  btn?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
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

async function addAdGuideFromPaste() {
  const text = $('#ad-guide-paste')?.value.trim();
  if (!text) return showToast('가이드를 붙여넣으세요.', true);
  state.adGuides.push({ id: `ad-${Date.now()}`, name: '붙여넣기', source: 'paste', text, chars: text.length });
  $('#ad-guide-paste').value = '';
  renderAdGuideList();
  saveProject();
}

async function addAdGuideFiles(fileList) {
  if (!fileList?.length || !REF) return;
  for (const file of fileList) {
    try {
      state.adGuides.push(await REF.parseReferenceFile(file));
    } catch (e) {
      showToast(e.message, true);
    }
  }
  renderAdGuideList();
  saveProject();
}

function clearAdGuides() {
  state.adGuides = [];
  renderAdGuideList();
  saveProject();
}

function bindDrawerPanels() {
  $('#toggle-settings')?.addEventListener('click', () => togglePanel('#settings-panel', '#toggle-settings'));
  $('#toggle-prompt')?.addEventListener('click', () => togglePanel('#prompt-panel', '#toggle-prompt'));
  $('#toggle-error-log')?.addEventListener('click', () => togglePanel('#error-log-panel', '#toggle-error-log'));
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
}

function renderCategoryOptions() {
  const sel = $('#category');
  if (!sel || !BRIEF) return;
  sel.innerHTML = BRIEF.getCategories().map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  sel.value = state.categoryId;
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
  $('#btn-sheet-push')?.addEventListener('click', pushToSheet);
  $('#btn-sheet-push-inline')?.addEventListener('click', pushToSheet);
  $('#btn-sheet-pull')?.addEventListener('click', pullFromSheet);
  $('#btn-sheet-pull-inline')?.addEventListener('click', pullFromSheet);
  $('#btn-pipeline-next-brief')?.addEventListener('click', () => navigatePipeline(2));
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => navigatePipeline(Number(btn.dataset.goto)));
  });
  $('#btn-sheet-open')?.addEventListener('click', openSheetUrl);
  $('#btn-sheet-open-inline')?.addEventListener('click', openSheetUrl);
  $('#product-name')?.addEventListener('input', (e) => { state.productName = e.target.value; saveProject(); updatePipelineUI(); });
  $('#prose-draft')?.addEventListener('input', (e) => { state.proseDraft = e.target.value; saveProject(); updatePipelineUI(); });
  $('#ad-mode')?.addEventListener('change', (e) => { state.adMode = e.target.checked; updateAdModeUI(); saveProject(); });
  $('#ad-brand')?.addEventListener('input', (e) => { state.adBrand = e.target.value; saveProject(); });
  $('#ad-tone-level')?.addEventListener('change', (e) => { state.adToneLevel = e.target.value; saveProject(); });
  $('#ad-disclosure')?.addEventListener('change', (e) => { state.adDisclosure = e.target.checked; saveProject(); });
  $('#category')?.addEventListener('change', (e) => { state.categoryId = e.target.value; renderSpecFields(); saveProject(); });
  $('#api-key')?.addEventListener('input', (e) => { state.apiKey = e.target.value.trim(); saveSettings(); updatePipelineUI(); });
  $('#model-pro')?.addEventListener('change', (e) => { state.modelPro = e.target.value; saveSettings(); });
  $('#btn-ref-add-paste')?.addEventListener('click', addReferenceFromPaste);
  $('#ref-file-input')?.addEventListener('change', (e) => addReferenceFiles(e.target.files));
  $('#btn-ref-clear')?.addEventListener('click', clearReferences);
  $('#btn-ad-guide-add-paste')?.addEventListener('click', addAdGuideFromPaste);
  $('#ad-guide-file-input')?.addEventListener('change', (e) => addAdGuideFiles(e.target.files));
  $('#btn-ad-guide-clear')?.addEventListener('click', clearAdGuides);
  bindDrawerPanels();
}

function openSheetUrl() {
  if (state.sheetOpenUrl) window.open(state.sheetOpenUrl, '_blank');
  else showToast('시트 URL이 없습니다. 먼저 시트로 보내기를 실행하세요.', true);
}

async function initPromptOnBoot() {
  if (!PM.loadPromptState()?.text) await PM.loadDefaultPromptFile();
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
    await importProjectSeed(getSheetSlug());
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
      $('#settings-panel')?.classList.remove('collapsed');
    }
  } catch (e) {
    $('#boot-error')?.classList.remove('hidden');
    $('#boot-error').textContent = `초기화 오류: ${e.message}`;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
