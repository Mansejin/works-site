(function () {
'use strict';

let CATEGORIES = [];
let GEMINI_MODELS = [];
let DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
let LITE_GEMINI_MODEL = 'gemini-3.1-flash-lite';
let PRO_GEMINI_MODEL = 'gemini-3.1-pro-preview';
let PART_NAME_POOL = [];
let isSupportedGeminiModel = () => false;
let detectCategory = () => null;
let utf8ByteLength = (s) => new TextEncoder().encode(s).length;
let PM = null;

let REF = null;
let LOG = null;
let RESEARCH_LOG = null;
let BRIEF = null;
let RESEARCH = null;

const REQUIRED_PART_KEYWORDS = ['디자인', '실사용', '가격', '총평'];

const STORAGE_KEY = 'dididit-script-machine-v1';
const PROJECT_STORAGE_KEY = 'dididit-project-v1';

const state = {
  apiKey: '',
  modelLite: 'gemini-3.1-flash-lite',
  modelPro: 'gemini-3.1-pro-preview',
  productName: '',
  contentDirection: '',
  productNotes: '',
  productSpecs: {},
  reviewBrief: {
    thesis: '',
    targetScenario: '',
    mustHighlight: '',
    carefulPoints: '',
    compareWith: '',
  },
  priceInfo: '',
  categoryId: 'other',
  referenceScripts: [],
  adMode: false,
  adBrand: '',
  adToneLevel: 'balanced',
  adDisclosure: true,
  adGuides: [],
  partLineup: [],
  draftLineup: [],
  draftReason: '',
  lineupConfirmed: false,
  currentPartIndex: -1,
  allRows: [],
  partSegments: [],
  selectedPartIndex: null,
  searchResults: null,
  searchDeviceId: 'dehumidifier',
  workflowStep: 1,
  currentPage: 1,
};

const $ = (sel) => document.querySelector(sel);

function bindModules() {
  const cfg = window.DIDIDIT_CONFIG;
  PM = window.DIDIDIT_PROMPT;
  REF = window.DIDIDIT_REF;
  LOG = window.DIDIDIT_LOG || null;
  RESEARCH_LOG = window.DIDIDIT_RESEARCH_LOG || null;
  BRIEF = window.DIDIDIT_BRIEF || null;
  RESEARCH = window.DIDIDIT_RESEARCH || null;
  if (!cfg || !PM || !REF) {
    throw new Error('스크립트 로드 실패. index.html과 js 폴더가 같은 위치에 있는지 확인하세요.');
  }
  CATEGORIES = cfg.CATEGORIES;
  GEMINI_MODELS = cfg.GEMINI_MODELS;
  DEFAULT_GEMINI_MODEL = cfg.DEFAULT_GEMINI_MODEL;
  LITE_GEMINI_MODEL = cfg.LITE_GEMINI_MODEL || cfg.DEFAULT_GEMINI_MODEL;
  PRO_GEMINI_MODEL = cfg.PRO_GEMINI_MODEL || 'gemini-3.1-pro-preview';
  isSupportedGeminiModel = cfg.isSupportedGeminiModel;
  PART_NAME_POOL = cfg.PART_NAME_POOL || [];
  detectCategory = cfg.detectCategory;
  utf8ByteLength = cfg.utf8ByteLength;
}

function getSystemRules() {
  return PM.getActiveSystemRules();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.apiKey) state.apiKey = saved.apiKey;
    if (saved.modelLite && isSupportedGeminiModel(saved.modelLite)) {
      state.modelLite = saved.modelLite;
    } else if (saved.model && isSupportedGeminiModel(saved.model)) {
      state.modelLite = saved.model;
    } else if (saved.model) {
      state.modelLite = LITE_GEMINI_MODEL;
    }
    if (saved.modelPro && isSupportedGeminiModel(saved.modelPro)) {
      state.modelPro = saved.modelPro;
    } else if (saved.model && isSupportedGeminiModel(saved.model)) {
      /* legacy: single model was lite default */
    }
  } catch {
    /* ignore */
  }
}

function modelOptionHtml() {
  return GEMINI_MODELS.map(
    (m) => `<option value="${m.id}">${m.label} — ${m.hint}</option>`
  ).join('');
}

function syncModelSelect(selectId, current, fallback) {
  const select = $(selectId);
  if (!select || !GEMINI_MODELS.length) return fallback;
  select.innerHTML = modelOptionHtml();
  const value = isSupportedGeminiModel(current) ? current : fallback;
  select.value = value;
  return value;
}

function renderModelOptions() {
  state.modelLite = syncModelSelect('#model-lite', state.modelLite, LITE_GEMINI_MODEL);
  state.modelPro = syncModelSelect('#model-pro', state.modelPro, PRO_GEMINI_MODEL);
}

function getLineupModel() {
  return state.modelLite;
}

function getPartScriptModel(partName) {
  return isProloguePart(partName) ? state.modelLite : state.modelPro;
}

function getModelLabel(modelId) {
  const m = GEMINI_MODELS.find((x) => x.id === modelId);
  return m ? m.label : modelId;
}

function saveSettings() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      apiKey: state.apiKey,
      modelLite: state.modelLite,
      modelPro: state.modelPro,
    })
  );
}

function saveProject() {
  try {
    syncBriefFromDOM();
    syncSpecsFromDOM();
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({
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
        partLineup: state.partLineup,
        draftLineup: state.draftLineup,
        draftReason: state.draftReason,
        lineupConfirmed: state.lineupConfirmed,
        currentPartIndex: state.currentPartIndex,
        allRows: state.allRows,
        partSegments: state.partSegments,
        searchResults: state.searchResults,
        searchDeviceId: state.searchDeviceId,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    /* quota */
  }
}

function loadProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) || '{}');
    if (saved.productName) state.productName = saved.productName;
    if (saved.contentDirection) state.contentDirection = saved.contentDirection;
    if (saved.productNotes) state.productNotes = saved.productNotes;
    if (saved.priceInfo) state.priceInfo = saved.priceInfo;
    if (saved.categoryId) state.categoryId = saved.categoryId;
    if (saved.productSpecs && typeof saved.productSpecs === 'object') {
      state.productSpecs = saved.productSpecs;
    }
    if (saved.reviewBrief && typeof saved.reviewBrief === 'object') {
      state.reviewBrief = { ...state.reviewBrief, ...saved.reviewBrief };
    }
    if (Array.isArray(saved.referenceScripts)) state.referenceScripts = saved.referenceScripts;
    if (typeof saved.adMode === 'boolean') state.adMode = saved.adMode;
    if (saved.adBrand) state.adBrand = saved.adBrand;
    if (saved.adToneLevel) state.adToneLevel = saved.adToneLevel;
    if (typeof saved.adDisclosure === 'boolean') state.adDisclosure = saved.adDisclosure;
    if (Array.isArray(saved.adGuides)) state.adGuides = saved.adGuides;
    if (Array.isArray(saved.partLineup) && saved.partLineup.length) {
      state.partLineup = saved.partLineup;
      state.draftLineup = saved.draftLineup || [...saved.partLineup];
      state.draftReason = saved.draftReason || '';
      state.lineupConfirmed = !!saved.lineupConfirmed;
      state.currentPartIndex = saved.currentPartIndex ?? -1;
      state.allRows = saved.allRows || [];
      state.partSegments = saved.partSegments || [];
    }
    if (saved.searchResults) state.searchResults = saved.searchResults;
    if (saved.searchDeviceId) state.searchDeviceId = saved.searchDeviceId;
  } catch {
    /* ignore */
  }
}

function applyBriefToDOM() {
  $('#product-name').value = state.productName;
  $('#content-direction').value = state.contentDirection;
  $('#product-notes').value = state.productNotes;
  $('#price-info').value = state.priceInfo;
  if ($('#category')) $('#category').value = state.categoryId;
  $('#brief-thesis').value = state.reviewBrief.thesis || '';
  $('#brief-scenario').value = state.reviewBrief.targetScenario || '';
  $('#brief-must').value = state.reviewBrief.mustHighlight || '';
  $('#brief-careful').value = state.reviewBrief.carefulPoints || '';
  $('#brief-compare').value = state.reviewBrief.compareWith || '';
  renderSpecFields();
}

function syncBriefFromDOM() {
  state.reviewBrief = {
    thesis: $('#brief-thesis')?.value.trim() || '',
    targetScenario: $('#brief-scenario')?.value.trim() || '',
    mustHighlight: $('#brief-must')?.value.trim() || '',
    carefulPoints: $('#brief-careful')?.value.trim() || '',
    compareWith: $('#brief-compare')?.value.trim() || '',
  };
}

function syncSpecsFromDOM() {
  if (!BRIEF) return;
  document.querySelectorAll('[data-spec-key]').forEach((inp) => {
    const key = inp.dataset.specKey;
    if (key) state.productSpecs[key] = inp.value.trim();
  });
}

function renderSpecFields() {
  const container = $('#spec-fields');
  if (!container || !BRIEF) return;

  syncSpecsFromDOM();
  const fields = BRIEF.getSpecFields(state.categoryId, state.searchDeviceId);
  const merged = {
    ...BRIEF.emptySpecsForCategory(state.categoryId, state.searchDeviceId),
    ...state.productSpecs,
  };
  state.productSpecs = merged;

  container.innerHTML = fields
    .map(
      (f) => `
    <label>${esc(f.label)}
      <input type="text" data-spec-key="${esc(f.key)}" value="${esc(merged[f.key] || '')}" placeholder="${esc(f.placeholder || '')}" />
    </label>`
    )
    .join('');

  container.querySelectorAll('[data-spec-key]').forEach((inp) => {
    inp.addEventListener('input', () => {
      state.productSpecs[inp.dataset.specKey] = inp.value;
      saveProject();
    });
  });
}

function onCategoryChange(categoryId) {
  const prev = { ...state.productSpecs };
  state.categoryId = categoryId;
  if (BRIEF) {
    state.productSpecs = BRIEF.emptySpecsForCategory(categoryId, state.searchDeviceId);
    BRIEF.getSpecFields(categoryId, state.searchDeviceId).forEach((f) => {
      if (prev[f.key]) state.productSpecs[f.key] = prev[f.key];
    });
    renderSpecFields();
  }
  updateCategoryHint();
  saveProject();
}

function loadAirPurifierExample() {
  if (!BRIEF) return;
  if (state.productName.trim() && !confirm('현재 브리프를 공기청정기 예시로 덮어쓸까요?')) return;

  const ex = BRIEF.getAirPurifierExample();
  state.productName = ex.productName;
  state.contentDirection = ex.contentDirection;
  state.priceInfo = ex.priceInfo;
  state.productNotes = ex.productNotes;
  state.categoryId = ex.categoryId;
  state.productSpecs = { ...ex.productSpecs };
  state.reviewBrief = { ...ex.reviewBrief };

  applyBriefToDOM();
  updateCategoryHint();
  saveProject();
  if (state.apiKey && state.productName.trim()) updateWorkflowStep(3);
  showToast('공기청정기 예시 브리프를 불러왔습니다. 실제 제품 정보로 수정하세요.');
}

function getSearchCriteriaFromDOM() {
  const deviceId = $('#search-device')?.value || state.searchDeviceId || RESEARCH?.DEFAULT_DEVICE_ID;
  const profile = RESEARCH?.getDeviceProfile(deviceId);
  const priorities = [];
  document.querySelectorAll('input[name="search-pri"]:checked').forEach((el) => {
    priorities.push(el.value);
  });
  return {
    deviceId,
    season: profile?.season || '2026',
    budget: $('#search-budget')?.value || profile?.budget || '40-60',
    roomSize: $('#search-room')?.value || profile?.roomSize || '10-15',
    priorities: priorities.length ? priorities : RESEARCH?.getDefaultPriorities(deviceId) || [],
    extra: $('#search-extra')?.value.trim() || '',
    exclude: profile?.exclude,
    count: 5,
  };
}

function renderSearchDeviceSelect() {
  const sel = $('#search-device');
  if (!sel || !RESEARCH) return;

  sel.innerHTML = RESEARCH.DEVICE_GROUPS.map(
    (g) =>
      `<optgroup label="${esc(g.label)}">${g.ids
        .map((id) => {
          const d = RESEARCH.getDeviceProfile(id);
          const selected = id === (state.searchDeviceId || RESEARCH.DEFAULT_DEVICE_ID) ? ' selected' : '';
          return `<option value="${esc(id)}"${selected}>${esc(d.label)}</option>`;
        })
        .join('')}</optgroup>`
  ).join('');
}

function updateSearchProfileUI(deviceId) {
  if (!RESEARCH) return;
  const id = deviceId || $('#search-device')?.value || state.searchDeviceId;
  state.searchDeviceId = id;
  const profile = RESEARCH.getDeviceProfile(id);

  const badge = $('#search-season-badge');
  if (badge) badge.textContent = profile.badge || '';

  const budgetSel = $('#search-budget');
  if (budgetSel && profile.budget) budgetSel.value = profile.budget;

  const roomRow = $('#search-room-row');
  if (roomRow) roomRow.classList.toggle('hidden', !profile.useRoomSize);

  const priBox = $('#search-priorities');
  if (priBox) {
    const priorities = RESEARCH.getPrioritiesForUI
      ? RESEARCH.getPrioritiesForUI(id)
      : profile.priorities;
    priBox.innerHTML = priorities
      .map(
        (p) =>
          `<label class="checkbox-inline"><input type="checkbox" name="search-pri" value="${esc(p.label)}"${p.default ? ' checked' : ''} /> ${esc(p.label)}</label>`
      )
      .join('');
  }

  const hint = $('#search-device-hint');
  if (hint) hint.textContent = `리서치 포인트: ${profile.searchFocus}`;
}

function renderSearchResults(result) {
  const list = $('#search-results');
  const summary = $('#search-summary');
  const tips = $('#search-buying-tips');
  const toolbar = $('#search-results-toolbar');
  if (!list || !result) {
    $('#search-results-toolbar')?.classList.add('hidden');
    return;
  }

  const deviceLabel = result.deviceLabel || result.criteria?.deviceId || '제품';
  const hasProducts = result.products?.length > 0;
  if (toolbar) toolbar.classList.toggle('hidden', !hasProducts);

  if (summary) {
    summary.classList.remove('hidden');
    const planned = (result.plannedQueries || []).join(' · ');
    const executed = (result.webSearchQueries || []).slice(0, 8).join(', ');
    const sum = result.summary || result.audit?.summary || {};
    const verifyLine =
      sum.verifiedCount != null
        ? ` · 검증 ${sum.verifiedCount}/${sum.totalProducts}${sum.partialCount ? ` (부분 ${sum.partialCount})` : ''}${sum.strippedLinks ? ` · 링크 제거 ${sum.strippedLinks}` : ''}`
        : '';
    summary.innerHTML = `<strong>[${esc(deviceLabel)}] ${esc(result.querySummary || '검색 완료')}</strong>${verifyLine}${planned ? `<br><span class="hint">계획 쿼리: ${esc(planned)}</span>` : ''}${executed ? `<br><span class="hint">실행 검색: ${esc(executed)}</span>` : ''}`;
  }

  if (tips) {
    if (result.buyingTips) {
      tips.classList.remove('hidden');
      tips.innerHTML = `<strong>구매 체크리스트</strong> ${esc(result.buyingTips)}`;
    } else {
      tips.classList.add('hidden');
    }
  }

  list.innerHTML = result.products
    .map((p, idx) => {
      const specsHtml = (p.keySpecs || [])
        .map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`)
        .join('');
      const pros = (p.pros || []).map((x) => `<li>${esc(x)}</li>`).join('');
      const cons = (p.cons || []).map((x) => `<li>${esc(x)}</li>`).join('');
      const yt = (p.youtubeRefs || [])
        .map(
          (y) =>
            `<li><a href="${esc(y.url)}" target="_blank" rel="noopener">${esc(y.title || y.url)}</a>${y.note ? ` — ${esc(y.note)}` : ''}</li>`
        )
        .join('');
      const src = (p.sources || [])
        .slice(0, 5)
        .map(
          (s) =>
            `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></li>`
        )
        .join('');
      const status = p.verificationStatus || (p.verified ? 'verified' : 'unverified');
      const statusLabels = { verified: '검증됨', partial: '부분검증', unverified: '미검증' };
      const verifyBadge = `<span class="search-verify search-verify-${status}" title="${esc(statusLabels[status] || status)}">${esc(statusLabels[status] || status)}</span>`;
      const modelCodeHtml = p.modelCode
        ? `<span class="search-model-code">${esc(p.modelCode)}</span>`
        : '';
      const linkWarnHtml =
        p.linkWarnings?.length
          ? `<p class="search-link-warn hint">링크 제거: ${esc(p.linkWarnings.join(', '))}</p>`
          : '';
      const verifyNoteHtml = p.verificationNotes
        ? `<p class="search-verify-note hint">${esc(p.verificationNotes)}</p>`
        : '';
      const officialHtml = p.officialUrl
        ? `<p class="search-label">공식</p><ul class="search-links"><li><a href="${esc(p.officialUrl)}" target="_blank" rel="noopener">${esc(p.officialUrl)}</a></li></ul>`
        : '';
      const purchaseHtml = p.purchaseUrl
        ? `<p class="search-label">구매</p><ul class="search-links"><li><a href="${esc(p.purchaseUrl)}" target="_blank" rel="noopener">${esc(p.purchaseUrl)}</a></li></ul>`
        : '';
      return `<li class="search-card" data-search-idx="${idx}">
        <div class="search-card-head">
          <span class="search-rank">#${p.rank}</span>
          <h4 class="search-card-title">${esc(p.brand)} ${esc(p.model)}</h4>
          ${modelCodeHtml}
          ${verifyBadge}
          ${p.releaseYear ? `<span class="search-year">${esc(p.releaseYear)}</span>` : ''}
          <span class="search-price">${esc(p.priceKrw)}${p.priceNote ? ` <span class="hint">(${esc(p.priceNote)})</span>` : ''}</span>
          <button type="button" class="btn btn-ghost btn-sm btn-delete-search" data-idx="${idx}" title="삭제">삭제</button>
        </div>
        ${linkWarnHtml}
        ${verifyNoteHtml}
        ${specsHtml ? `<dl class="search-specs">${specsHtml}</dl>` : ''}
        ${p.timingFit ? `<p class="search-summer">${esc(p.timingFit)}</p>` : ''}
        ${p.maintenanceCost ? `<p class="search-maint hint">유지비: ${esc(p.maintenanceCost)}</p>` : ''}
        ${pros ? `<p class="search-label">장점</p><ul class="search-pros">${pros}</ul>` : ''}
        ${cons ? `<p class="search-label">단점</p><ul class="search-cons">${cons}</ul>` : ''}
        ${p.reviewAngle ? `<p class="search-angle"><strong>리뷰 각도</strong> ${esc(p.reviewAngle)}</p>` : ''}
        ${officialHtml}
        ${purchaseHtml}
        ${yt ? `<p class="search-label">유튜브</p><ul class="search-links">${yt}</ul>` : ''}
        ${src && !p.officialUrl && !p.purchaseUrl ? `<p class="search-label">출처</p><ul class="search-links">${src}</ul>` : ''}
        <button type="button" class="btn btn-primary btn-sm btn-apply-search" data-idx="${idx}">브리프에 적용</button>
      </li>`;
    })
    .join('');

  list.querySelectorAll('.btn-apply-search').forEach((btn) => {
    btn.addEventListener('click', () => applyResearchProduct(Number(btn.dataset.idx)));
  });
  list.querySelectorAll('.btn-delete-search').forEach((btn) => {
    btn.addEventListener('click', () => deleteSearchResult(Number(btn.dataset.idx)));
  });
}

function resetSearchResultsUI() {
  const list = $('#search-results');
  if (list) list.innerHTML = '';
  $('#search-summary')?.classList.add('hidden');
  $('#search-buying-tips')?.classList.add('hidden');
  $('#search-results-toolbar')?.classList.add('hidden');
  const statusEl = $('#search-status');
  if (statusEl) statusEl.textContent = '';
}

function clearSearchResults() {
  if (state.searchResults?.products?.length && !confirm('서치 결과를 모두 지울까요?')) return;
  state.searchResults = null;
  resetSearchResultsUI();
  saveProject();
  showToast('서치 결과를 초기화했습니다.');
}

function deleteSearchResult(index) {
  if (!state.searchResults?.products?.length) return;
  const product = state.searchResults.products[index];
  if (!product) return;
  const label = `${product.brand} ${product.model}`.trim() || '후보';
  if (!confirm(`«${label}» 후보를 목록에서 삭제할까요?`)) return;
  state.searchResults.products.splice(index, 1);
  state.searchResults.products.forEach((p, i) => {
    p.rank = i + 1;
  });
  if (!state.searchResults.products.length) {
    state.searchResults = null;
    resetSearchResultsUI();
    showToast('서치 결과를 초기화했습니다.');
  } else {
    renderSearchResults(state.searchResults);
    showToast('후보를 삭제했습니다.');
  }
  saveProject();
}

async function runDeviceSearch() {
  if (!state.apiKey) return showToast('Google API 키를 입력하세요. (상단 API)', true);
  if (!RESEARCH) return showToast('리서치 모듈을 불러오지 못했습니다.', true);

  const criteria = getSearchCriteriaFromDOM();
  const profile = RESEARCH.getDeviceProfile(criteria.deviceId);
  if (criteria.extra) criteria.priorities = [...criteria.priorities, criteria.extra];

  const statusEl = $('#search-status');
  if (statusEl) statusEl.textContent = `${profile.label} 쿼리 계획 중… (3.1 Pro, 2~4분)`;

  setLoading(true, `${profile.label} 서치 중…`);
  try {
    const result = await RESEARCH.searchDevices(state.apiKey, criteria, {
      model: state.modelPro,
      onProgress: (p) => {
        const phaseLabels = {
          plan: '쿼리 계획',
          discover: '후보 발굴',
          verify: '제품 검증',
          synthesize: '순위 정리',
        };
        const label = p.message || phaseLabels[p.phase] || p.label || p.phase;
        if (statusEl) {
          if (p.phase === 'verify' && p.total != null) {
            statusEl.textContent = `${profile.label} ${label} (${p.index + 1}/${p.total})`;
          } else {
            statusEl.textContent = `${profile.label} ${label}`;
          }
        }
        setLoading(true, label);
      },
    });
    state.searchResults = result;
    state.searchDeviceId = criteria.deviceId;
    renderSearchResults(result);
    const sum = result.summary || result.audit?.summary;
    if (statusEl) {
      const verified = sum ? ` · 검증 ${sum.verifiedCount}/${sum.totalProducts}` : '';
      statusEl.textContent = `${profile.label} ${result.products.length}개 후보${verified} · ${new Date().toLocaleString('ko-KR')}`;
    }
    RESEARCH_LOG?.logRun({
      deviceId: criteria.deviceId,
      deviceLabel: profile.label,
      model: result.model || state.modelPro,
      criteria,
      phases: result.auditPhases || result.audit?.phases,
      summary: sum,
      finalProducts: result.products.map((p) => ({
        brand: p.brand,
        model: p.model,
        modelCode: p.modelCode,
        verified: p.verified,
        verificationStatus: p.verificationStatus,
        officialUrl: p.officialUrl,
        purchaseUrl: p.purchaseUrl,
        linkWarnings: p.linkWarnings,
        verificationNotes: p.verificationNotes,
      })),
    });
    saveProject();
    updateWorkflowStep(2);
    const vCount = sum?.verifiedCount ?? 0;
    showToast(`${profile.label} 후보 ${result.products.length}개 (검증 ${vCount}개) — 브리프에 적용하세요.`);
  } catch (e) {
    reportError('searchDevice', e, { model: state.modelPro, device: criteria.deviceId });
    if (statusEl) statusEl.textContent = '';
  } finally {
    setLoading(false);
  }
}

function applyResearchProduct(index) {
  const product = state.searchResults?.products?.[index];
  if (!product || !RESEARCH) return;

  const deviceId = state.searchResults.deviceId || state.searchDeviceId;
  const patch = RESEARCH.productToBriefPatch(product, deviceId);
  state.searchDeviceId = patch.deviceId || deviceId;
  state.categoryId = patch.categoryId;
  state.productName = patch.productName;
  state.priceInfo = patch.priceInfo;
  state.contentDirection = patch.contentDirection;
  state.productSpecs = { ...patch.productSpecs };
  state.reviewBrief = { ...patch.reviewBrief };
  state.productNotes = patch.productNotes;

  applyBriefToDOM();
  updateCategoryHint();
  saveProject();
  updateWorkflowStep(3);
  updateGenerateButtons();
  showToast(`«${patch.productName}» 브리프에 적용했습니다.`);
}

function hasUnsavedWork() {
  return !!(
    state.productName.trim() ||
    state.contentDirection.trim() ||
    state.productNotes.trim() ||
    state.priceInfo.trim() ||
    Object.values(state.productSpecs || {}).some((v) => String(v).trim()) ||
    Object.values(state.reviewBrief || {}).some((v) => String(v).trim()) ||
    state.referenceScripts.length ||
    state.adGuides.length ||
    state.adMode ||
    state.adBrand.trim() ||
    state.partLineup.length ||
    state.allRows.length
  );
}

function bindBeforeUnload() {
  window.addEventListener('beforeunload', (e) => {
    if (!hasUnsavedWork()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function renderCategoryOptions() {
  const select = $('#category');
  if (!select || !CATEGORIES.length) return;
  select.innerHTML = CATEGORIES.map(
    (c) => `<option value="${c.id}">${c.name} — ${c.examples}</option>`
  ).join('');
  select.value = state.categoryId;
}

function updateCategoryHint() {
  const cat =
    CATEGORIES.find((c) => c.id === state.categoryId) ||
    CATEGORIES.find((c) => c.id === 'other');
  const hint = $('#category-hint');
  if (hint) hint.textContent = `촬영 포인트: ${cat.focusHints}`;
}

function autoDetectCategory() {
  syncSpecsFromDOM();
  const detected = detectCategory(
    state.productName,
    state.productNotes,
    state.contentDirection
  );
  onCategoryChange(detected.id);
  $('#category').value = detected.id;
  showToast(`카테고리 자동 감지: ${detected.name}`);
}

function hideToast() {
  const el = $('#toast');
  if (!el) return;
  clearTimeout(showToast._t);
  showToast._t = null;
  el.classList.remove('visible');
  el.setAttribute('aria-hidden', 'true');
}

function showToast(msg, isError = false) {
  const el = $('#toast');
  if (!el) return;
  if (!msg) {
    hideToast();
    return;
  }

  const now = Date.now();
  if (showToast._lastMsg === msg && now - (showToast._lastAt || 0) < 600) return;
  showToast._lastMsg = msg;
  showToast._lastAt = now;

  el.textContent = msg;
  el.className = `toast${isError ? ' error' : ''}`;
  requestAnimationFrame(() => {
    el.classList.add('visible');
    el.setAttribute('aria-hidden', 'false');
  });

  clearTimeout(showToast._t);
  showToast._t = setTimeout(hideToast, isError ? 4000 : 2500);
}

function bindToastDismiss() {
  const el = $('#toast');
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('click', hideToast);
}

function reportError(context, err, meta = {}, options = {}) {
  const error = err instanceof Error ? err : new Error(String(err));
  const merged = {
    ...meta,
    ...(error.apiModel ? { model: error.apiModel } : {}),
    ...(error.apiStatus ? { status: error.apiStatus } : {}),
    ...(error.finishReason ? { finishReason: error.finishReason } : {}),
  };
  if (LOG) LOG.log(context, error, merged);
  else console.error(`[${context}]`, error, merged);
  if (!options.silent) {
    const toastKey = `${context}:${error.message}`;
    const now = Date.now();
    if (
      reportError._toastKey === toastKey &&
      now - (reportError._toastAt || 0) < 2500
    ) {
      return;
    }
    reportError._toastKey = toastKey;
    reportError._toastAt = now;
    showToast(error.message, true);
  }
}

function closeOtherDrawers(exceptPanelId) {
  const drawers = [
    ['#settings-panel', '#toggle-settings'],
    ['#prompt-panel', '#toggle-prompt'],
    ['#error-log-panel', '#toggle-error-log'],
  ];
  drawers.forEach(([panelId, btnId]) => {
    if (panelId === exceptPanelId) return;
    $(panelId)?.classList.add('collapsed');
    $(btnId)?.classList.remove('btn-active');
  });
}

function bindErrorLogging() {
  window.addEventListener('unhandledrejection', (e) => {
    reportError(
      'unhandledrejection',
      e.reason instanceof Error ? e.reason : new Error(String(e.reason))
    );
  });
  flushEarlyErrors();
}

function flushEarlyErrors() {
  const early = window.__earlyErrors;
  if (!early?.length || !LOG) return;
  early.forEach((item) => {
    LOG.log('window.error', new Error(item.message || '스크립트 오류'), {
      source: item.filename,
      line: item.lineno,
    });
  });
  window.__earlyErrors = [];
}

function switchLogTab(tabId) {
  const isError = tabId === 'error';
  document.querySelectorAll('.log-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.logTab === tabId);
  });
  $('#log-tab-error')?.classList.toggle('hidden', !isError);
  $('#log-tab-research')?.classList.toggle('hidden', isError);
  if (isError) LOG?.render();
  else RESEARCH_LOG?.render();
}

function bindErrorLogUI() {
  $('#toggle-error-log')?.addEventListener('click', () => {
    togglePanel('#error-log-panel', '#toggle-error-log');
  });
  document.querySelectorAll('.log-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchLogTab(btn.dataset.logTab));
  });
  $('#btn-log-clear')?.addEventListener('click', () => {
    const activeTab = document.querySelector('.log-tab.active')?.dataset.logTab || 'error';
    if (activeTab === 'research') {
      if (RESEARCH_LOG?.getEntries().length && !confirm('서치 감사 로그를 모두 삭제할까요?')) return;
      RESEARCH_LOG?.clear();
      showToast('서치 감사 로그를 비웠습니다.');
      return;
    }
    if (LOG?.getEntries().length && !confirm('오류 로그를 모두 삭제할까요?')) return;
    LOG?.clear();
    showToast('오류 로그를 비웠습니다.');
  });
  $('#btn-log-copy')?.addEventListener('click', async () => {
    const activeTab = document.querySelector('.log-tab.active')?.dataset.logTab || 'error';
    const text = activeTab === 'research' ? RESEARCH_LOG?.toExportText() : LOG?.toExportText();
    if (!text) return showToast('복사할 로그가 없습니다.', true);
    try {
      await navigator.clipboard.writeText(text);
      showToast(activeTab === 'research' ? '서치 감사 로그를 복사했습니다.' : '오류 로그를 복사했습니다.');
    } catch (e) {
      reportError('error-log.copy', e);
    }
  });
  $('#btn-log-export')?.addEventListener('click', () => {
    const activeTab = document.querySelector('.log-tab.active')?.dataset.logTab || 'error';
    const ok =
      activeTab === 'research' ? RESEARCH_LOG?.downloadTxt() : LOG?.downloadTxt();
    if (!ok) showToast('저장할 로그가 없습니다.', true);
    else showToast(activeTab === 'research' ? '서치 감사 로그를 저장했습니다.' : '오류 로그 txt를 저장했습니다.');
  });
}

function setLoading(on, text = '생성 중…') {
  const overlay = $('#loading-overlay');
  if (overlay) overlay.classList.toggle('hidden', !on);
  const loadingText = $('#loading-text');
  if (loadingText) loadingText.textContent = text;
  document
    .querySelectorAll(
      'main button, main input, main textarea, main select, .action-dock button, .action-dock input, .drawer button, .drawer input, .drawer textarea, .drawer select'
    )
    .forEach((el) => {
      el.disabled = on;
    });
}

function togglePanel(panelId, btnId) {
  const panel = $(panelId);
  const btn = $(btnId);
  if (!panel) return;
  const willOpen = panel.classList.contains('collapsed');
  if (willOpen) closeOtherDrawers(panelId);
  panel.classList.toggle('collapsed');
  if (btn) btn.classList.toggle('btn-active', willOpen);
  if (willOpen && panelId === '#prompt-panel') loadPromptEditor();
  if (willOpen && panelId === '#error-log-panel') {
    const activeTab = document.querySelector('.log-tab.active')?.dataset.logTab || 'error';
    if (activeTab === 'research') RESEARCH_LOG?.render();
    else LOG?.render();
  }
}

function workflowPageForStep(step) {
  if (step <= 1) return 1;
  if (step <= 3) return 2;
  if (step <= 6) return 3;
  return 4;
}

function updateRailDoneState() {
  const maxPage = workflowPageForStep(state.workflowStep || 1);
  document.querySelectorAll('.step-rail-item').forEach((el) => {
    const n = Number(el.dataset.rail);
    el.classList.toggle('done', n < maxPage);
  });
}

function navigateToPage(page) {
  const shell = document.querySelector('.app-shell');
  if (shell) {
    shell.dataset.page = String(page);
    shell.classList.toggle('page-conti', page === 4);
  }
  document.body.dataset.workflowPage = String(page);
  state.currentPage = page;

  document.querySelectorAll('.step-rail-item').forEach((el) => {
    const n = Number(el.dataset.rail);
    el.classList.toggle('active', n === page);
  });
  updateRailDoneState();

  document.querySelectorAll('.work-column .step-section').forEach((el) => {
    const n = Number(el.dataset.step);
    const visible = n === page;
    el.classList.toggle('page-visible', visible);
    el.classList.toggle('step-active', visible);
    el.classList.toggle('step-collapsed', !visible);
    el.classList.toggle('step-done', n < page);
  });

  updateActionDock();
}

function updateWorkflowStep(step) {
  state.workflowStep = step;
  navigateToPage(workflowPageForStep(step));
}

function getSegmentForRow(rowIndex) {
  return state.partSegments.find(
    (s) => rowIndex >= s.start && rowIndex <= s.end
  );
}

function isPartGenerated(partIndex) {
  return state.partSegments.some((s) => s.partIndex === partIndex);
}

function countGeneratedParts() {
  return state.partSegments.length;
}

function getInsertPosition(partIndex) {
  let pos = 0;
  for (let i = 0; i < partIndex; i++) {
    const seg = state.partSegments.find((s) => s.partIndex === i);
    if (seg) pos = seg.end + 1;
  }
  return pos;
}

function removePartRows(partIndex) {
  const segIdx = state.partSegments.findIndex((s) => s.partIndex === partIndex);
  if (segIdx < 0) return 0;
  const seg = state.partSegments[segIdx];
  const count = seg.end - seg.start + 1;
  state.allRows.splice(seg.start, count);
  state.partSegments.splice(segIdx, 1);
  for (const s of state.partSegments) {
    if (s.start > seg.start) {
      s.start -= count;
      s.end -= count;
    }
  }
  return count;
}

function insertPartRows(partIndex, partName, rows) {
  removePartRows(partIndex);
  const insertAt = getInsertPosition(partIndex);
  state.allRows.splice(insertAt, 0, ...rows);
  const len = rows.length;
  for (const s of state.partSegments) {
    if (s.start >= insertAt) {
      s.start += len;
      s.end += len;
    }
  }
  recordPartSegment(partIndex, partName, insertAt, insertAt + len - 1);
  state.currentPartIndex = Math.max(state.currentPartIndex, partIndex);
}

function recordPartSegment(partIndex, partName, start, end) {
  const seg = { partIndex, partName, start, end };
  const existing = state.partSegments.findIndex((s) => s.partIndex === partIndex);
  if (existing >= 0) state.partSegments[existing] = seg;
  else state.partSegments.push(seg);
  state.partSegments.sort((a, b) => a.partIndex - b.partIndex);
}

function getPreviousPartsContext(partIndex) {
  const prior = state.partSegments
    .filter((s) => s.partIndex < partIndex)
    .sort((a, b) => a.partIndex - b.partIndex);
  if (!prior.length) return '';
  const last = prior[prior.length - 1];
  return `\n이전 파트에서 다룬 내용 요약:\n${state.allRows
    .slice(last.start, last.end + 1)
    .slice(-5)
    .map((r) => r.대본)
    .join(' ')}`;
}

function getPendingPartsLabel() {
  const pending = state.partLineup
    .map((name, i) => (!isPartGenerated(i) ? name : null))
    .filter(Boolean);
  return pending.length ? pending.join(', ') : '(없음)';
}

function selectPart(partIndex) {
  if (!state.lineupConfirmed) return;
  state.selectedPartIndex = partIndex;
  const name = state.partLineup[partIndex];
  const hasSeg = isPartGenerated(partIndex);
  renderPartLineup();
  renderTable();
  updateActionDock();
  updateGenerateButtons();
  if (hasSeg) {
    showToast(`"${name}" 선택 — AI 수정 또는 [파트 생성]으로 다시 작성`);
  } else {
    showToast(`"${name}" 선택 — [파트 생성]으로 작성`);
  }
}

/** @deprecated use selectPart */
function selectPartForRevision(partIndex) {
  selectPart(partIndex);
}

function updateActionDock() {
  const label = $('#dock-part-label');
  const progress = $('#dock-progress');
  const btnRevise = $('#btn-revise-part');
  const btnReviseLineup = $('#btn-revise-lineup');

  if (btnReviseLineup) {
    btnReviseLineup.disabled =
      !state.apiKey || !state.partLineup.length || state.lineupConfirmed;
  }

  if (!state.lineupConfirmed) {
    if (label) label.textContent = '파트 구성을 확정하세요';
    if (progress) progress.textContent = state.partLineup.length
      ? `${state.partLineup.length}개 파트 초안`
      : '';
    if (btnRevise) btnRevise.disabled = true;
    return;
  }

  const done = countGeneratedParts();
  const total = state.partLineup.length;

  if (state.selectedPartIndex !== null) {
    const name = state.partLineup[state.selectedPartIndex];
    const hasSeg = isPartGenerated(state.selectedPartIndex);
    if (label) {
      label.textContent = hasSeg ? `수정 대상: ${name}` : `작성 대상: ${name}`;
    }
    if (progress) progress.textContent = `${done}/${total} 파트 완료 · 미작성: ${getPendingPartsLabel()}`;
    if (btnRevise) btnRevise.disabled = !state.apiKey || !hasSeg;
  } else if (done < total) {
    const nextIdx = state.partLineup.findIndex((_, i) => !isPartGenerated(i));
    const next = nextIdx >= 0 ? state.partLineup[nextIdx] : '';
    if (label) label.textContent = next ? `다음 추천: ${next}` : '파트를 선택하세요';
    if (progress) progress.textContent = `${done}/${total} 파트 완료`;
    if (btnRevise) btnRevise.disabled = true;
  } else if (done >= total && total > 0) {
    if (label) label.textContent = '전체 파트 완료';
    if (progress) progress.textContent = `${total}/${total}`;
    if (btnRevise) {
      btnRevise.disabled =
        state.selectedPartIndex === null || !isPartGenerated(state.selectedPartIndex) || !state.apiKey;
    }
  }
}

async function callGemini(userPrompt, temperature = 0.7, modelId = null, options = {}) {
  const model = modelId || state.modelLite;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;

  const generationConfig = {
    temperature,
    responseMimeType: 'application/json',
  };
  if (options.responseSchema) {
    generationConfig.responseSchema = options.responseSchema;
  }

  const body = {
    systemInstruction: { parts: [{ text: getSystemRules() }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `API 오류 (${res.status})`;
    const e = new Error(msg);
    e.apiStatus = res.status;
    e.apiModel = model;
    throw e;
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = candidate?.finishReason || '';
    const blockReason = data?.promptFeedback?.blockReason || '';
    const hint = finishReason || blockReason;
    const msg =
      finishReason === 'SAFETY' || blockReason
        ? `응답 차단${hint ? `: ${hint}` : ''}`
        : '응답이 비어 있습니다.';
    const e = new Error(msg);
    e.apiModel = model;
    e.finishReason = finishReason;
    throw e;
  }
  return text;
}

const LINEUP_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    lineup: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    reason: { type: 'STRING' },
  },
  required: ['lineup'],
};

const LINEUP_SCHEMA_LINEUP_ONLY = {
  type: 'OBJECT',
  properties: {
    lineup: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: ['lineup'],
};

function stripJsonFences(text) {
  return String(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function findJsonObjectBounds(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

function repairJsonText(s) {
  return s
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([\]}])/g, '$1');
}

function parseJsonLoose(raw) {
  const candidates = [
    String(raw).trim(),
    stripJsonFences(raw),
    findJsonObjectBounds(stripJsonFences(raw)),
    repairJsonText(findJsonObjectBounds(stripJsonFences(raw))),
  ];
  const seen = new Set();
  let lastErr;
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return JSON.parse(candidate);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('JSON 파싱 실패');
}

function extractBracketArray(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*\\[`, 'i');
  const match = re.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          const arr = JSON.parse(repairJsonText(slice));
          if (Array.isArray(arr)) return arr;
        } catch {
          const items = [];
          const itemRe = /"((?:[^"\\]|\\.)*)"/g;
          let m;
          while ((m = itemRe.exec(slice))) {
            try {
              items.push(JSON.parse(`"${m[1]}"`));
            } catch {
              items.push(m[1]);
            }
          }
          if (items.length) return items;
        }
        return null;
      }
    }
  }
  return null;
}

function extractReasonLoose(text) {
  const m = text.match(/"reason"\s*:\s*"([\s\S]*?)"\s*[,}]/i);
  if (!m) return '';
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1].replace(/\\"/g, '"').trim();
  }
}

function extractLineupStringsLoose(text) {
  const arr = extractBracketArray(text, 'lineup') || extractBracketArray(text, 'parts');
  if (arr?.length) return arr;
  const block = text.match(/"lineup"\s*:\s*\[([\s\S]*?)\]/i) || text.match(/"parts"\s*:\s*\[([\s\S]*?)\]/i);
  if (!block) return null;
  const items = [];
  const itemRe = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = itemRe.exec(block[1]))) {
    try {
      items.push(JSON.parse(`"${m[1]}"`));
    } catch {
      items.push(m[1]);
    }
  }
  return items.length ? items : null;
}

function parseLineupJson(raw) {
  const text = stripJsonFences(raw);
  let lineup;
  let reason = '';

  try {
    const parsed = parseJsonLoose(text);
    lineup = parsed.lineup || parsed.parts;
    reason = String(parsed.reason || '');
  } catch (e) {
    lineup = extractLineupStringsLoose(text);
    reason = extractReasonLoose(text);
    if (!lineup?.length) {
      throw new Error(`파트 구성 JSON 파싱 실패: ${e.message}`);
    }
  }

  if (!Array.isArray(lineup) || !lineup.length) {
    throw new Error('lineup 배열이 없거나 비어 있습니다.');
  }

  return {
    lineup: lineup.map((p) => String(p).trim()).filter(Boolean),
    reason,
  };
}

async function requestLineupFromGemini(prompt, temperature = 0.35) {
  const model = getLineupModel();
  const jsonRule =
    '\n\nreason은 한 줄 설명만(큰따옴표·줄바꿈 없이). 파트 이름은 1~3단어. JSON만 출력.';
  const attempts = [
    { text: prompt + jsonRule, temp: temperature, schema: LINEUP_RESPONSE_SCHEMA },
    {
      text: `${prompt}${jsonRule}\n\n[재시도] {"lineup":["프롤로그","디자인",...],"reason":"한줄"}`,
      temp: 0.15,
      schema: LINEUP_RESPONSE_SCHEMA,
    },
    {
      text: `${prompt}\n\nreason 생략. {"lineup":["프롤로그","디자인","실사용","가격","총평"]} 만 출력.`,
      temp: 0.1,
      schema: LINEUP_SCHEMA_LINEUP_ONLY,
    },
  ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      const raw = await callGemini(attempt.text, attempt.temp, model, {
        responseSchema: attempt.schema,
      });
      return parseLineupJson(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('파트 구성 JSON 파싱 실패');
}

function parseRowsJson(raw) {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`대본 JSON 파싱 실패: ${e.message}`);
  }
  const rows = parsed.rows || parsed;
  if (!Array.isArray(rows)) throw new Error('rows 배열이 없습니다.');
  if (!rows.length) throw new Error('rows가 비어 있습니다.');
  return rows.map((r) => ({
    대본: String(r.대본 || r.script || '').trim(),
    장면: String(r.장면 || r.scene || '').trim(),
    사이즈: String(r.사이즈 || r.size || '').trim(),
    자막: String(r.자막 || r.subtitle || '').trim(),
    코멘트: String(r.코멘트 || r.comment || '').trim(),
  }));
}

const ROW_CHARS_MIN = 20;
const ROW_CHARS_TARGET_MAX = 45;
const ROW_CHARS_HARD_MAX = 50;

function getNarrationRhythmBlock() {
  return `
# [대본 호흡·행 분할 — 반드시 준수]
- **반드시 호흡마다 행을 나눕니다.** 한 행 = 성우가 한 번에 읽는 한 호흡.
- 1행 길이: 공백 포함 **25~45자** (절대 **50자 초과 금지**). 100자 넘는 장문을 한 행에 넣지 마세요.
- 마침표마다 무조건 분리하지 말되, **호흡이 바뀌면 새 행**. 이어지는 절은 쉼표·연결어미에서 나눌 수 있음.
- **금지①**: 문장마다 15자 내외 초단문만 연속 나열
- **금지②**: 여러 문장·장문을 한 셀에 합침 (스프레드시트 1행 = 대본 1호흡)
- 연속 내레이션·같은 장면: 장면 열에 '컷 유지'
- 좋은 예 (3행):
  "물론 별도로 판매하는 전용 커버를 사용하면 스탠드 기능을 추가할 수 있습니다."
  "저는 개인적으로 영상 시청이 주 목적이라면 이런 액세서리를 활용해"
  "거치 환경을 만드는 것을 적극적으로 추천해 드리고 싶습니다."
- 나쁜 예: 위 3문장을 한 행에 합침 / "전체적인 외관은 깔끔합니다."만 단독 10자 행 반복`;
}

function detectChoppyRhythm(rows, partName = '') {
  if (isProloguePart(partName) || rows.length < 6) return null;
  const shortRows = rows.filter((r) => r.대본.length < ROW_CHARS_MIN);
  if (shortRows.length / rows.length > 0.35) {
    return `호흡 리듬: ${rows.length}행 중 ${shortRows.length}행이 ${ROW_CHARS_MIN}자 미만 (너무 잘게 쪼갬)`;
  }
  return null;
}

function detectOverlongRows(rows, partName = '') {
  if (isProloguePart(partName)) return null;
  const longRows = rows.filter((r) => r.대본.length > ROW_CHARS_HARD_MAX);
  if (longRows.length) {
    return `행 분할 부족: ${longRows.length}행이 ${ROW_CHARS_HARD_MAX}자 초과 — 호흡마다 나눠 행당 25~45자`;
  }
  const avg = rows.reduce((s, r) => s + r.대본.length, 0) / rows.length;
  if (avg > 48) {
    return `평균 ${Math.round(avg)}자/행 — 장문 합침. 호흡 단위로 더 잘게 나누세요 (목표 25~45자)`;
  }
  return null;
}

function shortenPartName(name) {
  const rules = [
    [/프롤로그|오프닝/i, '프롤로그'],
    [/구성품|언박싱/i, '구성품'],
    [/디자인|첫인상|외관/i, '디자인'],
    [/성능|기술|스펙|디스플레이/i, '성능'],
    [/실사용|환경/i, '실사용'],
    [/편의|연결|앱/i, '편의성'],
    [/관리|유지/i, '관리'],
    [/단점|한계|아쉬운/i, '단점'],
    [/가격/i, '가격'],
    [/총평|클로징/i, '총평'],
  ];
  const text = String(name || '').trim();
  for (const [re, label] of rules) {
    if (re.test(text)) return label;
  }
  const word = text.split(/[\s 및·]+/).find(Boolean) || text;
  return word.length > 8 ? word.slice(0, 6) : word;
}

function normalizePartLineup(lineup) {
  const seen = new Set();
  return lineup
    .map((p) => shortenPartName(p))
    .filter((p) => {
      if (!p || seen.has(p)) return false;
      seen.add(p);
      return true;
    });
}

function isProloguePart(partName) {
  return /프롤로그|오프닝/i.test(partName || '');
}

function isClosingPart(partName) {
  return /총평|클로징/i.test(partName || '');
}

function getPartVolumePrompt(partName) {
  if (isProloguePart(partName)) {
    return `[프롤로그 전용 분량 — 시스템 프롬프트보다 이 지침 우선]
- 반드시 8행 이하로 작성 (9행 이상 절대 금지)
- 일반 파트 규칙(20~25행, 1,600~2,000 bytes)은 이 파트에 적용하지 마세요
- 오프닝 고정 멘트(안녕하세요 디디딧입니다 ~ 리뷰 시작하겠습니다)를 모두 포함
- 권장 4~8행, 대본 총 약 400~800 UTF-8 bytes
- 행마다 장면·사이즈 포함. 대본은 호흡에 맞게 짧게`;
  }
  if (isClosingPart(partName)) {
    return `이 파트만 14~20행, 대본 총 1,600~2,000 UTF-8 bytes로 작성하세요.
클로징 고정 멘트를 반드시 포함할 것.
${getNarrationRhythmBlock()}
행마다 장면(모델 행동·카메라 구도)·사이즈(샷 크기) 포함.`;
  }
  return `이 파트만 14~20행, 대본 총 1,600~2,000 UTF-8 bytes로 작성하세요.
${getNarrationRhythmBlock()}
행마다 장면(모델 행동·카메라 구도)·사이즈(샷 크기) 포함.`;
}

function getPartRetryHint(partName) {
  if (isProloguePart(partName)) {
    return '\n\n[재시도] 프롤로그는 8행 이하만 허용. 9행 이상·1600bytes·20행 규칙 적용 금지. 오프닝 고정 멘트 포함.';
  }
  return '\n\n[재시도] 50자 넘는 행 절대 금지. 호흡마다 행 분할(행당 25~45자). 장문 합치지 말 것. 14~22행, 1600~2000 bytes.';
}

function shouldAcceptPartRows(rows, validation, partName) {
  if (isProloguePart(partName)) {
    return rows.length <= 8 && rows.length >= 3;
  }
  if (detectOverlongRows(rows, partName)) return false;
  if (detectChoppyRhythm(rows, partName)) return false;
  if (rows.some((r) => r.대본.length > ROW_CHARS_HARD_MAX)) return false;
  return validation.issues.length <= 3;
}

function validatePartRows(rows, partName = '') {
  const issues = [];
  const totalBytes = rows.reduce((s, r) => s + utf8ByteLength(r.대본), 0);

  if (isProloguePart(partName)) {
    if (rows.length > 8) {
      issues.push(`행 수 ${rows.length}개 (프롤로그 최대 8행)`);
    }
    if (rows.length < 3) {
      issues.push(`행 수 ${rows.length}개 (프롤로그 최소 3행)`);
    }
    if (totalBytes > 1000) {
      issues.push(`총 바이트 ${totalBytes} (프롤로그는 약 800 이하 권장)`);
    }
    rows.forEach((r, i) => {
      if (!r.장면) issues.push(`${i + 1}행 장면 누락`);
      if (!r.대본.trim()) issues.push(`${i + 1}행 대본 누락`);
    });
    return { totalBytes, rowCount: rows.length, issues };
  }

  if (rows.length < 14 || rows.length > 22) {
    issues.push(`행 수 ${rows.length}개 (목표 14~22, 호흡 단위)`);
  }
  if (totalBytes < 1600 || totalBytes > 2000) {
    issues.push(`총 바이트 ${totalBytes} (목표 1,600~2,000)`);
  }

  const choppy = detectChoppyRhythm(rows, partName);
  if (choppy) issues.push(choppy);
  const overlong = detectOverlongRows(rows, partName);
  if (overlong) issues.push(overlong);

  rows.forEach((r, i) => {
    const chars = r.대본.length;
    const bytes = utf8ByteLength(r.대본);
    if (chars < ROW_CHARS_MIN) {
      issues.push(`${i + 1}행 너무 짧음 (${chars}자) — 인접 호흡과 합치거나 내용 보강`);
    } else if (chars > ROW_CHARS_HARD_MAX) {
      issues.push(`${i + 1}행 너무 김 (${chars}자) — 호흡마다 나눠 25~45자로`);
    } else if (chars > ROW_CHARS_TARGET_MAX) {
      issues.push(`${i + 1}행 다소 김 (${chars}자, 목표 25~45)`);
    }
    if (bytes > 135) {
      issues.push(`${i + 1}행 바이트 ${bytes} (한 호흡 분량 초과)`);
    }
    if (!r.장면) issues.push(`${i + 1}행 장면 누락`);
  });

  return { totalBytes, rowCount: rows.length, issues };
}

function getRevisionRhythmBoost(notes) {
  if (!notes) return '';
  if (/나눠|분할|길|장문|쪼개|행\s*나|잘라/.test(notes)) {
    return `
[수정 최우선 — 행 분할]
- 50자 넘는 대본은 반드시 여러 행으로 나누세요.
- 행당 25~45자, 호흡 단위. 같은 장면은 '컷 유지'.`;
  }
  if (/호흡|리듬|끊|합쳐|병합|짧게|나열/.test(notes)) {
    return `
[수정 최우선 — 호흡 리듬]
- 너무 잘게 쪼갠 행은 인접 호흡끼리만 합치세요 (행당 25~45자 유지).
- 50자 넘게 합치지 마세요.`;
  }
  return '';
}

function renderPartLineup() {
  const editor = $('#part-lineup-editor');
  const chips = $('#part-lineup');
  const status = $('#lineup-status');

  if (!state.partLineup.length) {
    if (editor) editor.innerHTML = '<p class="muted">① [파트 초안 생성]을 눌러 AI 초안을 만드세요.</p>';
    if (chips) chips.innerHTML = '';
    if (status) status.textContent = '상태: 초안 없음';
    updateGenerateButtons();
    return;
  }

  if (!state.lineupConfirmed && editor) {
    editor.innerHTML = state.partLineup
      .map(
        (p, i) => `
      <div class="lineup-row" data-idx="${i}">
        <span class="lineup-drag-num">${i + 1}</span>
        <input class="lineup-name-input" data-idx="${i}" value="${esc(p)}" />
        <div class="lineup-row-actions">
          <button class="btn-icon btn-part-up" data-idx="${i}" type="button" title="위로" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-icon btn-part-down" data-idx="${i}" type="button" title="아래로" ${i === state.partLineup.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-icon btn-part-del" data-idx="${i}" type="button" title="삭제">✕</button>
        </div>
      </div>`
      )
      .join('');

    editor.querySelectorAll('.lineup-name-input').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        state.partLineup[idx] = e.target.value.trim();
      });
    });
    editor.querySelectorAll('.btn-part-up').forEach((btn) => {
      btn.addEventListener('click', () => movePart(Number(btn.dataset.idx), -1));
    });
    editor.querySelectorAll('.btn-part-down').forEach((btn) => {
      btn.addEventListener('click', () => movePart(Number(btn.dataset.idx), 1));
    });
    editor.querySelectorAll('.btn-part-del').forEach((btn) => {
      btn.addEventListener('click', () => removePart(Number(btn.dataset.idx)));
    });
    if (editor) editor.classList.remove('hidden');
    if (chips) chips.innerHTML = '';
  } else if (chips) {
    chips.innerHTML = state.partLineup
      .map((p, i) => {
        const hasSeg = isPartGenerated(i);
        const isSelected = state.selectedPartIndex === i;
        const classes = [
          'part-chip',
          'clickable',
          hasSeg ? 'done' : 'pending',
          isSelected ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const mark = hasSeg ? '✓' : '○';
        const title = hasSeg
          ? '클릭: 수정·재생성 대상 선택'
          : '클릭: 이 파트만 작성';
        return `
      <div class="${classes}" data-part-idx="${i}" role="button" tabindex="0" title="${title}">
        <span class="part-num">${mark}</span>
        <span class="part-name">${esc(p)}</span>
      </div>`;
      })
      .join('');
    chips.querySelectorAll('.part-chip.clickable').forEach((chip) => {
      chip.addEventListener('click', () => selectPart(Number(chip.dataset.partIdx)));
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectPart(Number(chip.dataset.partIdx));
        }
      });
    });
    if (editor) editor.innerHTML = '';
  }

  if (status) {
    if (!state.lineupConfirmed) {
      status.textContent = '상태: 초안 — 수정 후 ② [파트 구성 확정]';
    } else {
      const done = countGeneratedParts();
      const total = state.partLineup.length;
      if (done === total) {
        status.textContent = `상태: 전체 완료 (${total}/${total} 파트)`;
      } else if (done > 0) {
        status.textContent = `상태: ${done}/${total} 파트 작성됨 — 칩 클릭으로 원하는 파트만 추가 작성`;
      } else {
        status.textContent = `상태: 확정됨 (${total}개) — 칩 클릭 후 [파트 생성]`;
      }
    }
  }

  const addRow = document.querySelector('.lineup-add-row');
  if (addRow) {
    addRow.classList.toggle('hidden', state.lineupConfirmed || !state.partLineup.length);
  }

  const selectHint = $('#part-select-hint');
  if (selectHint) {
    selectHint.classList.toggle('hidden', !state.lineupConfirmed || !state.partLineup.length);
  }

  updateGenerateButtons();
  updateActionDock();
}

function movePart(index, dir) {
  const next = index + dir;
  if (next < 0 || next >= state.partLineup.length) return;
  const arr = [...state.partLineup];
  [arr[index], arr[next]] = [arr[next], arr[index]];
  state.partLineup = arr;
  renderPartLineup();
}

function removePart(index) {
  if (state.partLineup.length <= 3) {
    return showToast('최소 3개 파트는 유지해야 합니다.', true);
  }
  state.partLineup.splice(index, 1);
  renderPartLineup();
}

function addPartFromInput() {
  if (state.lineupConfirmed) return showToast('확정된 구성입니다. [구성 다시 편집]을 누르세요.', true);
  const name = $('#new-part-name')?.value.trim();
  if (!name) return showToast('추가할 파트 이름을 입력하세요.', true);
  state.partLineup.push(name);
  $('#new-part-name').value = '';
  renderPartLineup();
  showToast(`"${name}" 파트 추가됨`);
}

function addPartFromPool() {
  if (state.lineupConfirmed) return showToast('확정된 구성입니다. [구성 다시 편집]을 누르세요.', true);
  const sel = $('#part-pool-select');
  const name = sel?.value;
  if (!name) return;
  if (state.partLineup.includes(name)) {
    return showToast('이미 있는 파트입니다.', true);
  }
  state.partLineup.push(name);
  renderPartLineup();
}

function resetLineupToDraft() {
  if (!state.draftLineup.length) return showToast('되돌릴 초안이 없습니다.', true);
  state.partLineup = [...state.draftLineup];
  state.lineupConfirmed = false;
  state.currentPartIndex = -1;
  state.allRows = [];
  state._lastPartRows = [];
  state.partSegments = [];
  state.selectedPartIndex = null;
  renderPartLineup();
  renderTable();
  showToast('AI 초안으로 되돌렸습니다.');
}

function unlockLineupEdit() {
  if (state.allRows.length && !confirm('이미 생성된 대본이 있습니다. 구성을 수정하면 대본이 초기화됩니다. 계속할까요?')) {
    return;
  }
  state.lineupConfirmed = false;
  state.currentPartIndex = -1;
  state.allRows = [];
  state._lastPartRows = [];
  state.partSegments = [];
  state.selectedPartIndex = null;
  renderPartLineup();
  renderTable();
  showToast('파트 구성 편집 모드입니다.');
}

function validateLineupRequired() {
  const joined = state.partLineup.join(' ');
  const missing = REQUIRED_PART_KEYWORDS.filter((kw) => !joined.includes(kw));
  return missing;
}

function updateGenerateButtons() {
  const btnDraft = $('#btn-draft');
  const btnConfirm = $('#btn-confirm-lineup');
  const btnPart = $('#btn-generate-part');
  const btnUnlock = $('#btn-unlock-lineup');

  if (btnDraft) btnDraft.disabled = !state.apiKey || !state.productName.trim();
  if (btnConfirm) {
    btnConfirm.disabled = !state.partLineup.length || state.lineupConfirmed;
  }
  if (btnUnlock) {
    btnUnlock.classList.toggle('hidden', !state.lineupConfirmed);
  }
  if (btnPart) {
    const setGenBtn = (label, title) => {
      btnPart.textContent = label;
      btnPart.title = title || label;
    };
    if (!state.lineupConfirmed || !state.partLineup.length) {
      btnPart.disabled = true;
      setGenBtn('③ 생성', '파트 생성');
    } else if (countGeneratedParts() >= state.partLineup.length) {
      if (state.selectedPartIndex !== null && isPartGenerated(state.selectedPartIndex)) {
        const name = state.partLineup[state.selectedPartIndex];
        btnPart.disabled = !state.apiKey;
        setGenBtn('③ 재생성', `다시 생성: ${name}`);
      } else {
        btnPart.disabled = true;
        setGenBtn('③ 완료', '전체 파트 완료');
      }
    } else if (state.selectedPartIndex !== null) {
      btnPart.disabled = !state.apiKey;
      const name = state.partLineup[state.selectedPartIndex];
      setGenBtn(
        isPartGenerated(state.selectedPartIndex) ? '③ 재생성' : '③ 생성',
        isPartGenerated(state.selectedPartIndex) ? `다시 생성: ${name}` : `파트 생성: ${name}`
      );
    } else {
      btnPart.disabled = !state.apiKey;
      const nextIdx = state.partLineup.findIndex((_, i) => !isPartGenerated(i));
      const next = nextIdx >= 0 ? state.partLineup[nextIdx] : '';
      setGenBtn('③ 생성', next ? `파트 생성: ${next}` : '파트 생성');
    }
  }
  updateActionDock();
}

const SHEET_HEADERS = ['대본', '장면', '사이즈', '자막', '코멘트'];

function emptySheetRow() {
  return { 대본: '', 장면: '', 사이즈: '', 자막: '', 코멘트: '' };
}

function commitCellFromElement(el) {
  const tr = el?.closest('tr');
  if (!tr) return;
  const idx = Number(tr.dataset.idx);
  const field = el.dataset.field;
  if (!Number.isFinite(idx) || !field || !state.allRows[idx]) return;
  state.allRows[idx][field] = el.value;
}

function applySpreadsheetPaste(startRow, startField, grid) {
  const startCol = SHEET_HEADERS.indexOf(startField);
  if (startCol < 0 || !grid.length) return 0;

  grid.forEach((cells, rowOffset) => {
    const rowIndex = startRow + rowOffset;
    while (state.allRows.length <= rowIndex) {
      state.allRows.push(emptySheetRow());
    }
    cells.forEach((cell, colOffset) => {
      const headerIndex = startCol + colOffset;
      if (headerIndex < 0 || headerIndex >= SHEET_HEADERS.length) return;
      state.allRows[rowIndex][SHEET_HEADERS[headerIndex]] = String(cell ?? '').trim();
    });
  });

  saveProject();
  renderTable();
  return grid.length;
}

function bindScriptTableSpreadsheet() {
  const SS = window.DdditSpreadsheetCells;
  const tbody = $('#script-table tbody');
  if (!SS || !tbody || tbody.dataset.spreadsheetBound === '1') return;
  tbody.dataset.spreadsheetBound = '1';

  SS.bindSpreadsheetTable(tbody, {
    headers: SHEET_HEADERS,
    rowAttr: 'data-idx',
    rowCount: () => state.allRows.length,
    onBeforeNav: commitCellFromElement,
    onPaste: applySpreadsheetPaste,
    onPasted: (count) => showToast(`${count}행 붙여넣음`),
  });
}

function renderTable() {
  const SS = window.DdditSpreadsheetCells;
  const tbody = $('#script-table tbody');
  const focusRef = SS?.captureFocus?.(tbody, 'data-idx');

  if (!state.allRows.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty">대본이 여기에 쌓입니다</td></tr>';
    updateStats();
    return;
  }

  const highlight = state.selectedPartIndex !== null;

  tbody.innerHTML = state.allRows
    .map((r, i) => {
      const seg = getSegmentForRow(i);
      const rowClasses = [];
      if (highlight && seg) {
        if (seg.partIndex === state.selectedPartIndex) rowClasses.push('part-selected');
        else rowClasses.push('part-dim');
      }
      return `
    <tr data-idx="${i}" class="${rowClasses.join(' ')}">
      <td><textarea class="cell-edit" data-field="대본" rows="2">${esc(r.대본)}</textarea></td>
      <td><textarea class="cell-edit" data-field="장면" rows="2">${esc(r.장면)}</textarea></td>
      <td><input class="cell-edit" data-field="사이즈" value="${esc(r.사이즈)}" /></td>
      <td><input class="cell-edit" data-field="자막" value="${esc(r.자막)}" /></td>
      <td><input class="cell-edit" data-field="코멘트" value="${esc(r.코멘트)}" /></td>
    </tr>`;
    })
    .join('');

  tbody.querySelectorAll('.cell-edit').forEach((el) => {
    el.addEventListener('change', onCellEdit);
    el.addEventListener('blur', onCellEdit);
  });

  SS?.restoreFocus?.(tbody, focusRef, 'data-idx');
  updateStats();
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function onCellEdit(e) {
  const tr = e.target.closest('tr');
  const idx = Number(tr.dataset.idx);
  const field = e.target.dataset.field;
  state.allRows[idx][field] = e.target.value;
  updateStats();
}

function updateStats() {
  const totalBytes = state.allRows.reduce((s, r) => s + utf8ByteLength(r.대본), 0);
  $('#stat-rows').textContent = state.allRows.length;
  $('#stat-bytes').textContent = totalBytes.toLocaleString();

  const currentPart = state.partLineup[state.currentPartIndex];
  const partRows = state._lastPartRows || [];
  if (partRows.length && currentPart) {
    const v = validatePartRows(partRows, currentPart);
    const el = $('#part-validation');
    el.innerHTML =
      v.issues.length === 0
        ? `<span class="ok">✓ ${currentPart}: ${v.rowCount}행 / ${v.totalBytes} bytes</span>`
        : `<span class="warn">⚠ ${currentPart}: ${v.issues.slice(0, 3).join(', ')}${v.issues.length > 3 ? '…' : ''}</span>`;
  }
}

function renderReferenceList() {
  const list = $('#ref-file-list');
  if (!state.referenceScripts.length) {
    list.innerHTML = '<li class="muted">추가된 참고 대본이 없습니다.</li>';
  } else {
    list.innerHTML = state.referenceScripts
      .map(
        (s) => `
      <li class="ref-item">
        <div class="ref-item-info">
          <strong>${esc(s.name)}</strong>
          <span class="ref-meta">${s.source === 'paste' ? '붙여넣기' : '파일'} · ${s.text.length.toLocaleString()}자</span>
        </div>
        <button class="btn-icon btn-ref-remove" data-id="${s.id}" type="button" title="삭제">✕</button>
      </li>`
      )
      .join('');
    list.querySelectorAll('.btn-ref-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeReference(btn.dataset.id));
    });
  }

  const totalChars = state.referenceScripts.reduce((n, s) => n + s.text.length, 0);
  $('#ref-stats').textContent = `${state.referenceScripts.length}개 · ${totalChars.toLocaleString()}자`;
}

function addReferenceFromPaste() {
  const text = $('#ref-paste').value.trim();
  if (!text) return showToast('붙여넣을 대본을 입력하세요.', true);

  const name = `붙여넣기 ${state.referenceScripts.filter((s) => s.source === 'paste').length + 1}`;
  state.referenceScripts.push({
    id: `ref-paste-${Date.now()}`,
    name,
    source: 'paste',
    text,
    chars: text.length,
  });
  $('#ref-paste').value = '';
  renderReferenceList();
  showToast(`"${name}" 추가됨`);
}

async function addReferenceFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  setLoading(true, '파일 읽는 중…');
  let ok = 0;
  try {
    for (const file of files) {
      try {
        const parsed = await REF.parseReferenceFile(file);
        state.referenceScripts.push(parsed);
        ok++;
      } catch (e) {
        reportError('reference.file', e, { file: file.name }, { silent: true });
      }
    }
    renderReferenceList();
    if (ok) showToast(`${ok}개 파일 추가됨`);
    else if (files.length) showToast('파일 추가 실패 — 상단 [로그]에서 확인하세요.', true);
  } finally {
    setLoading(false);
    $('#ref-file-input').value = '';
  }
}

function removeReference(id) {
  state.referenceScripts = state.referenceScripts.filter((s) => s.id !== id);
  renderReferenceList();
}

function clearReferences() {
  if (state.referenceScripts.length && !confirm('참고 대본을 모두 삭제할까요?')) return;
  state.referenceScripts = [];
  renderReferenceList();
}

function buildAdModeContext() {
  if (!state.adMode) return '';

  const toneHints = {
    mild:
      '긍정 가중치: 낮음. 장점은 자연스럽게, 단점은 솔직히 다루되 공격적 표현·과장된 비판은 피하세요. 디디딧 담백함 유지.',
    balanced:
      '긍정 가중치: 중간(권장). 본사 가이드 강조 포인트를 충실히 반영하고, 단점은 "아쉬운 점·개선 여지"로 완화해 서술하세요. 전체 톤은 추천 쪽으로 기울되 허위·과장 금지.',
    strong:
      '긍정 가중치: 높음. 가이드의 핵심 메시지·USP·차별점을 적극 부각하세요. 단점 파트는 짧게, 장점·실사용 만족·가성비(해당 시) 비중을 높이세요. 그래도 명백한 허위·날조는 금지.',
  };

  const guideBlock = REF.buildAdGuideContext(state.adGuides);
  const brandLine = state.adBrand ? `광고주/브랜드: ${state.adBrand}` : '광고주/브랜드: (미입력)';

  return `
# [광고·협찬 모드]
${brandLine}
콘텐츠 성격: 유료 광고·협찬 리뷰
긍정 톤 지침: ${toneHints[state.adToneLevel] || toneHints.balanced}
${state.adDisclosure ? '- 프롤로그에 "유료광고포함" 또는 "협찬" 표기를 자연스럽게 포함하세요.' : '- 별도 유료광고 표기 요청 없음 (필요 시 사용자 지시 따름).'}
- 본사 가이드의 필수 키워드·강조 문구·금지 표현을 대본 전반에 반영하세요.
- 일반 리뷰 대비 긍정적 평가·추천 의사에 가중치를 두되, 디디딧 채널의 신뢰를 해치는 허위·과장은 금지합니다.
${guideBlock ? `\n${guideBlock}` : '\n[경고] 본사 리뷰 가이드가 첨부되지 않았습니다. 가이드를 추가하면 품질이 크게 향상됩니다.'}`.trim();
}

function buildProductContext() {
  syncBriefFromDOM();
  syncSpecsFromDOM();
  const cat = CATEGORIES.find((c) => c.id === state.categoryId);
  const refBlock = REF.buildReferenceContext(state.referenceScripts);
  const adBlock = buildAdModeContext();
  if (BRIEF) {
    return BRIEF.buildPromptContext(state, cat, refBlock, adBlock);
  }
  return `
제품명: ${state.productName}
콘텐츠 방향: ${state.contentDirection || '(미입력)'}
가격 정보: ${state.priceInfo || '(미입력)'}
카테고리: ${cat?.name || '기타'}
제품 메모/스펙:
${state.productNotes || '(없음)'}
${adBlock ? `\n${adBlock}\n` : ''}${refBlock ? `\n${refBlock}` : ''}`.trim();
}

function updateAdModeUI() {
  const panel = $('#ad-mode-panel');
  const fields = $('#ad-mode-fields');
  const badge = $('#ad-mode-badge');
  const checkbox = $('#ad-mode');

  if (checkbox) checkbox.checked = state.adMode;
  if (fields) fields.classList.toggle('hidden', !state.adMode);
  if (panel) panel.classList.toggle('active', state.adMode);
  if (badge) badge.classList.toggle('hidden', !state.adMode);
  document.body.classList.toggle('ad-mode-on', state.adMode);

  const brand = $('#ad-brand');
  if (brand) brand.value = state.adBrand;
  const tone = $('#ad-tone-level');
  if (tone) tone.value = state.adToneLevel;
  const disclosure = $('#ad-disclosure');
  if (disclosure) disclosure.checked = state.adDisclosure;
}

function renderAdGuideList() {
  const list = $('#ad-guide-list');
  if (!list) return;

  if (!state.adGuides.length) {
    list.innerHTML = '<li class="muted">첨부된 본사 가이드가 없습니다.</li>';
  } else {
    list.innerHTML = state.adGuides
      .map(
        (s) => `
      <li class="ref-item">
        <div class="ref-item-info">
          <strong>${esc(s.name)}</strong>
          <span class="ref-meta">${s.source === 'paste' ? '붙여넣기' : '파일'} · ${s.text.length.toLocaleString()}자</span>
        </div>
        <button class="btn-icon btn-ad-guide-remove" data-id="${s.id}" type="button" title="삭제">✕</button>
      </li>`
      )
      .join('');
    list.querySelectorAll('.btn-ad-guide-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeAdGuide(btn.dataset.id));
    });
  }

  const totalChars = state.adGuides.reduce((n, s) => n + s.text.length, 0);
  const stats = $('#ad-guide-stats');
  if (stats) stats.textContent = `${state.adGuides.length}개 · ${totalChars.toLocaleString()}자`;
}

function addAdGuideFromPaste() {
  const text = $('#ad-guide-paste')?.value.trim();
  if (!text) return showToast('붙여넣을 가이드를 입력하세요.', true);

  const name = `가이드 ${state.adGuides.filter((s) => s.source === 'paste').length + 1}`;
  state.adGuides.push({
    id: `ad-guide-paste-${Date.now()}`,
    name,
    source: 'paste',
    text,
    chars: text.length,
  });
  $('#ad-guide-paste').value = '';
  renderAdGuideList();
  showToast(`"${name}" 추가됨`);
}

async function addAdGuideFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  setLoading(true, '가이드 파일 읽는 중…');
  let ok = 0;
  try {
    for (const file of files) {
      try {
        const parsed = await REF.parseReferenceFile(file);
        parsed.id = `ad-guide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        state.adGuides.push(parsed);
        ok++;
      } catch (e) {
        reportError('adGuide.file', e, { file: file.name }, { silent: true });
      }
    }
    renderAdGuideList();
    if (ok) showToast(`${ok}개 가이드 파일 추가됨`);
    else if (files.length) showToast('가이드 파일 추가 실패 — 상단 [로그]에서 확인하세요.', true);
  } finally {
    setLoading(false);
    const input = $('#ad-guide-file-input');
    if (input) input.value = '';
  }
}

function removeAdGuide(id) {
  state.adGuides = state.adGuides.filter((s) => s.id !== id);
  renderAdGuideList();
}

function clearAdGuides() {
  if (state.adGuides.length && !confirm('본사 가이드를 모두 삭제할까요?')) return;
  state.adGuides = [];
  renderAdGuideList();
}

function adModePromptExtra() {
  if (!state.adMode) return '';
  return `
[광고·협찬 모드 추가 지침]
- 파트 구성 시 "치명적 단점" 대신 "아쉬운 점" 또는 "한계점"처럼 완화된 파트명을 사용할 수 있습니다.
- 장점·핵심 성능·실사용·가격(가성비) 파트 비중을 상대적으로 늘리세요.
- 본사 가이드의 필수 언급 사항이 있으면 해당 파트에 배치하세요.`;
}

function adPartPromptExtra(partName) {
  if (!state.adMode) return '';
  const isWeakPart =
    /단점|한계|아쉬운|호불호/.test(partName) || partName.includes('치명적');
  const isPrologue = /프롤로그|오프닝/.test(partName);
  const isClosing = /총평|클로징/.test(partName);

  let extra = `
[광고·협찬 모드 — 이 파트 작성 지침]
- 본사 리뷰 가이드의 강조 포인트·필수 키워드를 우선 반영하세요.
- 긍정적 평가에 가중치를 두되 사실 왜곡·허위 장점은 금지합니다.`;

  if (isPrologue && state.adDisclosure) {
    extra += `
- 프롤로그에 유료광고 표기(예: "오늘 영상은 유료광고를 포함합니다" 또는 "협찬으로 제작된 영상입니다")를 자연스럽게 넣으세요.`;
  }
  if (isWeakPart) {
    extra += `
- 단점 파트: 짧고 균형 있게. 과도한 비판·조롱 금지. "개선 여지", "취향에 따라 다를 수 있는 부분" 등 완화 표현 사용.`;
  }
  if (isClosing) {
    extra += `
- 총평: 전체적으로 긍정적 결론·추천 대상을 명확히. 가이드의 핵심 메시지로 마무리하세요.`;
  }
  return extra;
}

function startEmptyLineup() {
  if (state.partLineup.length && !confirm('현재 파트 구성을 카테고리 기본값으로 바꿀까요?')) return;
  const cat = CATEGORIES.find((c) => c.id === state.categoryId);
  state.partLineup = [...(cat?.suggestedParts || PART_NAME_POOL)];
  state.draftLineup = [];
  state.draftReason = '카테고리 기본 파트 구성 (수동 시작)';
  state.lineupConfirmed = false;
  state.currentPartIndex = -1;
  state.allRows = [];
  state._lastPartRows = [];
  state.partSegments = [];
  state.selectedPartIndex = null;
  $('#structure-reason').textContent = state.draftReason;
  renderPartLineup();
  renderTable();
  updateWorkflowStep(5);
  showToast('기본 파트 구성으로 시작했습니다. 수정 후 ② [파트 구성 확정]');
}

async function generatePartDraft() {
  if (!state.apiKey) return showToast('Google API 키를 입력하세요.', true);
  if (!state.productName.trim()) return showToast('제품명을 입력하세요.', true);
  if (state.adMode && !state.adGuides.length) {
    if (!confirm('광고 모드인데 본사 가이드가 없습니다. 가이드 없이 초안을 만들까요?')) return;
  }

  if (state.partLineup.length && !confirm('새 초안을 만들면 현재 파트 구성과 대본이 초기화됩니다. 계속할까요?')) {
    return;
  }

  setLoading(true, '파트 초안 작성 중… (라이트)');
  try {
    const cat = CATEGORIES.find((c) => c.id === state.categoryId);
    const directionHint = state.contentDirection
      ? `\n콘텐츠 방향: ${state.contentDirection}`
      : '';

    const prompt = `${buildProductContext()}
${directionHint}
${adModePromptExtra()}

디디딧 리뷰의 **파트 구성 초안**만 작성하세요. (대본 본문 X)
카테고리 후보 파트: ${cat.suggestedParts.join(', ')}
필수 포함: 디자인, 실사용, 가격, 총평 (파트 제목에 반영)
파트 이름 규칙: **1~3단어 짧은 라벨만** (예: 프롤로그, 디자인, 성능, 실사용, 편의성, 단점, 가격, 총평). "디자인 및 첫인상" 같은 긴 설명형 제목 금지.
reason: 구성 이유 한 줄 (큰따옴표·줄바꿈 없이)

JSON만 출력:
{"lineup":["프롤로그","디자인","성능"],"reason":"이 구성을 선택한 이유"}`;

    const { lineup, reason } = await requestLineupFromGemini(prompt, 0.4);

    state.partLineup = normalizePartLineup(lineup);
    state.draftLineup = [...state.partLineup];
    state.draftReason = reason;
    state.lineupConfirmed = false;
    state.currentPartIndex = -1;
    state.allRows = [];
    state._lastPartRows = [];
    state.partSegments = [];
    state.selectedPartIndex = null;

    $('#structure-reason').textContent = state.draftReason;
    renderPartLineup();
    renderTable();
    updateWorkflowStep(5);
    showToast('초안이 생성됐습니다. 파트를 수정한 뒤 [② 파트 구성 확정]을 누르세요.');
    saveProject();
  } catch (e) {
    reportError('generatePartDraft', e, { model: getLineupModel() });
  } finally {
    setLoading(false);
  }
}

function confirmPartLineup() {
  if (!state.partLineup.length) return showToast('먼저 파트 초안을 생성하세요.', true);

  syncLineupFromInputs();
  const missing = validateLineupRequired();
  if (missing.length) {
    return showToast(`필수 파트 누락: ${missing.join(', ')} (파트 이름에 포함되어야 함)`, true);
  }

  state.lineupConfirmed = true;
  state.currentPartIndex = -1;
  state.selectedPartIndex = null;
  renderPartLineup();
  updateWorkflowStep(6);
  showToast('파트 구성이 확정됐습니다. 칩을 클릭해 원하는 파트만 [③ 파트 생성]하세요.');
  saveProject();
}

function syncLineupFromInputs() {
  document.querySelectorAll('.lineup-name-input').forEach((inp) => {
    const idx = Number(inp.dataset.idx);
    state.partLineup[idx] = inp.value.trim();
  });
  state.partLineup = state.partLineup.filter(Boolean);
}

async function generatePartAtIndex(partIndex) {
  if (!state.lineupConfirmed || !state.partLineup.length) {
    return showToast('먼저 ② [파트 구성 확정]을 완료하세요.', true);
  }
  if (partIndex < 0 || partIndex >= state.partLineup.length) {
    return showToast('유효하지 않은 파트입니다.', true);
  }

  const partName = state.partLineup[partIndex];
  const scriptModel = getPartScriptModel(partName);
  setLoading(true, `${partName} 작성 중… (${getModelLabel(scriptModel)})`);

  try {
    const prevContext = getPreviousPartsContext(partIndex);
    const writtenParts = state.partSegments
      .filter((s) => s.partIndex !== partIndex)
      .map((s) => state.partLineup[s.partIndex])
      .join(', ');
    const pendingParts = getPendingPartsLabel();

    const directionHint = state.contentDirection
      ? `\n콘텐츠 방향 우선 반영: ${state.contentDirection}`
      : '';

    const prompt = `${buildProductContext()}
${directionHint}
${adPartPromptExtra(partName)}

전체 파트 구성: ${state.partLineup.join(' → ')}
현재 작성 파트: "${partName}" (${partIndex + 1}/${state.partLineup.length})
이미 작성된 파트: ${writtenParts || '(없음)'}
아직 미작성 파트: ${pendingParts}
${prevContext}

${getPartVolumePrompt(partName)}`;

    let rows;
    let validation;
    let attempts = 0;
    const maxAttempts = 4;

    while (attempts < maxAttempts) {
      attempts++;
      const raw = await callGemini(
        attempts > 1 ? prompt + getPartRetryHint(partName) : prompt,
        0.7,
        scriptModel
      );
      rows = parseRowsJson(raw);
      validation = validatePartRows(rows, partName);
      if (shouldAcceptPartRows(rows, validation, partName)) break;
    }

    insertPartRows(partIndex, partName, rows);
    state._lastPartRows = rows;
    state.selectedPartIndex = partIndex;

    renderPartLineup();
    renderTable();
    updateGenerateButtons();

    const msg =
      validation.issues.length === 0
        ? `${partName} 완료 (${validation.rowCount}행 / ${validation.totalBytes}B)`
        : `${partName} 완료 — 검증 참고: ${validation.issues[0]}`;
    showToast(msg);
    saveProject();

    if (countGeneratedParts() >= state.partLineup.length) {
      updateWorkflowStep(8);
    } else {
      updateWorkflowStep(7);
    }
  } catch (e) {
    reportError('generatePartAtIndex', e, { model: scriptModel, part: partName });
  } finally {
    setLoading(false);
  }
}

async function generateNextPart() {
  if (!state.lineupConfirmed || !state.partLineup.length) {
    return showToast('먼저 ② [파트 구성 확정]을 완료하세요.', true);
  }

  let partIndex =
    state.selectedPartIndex !== null
      ? state.selectedPartIndex
      : state.partLineup.findIndex((_, i) => !isPartGenerated(i));

  if (partIndex < 0) {
    return showToast('모든 파트가 완료되었습니다.');
  }

  if (isPartGenerated(partIndex)) {
    const name = state.partLineup[partIndex];
    if (!confirm(`"${name}" 파트를 다시 생성할까요? 기존 대본이 교체됩니다.`)) return;
  }

  await generatePartAtIndex(partIndex);
}

async function reviseLineupWithAI() {
  if (!state.apiKey) return showToast('Google API 키를 입력하세요.', true);
  if (!state.partLineup.length) return showToast('먼저 파트 초안을 만드세요.', true);
  if (state.lineupConfirmed) return showToast('확정된 구성입니다. [구성 다시 편집]을 누르세요.', true);

  const notes = $('#lineup-revision-notes')?.value.trim();
  if (!notes) return showToast('파트 구성 수정 요청을 입력하세요.', true);

  syncLineupFromInputs();
  setLoading(true, '파트 구성 수정 중…');
  try {
    const prompt = `${buildProductContext()}

현재 파트 구성: ${JSON.stringify(state.partLineup)}
구성 이유: ${state.draftReason || '(없음)'}
${adModePromptExtra()}

사용자 수정 요청:
${notes}

위 요청을 반영해 파트 구성만 다시 작성하세요. (대본 본문 X)
파트 이름은 1~3단어 짧은 라벨만 (긴 설명형 제목 금지).
필수 포함: 디자인, 실사용, 가격, 총평 (파트 제목에 반영)
reason: 수정 반영 이유 한 줄 (큰따옴표·줄바꿈 없이)

JSON만 출력:
{"lineup":["..."],"reason":"수정 반영 이유"}`;

    const { lineup, reason } = await requestLineupFromGemini(prompt, 0.5);

    state.partLineup = normalizePartLineup(lineup);
    state.draftLineup = [...state.partLineup];
    state.draftReason = reason || state.draftReason;
    $('#structure-reason').textContent = state.draftReason;
    $('#lineup-revision-notes').value = '';
    renderPartLineup();
    showToast('AI가 파트 구성을 수정했습니다.');
  } catch (e) {
    reportError('reviseLineupWithAI', e, { model: getLineupModel() });
  } finally {
    setLoading(false);
  }
}

async function revisePartWithAI() {
  if (!state.apiKey) return showToast('Google API 키를 입력하세요.', true);
  if (!state.lineupConfirmed) return showToast('먼저 파트 구성을 확정하세요.', true);

  const partIndex =
    state.selectedPartIndex !== null
      ? state.selectedPartIndex
      : state.currentPartIndex >= 0
        ? state.currentPartIndex
        : null;

  if (partIndex === null) {
    return showToast('수정할 파트를 클릭해 선택하세요.', true);
  }

  const seg = state.partSegments.find((s) => s.partIndex === partIndex);
  if (!seg) return showToast('아직 생성되지 않은 파트입니다.', true);

  const notes = $('#part-revision-notes')?.value.trim();
  if (!notes) return showToast('AI 수정 요청을 입력하세요.', true);

  const partName = state.partLineup[partIndex];
  const scriptModel = getPartScriptModel(partName);
  const currentRows = state.allRows.slice(seg.start, seg.end + 1);

  setLoading(true, `${partName} AI 수정 중… (${getModelLabel(scriptModel)})`);
  try {
    const prevContext =
      seg.start > 0
        ? `\n이전 파트 마지막 대사:\n${state.allRows
            .slice(Math.max(0, seg.start - 3), seg.start)
            .map((r) => r.대본)
            .join('\n')}`
        : '';

    const nextContext =
      seg.end < state.allRows.length - 1
        ? `\n다음 파트 시작 대사:\n${state.allRows
            .slice(seg.end + 1, seg.end + 4)
            .map((r) => r.대본)
            .join('\n')}`
        : '';

    const prompt = `${buildProductContext()}
${adPartPromptExtra(partName)}

전체 파트 구성: ${state.partLineup.join(' → ')}
수정 대상 파트: "${partName}" (${partIndex + 1}/${state.partLineup.length})
${prevContext}
${nextContext}

현재 파트 대본 (${currentRows.length}행):
${JSON.stringify(currentRows, null, 0)}

사용자 수정 요청:
${notes}
${getRevisionRhythmBoost(notes)}

${getPartVolumePrompt(partName)}

JSON만 출력: {"rows":[...]}`;

    let rows;
    let validation;
    let attempts = 0;
    const maxAttempts = 4;

    while (attempts < maxAttempts) {
      attempts++;
      const raw = await callGemini(
        attempts > 1 ? prompt + getPartRetryHint(partName) : prompt,
        0.65,
        scriptModel
      );
      rows = parseRowsJson(raw);
      validation = validatePartRows(rows, partName);
      if (shouldAcceptPartRows(rows, validation, partName)) break;
    }

    state.allRows.splice(seg.start, seg.end - seg.start + 1, ...rows);
    const existing = state.partSegments.findIndex((s) => s.partIndex === partIndex);
    const newSeg = {
      partIndex,
      partName,
      start: seg.start,
      end: seg.start + rows.length - 1,
    };
    if (existing >= 0) state.partSegments[existing] = newSeg;
    state._lastPartRows = rows;
    state.selectedPartIndex = partIndex;
    $('#part-revision-notes').value = '';

    reindexPartSegments();
    renderPartLineup();
    renderTable();
    updateGenerateButtons();

    const msg =
      validation.issues.length === 0
        ? `"${partName}" AI 수정 완료 (${validation.rowCount}행 / ${validation.totalBytes}B)`
        : `"${partName}" 수정 완료 — ${validation.issues[0]}`;
    showToast(msg);
  } catch (e) {
    reportError('revisePartWithAI', e, { model: scriptModel, part: partName });
  } finally {
    setLoading(false);
  }
}

function reindexPartSegments() {
  let offset = 0;
  state.partSegments = state.partSegments
    .sort((a, b) => a.partIndex - b.partIndex)
    .map((seg) => {
      const len = seg.end - seg.start + 1;
      const start = offset;
      const end = offset + len - 1;
      offset = end + 1;
      return { ...seg, start, end };
    });
}

function exportTsv() {
  if (!state.allRows.length) return showToast('보낼 대본이 없습니다.', true);

  const header = ['대본', '장면', '사이즈', '자막', '코멘트'];
  const lines = [
    header.join('\t'),
    ...state.allRows.map((r) =>
      header.map((h) => String(r[h] || '').replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t')
    ),
  ];

  const blob = new Blob(['\uFEFF' + lines.join('\n')], {
    type: 'text/tab-separated-values;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `디디딧_${state.productName || '대본'}_${new Date().toISOString().slice(0, 10)}.tsv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('TSV 파일을 저장했습니다.');
}

function copyTable() {
  if (!state.allRows.length) return showToast('복사할 대본이 없습니다.', true);
  const header = ['대본', '장면', '사이즈', '자막', '코멘트'];
  const text = [
    header.join('\t'),
    ...state.allRows.map((r) => header.map((h) => r[h] || '').join('\t')),
  ].join('\n');
  navigator.clipboard.writeText(text).then(
    () => showToast('클립보드에 복사했습니다.'),
    (err) => reportError('copyTable', err)
  );
}

function resetProject() {
  if (state.allRows.length && !confirm('진행 중인 대본을 초기화할까요?')) return;
  state.partLineup = [];
  state.draftLineup = [];
  state.draftReason = '';
  state.lineupConfirmed = false;
  state.currentPartIndex = -1;
  state.allRows = [];
  state._lastPartRows = [];
  state.partSegments = [];
  state.selectedPartIndex = null;
  state.adGuides = [];
  state.adMode = false;
  state.adBrand = '';
  state.adToneLevel = 'balanced';
  state.adDisclosure = true;
  $('#structure-reason').textContent = '';
  updateAdModeUI();
  renderAdGuideList();
  renderPartLineup();
  renderTable();
  updateWorkflowStep(state.apiKey ? 2 : 1);
  showToast('프로젝트를 초기화했습니다.');
}

/* ── 프롬프트 UI (txt 파일) ── */

function updatePromptBadge() {
  const source = PM.getActivePromptSource();
  const short = source.split('/').pop() || source;
  $('#prompt-version-badge').textContent = short;
  $('#active-prompt-label').textContent = source;
  const fn = $('#prompt-filename');
  if (fn && !fn.value) fn.value = short.endsWith('.txt') ? short : `dididit-prompt-v${PM.PROMPT_VERSION}.txt`;
}

function loadPromptEditor() {
  $('#prompt-editor').value = getSystemRules();
  const fn = $('#prompt-filename');
  if (fn) {
    const short = PM.getActivePromptSource().split('/').pop();
    if (short?.endsWith('.txt')) fn.value = short;
  }
  updatePromptBadge();
}

function applyPromptFromEditor() {
  const text = $('#prompt-editor').value.trim();
  if (!text) return showToast('프롬프트 내용이 비어 있습니다.', true);
  const filename = $('#prompt-filename')?.value.trim() || `dididit-prompt-v${PM.PROMPT_VERSION}.txt`;
  PM.setActivePrompt(text, filename);
  loadPromptEditor();
  showToast(`적용됨: ${filename}`);
}

function exportPromptToTxt() {
  const text = $('#prompt-editor').value.trim();
  if (!text) return showToast('저장할 내용이 없습니다.', true);
  const filename = $('#prompt-filename')?.value.trim() || `dididit-prompt-v${PM.PROMPT_VERSION}.txt`;
  PM.downloadPromptTxt(text, filename);
  PM.setActivePrompt(text, filename);
  updatePromptBadge();
  showToast(`${filename} 저장 — prompts 폴더에 넣어 Git으로 관리하세요.`);
}

async function loadPromptFromFileInput(fileList) {
  const file = fileList?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (!text.trim()) return showToast('빈 파일입니다.', true);
    PM.setActivePrompt(text, file.name);
    loadPromptEditor();
    showToast(`불러옴: ${file.name}`);
  } catch (e) {
    reportError('prompt.loadFile', e);
  } finally {
    const input = $('#prompt-file-input');
    if (input) input.value = '';
  }
}

async function loadBundledDefaultPrompt() {
  setLoading(true, '기본 프롬프트 불러오는 중…');
  try {
    const { source } = await PM.loadDefaultPromptFile();
    loadPromptEditor();
    showToast(`불러옴: ${source}`);
  } catch (e) {
    reportError('prompt.loadDefault', e);
  } finally {
    setLoading(false);
  }
}

function resetPromptEditorToBuiltin() {
  $('#prompt-editor').value = PM.buildDefaultSystemRules();
  $('#prompt-filename').value = PM.DEFAULT_PROMPT_FILE.split('/').pop();
  showToast('내장 기본값을 편집창에 넣었습니다. [적용] 또는 [txt로 저장]하세요.');
}

function clearPromptToBuiltin() {
  PM.clearActivePrompt();
  loadPromptEditor();
  showToast('내장 기본 프롬프트로 복원했습니다.');
}

async function initPromptOnBoot() {
  const saved = PM.loadPromptState();
  if (!saved.text) {
    await PM.loadDefaultPromptFile();
  }
  loadPromptEditor();
}

function bindEvents() {
  $('#api-key').addEventListener('input', (e) => {
    state.apiKey = e.target.value.trim();
    saveSettings();
    if (state.apiKey) updateWorkflowStep(2);
    updateGenerateButtons();
  });
  $('#api-key').addEventListener('change', (e) => {
    state.apiKey = e.target.value.trim();
    saveSettings();
    if (state.apiKey) updateWorkflowStep(2);
    updateGenerateButtons();
  });
  $('#model-lite').addEventListener('change', (e) => {
    state.modelLite = e.target.value;
    saveSettings();
  });
  $('#model-pro').addEventListener('change', (e) => {
    state.modelPro = e.target.value;
    saveSettings();
  });
  $('#product-name').addEventListener('input', (e) => {
    state.productName = e.target.value;
    if (state.productName.trim() && state.apiKey) updateWorkflowStep(3);
    updateGenerateButtons();
    saveProject();
  });
  $('#content-direction').addEventListener('input', (e) => {
    state.contentDirection = e.target.value;
    saveProject();
  });
  $('#product-notes').addEventListener('input', (e) => {
    state.productNotes = e.target.value;
    saveProject();
  });
  $('#price-info').addEventListener('input', (e) => {
    state.priceInfo = e.target.value;
    saveProject();
  });
  ['brief-thesis', 'brief-scenario', 'brief-must', 'brief-careful', 'brief-compare'].forEach((id) => {
    $(`#${id}`)?.addEventListener('input', () => {
      syncBriefFromDOM();
      saveProject();
    });
  });
  $('#category').addEventListener('change', (e) => {
    onCategoryChange(e.target.value);
  });
  $('#btn-detect').addEventListener('click', autoDetectCategory);
  $('#btn-load-air-example')?.addEventListener('click', loadAirPurifierExample);
  $('#btn-search-device')?.addEventListener('click', runDeviceSearch);
  $('#btn-search-clear')?.addEventListener('click', clearSearchResults);

  document.querySelectorAll('.step-rail-item').forEach((btn) => {
    btn.addEventListener('click', () => navigateToPage(Number(btn.dataset.rail)));
  });
  $('#search-device')?.addEventListener('change', (e) => {
    updateSearchProfileUI(e.target.value);
    saveProject();
  });
  $('#btn-draft').addEventListener('click', generatePartDraft);
  $('#btn-empty-lineup').addEventListener('click', startEmptyLineup);
  $('#btn-confirm-lineup').addEventListener('click', confirmPartLineup);
  $('#btn-generate-part').addEventListener('click', generateNextPart);
  $('#btn-add-part').addEventListener('click', addPartFromInput);
  $('#btn-add-part-pool').addEventListener('click', addPartFromPool);
  $('#btn-reset-lineup').addEventListener('click', resetLineupToDraft);
  $('#btn-unlock-lineup').addEventListener('click', unlockLineupEdit);
  $('#btn-revise-lineup').addEventListener('click', reviseLineupWithAI);
  $('#btn-revise-part').addEventListener('click', revisePartWithAI);
  $('#btn-export').addEventListener('click', exportTsv);
  $('#btn-copy').addEventListener('click', copyTable);
  $('#btn-reset').addEventListener('click', resetProject);
  $('#toggle-settings').addEventListener('click', () => {
    togglePanel('#settings-panel', '#toggle-settings');
  });
  $('#toggle-prompt').addEventListener('click', () => {
    togglePanel('#prompt-panel', '#toggle-prompt');
  });
  $('#btn-prompt-apply').addEventListener('click', applyPromptFromEditor);
  $('#btn-prompt-export').addEventListener('click', exportPromptToTxt);
  $('#btn-prompt-load-default').addEventListener('click', loadBundledDefaultPrompt);
  $('#btn-prompt-reset').addEventListener('click', resetPromptEditorToBuiltin);
  $('#prompt-file-input').addEventListener('change', (e) => loadPromptFromFileInput(e.target.files));
  $('#btn-ref-add-paste').addEventListener('click', addReferenceFromPaste);
  $('#ref-file-input').addEventListener('change', (e) => addReferenceFiles(e.target.files));
  $('#btn-ref-clear').addEventListener('click', clearReferences);

  $('#ad-mode').addEventListener('change', (e) => {
    state.adMode = e.target.checked;
    updateAdModeUI();
    if (state.adMode && !state.adGuides.length) {
      showToast('본사 리뷰 가이드를 첨부해 주세요.');
    }
  });
  $('#ad-brand').addEventListener('input', (e) => {
    state.adBrand = e.target.value;
  });
  $('#ad-tone-level').addEventListener('change', (e) => {
    state.adToneLevel = e.target.value;
  });
  $('#ad-disclosure').addEventListener('change', (e) => {
    state.adDisclosure = e.target.checked;
  });
  $('#btn-ad-guide-add-paste').addEventListener('click', addAdGuideFromPaste);
  $('#ad-guide-file-input').addEventListener('change', (e) => addAdGuideFiles(e.target.files));
  $('#btn-ad-guide-clear').addEventListener('click', clearAdGuides);
}

function renderPartPoolSelect() {
  const sel = $('#part-pool-select');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">파트 후보에서 추가…</option>' +
    PART_NAME_POOL.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
}

async function boot() {
  try {
    bindModules();
    hideToast();
    bindToastDismiss();
    LOG?.load();
    LOG?.updateBadge();
    RESEARCH_LOG?.load();
    RESEARCH_LOG?.updateBadge();
    loadState();
    loadProject();
    renderModelOptions();
    renderCategoryOptions();
    applyBriefToDOM();
    updateCategoryHint();
    renderReferenceList();
    renderAdGuideList();
    updateAdModeUI();
    $('#api-key').value = state.apiKey;
    bindEvents();
    bindScriptTableSpreadsheet();
    bindErrorLogUI();
    bindErrorLogging();
    bindBeforeUnload();
    renderPartPoolSelect();
    renderPartLineup();
    renderTable();
    updateGenerateButtons();
    await initPromptOnBoot();

    renderSearchDeviceSelect();
    updateSearchProfileUI(state.searchDeviceId);
    if (state.searchResults) renderSearchResults(state.searchResults);

    if (!state.apiKey) {
      updateWorkflowStep(1);
      $('#settings-panel')?.classList.remove('collapsed');
      $('#toggle-settings')?.classList.add('btn-active');
    } else {
      updateWorkflowStep(state.searchResults ? 2 : 1);
    }

    const bootEl = $('#boot-error');
    if (bootEl) bootEl.classList.add('hidden');
  } catch (err) {
    reportError('boot', err, {}, { silent: true });
    const bootEl = $('#boot-error');
    if (bootEl) {
      bootEl.classList.remove('hidden');
      bootEl.textContent = `초기화 오류: ${err.message}`;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
