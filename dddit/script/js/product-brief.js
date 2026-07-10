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

  const AIR_PURIFIER_EXAMPLE = {
    productName: '삼성 비스포크 공기청정기 (예시)',
    categoryId: 'air',
    contentDirection: '1인 원룸 거실 기준 체감 성능과 필터 유지비 중심',
    priceInfo: '출고 89만원대, 동급 LG·다이슨 대비 중간 가격',
    reviewBrief: {
      thesis: '좁은 원룸에서 실제로 공기가 달라지는지, 소음과 필터 비용까지 솔직하게',
      targetScenario: '퇴근 후 문 닫고 혼자 쓰는 10평 거실, 반려동물 없음',
      mustHighlight: 'CADR 대비 실제 체감, 취침 모드 소음, 필터 교체 주기·비용',
      carefulPoints: '대형 평수 과장 광고, 필터 추가 구매 항목',
      compareWith: 'LG 퓨리케어 동급, 다이슨 쿨기능 없는 라인',
    },
    productSpecs: {
      model: 'AX90T7080WD (예시)',
      cadr: '350 ㎥/h',
      coverage: '33㎡ (10평)',
      filter: 'HEPA13 + 탈취, 6개월 교체, 1년 약 10만원',
      noise: '강풍 48dB / 취침 22dB',
      power: '45W',
      size: '250×400×650mm, 7.2kg',
      smart: 'SmartThings, PM1.0 표시, 자동·취침 모드',
    },
    productNotes: '예시 데이터 — 실제 촬영 제품으로 교체하세요.',
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

  function formatReviewBriefBlock(brief) {
    const b = brief || {};
    const lines = [
      b.thesis && `- 한 줄 테제: ${b.thesis}`,
      b.targetScenario && `- 타깃 사용 시나리오: ${b.targetScenario}`,
      b.mustHighlight && `- 반드시 다룰 포인트: ${b.mustHighlight}`,
      b.carefulPoints && `- 단점·주의 (왜곡 없이): ${b.carefulPoints}`,
      b.compareWith && `- 비교·경쟁 모델: ${b.compareWith}`,
    ].filter(Boolean);
    return lines.length ? lines.join('\n') : '(리뷰 방향 미입력)';
  }

  function buildPromptContext(state, category, refBlock, adBlock) {
    const cat = category || {};
    const specsBlock = formatSpecsBlock(state.productSpecs, state.categoryId);
    const briefBlock = formatReviewBriefBlock(state.reviewBrief);
    const extraNotes = String(state.productNotes || '').trim();
    const teamNotes = String(state.teamBriefNotes || '').trim();
    const teamBlock = teamNotes ? `\n## 팀 제공 자료 (최우선 반영)\n${teamNotes}` : '';
    const sourceNote =
      state.briefSource === 'team'
        ? '\n- 브리프 출처: 팀 제공 (자동 서치 생략). 팀 자료·구조화 제원·리뷰 방향을 함께 반영.'
        : '';

    return `
# 제품 브리프
제품명: ${state.productName}
카테고리: ${cat.name || '기타'} — ${cat.focusHints || ''}
콘텐츠 방향: ${state.contentDirection || '(미입력)'}
가격·라인업: ${state.priceInfo || '(미입력)'}${sourceNote}
${teamBlock}

## 구조화 제원
${specsBlock}
${extraNotes ? `\n## 추가 메모\n${extraNotes}` : ''}

## 리뷰 방향 (콘티·대본에 반영)
${briefBlock}

## 작성 파이프라인
- 1단계: 파트별 내레이션 원문(prose) — 행·글자 수 제한 없이 자연스러운 호흡으로
- 2단계: 원문을 스프레드시트 5열로 변환 — 대본 | 장면 | 사이즈 | 자막 | 코멘트
- 제원·수치는 대본에 자연스럽게 녹이고, 스펙 나열형 낭독은 지양
- 리뷰 방향의 mustHighlight는 빠뜨리지 말 것, carefulPoints는 디디딧 톤으로 솔직히
${adBlock ? `\n${adBlock}\n` : ''}${refBlock ? `\n${refBlock}` : ''}`.trim();
  }

  function getAirPurifierExample() {
    return JSON.parse(JSON.stringify(AIR_PURIFIER_EXAMPLE));
  }

  window.DIDIDIT_BRIEF = {
    getSpecFields,
    emptySpecsForCategory,
    emptyReviewBrief,
    formatSpecsBlock,
    formatReviewBriefBlock,
    buildPromptContext,
    getAirPurifierExample,
    RESEARCH_PHASE: 2,
  };
})();
