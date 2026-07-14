/** 제품 브리프 — 제원 템플릿 · 리뷰 방향 · 프롬프트 컨텍스트 (Phase 1) */
(function () {
  /** 카테고리별 제원 필드 (Phase 2에서 상세페이지 분석 결과로 자동 채움 예정) */
  const SPEC_FIELDS_BY_CATEGORY = {
    air: [
      { key: 'model', label: '모델명', placeholder: '예: OO 공기청정기 AX000' },
      { key: 'cadr', label: 'CADR (㎥/h)', placeholder: '예: 350' },
      { key: 'coverage', label: '권장 평수', placeholder: '예: 33㎡ (10평)' },
      { key: 'filter', label: '필터 구성·교체', placeholder: 'HEPA + 탈취, 6개월·연 12만원' },
      { key: 'noise', label: '소음', placeholder: '예: 강풍 48dB / 취침 22dB' },
      { key: 'power', label: '소비전력', placeholder: '예: 45W' },
      { key: 'size', label: '크기·무게', placeholder: '예: 250×400×650mm, 7.2kg' },
      { key: 'smart', label: '스마트·부가기능', placeholder: '앱, 공기질 표시, 자동 모드' },
    ],
    'it-device': [
      { key: 'model', label: '모델명', placeholder: '예: 갤럭시 S26 Ultra' },
      { key: 'chip', label: '칩셋·성능', placeholder: '예: 스냅드래곤 8 Elite' },
      { key: 'display', label: '디스플레이', placeholder: '6.8" QHD+ 120Hz' },
      { key: 'battery', label: '배터리·충전', placeholder: '5000mAh, 45W' },
      { key: 'camera', label: '카메라', placeholder: '200MP 메인, 5배 광학줌' },
      { key: 'storage', label: '저장·램', placeholder: '256GB / 12GB' },
      { key: 'weight', label: '무게·두께', placeholder: '예: 232g' },
      { key: 'connectivity', label: '연결·기타', placeholder: '5G, Wi-Fi 7, IP68' },
    ],
    'floor-care': [
      { key: 'model', label: '모델명', placeholder: '' },
      { key: 'suction', label: '흡입력', placeholder: '예: 220AW' },
      { key: 'battery', label: '배터리·런타임', placeholder: '예: 60분 표준 모드' },
      { key: 'dustbin', label: '먼지통·필터', placeholder: '' },
      { key: 'noise', label: '소음', placeholder: '' },
      { key: 'weight', label: '무게', placeholder: '' },
    ],
    default: [
      { key: 'model', label: '모델명', placeholder: '' },
      { key: 'coreSpec', label: '핵심 스펙', placeholder: '이 제품의 핵심 수치·기능' },
      { key: 'size', label: '크기·무게', placeholder: '' },
      { key: 'power', label: '전력·효율', placeholder: '' },
      { key: 'extra', label: '기타 제원', placeholder: '' },
    ],
  };

  const SPEC_FIELDS_BY_DEVICE = {
    dehumidifier: [
      { key: 'model', label: '모델명', placeholder: '예: LG 퓨리케어 제습기' },
      { key: 'dehumidRate', label: '일일 제습량 (L)', placeholder: '예: 12L/일' },
      { key: 'coverage', label: '권장 평수', placeholder: '예: 18㎡ (5.5평)' },
      { key: 'tank', label: '물통 용량', placeholder: '예: 2.5L' },
      { key: 'drain', label: '연속 배수', placeholder: '호스 연속 배수' },
      { key: 'noise', label: '소음', placeholder: '예: 38dB' },
      { key: 'power', label: '소비전력', placeholder: '' },
      { key: 'size', label: '크기·무게', placeholder: '' },
    ],
    'air-purifier': [
      { key: 'model', label: '모델명', placeholder: '' },
      { key: 'cadr', label: 'CADR (㎥/h)', placeholder: '' },
      { key: 'coverage', label: '권장 평수', placeholder: '' },
      { key: 'filter', label: '필터·교체 비용', placeholder: '' },
      { key: 'noise', label: '소음', placeholder: '' },
      { key: 'power', label: '소비전력', placeholder: '' },
      { key: 'size', label: '크기·무게', placeholder: '' },
      { key: 'smart', label: '스마트 기능', placeholder: '' },
    ],
  };

  function getSpecFields(categoryId, deviceId) {
    if (deviceId && SPEC_FIELDS_BY_DEVICE[deviceId]) return SPEC_FIELDS_BY_DEVICE[deviceId];
    return SPEC_FIELDS_BY_CATEGORY[categoryId] || SPEC_FIELDS_BY_CATEGORY.default;
  }

  function emptySpecsForCategory(categoryId, deviceId) {
    const fields = getSpecFields(categoryId, deviceId);
    const specs = {};
    fields.forEach((f) => {
      specs[f.key] = '';
    });
    return specs;
  }

  function emptyReviewBrief() {
    return {
      thesis: '',
      targetScenario: '',
      mustHighlight: '',
      carefulPoints: '',
      compareWith: '',
    };
  }

  function formatSpecsBlock(specs, categoryId) {
    const fields = getSpecFields(categoryId);
    const lines = fields
      .map((f) => {
        const v = String(specs?.[f.key] || '').trim();
        return v ? `- ${f.label}: ${v}` : null;
      })
      .filter(Boolean);
    return lines.length ? lines.join('\n') : '(구조화 제원 없음)';
  }

  function formatReviewBriefBlock(brief, options = {}) {
    const b = brief || {};
    const adMode = Boolean(options.adMode);
    const carefulLabel = adMode
      ? '- 필수 고지·주의 (단점 서술 금지, 고지용만):'
      : '- 단점·주의 (왜곡 없이):';
    const lines = [
      b.thesis && `- 한 줄 테제: ${b.thesis}`,
      b.targetScenario && `- 타깃 사용 시나리오: ${b.targetScenario}`,
      b.mustHighlight && `- 반드시 다룰 포인트: ${b.mustHighlight}`,
      b.carefulPoints && `${carefulLabel} ${b.carefulPoints}`,
      b.compareWith && `- 비교·경쟁 모델: ${b.compareWith}`,
    ].filter(Boolean);
    return lines.length ? lines.join('\n') : '(리뷰 방향 미입력)';
  }

  function buildAdModeBlock(adMode) {
    if (adMode) {
      return `
## 광고·협찬 모드 (최우선)
- 이 콘텐츠는 유료광고·협찬입니다.
- **단점·한계·아쉬운 점·불편·부족·비추천 표현을 하지 마세요.**
- carefulPoints/브랜드 주의는 제품 비하가 아니라 **필수 고지**(협찬 고지·보조금·시연 주의 등)로만 다루세요.
- 총평에서도 단점 요약·솔직한 비추천을 넣지 마세요.
- 허위 과장·「무조건 사라」식 과잉 홍보는 금지. 체감 장점·사용 장면 중심으로 담백하게.`;
    }
    return `
## 일반 리뷰 모드
- 장점과 함께 단점·주의점도 왜곡 없이 균형 있게 다룹니다.`;
  }

  function buildPromptContext(state, category, refBlock) {
    const cat = category || {};
    const adMode = Boolean(state.adMode);
    const specsBlock = formatSpecsBlock(state.productSpecs, state.categoryId);
    const briefBlock = formatReviewBriefBlock(state.reviewBrief, { adMode });
    const extraNotes = String(state.productNotes || '').trim();
    const teamNotes = String(state.teamBriefNotes || '').trim();
    const teamBlock = teamNotes
      ? `\n## 기획안·팀 가이드 (내용 최우선)
- 챕터 구성·필수 장면·필수/서브 소구·주의사항·제품 제원은 **기획안을 따릅니다.**
- 일반 IT리뷰 관례(디자인/실사용/한계 고정 골격 등)와 충돌하면 **기획안 구성·범위를 우선**합니다.
- 시스템 프롬프트는 톤·고정 멘트·형식만, **내용 판단은 기획안 가중치가 더 큽니다.**

${teamNotes}`
      : '';
    const sourceNote =
      state.briefSource === 'team'
        ? '\n- 브리프 출처: 팀 기획안 (자동 서치 생략). **내용·챕터 범위는 기획안 최우선.**'
        : '';
    const adBrand = String(state.adBrand || '').trim();

    return `
# 제품 브리프
제품명: ${state.productName}
카테고리: ${cat.name || '기타'} — ${cat.focusHints || ''}
콘텐츠 방향: ${state.contentDirection || '(미입력)'}
가격·라인업: ${state.priceInfo || '(미입력)'}
광고 모드: ${adMode ? 'ON' : 'OFF'}${adBrand ? `\n광고 브랜드: ${adBrand}` : ''}${sourceNote}
${buildAdModeBlock(adMode)}
${teamBlock}

## 구조화 제원
${specsBlock}
${extraNotes ? `\n## 추가 메모\n${extraNotes}` : ''}

## 리뷰 방향 (콘티·대본에 반영)
${briefBlock}${refBlock ? `\n${refBlock}` : ''}`.trim();
  }

  window.DIDIDIT_BRIEF = {
    getSpecFields,
    emptySpecsForCategory,
    emptyReviewBrief,
    formatSpecsBlock,
    formatReviewBriefBlock,
    buildAdModeBlock,
    buildPromptContext,
  };
})();
