/**
 * 기획안(plan) ↔ 시나리오 머신 브리프 양방향 연동
 * 같은 origin localStorage 공유 (works.mansejin.com / localhost)
 */
window.DdditPlanBriefSync = (function () {
  const PROJECT_META = {
    vendict: { adBrand: '벤딕트', label: '벤딕트', planPath: '/dddit/vendict/plan/' },
    xenics: { adBrand: '제닉스', label: 'Xenics', planPath: '/dddit/xenics/plan/' },
  };

  const SCRIPT_PROJECT_PREFIX = 'dididit-project-v2';

  function planStorageKey(project) {
    return `works/dddit/${String(project || '').trim().toLowerCase()}/plan`;
  }

  function scriptStorageKey(project) {
    return `${SCRIPT_PROJECT_PREFIX}-${String(project || '').trim().toLowerCase()}`;
  }

  function loadPlanEnvelope(project) {
    try {
      const raw = localStorage.getItem(planStorageKey(project));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.data || typeof parsed.data !== 'object') return null;
      return { updatedAt: Number(parsed.updatedAt) || 0, data: parsed.data };
    } catch {
      return null;
    }
  }

  function loadScriptEnvelope(project) {
    try {
      const raw = localStorage.getItem(scriptStorageKey(project));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const savedAt = parsed.savedAt ? new Date(parsed.savedAt).getTime() : 0;
      return { savedAt, data: parsed };
    } catch {
      return null;
    }
  }

  function savePlan(project, data) {
    localStorage.setItem(
      planStorageKey(project),
      JSON.stringify({ updatedAt: Date.now(), data })
    );
  }

  function parseStructureToChapters(structure) {
    const text = String(structure || '').trim();
    if (!text) return [];
    const parts = text
      .split(/\s*→\s*|\n+/)
      .map((s) => s.replace(/^[\d.)\s]+/, '').trim())
      .filter(Boolean);
    return parts.map((title, i) => ({
      id: `ch-plan-${i}-${Date.now()}`,
      title,
      notes: '',
    }));
  }

  function chaptersToStructure(chapters) {
    if (!Array.isArray(chapters) || !chapters.length) return '';
    return chapters.map((c) => c.title).filter(Boolean).join(' → ');
  }

  function buildTeamBriefNotes(plan) {
    const blocks = [];
    if (plan.reviewGuide) blocks.push(`## 리뷰 가이드\n${plan.reviewGuide}`);
    if (plan.brandMust) blocks.push(`## 필수 언급·준수\n${plan.brandMust}`);
    if (plan.shootChecklist) blocks.push(`## 촬영 체크리스트\n${plan.shootChecklist}`);
    if (plan.tags) blocks.push(`## 태그\n${plan.tags}`);
    if (plan.descriptionDraft) blocks.push(`## 설명란 초안\n${plan.descriptionDraft}`);
    if (plan.tone) blocks.push(`## 톤앤매너\n${plan.tone}`);
    if (plan.targetLength) blocks.push(`## 목표 러닝타임\n${plan.targetLength}`);
    if (plan.notes) blocks.push(`## 비고\n${plan.notes}`);
    return blocks.join('\n\n');
  }

  function planToBriefPatch(plan, project) {
    const meta = PROJECT_META[project] || {};
    const contentParts = [plan.summary, plan.concept].map((s) => String(s || '').trim()).filter(Boolean);
    const chapters = parseStructureToChapters(plan.structure);

    return {
      productName: String(plan.title || '').trim(),
      contentDirection: contentParts.join('\n\n'),
      teamBriefNotes: buildTeamBriefNotes(plan),
      briefSource: 'team',
      adMode: true,
      adBrand: meta.adBrand || '',
      reviewBrief: {
        thesis: String(plan.keyMessage || '').trim(),
        targetScenario: String(plan.targetAudience || '').trim(),
        mustHighlight: String(plan.brandMust || '').trim(),
        carefulPoints: String(plan.brandAvoid || '').trim(),
        compareWith: '',
      },
      productNotes: [
        plan.concept && `콘셉트: ${plan.concept}`,
        plan.structure && `구성: ${plan.structure}`,
      ]
        .filter(Boolean)
        .join('\n'),
      chapters: chapters.length ? chapters : undefined,
    };
  }

  function briefToPlanPatch(brief) {
    const structure =
      chaptersToStructure(brief.chapters) ||
      extractSection(brief.teamBriefNotes, '영상 구성') ||
      extractSection(brief.productNotes, '구성:');

    return {
      title: String(brief.productName || '').trim(),
      summary: String(brief.contentDirection || '').split('\n\n')[0].trim(),
      concept: String(brief.contentDirection || '').trim(),
      keyMessage: String(brief.reviewBrief?.thesis || '').trim(),
      targetAudience: String(brief.reviewBrief?.targetScenario || '').trim(),
      brandMust: String(brief.reviewBrief?.mustHighlight || '').trim(),
      brandAvoid: String(brief.reviewBrief?.carefulPoints || '').trim(),
      structure,
      reviewGuide: extractSection(brief.teamBriefNotes, '리뷰 가이드') || undefined,
      notes: extractSection(brief.teamBriefNotes, '비고') || undefined,
      tags: extractSection(brief.teamBriefNotes, '태그') || undefined,
      descriptionDraft: extractSection(brief.teamBriefNotes, '설명란 초안') || undefined,
      tone: extractSection(brief.teamBriefNotes, '톤앤매너') || undefined,
    };
  }

  function extractSection(text, heading) {
    const re = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const m = String(text || '').match(re);
    return m ? m[1].trim() : '';
  }

  function getSyncStatus(project) {
    const plan = loadPlanEnvelope(project);
    const script = loadScriptEnvelope(project);
    if (!plan && !script) return { hasPlan: false, hasScript: false, newer: null };
    const planAt = plan?.updatedAt || 0;
    const scriptAt = script?.savedAt || 0;
    let newer = null;
    if (planAt && scriptAt) newer = planAt > scriptAt ? 'plan' : scriptAt > planAt ? 'script' : 'same';
    else if (planAt) newer = 'plan';
    else if (scriptAt) newer = 'script';
    return {
      hasPlan: !!plan,
      hasScript: !!script,
      planUpdatedAt: planAt,
      scriptSavedAt: scriptAt,
      newer,
      planTitle: plan?.data?.title || '',
    };
  }

  function importPlanToBrief(state, project, { force = false } = {}) {
    const envelope = loadPlanEnvelope(project);
    if (!envelope?.data) return { ok: false, reason: 'no-plan' };

    const status = getSyncStatus(project);
    const briefEmpty = !String(state.productName || '').trim();
    if (!force && !briefEmpty && status.newer !== 'plan') {
      if (status.newer === 'script') return { ok: false, reason: 'script-newer', status };
      return { ok: false, reason: 'unchanged', status };
    }

    const patch = planToBriefPatch(envelope.data, project);
    Object.assign(state, patch);
    if (patch.reviewBrief) state.reviewBrief = { ...state.reviewBrief, ...patch.reviewBrief };
    if (patch.chapters?.length) state.chapters = patch.chapters;
    return { ok: true, status, patch };
  }

  function exportBriefToPlan(project, brief) {
    const envelope = loadPlanEnvelope(project);
    const existing = envelope?.data || {};
    const patch = briefToPlanPatch(brief);
    const merged = { ...existing };
    Object.entries(patch).forEach(([k, v]) => {
      if (v !== undefined && v !== '') merged[k] = v;
    });
    savePlan(project, merged);
    return { ok: true, data: merged };
  }

  function planEditUrl(project) {
    const meta = PROJECT_META[project];
    if (!meta) return null;
    return `${location.origin}${meta.planPath}`;
  }

  function scriptMachineUrl(project) {
    return `${location.origin}/dddit/script/?project=${encodeURIComponent(project)}`;
  }

  function mountPlanPageSync(project, api) {
    const { getState, applyState, rerender } = api;
    const status = getSyncStatus(project);
    const page = document.querySelector('.page');
    if (!page || !window.DdditPlanBriefSync) return;

    let banner = document.getElementById('script-sync-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'script-sync-banner';
      banner.className = 'sync-banner';
      const nav = page.querySelector('.hub-nav');
      if (nav?.nextSibling) page.insertBefore(banner, nav.nextSibling);
      else page.prepend(banner);
    }

    const showPull = status.hasScript && status.newer === 'script';
    banner.className = `sync-banner${showPull ? ' is-new' : ''}`;
    banner.style.display = status.hasScript || status.hasPlan ? '' : 'none';
    banner.innerHTML = `
      <div>
        <strong>시나리오 머신 연동</strong>
        <p>${formatSyncHint(project)}</p>
      </div>
      <div class="sync-banner-actions">
        <a class="sync-link" href="${scriptMachineUrl(project)}" target="_blank" rel="noopener">시나리오 머신</a>
        ${showPull ? '<button type="button" class="sync-btn" id="btn-script-pull">브리프 가져오기</button>' : ''}
      </div>`;

    banner.querySelector('#btn-script-pull')?.addEventListener('click', () => {
      const script = loadScriptEnvelope(project);
      if (!script?.data) return;
      const merged = { ...getState(), ...briefToPlanPatch(script.data) };
      applyState(merged);
      savePlan(project, merged);
      rerender();
      mountPlanPageSync(project, api);
    });
  }

  function formatSyncHint(project) {
    const status = getSyncStatus(project);
    const meta = PROJECT_META[project];
    if (!meta) return '프로젝트를 URL에 지정하세요 (?project=vendict)';
    if (!status.hasPlan && !status.hasScript) {
      return `${meta.label} 기획안을 작성하면 여기에 자동 반영됩니다.`;
    }
    if (status.newer === 'plan') {
      return `기획안이 더 최신입니다 · ${status.planTitle || '제목 없음'}`;
    }
    if (status.newer === 'script') {
      return '시나리오 머신 브리프가 기획안보다 최신입니다.';
    }
    if (status.hasPlan) {
      return `기획안 연동됨 · ${status.planTitle || ''}`;
    }
    return '기획안 없음 — 브리프만 저장됨';
  }

  return {
    PROJECT_META,
    planStorageKey,
    scriptStorageKey,
    loadPlanEnvelope,
    loadScriptEnvelope,
    planToBriefPatch,
    briefToPlanPatch,
    getSyncStatus,
    importPlanToBrief,
    exportBriefToPlan,
    planEditUrl,
    scriptMachineUrl,
    mountPlanPageSync,
    formatSyncHint,
  };
})();
