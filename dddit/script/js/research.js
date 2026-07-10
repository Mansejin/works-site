/** IT·가전 리서치 — 기기별 우선순위 · Google Search 그라운딩 */
(function () {
  const RESEARCH_GEMINI_MODEL = 'gemini-3.1-pro-preview';
  const DEFAULT_DEVICE_ID = 'dehumidifier';

  /** 모든 기기 공통 — UI·프롬프트에 자동 주입 */
  const RECENT_RELEASE_PRIORITY = {
    id: 'recent',
    label: '최근 출시·국내 출시 모델 우선',
    default: true,
  };

  const RECENCY_RANKING_RULES = `## 순위 가중치 (출시년도 — 중요)
- **출시가 최근일수록 높은 순위** (2026 > 2025 > 2024 > 그 이전)
- 동급 스펙·가격이면 **최신 세대·리뉴얼·2025~2026 국내 출시** 모델을 위로
- 2022년 이전 단종 임박·구형 재고 위주 모델은 후순위 (단, 가성비 압도 시 1~2위 예외 가능)
- releaseYear 필드 필수 (예: "2025", "2026 상반기"). 불확실하면 "2024 추정" 등으로 표기`;

  const BUDGET_LABELS = {
    '20-40': '20~40만원',
    '30-50': '30~50만원',
    '40-60': '40~60만원 (가성비)',
    '60-100': '60~100만원',
    '100-150': '100~150만원',
    '150-250': '150~250만원',
    '250+': '250만원 이상',
  };

  /** @type {Record<string, object>} */
  const DEVICE_PROFILES = {
    dehumidifier: {
      id: 'dehumidifier',
      label: '제습기',
      categoryId: 'air',
      badge: '2026 장마',
      season: '2026 장마·여름',
      budget: '30-50',
      roomSize: '10-15',
      useRoomSize: true,
      exclude: '산업용 대용량, 200만원 초과 프리미엄만, 단순 제습기능 없는 가습겸용만',
      searchFocus: '일일 제습량(L), 적용 면적, 물통·연속 배수, 에너지효율, 장마철 곰팡이·눅눅함 체감',
      specHints: ['일일 제습량', '권장 평수', '물통 용량', '연속 배수', '소음', '소비전력'],
      priorities: [
        { id: 'rainy', label: '장마철 습도·곰팡이 체감', default: true },
        { id: 'room', label: '1인 원룸·침실', default: true },
        { id: 'tank', label: '물통 비우기·연속 배수', default: true },
        { id: 'noise', label: '취침·재택 소음', default: true },
        { id: 'power', label: '전기요금·에너지효율', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰 참고', default: false },
      ],
      specKeyMap: {
        '일일 제습량': 'dehumidRate',
        '제습량': 'dehumidRate',
        '권장 평수': 'coverage',
        '적용 면적': 'coverage',
        '물통': 'tank',
        '물통 용량': 'tank',
        '연속 배수': 'drain',
        '소음': 'noise',
        '소비전력': 'power',
        '크기': 'size',
        '무게': 'size',
      },
    },
    'air-purifier': {
      id: 'air-purifier',
      label: '공기청정기',
      categoryId: 'air',
      badge: '미세먼지',
      season: '2026 여름',
      budget: '40-60',
      roomSize: '10-15',
      useRoomSize: true,
      exclude: '산업용, 150만원 초과 프리미엄만',
      searchFocus: 'CADR, 권장 평수, 필터 비용, 미세먼지·꽃가루, 취침 소음',
      specHints: ['CADR', '권장 평수', '필터 구성·교체', '소음', '소비전력'],
      priorities: [
        { id: 'pollen', label: '여름철 미세먼지·꽃가루', default: true },
        { id: 'room', label: '1인 원룸 체감', default: true },
        { id: 'filter', label: '필터 유지비', default: true },
        { id: 'noise', label: '취침 소음', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰 참고', default: false },
      ],
      specKeyMap: {
        CADR: 'cadr',
        '권장 평수': 'coverage',
        필터: 'filter',
        소음: 'noise',
        '소비전력': 'power',
      },
    },
    humidifier: {
      id: 'humidifier',
      label: '가습기',
      categoryId: 'air',
      badge: '건조기',
      season: '2026 겨울·건조',
      budget: '20-40',
      roomSize: '10-15',
      useRoomSize: true,
      exclude: '가열식 화상 위험 무시, 미세가습기 청소 불가 모델만',
      searchFocus: '가습 방식, 적용 면적, 물통, 세척 편의, 소음, 백탁·세균 이슈',
      specHints: ['가습 방식', '적용 면적', '물통 용량', '세척', '소음'],
      priorities: [
        { id: 'dry', label: '건조기·히터 시즌 체감', default: true },
        { id: 'clean', label: '세척·위생 관리', default: true },
        { id: 'noise', label: '취침 소음', default: true },
        { id: 'room', label: '1인 원룸', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰 참고', default: false },
      ],
      specKeyMap: { '가습 방식': 'method', '적용 면적': 'coverage', 물통: 'tank', 소음: 'noise' },
    },
    smartphone: {
      id: 'smartphone',
      label: '스마트폰',
      categoryId: 'it-device',
      badge: 'IT',
      season: '2026 상반기',
      budget: '60-100',
      roomSize: null,
      useRoomSize: false,
      exclude: '해외 전용 모델만, 단종·재고 소진만',
      searchFocus: '칩셋, 배터리, 카메라, 디스플레이, 국내 출시가·통신사 혜택',
      specHints: ['칩셋', '배터리', '디스플레이', '카메라', '저장·램', '출고가'],
      priorities: [
        { id: 'battery', label: '퇴근 후 1일 배터리', default: true },
        { id: 'camera', label: '카메라·일상 촬영', default: true },
        { id: 'perf', label: '발열·성능 체감', default: true },
        { id: 'price', label: '가성비·자급제 vs 통신사', default: true },
        { id: 'compact', label: '한손·휴대성', default: false },
        { id: 'youtube', label: '국내 유튜브 리뷰 참고', default: true },
      ],
      specKeyMap: {
        칩셋: 'chip',
        배터리: 'battery',
        디스플레이: 'display',
        카메라: 'camera',
        저장: 'storage',
        램: 'storage',
      },
    },
    tablet: {
      id: 'tablet',
      label: '태블릿',
      categoryId: 'it-device',
      badge: 'IT',
      season: '2026',
      budget: '60-100',
      useRoomSize: false,
      exclude: '키보드 미포함 가격만 비교 금지',
      searchFocus: '화면, 펜, 배터리, 멀티태스킹, 영상·웹서핑 1인 사용',
      specHints: ['디스플레이', '칩셋', '배터리', '저장', '펜·키보드'],
      priorities: [
        { id: 'media', label: '퇴근 후 영상·웹', default: true },
        { id: 'pen', label: '필기·메모 (펜)', default: false },
        { id: 'battery', label: '배터리', default: true },
        { id: 'price', label: '가성비', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰', default: true },
      ],
      specKeyMap: { 디스플레이: 'display', 칩셋: 'chip', 배터리: 'battery', 저장: 'storage' },
    },
    laptop: {
      id: 'laptop',
      label: '노트북',
      categoryId: 'it-device',
      badge: 'IT',
      season: '2026',
      budget: '100-150',
      useRoomSize: false,
      exclude: '게이밍 전용 300만원+만',
      searchFocus: '무게, 배터리, 성능, 발열, 디스플레이, 재택·카페 사용',
      specHints: ['CPU·GPU', 'RAM·SSD', '디스플레이', '무게', '배터리'],
      priorities: [
        { id: 'portable', label: '휴대·무게', default: true },
        { id: 'battery', label: '배터리·재택', default: true },
        { id: 'thermal', label: '발열·팬 소음', default: true },
        { id: 'screen', label: '화면 품질', default: true },
        { id: 'price', label: '가성비', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰', default: true },
      ],
      specKeyMap: { CPU: 'chip', RAM: 'storage', SSD: 'storage', 디스플레이: 'display', 무게: 'weight' },
    },
    earbuds: {
      id: 'earbuds',
      label: '이어폰·헤드폰',
      categoryId: 'it-device',
      badge: 'IT',
      season: '2026',
      budget: '20-40',
      useRoomSize: false,
      exclude: '유선 전용만',
      searchFocus: '노이즈캔슬, 음질, 착용감, 배터리, 통화품질, 출퇴근',
      specHints: ['노이즈캔슬', '코덱', '배터리', '방수', '착용감'],
      priorities: [
        { id: 'anc', label: '노이즈캔슬·출퇴근', default: true },
        { id: 'comfort', label: '장시간 착용감', default: true },
        { id: 'call', label: '통화·마이크', default: true },
        { id: 'battery', label: '배터리', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰', default: true },
      ],
      specKeyMap: { '노이즈캔슬': 'anc', 배터리: 'battery', 방수: 'connectivity' },
    },
    smartwatch: {
      id: 'smartwatch',
      label: '스마트워치',
      categoryId: 'it-device',
      badge: 'IT',
      season: '2026',
      budget: '40-60',
      useRoomSize: false,
      exclude: '어린이용만',
      searchFocus: '배터리, 건강 센서, iOS·Android 호환, 밴드 교체',
      specHints: ['배터리', '디스플레이', '건강 센서', '호환 OS'],
      priorities: [
        { id: 'battery', label: '배터리·일주일 사용', default: true },
        { id: 'health', label: '수면·운동 추적', default: true },
        { id: 'compat', label: '폰 연동·앱', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰', default: false },
      ],
      specKeyMap: { 배터리: 'battery', 디스플레이: 'display', 센서: 'connectivity' },
    },
    vacuum: {
      id: 'vacuum',
      label: '무선청소기',
      categoryId: 'floor-care',
      badge: '가전',
      season: '2026',
      budget: '40-60',
      roomSize: '10-15',
      useRoomSize: true,
      exclude: '유선만, 150만원+ 프리미엄만',
      searchFocus: '흡입력 AW, 배터리, 먼지통, 무게, 원룸 바닥·침구',
      specHints: ['흡입력', '배터리·런타임', '먼지통', '무게', '소음'],
      priorities: [
        { id: 'suction', label: '흡입력·카펫', default: true },
        { id: 'battery', label: '배터리·원룸 한 번에', default: true },
        { id: 'weight', label: '무게·손목', default: true },
        { id: 'maint', label: '먼지통·필터 관리', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰', default: true },
      ],
      specKeyMap: { 흡입력: 'suction', 배터리: 'battery', 먼지통: 'dustbin', 무게: 'weight', 소음: 'noise' },
    },
    'robot-vacuum': {
      id: 'robot-vacuum',
      label: '로봇청소기',
      categoryId: 'floor-care',
      badge: '가전',
      season: '2026',
      budget: '60-100',
      roomSize: '10-15',
      useRoomSize: true,
      exclude: '물걸레만 단독',
      searchFocus: '매핑, 장애물 회피, 흡입·물걸레, 앱, 좁은 원룸',
      specHints: ['매핑·센서', '흡입력', '물걸레', '배터리', '먼지통'],
      priorities: [
        { id: 'mapping', label: '매핑·회피', default: true },
        { id: 'room', label: '원룸 가구 밀집', default: true },
        { id: 'mop', label: '물걸레 품질', default: true },
        { id: 'maint', label: '관리·악취', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰', default: true },
      ],
      specKeyMap: { 매핑: 'suction', 흡입력: 'suction', 배터리: 'battery' },
    },
    fan: {
      id: 'fan',
      label: '선풍기',
      categoryId: 'climate',
      badge: '여름',
      season: '2026 여름',
      budget: '20-40',
      roomSize: '10-15',
      useRoomSize: true,
      exclude: '산업용만',
      searchFocus: '풍량, 소음, 리모컨·스마트, 원룸 배치, 무풍',
      specHints: ['풍량', '소음', '소비전력', '크기'],
      priorities: [
        { id: 'cool', label: '여름철 체감 냉감', default: true },
        { id: 'noise', label: '취침 소음', default: true },
        { id: 'power', label: '전기요금', default: true },
        { id: 'room', label: '원룸·좁은 공간', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰', default: false },
      ],
      specKeyMap: { 풍량: 'coreSpec', 소음: 'noise', '소비전력': 'power' },
    },
    airfryer: {
      id: 'airfryer',
      label: '에어프라이어',
      categoryId: 'kitchen',
      badge: '주방',
      season: '2026',
      budget: '20-40',
      useRoomSize: false,
      exclude: '대용량 업소용만',
      searchFocus: '용량, 조리 시간, 세척, 소음, 1인 식사',
      specHints: ['용량', '출력', '세척', '소음'],
      priorities: [
        { id: 'solo', label: '1인 식사·간편식', default: true },
        { id: 'clean', label: '세척·코팅 벗겨짐', default: true },
        { id: 'size', label: '주방 카운터 크기', default: true },
        { id: 'youtube', label: '국내 유튜브 리뷰', default: true },
      ],
      specKeyMap: { 용량: 'coreSpec', 출력: 'power', 소음: 'noise' },
    },
  };

  const DEVICE_GROUPS = [
    { label: '공기·환기 (장마·여름)', ids: ['dehumidifier', 'air-purifier', 'humidifier'] },
    { label: 'IT·모바일', ids: ['smartphone', 'tablet', 'laptop', 'earbuds', 'smartwatch'] },
    { label: '청소·주방·냉방', ids: ['vacuum', 'robot-vacuum', 'fan', 'airfryer'] },
  ];

  const DISCOVERY_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
      querySummary: { type: 'STRING' },
      searchedSeason: { type: 'STRING' },
      deviceType: { type: 'STRING' },
      products: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            rank: { type: 'INTEGER' },
            brand: { type: 'STRING' },
            model: { type: 'STRING' },
            modelCode: { type: 'STRING' },
            releaseYear: { type: 'STRING' },
            priceKrw: { type: 'STRING' },
            priceNote: { type: 'STRING' },
            keySpecs: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: { label: { type: 'STRING' }, value: { type: 'STRING' } },
              },
            },
            timingFit: { type: 'STRING' },
            maintenanceCost: { type: 'STRING' },
            pros: { type: 'ARRAY', items: { type: 'STRING' } },
            cons: { type: 'ARRAY', items: { type: 'STRING' } },
            reviewAngle: { type: 'STRING' },
          },
          required: ['brand', 'model'],
        },
      },
      buyingTips: { type: 'STRING' },
    },
    required: ['products'],
  };

  const VERIFY_PRODUCT_SCHEMA = {
    type: 'OBJECT',
    properties: {
      model: { type: 'STRING' },
      modelCode: { type: 'STRING' },
      officialUrl: { type: 'STRING' },
      purchaseUrl: { type: 'STRING' },
      priceKrw: { type: 'STRING' },
      priceNote: { type: 'STRING' },
      youtubeRefs: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            url: { type: 'STRING' },
            note: { type: 'STRING' },
          },
        },
      },
      verified: { type: 'BOOLEAN' },
      verificationNotes: { type: 'STRING' },
    },
    required: ['model', 'verified'],
  };

  const QUERY_PLAN_SCHEMA = {
    type: 'OBJECT',
    properties: {
      queries: { type: 'ARRAY', items: { type: 'STRING' } },
      rationale: { type: 'STRING' },
    },
    required: ['queries'],
  };

  /** @deprecated — discovery+verify 2단계로 대체 */
  const SEARCH_RESPONSE_SCHEMA = DISCOVERY_RESPONSE_SCHEMA;

  /** 출처 권위 가중치 (순위·검증 우선순위) */
  const SOURCE_AUTHORITY = [
    { pattern: /samsung\.com\/sec/i, score: 100, label: '삼성 공식' },
    { pattern: /lge\.co\.kr/i, score: 100, label: 'LG 공식' },
    { pattern: /lg\.com\/kr/i, score: 95, label: 'LG 공식' },
    { pattern: /danawa\.com/i, score: 80, label: '다나와' },
    { pattern: /enuri\.com/i, score: 78, label: '에누리' },
    { pattern: /coupang\.com/i, score: 70, label: '쿠팡' },
    { pattern: /11st\.co\.kr/i, score: 55, label: '11번가' },
    { pattern: /gmarket\.co\.kr/i, score: 55, label: 'G마켓' },
    { pattern: /naver\.com/i, score: 50, label: '네이버' },
    { pattern: /youtube\.com|youtu\.be/i, score: 40, label: '유튜브' },
  ];

  const BRAND_VERIFY_HINTS = {
    삼성: `삼성 제품 필수:
- Google 검색: site:samsung.com/sec "[모델코드 또는 제품명]"
- model 필드: 한국 공식 판매명 + 모델코드 (예: "비스포크 제습기 18L AX90F7020WD")
- officialUrl: 반드시 https://www.samsung.com/sec/ 도메인 (검색에서 본 URL만)
- 삼성 마케팅명만 쓰지 말고 samsung.com/sec 페이지의 정확한 모델명·코드 사용`,
    Samsung: `Samsung Korea — see 삼성 rules above`,
    LG: `LG 제품: site:lge.co.kr 또는 site:lg.com/kr 로 공식 모델명·모델코드 확인`,
    'LG전자': `LG 제품: site:lge.co.kr 로 공식 모델명 확인`,
  };

  const TRUSTED_HOSTS = [
    'samsung.com',
    'lge.co.kr',
    'lg.com',
    'danawa.com',
    'coupang.com',
    'youtube.com',
    'youtu.be',
    'enuri.com',
    '11st.co.kr',
    'gmarket.co.kr',
    'naver.com',
  ];

  function getDeviceProfile(deviceId) {
    return DEVICE_PROFILES[deviceId] || DEVICE_PROFILES[DEFAULT_DEVICE_ID];
  }

  function listDevices() {
    return Object.values(DEVICE_PROFILES);
  }

  function getPrioritiesForUI(deviceId) {
    const p = getDeviceProfile(deviceId);
    if (p.priorities.some((x) => x.id === RECENT_RELEASE_PRIORITY.id)) {
      return p.priorities;
    }
    return [RECENT_RELEASE_PRIORITY, ...p.priorities];
  }

  function getDefaultPriorities(deviceId) {
    const labels = getPrioritiesForUI(deviceId)
      .filter((x) => x.default)
      .map((x) => x.label);
    if (!labels.includes(RECENT_RELEASE_PRIORITY.label)) {
      labels.unshift(RECENT_RELEASE_PRIORITY.label);
    }
    return labels;
  }

  function normalizeUrlForMatch(url) {
    try {
      const u = new URL(String(url).trim());
      let host = u.hostname.replace(/^www\./, '').toLowerCase();
      let path = u.pathname.replace(/\/$/, '').toLowerCase();
      return `${host}${path}${u.search}`;
    } catch {
      return String(url || '').trim().toLowerCase();
    }
  }

  function collectGroundedUrls(chunks) {
    const urls = new Map();
    for (const chunk of chunks || []) {
      const uri = chunk?.web?.uri || chunk?.retrievedContext?.uri;
      const title = chunk?.web?.title || chunk?.retrievedContext?.title || '';
      if (uri) urls.set(normalizeUrlForMatch(uri), { uri, title });
    }
    return urls;
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  function isTrustedHost(url) {
    const h = hostOf(url);
    return TRUSTED_HOSTS.some((t) => h === t || h.endsWith('.' + t));
  }

  function getSourceAuthorityScore(url) {
    if (!url) return 0;
    for (const { pattern, score } of SOURCE_AUTHORITY) {
      if (pattern.test(url)) return score;
    }
    return isTrustedHost(url) ? 30 : 0;
  }

  function sourceTitleFromGrounding(url, groundedMap) {
    if (!url || !groundedMap?.size) return '';
    const norm = normalizeUrlForMatch(url);
    if (groundedMap.has(norm)) return groundedMap.get(norm).title || '';
    const host = hostOf(url);
    for (const [key, val] of groundedMap) {
      if (key.startsWith(host) || hostOf(val.uri) === host) return val.title || '';
    }
    return '';
  }

  function parseReleaseYear(releaseYear) {
    const m = String(releaseYear || '').match(/20(\d{2})/);
    return m ? Number(m[0]) : 0;
  }

  function deriveVerificationStatus(product) {
    if (product.verified && (product.officialUrl || product.purchaseUrl)) return 'verified';
    if (product.officialUrl || product.purchaseUrl || product.modelCode) return 'partial';
    return 'unverified';
  }

  function isValidYoutubeUrl(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      const h = u.hostname.replace(/^www\./, '').toLowerCase();
      if (h === 'youtu.be') return u.pathname.length > 1;
      if (h === 'youtube.com' || h === 'm.youtube.com') {
        return u.pathname === '/watch' && !!u.searchParams.get('v');
      }
      return false;
    } catch {
      return false;
    }
  }

  function urlMatchesGrounding(url, groundedMap) {
    if (!url) return false;
    const norm = normalizeUrlForMatch(url);
    if (groundedMap.has(norm)) return true;
    const host = hostOf(url);
    for (const [key, val] of groundedMap) {
      if (key.startsWith(host) && (norm.includes(key) || key.includes(norm))) return true;
      if (normalizeUrlForMatch(val.uri) === norm) return true;
    }
    return false;
  }

  function sanitizeUrl(url, groundedMap) {
    const raw = String(url || '').trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return { url: '', stripped: raw ? 'invalid-scheme' : '' };
    if (!isTrustedHost(raw)) return { url: '', stripped: 'untrusted-host' };
    if (groundedMap.size > 0 && !urlMatchesGrounding(raw, groundedMap)) {
      return { url: '', stripped: 'not-in-grounding' };
    }
    return { url: raw, stripped: '' };
  }

  function sanitizeYoutubeRefs(refs, groundedMap) {
    const out = [];
    const warnings = [];
    for (const ref of refs || []) {
      const url = String(ref?.url || '').trim();
      if (!isValidYoutubeUrl(url)) {
        if (url) warnings.push(`youtube-invalid:${url.slice(0, 40)}`);
        continue;
      }
      const { url: safe, stripped } = sanitizeUrl(url, groundedMap);
      if (!safe) {
        warnings.push(stripped || 'youtube-not-grounded');
        continue;
      }
      out.push({
        title: String(ref.title || '').trim(),
        url: safe,
        note: String(ref.note || '').trim(),
      });
    }
    return { refs: out, warnings };
  }

  function brandVerifyHint(brand) {
    for (const [key, hint] of Object.entries(BRAND_VERIFY_HINTS)) {
      if (String(brand || '').includes(key)) return hint;
    }
    return '';
  }

  function buildVerifyPrompt(product, profile) {
    const brandHint = brandVerifyHint(product.brand);
    return `Google 검색으로 아래 제품의 **한국 시장** 정보를 하나씩 확인하고 JSON만 출력하세요.

## 대상 제품
- 브랜드: ${product.brand}
- 후보 모델명: ${product.model}
- 제품군: ${profile.label}
${product.modelCode ? `- 후보 모델코드: ${product.modelCode}` : ''}

${brandHint ? `## 브랜드별 규칙\n${brandHint}\n` : ''}

## 필수 검색 (각각 Google 검색 실행)
1. "${product.brand} ${product.model} ${profile.label} 공식" + site:제조사공식도메인
2. "${product.brand} ${product.model} 다나와" 또는 "쿠팡"
3. "${product.brand} ${product.model} 리뷰 site:youtube.com"

## 출력 규칙
- model: 검색으로 확인한 **정확한 한국 판매 모델명** (마케팅명만 금지)
- modelCode: 공식 모델코드/SKU (없으면 "")
- officialUrl: 제조사 한국 공식 제품 페이지 (검색에서 실제로 본 URL만)
- purchaseUrl: 다나와·쿠팡 등 실제 판매 페이지 URL (검색에서 본 것만)
- youtubeRefs: 한국어 리뷰 [{title, url, note}] — youtube.com/watch?v= 형식만
- priceKrw, priceNote: 검색으로 확인한 가격
- verified: true — 모델명이 공식 페이지·판매 페이지와 일치할 때만
- verificationNotes: 불일치·주의사항 (예: "후보 모델명 오류, 실제는 XXX")

**URL은 이번 검색 결과에서 본 URL만. 추측·placeholder·example.com 절대 금지.**
확인 못한 URL 필드는 빈 문자열 "".

JSON만 출력.`;
  }

  function stripJsonFences(text) {
    return String(text)
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }

  function repairJsonText(s) {
    return s
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([\]}])/g, '$1');
  }

  function findJsonObjectBounds(text) {
    const s = String(text);
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    return s.slice(start, end + 1);
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

  function parseJsonLoose(raw) {
    const candidates = [
      String(raw).trim(),
      stripJsonFences(raw),
      findJsonObjectBounds(raw),
      findJsonObjectBounds(stripJsonFences(raw)),
      repairJsonText(findJsonObjectBounds(stripJsonFences(raw)) || ''),
    ].filter(Boolean);
    const seen = new Set();
    let lastErr;
    for (const c of candidates) {
      if (seen.has(c)) continue;
      seen.add(c);
      try {
        return JSON.parse(c);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('JSON 파싱 실패');
  }

  function buildSearchPrompt(criteria, plannedQueries = []) {
    const profile = getDeviceProfile(criteria.deviceId);
    const budget = BUDGET_LABELS[criteria.budget] || criteria.budget;
    const pri = (criteria.priorities || []).join(', ');
    const roomLine = profile.useRoomSize
      ? `- 사용 공간: ${criteria.roomSize}평 전후, 1인 가구 원룸·침실`
      : '- 휴대·1인 사용 시나리오 (평수 무관)';

    const queryBlock = plannedQueries.length
      ? `## 계획된 검색 쿼리 (각각 Google 검색 실행)
${plannedQueries.map((q, i) => `${i + 1}. ${q}`).join('\n')}
위 쿼리들을 실제로 검색한 뒤 결과를 종합하세요.`
      : `## 검색 쿼리 예시 (각각 Google 검색 실행)
1. "${profile.season || '2026'} ${profile.label} 추천 ${budget}"
2. "삼성 ${profile.label} site:samsung.com/sec" 또는 "LG ${profile.label} site:lge.co.kr"
3. "${profile.label} 다나와 비교"
4. "${profile.label} 유튜브 리뷰 site:youtube.com"`;

    return `당신은 한국 IT·가전 리뷰 채널 "디디딧"(DD-DIT)의 리서처입니다.
**Perplexity 방식**: 먼저 Google 검색으로 사실을 확인한 뒤, 검색에서 본 내용만 JSON에 담으세요.

${queryBlock}

## 시즌·맥락
- 시즌: ${criteria.season || profile.season}
- 지금 이 제품군을 추천하는 이유를 timingFit에 반영하세요.
  ${profile.id === 'dehumidifier' ? '(예: 2026 장마·장마철 습도, 곰팡이·눅눅함, 빨래 건조)' : ''}

## 검색 조건
- 제품군: **${profile.label}** (다른 기기 섞지 말 것)
- 가격대: ${budget} (국내 출고·쿠팡·공식몰 기준)
${roomLine}
- 우선순위 (리서치 시 가중치): ${pri}
- 타깃: 퇴근 후 혼자 쓰는 1인 가구 직장인 (디디딧 시청자)
- 제외: ${criteria.exclude || profile.exclude}
- 후보 ${criteria.count || 5}개 (순위 포함)

${RECENCY_RANKING_RULES}

## 반드시 확인할 스펙
${profile.searchFocus}

keySpecs에는 다음 항목을 가능한 한 포함: ${profile.specHints.join(', ')}, 출시년도·국내 출시일

## 이 단계 규칙 (Pass A — 발굴만)
- 제조사 공식 · 다나와 · 쿠팡 · IT/가전 매체를 검색하세요
- **URL 필드를 출력하지 마세요** (다음 검증 단계에서 링크 수집)
- 삼성: 마케팅명만 금지 — samsung.com/sec의 모델코드·공식 판매명 사용
- LG: lge.co.kr 공식 모델명·코드 우선

## 출력 (JSON만 — URL 필드 없음)
{
  "querySummary": "선정 기준 한 줄",
  "searchedSeason": "${criteria.season || profile.season}",
  "deviceType": "${profile.label}",
  "products": [{
    "rank": 1,
    "brand": "",
    "model": "",
    "modelCode": "",
    "releaseYear": "2025 또는 2026 상반기",
    "priceKrw": "",
    "priceNote": "",
    "keySpecs": [{"label":"스펙명","value":"값"}],
    "timingFit": "지금 이 시즌에 왜 괜찮은지",
    "maintenanceCost": "유지비·소모품 (해당 시)",
    "pros": [],
    "cons": [],
    "reviewAngle": "디디딧 리뷰 각도"
  }],
  "buyingTips": "이 가격대 구매 체크리스트"
}

가격·스펙은 검색 결과 우선. 불확실하면 priceNote에 "확인 필요".
sources·youtubeRefs·URL 필드는 이 단계에서 넣지 마세요.
중요: 응답은 JSON 객체 하나만. 설명 문장·마크다운·코드블록 금지.`;
  }

  function buildPlanQueriesPrompt(criteria) {
    const profile = getDeviceProfile(criteria.deviceId);
    const budget = BUDGET_LABELS[criteria.budget] || criteria.budget;
    const pri = (criteria.priorities || []).join(', ');

    return `한국 IT·가전 제품 리서치를 위한 **Google 검색 쿼리 3~5개**를 계획하세요.

## 조건
- 제품군: ${profile.label}
- 가격대: ${budget}
- 시즌: ${criteria.season || profile.season}
- 우선순위: ${pri}
- 제외: ${criteria.exclude || profile.exclude}

## 쿼리 유형 (각각 포함)
1. **브로드 발굴**: "${profile.season || '2026'} ${profile.label} 추천 ${budget}" 형태
2. **제조사 공식**: site:samsung.com/sec 또는 site:lge.co.kr (해당 브랜드)
3. **가격 비교**: 다나와 또는 에누리
4. **리뷰**: site:youtube.com 한국어 리뷰
5. (선택) 쿠팡·11번가 실판매가

쿼리는 한국어, 실제 Google 검색에 바로 쓸 수 있게 작성.
JSON만 출력: {"queries":["..."],"rationale":"계획 한 줄"}`;
  }

  async function planQueries(apiKey, criteria, options = {}) {
    const profile = getDeviceProfile(criteria.deviceId);
    const model = options.model || RESEARCH_GEMINI_MODEL;
    const prompt = buildPlanQueriesPrompt(criteria) + JSON_ONLY_SUFFIX;

    const { text, groundingChunks, webQueries } = await callGeminiGrounded(apiKey, prompt, {
      model,
      useSearch: true,
      responseSchema: QUERY_PLAN_SCHEMA,
      temperature: 0.2,
    });

    let parsed;
    try {
      parsed = parseJsonLoose(text);
    } catch {
      parsed = { queries: [], rationale: '' };
    }

    const queries = (parsed.queries || [])
      .map((q) => String(q).trim())
      .filter(Boolean)
      .slice(0, 5);

    if (queries.length < 3) {
      const budget = BUDGET_LABELS[criteria.budget] || criteria.budget;
      const fallback = [
        `${profile.season || '2026'} ${profile.label} 추천 ${budget}`,
        `삼성 ${profile.label} site:samsung.com/sec`,
        `LG ${profile.label} site:lge.co.kr`,
        `${profile.label} 다나와 비교`,
        `${profile.label} 유튜브 리뷰 site:youtube.com`,
      ];
      for (const q of fallback) {
        if (queries.length >= 5) break;
        if (!queries.includes(q)) queries.push(q);
      }
    }

    return {
      queries,
      rationale: String(parsed.rationale || '').trim(),
      groundingChunks,
      webQueries,
      model,
      rawPreview: String(text).slice(0, 2000),
    };
  }

  async function discoverCandidates(apiKey, criteria, plannedQueries, options = {}) {
    const profile = getDeviceProfile(criteria.deviceId);
    const model = options.model || RESEARCH_GEMINI_MODEL;
    const prompt = buildSearchPrompt(criteria, plannedQueries);

    const attempts = [
      {
        label: 'discover+schema',
        prompt: prompt + JSON_ONLY_SUFFIX,
        opts: { useSearch: true, responseSchema: DISCOVERY_RESPONSE_SCHEMA, temperature: 0.25 },
      },
      {
        label: 'discover+json',
        prompt: prompt + JSON_ONLY_SUFFIX,
        opts: { useSearch: true, responseSchema: null, temperature: 0.2 },
      },
      {
        label: 'discover+strict',
        prompt: `${prompt}${JSON_ONLY_SUFFIX}\n\n반드시 { 로 시작해 } 로 끝나는 JSON만.`,
        opts: { useSearch: true, responseSchema: null, temperature: 0.15 },
      },
    ];

    let lastErr;
    for (const attempt of attempts) {
      try {
        const { text, groundingChunks, webQueries } = await callGeminiGrounded(
          apiKey,
          attempt.prompt,
          { model, ...attempt.opts }
        );
        const result = parseSearchResponse(text);
        return {
          ...result,
          groundingChunks,
          webQueries,
          model,
          attempt: attempt.label,
          rawPreview: String(text).slice(0, 4000),
        };
      } catch (e) {
        lastErr = e;
        if (e.apiStatus && e.apiStatus !== 400 && !/JSON|products|파싱|Unexpected/i.test(e.message)) {
          throw e;
        }
      }
    }
    throw lastErr || new Error('후보 발굴 응답 파싱 실패');
  }

  const JSON_ONLY_SUFFIX =
    '\n\n[출력 규칙] 위 JSON 객체 하나만 출력하세요. 앞뒤 설명·마크다운 금지.';

  async function callGeminiGrounded(apiKey, prompt, options = {}) {
    const model = options.model || RESEARCH_GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const generationConfig = { temperature: options.temperature ?? 0.25 };
    if (options.jsonMime !== false) {
      generationConfig.responseMimeType = 'application/json';
    }
    if (options.responseSchema) {
      generationConfig.responseSchema = options.responseSchema;
    }

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    };
    if (options.useSearch !== false) {
      body.tools = [{ google_search: {} }];
    }
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
    let text = candidate?.content?.parts?.[0]?.text;
    if (!text && candidate?.content?.parts) {
      text = candidate.content.parts.map((p) => p.text || '').join('');
    }
    if (!text) {
      const finishReason = candidate?.finishReason || '';
      const e = new Error(finishReason ? `응답 없음 (${finishReason})` : '응답이 비어 있습니다.');
      e.apiModel = model;
      e.finishReason = finishReason;
      throw e;
    }

    return {
      text,
      groundingChunks: candidate?.groundingMetadata?.groundingChunks || [],
      webQueries: candidate?.groundingMetadata?.webSearchQueries || [],
      model,
    };
  }

  function normalizeProduct(p, i) {
    const keySpecs = Array.isArray(p.keySpecs)
      ? p.keySpecs.map((s) => ({
          label: String(s.label || '').trim(),
          value: String(s.value || '').trim(),
        })).filter((s) => s.label && s.value)
      : [];
    if (!keySpecs.length) {
      ['cadr', 'coverage', 'noise', 'filterCost'].forEach((k) => {
        if (p[k]) keySpecs.push({ label: k, value: String(p[k]) });
      });
    }
    return {
      rank: p.rank ?? i + 1,
      brand: String(p.brand || '').trim(),
      model: String(p.model || '').trim(),
      modelCode: String(p.modelCode || '').trim(),
      releaseYear: String(p.releaseYear || '').trim(),
      priceKrw: String(p.priceKrw || ''),
      priceNote: String(p.priceNote || ''),
      keySpecs,
      timingFit: String(p.timingFit || p.summerFit || ''),
      maintenanceCost: String(p.maintenanceCost || p.filterCost || ''),
      pros: Array.isArray(p.pros) ? p.pros.map(String) : [],
      cons: Array.isArray(p.cons) ? p.cons.map(String) : [],
      reviewAngle: String(p.reviewAngle || ''),
      officialUrl: String(p.officialUrl || '').trim(),
      purchaseUrl: String(p.purchaseUrl || '').trim(),
      verified: !!p.verified,
      verificationNotes: String(p.verificationNotes || '').trim(),
      linkWarnings: Array.isArray(p.linkWarnings) ? p.linkWarnings : [],
      sources: Array.isArray(p.sources) ? p.sources : [],
      youtubeRefs: Array.isArray(p.youtubeRefs) ? p.youtubeRefs : [],
      verificationStatus: p.verificationStatus || deriveVerificationStatus(p),
    };
  }

  function enforceCitations(product, groundedMap) {
    const linkWarnings = [];
    let strippedLinks = 0;

    const trackStrip = (field, result) => {
      if (result.stripped) {
        linkWarnings.push(`${field}:${result.stripped}`);
        strippedLinks++;
      }
    };

    const official = sanitizeOfficialUrl(product.officialUrl, groundedMap, product.brand);
    trackStrip('official', official);

    const purchase = sanitizeUrl(product.purchaseUrl, groundedMap);
    trackStrip('purchase', purchase);

    const yt = sanitizeYoutubeRefs(product.youtubeRefs, groundedMap);
    linkWarnings.push(...yt.warnings);
    strippedLinks += yt.warnings.length;

    const sources = [];
    if (official.url) {
      sources.push({
        title: sourceTitleFromGrounding(official.url, groundedMap) || '공식',
        url: official.url,
        authority: getSourceAuthorityScore(official.url),
      });
    }
    if (purchase.url) {
      sources.push({
        title: sourceTitleFromGrounding(purchase.url, groundedMap) || '구매',
        url: purchase.url,
        authority: getSourceAuthorityScore(purchase.url),
      });
    }
    for (const ref of yt.refs) {
      sources.push({
        title: ref.title || sourceTitleFromGrounding(ref.url, groundedMap) || '유튜브',
        url: ref.url,
        authority: getSourceAuthorityScore(ref.url),
      });
    }

    const merged = {
      ...product,
      officialUrl: official.url,
      purchaseUrl: purchase.url,
      youtubeRefs: yt.refs,
      sources,
      linkWarnings,
      strippedLinks,
    };
    merged.verificationStatus = deriveVerificationStatus(merged);
    return merged;
  }

  function mergeVerifiedProduct(discovered, verified, groundedMap) {
    const base = normalizeProduct({
      ...discovered,
      model: String(verified.model || discovered.model).trim(),
      modelCode: String(verified.modelCode || discovered.modelCode || '').trim(),
      priceKrw: verified.priceKrw || discovered.priceKrw,
      priceNote: verified.priceNote || discovered.priceNote,
      officialUrl: String(verified.officialUrl || '').trim(),
      purchaseUrl: String(verified.purchaseUrl || '').trim(),
      youtubeRefs: verified.youtubeRefs || [],
      verified: !!verified.verified,
      verificationNotes: verified.verificationNotes || '',
    });
    base.verified = !!verified.verified && !!(base.officialUrl || base.purchaseUrl) && base.model.length > 1;
    return enforceCitations(base, groundedMap);
  }

  function sanitizeOfficialUrl(url, groundedMap, brand) {
    const base = sanitizeUrl(url, groundedMap);
    if (!base.url) return base;
    const b = String(brand || '').toLowerCase();
    const h = hostOf(base.url);
    if (b.includes('삼성') || b.includes('samsung')) {
      if (!h.includes('samsung.com/sec')) {
        return { url: '', stripped: 'samsung-not-sec' };
      }
    }
    if (b.includes('lg')) {
      if (!h.includes('lge.co.kr') && !h.includes('lg.com')) {
        return { url: '', stripped: 'lg-not-official' };
      }
    }
    return base;
  }

  async function verifyCandidate(apiKey, product, profile, model, options = {}) {
    const prompt = buildVerifyPrompt(product, profile) + JSON_ONLY_SUFFIX;
    const { text, groundingChunks, webQueries } = await callGeminiGrounded(apiKey, prompt, {
      model,
      useSearch: true,
      responseSchema: VERIFY_PRODUCT_SCHEMA,
      temperature: 0.1,
    });
    const groundedMap = collectGroundedUrls(groundingChunks);
    let verified;
    try {
      verified = parseJsonLoose(text);
    } catch (e) {
      verified = { model: product.model, verified: false, verificationNotes: `파싱 실패: ${e.message}` };
    }
    const merged = mergeVerifiedProduct(product, verified, groundedMap);
    return {
      product: merged,
      groundedMap,
      phase: {
        phase: 'verify',
        brand: product.brand,
        candidateModel: product.model,
        model,
        webQueries,
        groundingUrls: [...groundedMap.values()].map((x) => ({ uri: x.uri, title: x.title })),
        rawPreview: String(text).slice(0, 4000),
        verified: merged.verified,
        verificationStatus: merged.verificationStatus,
        linkWarnings: merged.linkWarnings,
        strippedLinks: merged.strippedLinks || 0,
        finalModel: merged.model,
        modelCode: merged.modelCode,
      },
    };
  }

  /** @deprecated use verifyCandidate */
  const verifyProduct = verifyCandidate;

  function synthesizeRankings(verifiedProducts, discovery, criteria, profile) {
    const statusWeight = { verified: 1000, partial: 500, unverified: 0 };

    const scored = verifiedProducts.map((p, i) => {
      const discoveryRank = p.rank ?? i + 1;
      const authority = Math.max(
        getSourceAuthorityScore(p.officialUrl),
        getSourceAuthorityScore(p.purchaseUrl),
        ...(p.sources || []).map((s) => s.authority ?? getSourceAuthorityScore(s.url))
      );
      const score =
        (statusWeight[p.verificationStatus] || 0) +
        parseReleaseYear(p.releaseYear) * 10 +
        authority +
        (6 - Math.min(discoveryRank, 5)) * 5;
      return { product: p, score, discoveryRank };
    });

    scored.sort((a, b) => b.score - a.score);

    const products = scored.map((item, i) =>
      normalizeProduct({
        ...item.product,
        rank: i + 1,
        _rankScore: item.score,
      })
    );

    return {
      querySummary: discovery.querySummary || '',
      searchedSeason: discovery.searchedSeason || profile.season,
      deviceType: discovery.deviceType || profile.label,
      buyingTips: discovery.buyingTips || '',
      products,
      rankingNotes: `검증 ${products.filter((p) => p.verificationStatus === 'verified').length}/${products.length} · 출처 권위·출시년도 반영`,
    };
  }

  function mergeGroundingMaps(maps) {
    const merged = new Map();
    for (const map of maps) {
      if (!map) continue;
      for (const [k, v] of map) merged.set(k, v);
    }
    return merged;
  }

  function parseSearchResponse(raw) {
    let parsed;
    try {
      parsed = parseJsonLoose(raw);
    } catch (e) {
      const products = extractBracketArray(String(raw), 'products');
      if (products?.length) {
        parsed = { products, querySummary: '', buyingTips: '' };
      } else {
        throw e;
      }
    }
    if (!Array.isArray(parsed.products) || !parsed.products.length) {
      throw new Error('검색 결과 products 배열이 비어 있습니다.');
    }
    parsed.products = parsed.products.map(normalizeProduct);
    return parsed;
  }

  async function searchDevices(apiKey, criteria, options = {}) {
    const profile = getDeviceProfile(criteria.deviceId);
    const model = options.model || RESEARCH_GEMINI_MODEL;
    const onProgress = options.onProgress || (() => {});
    const merged = {
      deviceId: profile.id,
      season: profile.season,
      budget: profile.budget,
      roomSize: profile.roomSize || '10-15',
      exclude: profile.exclude,
      count: 5,
      audience: '퇴근 후 혼자 쓰는 1인 가구 직장인 (디디딧 시청자)',
      priorities: getDefaultPriorities(profile.id),
      ...criteria,
    };

    const auditPhases = [];
    const allGroundingMaps = [];

    onProgress({ phase: 'plan', message: '검색 쿼리 계획 중…' });
    const plan = await planQueries(apiKey, merged, { model });
    auditPhases.push({
      phase: 'plan',
      queries: plan.queries,
      rationale: plan.rationale,
      webQueries: plan.webQueries,
      groundingUrls: (plan.groundingChunks || [])
        .map((c) => c?.web?.uri || c?.retrievedContext?.uri)
        .filter(Boolean),
      model: plan.model,
      rawPreview: plan.rawPreview,
    });
    if (plan.groundingChunks?.length) {
      allGroundingMaps.push(collectGroundedUrls(plan.groundingChunks));
    }

    onProgress({ phase: 'discover', message: `${profile.label} 후보 발굴 중…` });
    const discovery = await discoverCandidates(apiKey, merged, plan.queries, { model });
    auditPhases.push({
      phase: 'discover',
      attempt: discovery.attempt,
      candidateCount: discovery.products.length,
      webQueries: discovery.webSearchQueries,
      groundingUrls: (discovery.groundingChunks || [])
        .map((c) => c?.web?.uri || c?.retrievedContext?.uri)
        .filter(Boolean),
      model: discovery.model,
      rawPreview: discovery.rawPreview,
    });
    if (discovery.groundingChunks?.length) {
      allGroundingMaps.push(collectGroundedUrls(discovery.groundingChunks));
    }

    const verifiedProducts = [];
    const total = discovery.products.length;

    for (let i = 0; i < total; i++) {
      const candidate = discovery.products[i];
      onProgress({
        phase: 'verify',
        message: `검증 중: ${candidate.brand} ${candidate.model}`,
        index: i,
        total,
      });
      try {
        const { product, groundedMap, phase } = await verifyCandidate(
          apiKey,
          candidate,
          profile,
          model
        );
        auditPhases.push(phase);
        if (groundedMap?.size) allGroundingMaps.push(groundedMap);
        verifiedProducts.push(product);
      } catch (e) {
        const fallback = normalizeProduct({
          ...candidate,
          verified: false,
          verificationNotes: `검증 API 실패: ${e.message}`,
          linkWarnings: ['verify-api-failed'],
          verificationStatus: 'unverified',
        });
        verifiedProducts.push(fallback);
        auditPhases.push({
          phase: 'verify',
          brand: candidate.brand,
          candidateModel: candidate.model,
          error: e.message,
        });
      }
    }

    onProgress({ phase: 'synthesize', message: '순위·출처 정리 중…' });
    const synthesized = synthesizeRankings(verifiedProducts, discovery, merged, profile);

    const globalGrounded = mergeGroundingMaps(allGroundingMaps);
    synthesized.products = synthesized.products.map((p) => enforceCitations(p, globalGrounded));

    const strippedLinks = synthesized.products.reduce((n, p) => n + (p.strippedLinks || 0), 0);
    const verifiedCount = synthesized.products.filter((p) => p.verificationStatus === 'verified').length;
    const partialCount = synthesized.products.filter((p) => p.verificationStatus === 'partial').length;

    auditPhases.push({
      phase: 'synthesize',
      rankingNotes: synthesized.rankingNotes,
      verifiedCount,
      partialCount,
      unverifiedCount: synthesized.products.length - verifiedCount - partialCount,
      strippedLinks,
    });

    const allWebQueries = auditPhases.flatMap((p) => p.webQueries || []);

    return {
      ...synthesized,
      searchedAt: new Date().toISOString(),
      criteria: merged,
      deviceId: profile.id,
      deviceLabel: profile.label,
      plannedQueries: plan.queries,
      groundingChunks: [...globalGrounded.values()].map((x) => ({
        web: { uri: x.uri, title: x.title },
      })),
      webSearchQueries: [...new Set(allWebQueries)],
      model,
      pipeline: 'plan-discover-verify-synthesize',
      auditPhases,
      audit: {
        phases: auditPhases,
        summary: {
          totalProducts: synthesized.products.length,
          verifiedCount,
          partialCount,
          unverifiedCount: synthesized.products.length - verifiedCount - partialCount,
          strippedLinks,
          apiCalls: 2 + total,
        },
      },
      summary: {
        totalProducts: synthesized.products.length,
        verifiedCount,
        partialCount,
        unverifiedCount: synthesized.products.length - verifiedCount - partialCount,
        strippedLinks,
        apiCalls: 2 + total,
      },
    };
  }

  function mapKeySpecsToProductSpecs(keySpecs, profile) {
    const specs = {};
    const map = profile.specKeyMap || {};
    keySpecs.forEach(({ label, value }) => {
      let key = map[label];
      if (!key) {
        const lower = label.toLowerCase();
        for (const [k, v] of Object.entries(map)) {
          if (lower.includes(k.toLowerCase()) || label.includes(k)) {
            key = v;
            break;
          }
        }
      }
      if (key) specs[key] = value;
      else if (!specs.extra) specs.extra = `${label}: ${value}`;
      else specs.extra += ` / ${label}: ${value}`;
    });
    specs.model = specs.model || '';
    return specs;
  }

  function productToBriefPatch(product, deviceId) {
    const profile = getDeviceProfile(deviceId);
    const name = [product.brand, product.model].filter(Boolean).join(' ').trim();
    const productSpecs = mapKeySpecsToProductSpecs(product.keySpecs || [], profile);
    if (!productSpecs.model) productSpecs.model = product.modelCode || product.model || name;

    return {
      deviceId: profile.id,
      categoryId: profile.categoryId,
      productName: name,
      priceInfo: [product.priceKrw, product.priceNote].filter(Boolean).join(' — '),
      contentDirection: product.timingFit
        ? `${profile.season} · ${product.timingFit}`
        : `${profile.season} · ${profile.label} 1인 가구 리뷰`,
      productSpecs,
      reviewBrief: {
        thesis:
          product.reviewAngle ||
          `${profile.label} — 1인 가구에서 실사용 체감과 유지비를 솔직하게`,
        targetScenario: profile.useRoomSize
          ? '퇴근 후 문 닫고 혼자 쓰는 원룸·침실'
          : '출퇴근·퇴근 후 1인 일상 사용',
        mustHighlight: [product.timingFit, product.maintenanceCost, ...(product.pros || [])]
          .filter(Boolean)
          .join(' / '),
        carefulPoints: (product.cons || []).join(' / '),
        compareWith: '',
      },
      productNotes: [
        product.modelCode && `모델코드: ${product.modelCode}`,
        product.releaseYear && `출시: ${product.releaseYear}`,
        product.officialUrl && `공식: ${product.officialUrl}`,
        product.purchaseUrl && `구매: ${product.purchaseUrl}`,
        product.verificationNotes && `검증 메모: ${product.verificationNotes}`,
        product.priceNote && `가격: ${product.priceNote}`,
        product.maintenanceCost && `유지비: ${product.maintenanceCost}`,
        product.keySpecs?.length &&
          `제원:\n${product.keySpecs.map((s) => `- ${s.label}: ${s.value}`).join('\n')}`,
        product.youtubeRefs?.length &&
          `유튜브:\n${product.youtubeRefs.map((y) => `- ${y.title} ${y.url}`).join('\n')}`,
        product.sources?.length &&
          `출처:\n${product.sources.map((s) => `- ${s.title} ${s.url}`).join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
  }

  window.DIDIDIT_RESEARCH = {
    RESEARCH_GEMINI_MODEL,
    DEFAULT_DEVICE_ID,
    DEVICE_PROFILES,
    DEVICE_GROUPS,
    BUDGET_LABELS,
    getDeviceProfile,
    listDevices,
    getPrioritiesForUI,
    getDefaultPriorities,
    buildSearchPrompt,
    buildPlanQueriesPrompt,
    buildVerifyPrompt,
    planQueries,
    discoverCandidates,
    verifyCandidate,
    verifyProduct,
    synthesizeRankings,
    enforceCitations,
    searchDevices,
    searchAirPurifiers: (apiKey, criteria, opts) =>
      searchDevices(apiKey, { ...criteria, deviceId: 'air-purifier' }, opts),
    parseSearchResponse,
    productToBriefPatch,
    deriveVerificationStatus,
    getSourceAuthorityScore,
  };
})();
