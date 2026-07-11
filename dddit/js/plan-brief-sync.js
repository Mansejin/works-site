/**
 * 기획안(plan) → 콘티 작성기 런타임 변환
 * 기획안이 SSOT. 콘티 작성기는 읽기만 함 (양방향 동기화 없음).
 */
window.DdditPlanBriefSync = (function () {
  const PROJECT_META = {
    vendict: { adBrand: '벤딕트', label: '벤딕트', planPath: '/dddit/vendict/plan/' },
    xenics: { adBrand: '제닉스', label: 'Xenics', planPath: '/dddit/xenics/plan/' },
  };

  function planStorageKey(project) {
    return `works/dddit/${String(project || '').trim().toLowerCase()}/plan`;
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

  function loadPlan(project) {
    return loadPlanEnvelope(project)?.data || null;
  }

  function parseStructureToChapters(structure) {
    const text = String(structure || '').trim();
    if (!text) return [];
    return text
      .split(/\s*→\s*|\n+/)
      .map((s) => s.replace(/^[\d.)\s]+/, '').trim())
      .filter(Boolean)
      .map((title, i) => ({ id: `ch-plan-${i}`, title, notes: '' }));
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

  /** Gemini 프롬프트용 브리프 객체로 변환 */
  function planToBriefState(plan, project) {
    const meta = PROJECT_META[project] || {};
    const contentParts = [plan.summary, plan.concept].map((s) => String(s || '').trim()).filter(Boolean);

    return {
      productName: String(plan.title || '').trim(),
      contentDirection: contentParts.join('\n\n'),
      teamBriefNotes: buildTeamBriefNotes(plan),
      briefSource: 'team',
      adMode: true,
      adBrand: meta.adBrand || '',
      adToneLevel: 'balanced',
      adDisclosure: true,
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
      chapters: parseStructureToChapters(plan.structure),
    };
  }

  function planEditUrl(project) {
    const meta = PROJECT_META[project];
    if (!meta) return null;
    return `${location.origin}${meta.planPath}`;
  }

  function projectLabel(project) {
    return PROJECT_META[project]?.label || project;
  }

  return {
    PROJECT_META,
    loadPlanEnvelope,
    loadPlan,
    planToBriefState,
    planEditUrl,
    projectLabel,
    parseStructureToChapters,
  };
})();
