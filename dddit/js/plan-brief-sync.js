/**
 * 기획안(plan) → 콘티 작성기 런타임 변환
 * 기획안이 SSOT. 콘티 작성기는 읽기만 함 (양방향 동기화 없음).
 */
window.DdditPlanBriefSync = (function () {
  const PROJECT_META = {
    vendict: { adBrand: '벤딕트', label: '벤딕트', planPath: '/dddit/vendict/plan/' },
    xenics: { adBrand: '제닉스', label: 'Xenics', planPath: '/dddit/xenics/plan/' },
    inic: { adBrand: '아이닉', label: '아이닉', planPath: '/dddit/inic/plan/' },
    galaxy: { adBrand: '', label: '갤럭시 Z 폴드8', planPath: '/dddit/galaxy/plan/' },
  };

  function planStorageKey(project) {
    return `works/dddit/${String(project || '').trim().toLowerCase()}/plan`;
  }

  function defaultPlan(project) {
    const slug = String(project || '').trim().toLowerCase();
    const data = window.DdditPlanDefaults?.[slug];
    if (!data || typeof data !== 'object') return null;
    return structuredClone(data);
  }

  function loadPlanEnvelope(project, options = {}) {
    const slug = String(project || '').trim().toLowerCase();
    if (!slug || slug === 'default') return null;
    try {
      const raw = localStorage.getItem(planStorageKey(slug));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.data && typeof parsed.data === 'object') {
          return {
            updatedAt: Number(parsed.updatedAt) || 0,
            data: parsed.data,
            source: 'local',
          };
        }
      }
    } catch {
      /* fall through */
    }
    if (options.includeDefault === false) return null;
    const fallback = defaultPlan(slug);
    if (!fallback) return null;
    return { updatedAt: 0, data: fallback, source: 'default' };
  }

  function loadPlan(project, options) {
    return loadPlanEnvelope(project, options)?.data || null;
  }

  function hasSavedPlan(project) {
    return Boolean(loadPlanEnvelope(project, { includeDefault: false }));
  }

  function listProjects() {
    const known = Object.keys(PROJECT_META);
    const discovered = new Set(known);

    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i) || '';
        const match = key.match(/^works\/dddit\/([^/]+)\/plan$/);
        if (match?.[1] && match[1] !== 'default') discovered.add(match[1]);
      }
    } catch {
      /* ignore */
    }

    return [...discovered]
      .sort((a, b) => {
        const ai = known.indexOf(a);
        const bi = known.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map((slug) => {
        const meta = PROJECT_META[slug] || {};
        const envelope = loadPlanEnvelope(slug);
        const title = String(envelope?.data?.title || '').trim();
        return {
          slug,
          label: meta.label || slug,
          planPath: meta.planPath || null,
          hasSaved: hasSavedPlan(slug),
          hasPlan: Boolean(envelope),
          source: envelope?.source || null,
          title,
          updatedAt: envelope?.updatedAt || 0,
        };
      });
  }

  function parseStructureToChapters(structure) {
    if (window.DdditChapterTitleQc?.parseStructureToChapters) {
      return window.DdditChapterTitleQc.parseStructureToChapters(structure);
    }
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
    const structured =
      typeof window !== 'undefined' && window.DdditBrandGuideQc?.buildPromptGuideBlock
        ? window.DdditBrandGuideQc.buildPromptGuideBlock(plan)
        : '';
    if (structured) blocks.push(structured);
    if (plan.reviewGuide) blocks.push(`## 리뷰 가이드\n${plan.reviewGuide}`);
    if (plan.brandMust) blocks.push(`## 필수 언급·준수\n${plan.brandMust}`);
    if (plan.brandAvoid) blocks.push(`## 주의·지양·촬영 금지\n${plan.brandAvoid}`);
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
    planStorageKey,
    defaultPlan,
    loadPlanEnvelope,
    loadPlan,
    hasSavedPlan,
    listProjects,
    planToBriefState,
    planEditUrl,
    projectLabel,
    parseStructureToChapters,
  };
})();
