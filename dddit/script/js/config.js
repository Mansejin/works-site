/** 디디딧 시나리오 머신 — 카테고리·파트 설정 */

const CATEGORIES = [
  {
    id: 'floor-care',
    name: '청소·바닥케어',
    examples: '무선청소기, 로봇청소기, 스팀청소기, 물걸레',
    keywords: ['청소', '로봇', '물걸레', '스팀', '배큠', 'vacuum', 'mop'],
    suggestedParts: [
      '프롤로그',
      '디자인',
      '구성품',
      '성능',
      '실사용',
      '관리',
      '단점',
      '가격',
      '총평',
    ],
    focusHints: '흡입력·배터리·먼지통·필터 청소·좁은 공간 주행',
  },
  {
    id: 'air',
    name: '공기·환기',
    examples: '공기청정기, 제습기, 가습기, 에어워셔',
    keywords: ['공기청정', '제습', '가습', '환기', '필터', '미세먼지'],
    suggestedParts: [
      '프롤로그',
      '디자인',
      '성능',
      '실사용',
      '관리',
      '편의성',
      '단점',
      '가격',
      '총평',
    ],
    focusHints: 'CADR·소음·필터 교체 비용·1인 거실 체감',
  },
  {
    id: 'climate',
    name: '냉난방·환경',
    examples: '선풍기, 에어컨, 온풍기, 전기장판',
    keywords: ['선풍', '에어컨', '냉방', '난방', '온풍', '무풍'],
    suggestedParts: [
      '프롤로그',
      '디자인',
      '성능',
      '실사용',
      '편의성',
      '단점',
      '가격',
      '총평',
    ],
    focusHints: '풍량·소음·전력·좁은 원룸 배치',
  },
  {
    id: 'kitchen',
    name: '주방가전',
    examples: '에어프라이어, 블렌더, 전자레인지, 커피머신',
    keywords: ['주방', '에어프라이', '블렌더', '커피', '전자레인지', '오븐'],
    suggestedParts: [
      '프롤로그',
      '디자인',
      '구성품',
      '성능',
      '실사용',
      '관리',
      '단점',
      '가격',
      '총평',
    ],
    focusHints: '1인 식사 조리·세척·소음·카운터 공간',
  },
  {
    id: 'laundry',
    name: '세탁·건조',
    examples: '세탁기, 건조기, 의류관리기',
    keywords: ['세탁', '건조', '드럼', '통돌이', '스팀다리미'],
    suggestedParts: [
      '프롤로그',
      '디자인',
      '성능',
      '실사용',
      '관리',
      '단점',
      '가격',
      '총평',
    ],
    focusHints: '1인 세탁량·소음·배수·좁은 발코니 설치',
  },
  {
    id: 'personal-care',
    name: '개인케어·뷰티',
    examples: '헤어드라이어, 면도기, 칫솔, 마사지기',
    keywords: ['드라이어', '면도', '칫솔', '뷰티', '헤어', '피부'],
    suggestedParts: [
      '프롤로그',
      '디자인',
      '구성품',
      '성능',
      '실사용',
      '단점',
      '가격',
      '총평',
    ],
    focusHints: '출근 전 루틴·손목 피로·소음·거울 앞 사용',
  },
  {
    id: 'it-device',
    name: 'IT·모바일',
    examples: '스마트폰, 태블릿, 노트북, 이어폰, 스마트워치',
    keywords: [
      '스마트폰', '휴대폰', '폰', '갤럭시', '아이폰', 'iphone', 'android',
      '태블릿', 'ipad', '갤탭', 'tab', '노트북', '맥북', 'laptop', '울트라북',
      '이어폰', '버즈', '에어팟', '워치', '스마트워치', '갤럭시북', 'surface',
    ],
    suggestedParts: [
      '프롤로그',
      '디자인',
      '구성품',
      '성능',
      '실사용',
      '편의성',
      '단점',
      '가격',
      '총평',
    ],
    focusHints: '배터리·성능·화면·휴대성·출퇴근·퇴근 후 1인 사용 시나리오',
  },
  {
    id: 'smart-home',
    name: '스마트홈·IoT',
    examples: '스마트 스피커, 도어락, CCTV, 허브',
    keywords: ['스마트', 'IoT', '앱', '연동', '허브', '도어락'],
    suggestedParts: [
      '프롤로그',
      '디자인',
      '편의성',
      '성능',
      '실사용',
      '단점',
      '가격',
      '총평',
    ],
    focusHints: '앱 연동·지연·1인 가구 보안·설치 난이도',
  },
  {
    id: 'other',
    name: '기타 가전',
    examples: '분류가 애매한 제품',
    keywords: [],
    suggestedParts: [
      '프롤로그',
      '디자인',
      '성능',
      '실사용',
      '단점',
      '가격',
      '총평',
    ],
    focusHints: '제품 특성에 맞게 파트를 유동 조합',
  },
];

function detectCategory(productName, productNotes, contentDirection) {
  const text = `${productName} ${productNotes} ${contentDirection || ''}`.toLowerCase();
  let best = CATEGORIES.find((c) => c.id === 'other');
  let bestScore = 0;

  for (const cat of CATEGORIES) {
    if (cat.id === 'other') continue;
    const score = cat.keywords.reduce((acc, kw) => {
      return acc + (text.includes(kw.toLowerCase()) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

function utf8ByteLength(str) {
  return new TextEncoder().encode(str).length;
}

/** @type {{ id: string, label: string, hint: string }[]} */
const GEMINI_MODELS = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    hint: '빠르고 저렴 — 대본 생성 추천',
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    hint: '최신 Flash — 코딩·에이전트 강화',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    hint: '고품질 — 복잡한 구성·팩트 체크',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    hint: '프리뷰 — 균형형',
  },
];

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
/** 파트 구성·프롤로그 */
const LITE_GEMINI_MODEL = 'gemini-3.1-flash-lite';
/** 프롤로그 이후 본문 대본 */
const PRO_GEMINI_MODEL = 'gemini-3.1-pro-preview';

const DEPRECATED_GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash-latest',
]);

function isSupportedGeminiModel(id) {
  return GEMINI_MODELS.some((m) => m.id === id);
}

const PART_NAME_POOL = [
  '프롤로그',
  '디자인',
  '구성품',
  '성능',
  '실사용',
  '편의성',
  '관리',
  '단점',
  '가격',
  '총평',
];

window.DIDIDIT_CONFIG = {
  CATEGORIES,
  PART_NAME_POOL,
  GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
  LITE_GEMINI_MODEL,
  PRO_GEMINI_MODEL,
  DEPRECATED_GEMINI_MODELS,
  isSupportedGeminiModel,
  get SYSTEM_RULES() {
    return window.DIDIDIT_PROMPT?.getActiveSystemRules() || '';
  },
  detectCategory,
  utf8ByteLength,
};
