/** 디디딧 콘티 작성기 — 카테고리·모델·라운드업 설정 */

const CATEGORIES = [
  { id: 'floor-care', name: '청소·바닥케어', focusHints: '흡입력·배터리·먼지통·필터 청소·좁은 공간 주행' },
  { id: 'air', name: '공기·환기', focusHints: 'CADR·소음·필터 교체 비용·1인 거실 체감' },
  { id: 'climate', name: '냉난방·환경', focusHints: '풍량·소음·전력·좁은 원룸 배치' },
  { id: 'kitchen', name: '주방가전', focusHints: '1인 식사 조리·세척·소음·카운터 공간' },
  { id: 'laundry', name: '세탁·건조', focusHints: '1인 세탁량·소음·배수·좁은 발코니 설치' },
  { id: 'personal-care', name: '개인케어·뷰티', focusHints: '출근 전 루틴·손목 피로·소음·거울 앞 사용' },
  { id: 'it-device', name: 'IT·모바일', focusHints: '배터리·성능·화면·휴대성·출퇴근·퇴근 후 1인 사용' },
  { id: 'smart-home', name: '스마트홈·IoT', focusHints: '앱 연동·지연·1인 가구 보안·설치 난이도' },
  { id: 'other', name: '기타 가전', focusHints: '제품 특성에 맞게 챕터를 유동 구성' },
];

/** N개 아이템 라운드업 — 소스·콘셉트 카테고리 (단일 제품 카테고리와 별도 축) */
const ROUNDUP_CATEGORIES = [
  {
    id: 'roundup-daiso',
    name: '다이소',
    detect: /다이소/i,
    conceptHints: ['가성비', '1000~5000원대', '품절·재입고', '매장 재고'],
    openingExample: '다이소 가성비 여름 꿀템 N가지',
  },
  {
    id: 'roundup-coupang',
    name: '쿠팡',
    detect: /쿠팡/i,
    conceptHints: ['로켓배송', '가격 변동', '리뷰 수·별점', '로켓와우'],
    openingExample: '쿠팡에서 찾은 ○○ 꿀템 N가지',
  },
  {
    id: 'roundup-temu',
    name: '테무',
    detect: /테무|temu/i,
    conceptHints: ['초저가', '배송 기간', '실물과 차이', '사이즈·재질 확인'],
    openingExample: '테무에서 살 만한 ○○ N가지',
  },
  {
    id: 'roundup-deskterior',
    name: '데스크테리어',
    detect: /데스크테리어|deskterior/i,
    conceptHints: ['책상·모니터 주변', '1인 workspace', '수납·선 정리'],
    openingExample: '책상을 바꿔 줄 데스크테리어 N가지',
  },
  {
    id: 'roundup-muji',
    name: '무인양품·MUJI',
    detect: /무인양품|muji|무지/i,
    conceptHints: ['미니멀', '베스트 N', '실용 소품', '매장 품절'],
    openingExample: '무인양품 베스트 ○○ N가지',
  },
];

/** N개 아이템 신호 — 브랜드 없이도 라운드업 (예: 꿀템 20, 베스트 11) */
const ROUNDUP_QUANTITY_PATTERN =
  /꿀템\s*\d+|\d+\s*꿀템|라운드업|\d+\s*가지|N\s*가지|베스트\s*\d+|베스트\s*일레븐|일레븐|top\s*\d+|\d+\s*개\s*(꿀템|아이템|제품|소품)|\d+\s*선/i;

function hasRoundupQuantity(text) {
  return ROUNDUP_QUANTITY_PATTERN.test(String(text || ''));
}

/**
 * 라운드업 포맷 여부 — N가지·꿀템 N·베스트 N 등 **개수 신호** 필수.
 * 브랜드(다이소·무인양품·쿠팡 등)만으로는 단일 제품 리뷰로 처리.
 */
function isRoundupFormat(text) {
  return hasRoundupQuantity(text);
}

function detectRoundupCategory(text) {
  const t = String(text || '');
  if (!isRoundupFormat(t)) return null;
  const found = ROUNDUP_CATEGORIES.find((c) => c.detect.test(t));
  if (found) return found.id;
  return 'roundup-generic';
}

function getRoundupCategory(id) {
  return ROUNDUP_CATEGORIES.find((c) => c.id === id) || null;
}

function buildRoundupCategoryHint(text) {
  const id = detectRoundupCategory(text);
  if (!id) return '';
  if (id === 'roundup-generic') {
    return '- 라운드업 소스: 기획안 콘셉트(다이소·쿠팡·테무·데스크테리어·무인양품 등)에 맞게 오프닝·구매 팁을 조정.\n';
  }
  const cat = getRoundupCategory(id);
  if (!cat) return '';
  return `- 라운드업 소스 **${cat.name}**: ${cat.conceptHints.join(', ')}. 오프닝 콘셉트 예: "${cat.openingExample}".\n`;
}

const GEMINI_MODELS = [
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', hint: '빠르고 저렴' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', hint: '최신 Flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', hint: '고품질 대본' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', hint: '균형형' },
];

const PRO_GEMINI_MODEL = 'gemini-3.1-pro-preview';

function isSupportedGeminiModel(id) {
  return GEMINI_MODELS.some((m) => m.id === id);
}

window.DIDIDIT_CONFIG = {
  CATEGORIES,
  ROUNDUP_CATEGORIES,
  GEMINI_MODELS,
  PRO_GEMINI_MODEL,
  isSupportedGeminiModel,
  isRoundupFormat,
  hasRoundupQuantity,
  detectRoundupCategory,
  getRoundupCategory,
  buildRoundupCategoryHint,
};
