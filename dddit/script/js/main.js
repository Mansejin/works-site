/** 프롬프트 — txt 파일 기반 관리 (단계별 시스템 규칙 분리) */
(function () {
  const PROMPT_VERSION = '1.1.1';
  const DEFAULT_PROMPT_FILE = `prompts/default-v${PROMPT_VERSION}.txt`;
  const STYLE_ANCHOR_FILE = 'prompts/style-anchor.txt';
  const FORMAT_ITEM_ROUNDUP_FILE = 'prompts/format-item-roundup.txt';
  const PROMPT_STORAGE_KEY = 'dididit-prompt-file-v2';

  const MANDATORY_OPENING = [
    '안녕하세요, 디디딧입니다.',
    '오늘 가져온 제품은 [제품명] 인데요',
    '[콘텐츠 방향 한 줄 요약]',
    '그럼 바로 리뷰 시작하겠습니다.',
  ];

  const MANDATORY_CLOSING = [
    '오늘 준비한 리뷰는 여기까지입니다.',
    '혹시 영상 보시고 궁금한 점이나 여러분이 직접 써보신 후기가 있다면',
    '댓글로 마음껏 공유해 주세요.',
    '구독과 좋아요는 다음 리뷰 제작에 큰 힘이 됩니다.',
    '그럼 오늘 소개해드린 제품의 장단점과 평점을 정리해드리며',
    '다음 영상에서 뵙겠습니다.',
  ];

  /** N개 아이템 라운드업 (다이소·무인양품 베스트 N 등) */
  const MANDATORY_CLOSING_ROUNDUP = [
    '오늘 소개해드린 [콘셉트·제품군명] 어떠셨나요?',
    '혹시 궁금한 점이나 여러분이 직접 써본 후기가 있다면',
    '댓글로 마음껏 공유해 주세요.',
    '구독과 좋아요는 다음 리뷰 제작에 큰 힘이 됩니다.',
    '그럼 오늘 소개해드린 제품의 정보를 정리해드리며,',
    '다음 영상에서 뵙겠습니다.',
    '감사합니다!',
  ];

  function isRoundupFormat(text) {
    if (window.DIDIDIT_CONFIG?.isRoundupFormat) return window.DIDIDIT_CONFIG.isRoundupFormat(text);
    return /꿀템\s*\d+|\d+\s*가지|라운드업|베스트\s*\d+|일레븐|\d+\s*개\s*(꿀템|아이템|제품|소품)/i.test(
      String(text || ''),
    );
  }

  function buildRoundupCategoryHint(text) {
    return window.DIDIDIT_CONFIG?.buildRoundupCategoryHint?.(text) ?? '';
  }

  function formatClosingBlock(roundup = false) {
    const lines = roundup ? MANDATORY_CLOSING_ROUNDUP : MANDATORY_CLOSING;
    const label = roundup ? 'N개 아이템 라운드업' : '단일 제품';
    return `[클로징 — ${label}]\n${lines.map((l) => `- ${l}`).join('\n')}`;
  }

  /** 단계별 출력 규칙 — 시스템 프롬프트에만 주입 (기본 프롬프트와 충돌 방지) */
  const STAGE_RULES = {
    prose: `# 현재 작업 단계: 줄글 작성 (최우선)
- 성우 내레이션 **줄글(연속 텍스트)** 만 작성합니다.
- 행 분할·글자 수·바이트·표·JSON·장면·사이즈·자막·코멘트 규칙은 **이 단계에서 적용하지 않습니다**.
- **내용 가중치**: 기획안 구성·챕터 메모·필수 장면/소구/멘션 > 일반 시스템 프롬프트 관례.
- 챕터마다 **범위가 다릅니다**. 다른 챕터에 배정된 소구·시연을 반복하지 마세요.
- 스펙·수치는 문장 속에 자연스럽게 녹이고, 나열형 낭독은 피합니다.
- 기획안의 mustHighlight·**필수 소구·필수 멘션**은 빠뜨리지 마세요. 서브 소구는 적절한 챕터에만.
- **분량**: 오프닝·인트로와 총평·클로징만 짧게. **그 외 본문 챕터는 분량 상한 없음**.
- **광고 모드 ON**: 단점·한계·비추천 표현 지양. carefulPoints는 고지용만.
- **광고 모드 OFF**: carefulPoints·단점을 솔직히 다룹니다.
- 첫 챕터(프롤로그)에는 [오프닝] 고정 멘트를 포함합니다.
- 마지막·총평 챕터 클로징: 요청 메시지의 역할 힌트와 아래 **[이 영상 클로징]** 만 사용. 단일/라운드업을 섞지 마세요.
- 출력: 마크다운·JSON·표 없이 줄글 본문만`,

    convert: `# 현재 작업 단계: 줄글 → 대본 열 변환 (최우선)
- 줄글을 JSON \`rows\` 배열로 변환합니다. **대본 열만** 채우고 장면·사이즈·자막·코멘트는 빈 문자열.
- 1행 = 성우가 **한 호흡에 말하기 좋은 단위** (문장 단위 ≠ 기계적 마침표 분할).
- 행당 공백 포함 목표 **20~40자**, 권장 상한 **48자**. 그 이상이면 자막이 길어지므로 호흡 쉼에서 나눕니다.
- 긴 문장은 연결 어미·쉼표(고/서/는데/지만/,)에서 나누고, **조사만 남은 미완성**(은/는/이/가/을/를…)으로 끊지 마세요.
- 15자 미만 초단문만 연속 나열 금지. 의미 없이 한 호흡을 억지로 합치지 마세요.
- 대본에 제품을 '이 녀석'이라 지칭하지 말 것.
- 출력: 유효한 JSON만. {"rows":[{"대본":"...","장면":"","사이즈":"","자막":"","코멘트":""}]}`,

    scene: `# 현재 작업 단계: 장면·사이즈 추가 (최우선)
- 대본 열은 **한 글자도 수정하지 않습니다**.
- 장면: 모델 행동·카메라 구도. 연속 호흡은 '컷 유지'.
- 사이즈: 와이드/미디엄/클로즈업/탑뷰 등.
- 자막·코멘트는 빈 문자열 유지.
- 팀 **촬영 체크리스트·필수 장면**이 있으면 대본 흐름에 맞게 장면 열에 반영하세요.
- 고가 비교 세팅·작위적 감정 연기 장면 금지.
- 언박싱: 가이드/체크리스트에 있으면 **허용**, 없으면 넣지 마세요.
- 출력: JSON rows 전체`,

    caption: `# 현재 작업 단계: 자막·코멘트 추가 (최우선)
- 대본·장면·사이즈는 **수정하지 않습니다**.
- 자막: 대본에 수치·스펙이 나올 때만 요약 (예: "무게 406g").
- 코멘트: 준비물·앱 세팅 등 촬영 메모가 필요할 때만.
- 출력: JSON rows 전체`,
  };

  function buildBaseSystemRules(options = {}) {
    const format = options.format || 'both';
    let closingBlock = '';
    if (format === 'single') {
      closingBlock = `${formatClosingBlock(false)}
- 이 영상은 **단일 제품** 리뷰입니다. 위 단일 클로징만 사용하세요.
- 라운드업 멘트(「어떠셨나요?」「정보를 정리」「감사합니다!」)는 넣지 마세요.`;
    } else if (format === 'roundup') {
      closingBlock = `${formatClosingBlock(true)}
- 이 영상은 **N개 아이템 라운드업**입니다. 위 라운드업 클로징만 사용하세요.
- 단일 제품 멘트(「장단점과 평점을 정리」)는 넣지 마세요.`;
    } else {
      closingBlock = `[클로징 — 단일 제품 · 총평·마지막 챕터]
${MANDATORY_CLOSING.map((l) => `- ${l}`).join('\n')}

[클로징 — N개 아이템 라운드업 · 마지막]
${MANDATORY_CLOSING_ROUNDUP.map((l) => `- ${l}`).join('\n')}`;
    }

    return `# 디디딧 시스템 프롬프트 (기본)

## 역할·톤
Role: IT 리뷰 채널 '디디딧' 메인 작가
Target Audience: 퇴근 후 혼자만의 시간을 즐기는 1인 가구 직장인
Content Format: 모델 실사용 연기(화면) + 성우 내레이션(음성)
Tone & Manner: 솔직 담백, 과장 없는 팩트, 실생활 밀착형 공감 화법

## 콘텐츠 원칙
- **기획안 우선**: 챕터 구성·필수 장면·소구·주의는 기획안/팀 가이드를 따릅니다. 일반 IT리뷰 골격과 충돌하면 기획안이 우선입니다.
- 스펙·기능 설명 시 기본 구성품과 별매품을 구분합니다.
- 제품 지칭: '이 녀석' 사용 금지.
- 사실 왜곡·허위 장점 금지. 리뷰 가이드·브리프 우선 반영.
- 진행자 등장 배제. 모델의 담백한 행동 묘사 중심.
- 챕터 간 내용 중복 금지 (각 챕터 메모 범위만).

## 촬영 제약
- 렌탈 스튜디오·최소 장비 기준. 고가 비교 제품 세팅 배제.
- 언박싱: 기본은 지양. 팀 가이드·촬영 체크리스트·필수 장면에 명시되면 **허용**.
- 복잡한 더미 세팅 대신 웹서핑·게임 등 직관적 화면.
- 작위적·어색한 감정 연기 지양.

## 참고 대본 (제공 시)
- 팩트 체크·누락 파악용. 문장·표현 복사 금지, 디디딧 톤으로 재작성.

## 고정 멘트
[오프닝 — 프롤로그·첫 챕터에만]
${MANDATORY_OPENING.map((l) => `- ${l}`).join('\n')}

${closingBlock}

## 파이프라인 안내
줄글 → 대본 분할 → 장면·사이즈 → 자막·코멘트 순으로 작성합니다.
**행 분할·JSON·표 형식 규칙은 요청 메시지 상단의 [현재 작업 단계] 지침만 따릅니다.**`;
  }

  /** 하위 호환: 편집기·내장값 표시용 */
  function buildDefaultSystemRules() {
    return buildBaseSystemRules({ format: 'both' });
  }

  function loadPromptState() {
    try {
      return JSON.parse(localStorage.getItem(PROMPT_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function savePromptState(data) {
    localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(data));
  }

  function getActiveSystemRules(options = {}) {
    const saved = loadPromptState();
    if (saved.text) return saved.text;
    return buildBaseSystemRules(options);
  }

  function buildAdModePin(adMode) {
    if (adMode) {
      return `# 광고·협찬 모드 (최우선)
- **단점·한계·아쉬운 점·불편·부족·비추천** 등 비판적 표현을 쓰지 마세요.
- brandAvoid/carefulPoints는 제품 단점이 아니라 **법적·필수 고지**(협찬 고지·보조금·시연 주의)로만 다루세요.
- 총평·편의성 챕터에서도 단점 요약·한계 나열·솔직한 비추천을 넣지 마세요.
- 허위 과장·「무조건 추천」은 금지. 체감 장점·사용 장면 중심으로 담백하게.`;
    }
    return `# 일반 리뷰 모드
- 장점과 단점·주의점을 왜곡 없이 균형 있게 다룹니다.
- carefulPoints는 솔직히 반영합니다.`;
  }

  /**
   * API 호출용 — 기본 프롬프트 + 단계 규칙.
   * 커스텀 프롬프트를 쓰더라도 단계 규칙이 최우선으로 앞에 붙어 패러독스를 방지합니다.
   * @param {string} stage
   * @param {{ format?: 'single'|'roundup'|'both', adMode?: boolean }} [options]
   */
  function getSystemRulesForStage(stage, options = {}) {
    const format = options.format || 'both';
    const stageBlock = STAGE_RULES[stage];
    const base = getActiveSystemRules({ format });
    let pins = '';
    if (stage === 'prose' && format !== 'both') {
      pins += `\n\n# 이 영상 클로징 (필수·최우선)\n${formatClosingBlock(format === 'roundup')}\n- 위 클로징만 사용. 다른 포맷 클로징 금지.\n`;
    }
    if (stage === 'prose') {
      pins += `\n\n${buildAdModePin(Boolean(options.adMode))}\n`;
    }
    if (!stageBlock) return `${pins}${base}`.trim();
    return `${stageBlock}${pins}\n\n---\n\n${base}`;
  }

  function getActivePromptSource() {
    const saved = loadPromptState();
    return saved.source || DEFAULT_PROMPT_FILE;
  }

  function setActivePrompt(text, source) {
    savePromptState({
      text,
      source: source || 'editor',
      savedAt: new Date().toISOString(),
    });
  }

  function clearActivePrompt() {
    localStorage.removeItem(PROMPT_STORAGE_KEY);
  }

  async function fetchPromptTxt(relativePath) {
    const res = await fetch(relativePath);
    if (!res.ok) throw new Error(`${relativePath} 읽기 실패 (${res.status})`);
    const text = await res.text();
    if (!text.trim()) throw new Error('파일이 비어 있습니다.');
    return text;
  }

  let styleAnchorCache = null;

  let formatAnchorCache = undefined;

  async function getFormatAnchorBlock() {
    if (formatAnchorCache !== undefined) return formatAnchorCache;
    try {
      const text = await fetchPromptTxt(FORMAT_ITEM_ROUNDUP_FILE);
      formatAnchorCache = `# 영상 포맷 (N개 아이템 라운드업 — QC 반영)\n${text.trim()}`;
      return formatAnchorCache;
    } catch {
      formatAnchorCache = '';
      return '';
    }
  }

  function clearFormatAnchorCache() {
    formatAnchorCache = undefined;
  }

  async function getStyleAnchorBlock() {
    if (styleAnchorCache !== null) return styleAnchorCache;
    try {
      const text = await fetchPromptTxt(STYLE_ANCHOR_FILE);
      styleAnchorCache = `# 디디딧 스타일 앵커 (문장 복사 금지 — 톤·호흡·리듬만 참고)\n${text.trim()}`;
      return styleAnchorCache;
    } catch {
      styleAnchorCache = '';
      return '';
    }
  }

  function clearStyleAnchorCache() {
    styleAnchorCache = null;
  }

  async function loadDefaultPromptFile() {
    try {
      const text = await fetchPromptTxt(DEFAULT_PROMPT_FILE);
      setActivePrompt(text, DEFAULT_PROMPT_FILE);
      return { text, source: DEFAULT_PROMPT_FILE };
    } catch {
      const text = buildBaseSystemRules();
      setActivePrompt(text, `${DEFAULT_PROMPT_FILE} (내장 fallback)`);
      return { text, source: `${DEFAULT_PROMPT_FILE} (내장 fallback)` };
    }
  }

  function downloadPromptTxt(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || `dididit-prompt-v${PROMPT_VERSION}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  window.DIDIDIT_PROMPT = {
    PROMPT_VERSION,
    DEFAULT_PROMPT_FILE,
    MANDATORY_CLOSING,
    MANDATORY_CLOSING_ROUNDUP,
    isRoundupFormat,
    buildRoundupCategoryHint,
    formatClosingBlock,
    buildBaseSystemRules,
    buildDefaultSystemRules,
    getActiveSystemRules,
    getSystemRulesForStage,
    getStyleAnchorBlock,
    clearStyleAnchorCache,
    STYLE_ANCHOR_FILE,
    getFormatAnchorBlock,
    clearFormatAnchorCache,
    FORMAT_ITEM_ROUNDUP_FILE,
    getActivePromptSource,
    setActivePrompt,
    clearActivePrompt,
    fetchPromptTxt,
    loadDefaultPromptFile,
    downloadPromptTxt,
    loadPromptState,
  };
})();

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
/**
 * Fast path for convert / scene / caption.
 * Flash-Lite 우선 — 3.5 Flash는 수요·thinking 부담이 커서 변환 단계에서
 * high-demand/빈 응답이 잦음. 실패 시 아래 체인으로 폴백.
 */
const FAST_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const FAST_GEMINI_FALLBACKS = [
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
];

function isSupportedGeminiModel(id) {
  return GEMINI_MODELS.some((m) => m.id === id);
}

window.DIDIDIT_CONFIG = {
  CATEGORIES,
  ROUNDUP_CATEGORIES,
  GEMINI_MODELS,
  PRO_GEMINI_MODEL,
  FAST_GEMINI_MODEL,
  FAST_GEMINI_FALLBACKS,
  isSupportedGeminiModel,
  isRoundupFormat,
  hasRoundupQuantity,
  detectRoundupCategory,
  getRoundupCategory,
  buildRoundupCategoryHint,
};

/** 참고 대본 파일 파싱 (txt, md, docx) */
(function () {
  const MAX_PER_FILE = 12000;
  const MAX_TOTAL = 30000;

  function decodeXmlEntities(str) {
    return str
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  async function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`${file.name} 읽기 실패`));
      reader.readAsText(file, 'UTF-8');
    });
  }

  async function readDocxFile(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('docx 읽기에 JSZip이 필요합니다. 인터넷 연결 후 다시 시도하세요.');
    }
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const docXml = zip.file('word/document.xml');
    if (!docXml) throw new Error(`${file.name}: document.xml 없음`);

    const xml = await docXml.async('string');
    const paragraphs = xml.split(/<\/w:p>/i);
    const lines = paragraphs.map((p) => {
      const texts = [];
      const re = /<w:t[^>]*>([^<]*)<\/w:t>/gi;
      let m;
      while ((m = re.exec(p))) texts.push(m[1]);
      return decodeXmlEntities(texts.join('')).trim();
    });
    return lines.filter(Boolean).join('\n');
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    return text.slice(0, max) + '\n…(이하 생략)';
  }

  async function parseReferenceFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    let text = '';

    if (['txt', 'md', 'csv', 'tsv', 'log'].includes(ext)) {
      text = await readTextFile(file);
    } else if (ext === 'docx') {
      text = await readDocxFile(file);
    } else if (ext === 'doc') {
      throw new Error(`${file.name}: .doc 형식은 지원하지 않습니다. docx 또는 txt로 저장해 주세요.`);
    } else {
      text = await readTextFile(file);
    }

    return {
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      source: 'file',
      text: truncate(text.trim(), MAX_PER_FILE),
      chars: text.length,
    };
  }

  function buildReferenceContext(scripts) {
    if (!scripts.length) return '';
    let total = 0;
    const blocks = [];

    for (const s of scripts) {
      if (total >= MAX_TOTAL) break;
      const budget = Math.min(MAX_PER_FILE, MAX_TOTAL - total);
      const body = s.text.length > budget ? truncate(s.text, budget) : s.text;
      total += body.length;
      blocks.push(`## ${s.name}\n${body}`);
    }

    return `
# 참고 리뷰 대본 (팩트 체크·차별화용)
- 아래 내용은 타 유튜버 리뷰 참고 자료입니다. 문장 그대로 복사 금지.
- 스펙·사용감 팩트만 교차 검증하고, 디디딧 톤으로 재작성하세요.

${blocks.join('\n\n')}`.trim();
  }

  window.DIDIDIT_REF = {
    parseReferenceFile,
    buildReferenceContext,
    MAX_PER_FILE,
    MAX_TOTAL,
  };
})();

/** 오류 로그 — localStorage 영속, UI 연동 */
(function () {
  const ERROR_LOG_KEY = 'dididit-error-log-v1';
  const ERROR_LOG_MAX = 80;

  const entries = [];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('ko-KR');
    } catch {
      return iso;
    }
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
      entries.length = 0;
      if (Array.isArray(saved)) entries.push(...saved.slice(-ERROR_LOG_MAX));
    } catch {
      entries.length = 0;
    }
  }

  function save() {
    try {
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(entries.slice(-ERROR_LOG_MAX)));
    } catch {
      /* quota */
    }
  }

  function log(context, error, meta = {}) {
    const message = error?.message || String(error || '알 수 없는 오류');
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
      context: context || 'unknown',
      message,
      stack: error?.stack || '',
      meta: meta && typeof meta === 'object' ? meta : {},
    };
    entries.push(entry);
    if (entries.length > ERROR_LOG_MAX) {
      entries.splice(0, entries.length - ERROR_LOG_MAX);
    }
    save();
    render();
    updateBadge();
    console.error(`[${entry.context}]`, message, meta, error);
    return entry;
  }

  function getEntries() {
    return entries.slice();
  }

  function clear() {
    entries.length = 0;
    save();
    render();
    updateBadge();
  }

  function toExportText() {
    if (!entries.length) return '';
    return entries
      .map((e) => {
        const meta =
          e.meta && Object.keys(e.meta).length
            ? `\nmeta: ${JSON.stringify(e.meta)}`
            : '';
        const stack = e.stack ? `\n${e.stack}` : '';
        return `[${formatTime(e.time)}] ${e.context}\n${e.message}${meta}${stack}`;
      })
      .join('\n\n---\n\n');
  }

  function render() {
    const list = document.getElementById('error-log-list');
    const empty = document.getElementById('error-log-empty');
    const countEl = document.getElementById('error-log-count');
    if (!list) return;

    if (countEl) countEl.textContent = `${entries.length}건`;

    if (!entries.length) {
      list.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    list.innerHTML = entries
      .slice()
      .reverse()
      .map((e) => {
        const metaBits = [];
        if (e.meta.kind === 'quota_billing') metaBits.push('유형: 지출 한도·쿼터');
        else if (e.meta.kind === 'transient_overload') metaBits.push('유형: 일시 과부하');
        else if (e.meta.kind === 'model_not_found') metaBits.push('유형: 모델 없음');
        if (e.meta.apiModel || e.meta.model) metaBits.push(`모델: ${esc(e.meta.apiModel || e.meta.model)}`);
        if (e.meta.part) metaBits.push(`파트: ${esc(e.meta.part)}`);
        if (e.meta.apiStatus || e.meta.status) metaBits.push(`HTTP ${esc(e.meta.apiStatus || e.meta.status)}`);
        const metaHtml = metaBits.length
          ? `<div class="error-log-meta">${metaBits.join(' · ')}</div>`
          : '';
        const stackHtml = e.stack
          ? `<details class="error-log-stack"><summary>스택</summary><pre>${esc(e.stack)}</pre></details>`
          : '';
        const kindCls = e.meta.kind === 'quota_billing' ? ' is-quota' : '';
        return `<li class="error-log-item${kindCls}">
        <div class="error-log-head">
          <time>${esc(formatTime(e.time))}</time>
          <span class="error-log-ctx">${esc(e.context)}</span>
        </div>
        <p class="error-log-msg">${esc(e.message)}</p>
        ${metaHtml}
        ${stackHtml}
      </li>`;
      })
      .join('');
  }

  function updateBadge() {
    const badge = document.getElementById('error-log-badge');
    if (!badge) return;
    if (entries.length) {
      badge.textContent = entries.length > 99 ? '99+' : String(entries.length);
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  }

  function downloadTxt() {
    const text = toExportText();
    if (!text) return false;
    const blob = new Blob([`\uFEFF${text}`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dididit-error-log_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  }

  window.DIDIDIT_LOG = {
    load,
    log,
    clear,
    render,
    updateBadge,
    getEntries,
    toExportText,
    downloadTxt,
  };
})();

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

/**
 * 시나리오 파이프라인 — 줄글 초안 → 5열 시트 변환 (단계별)
 */
window.DIDIDIT_PIPELINE = (function () {
  const HEADERS = ['대본', '장면', '사이즈', '자막', '코멘트'];

  const ROW_CHARS_MIN = 16;
  /** Comfortable spoken breath + on-screen caption length */
  const ROW_CHARS_TARGET_MIN = 20;
  const ROW_CHARS_TARGET_MAX = 40;
  /** Soft preferred max — above this, local heal splits at breath pauses */
  const ROW_CHARS_HARD_MAX = 48;
  /** Hard fail / last-resort split */
  const ROW_CHARS_FORCE_SPLIT = 64;

  const ROWS_SCHEMA = {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            대본: { type: 'string' },
            장면: { type: 'string' },
            사이즈: { type: 'string' },
            자막: { type: 'string' },
            코멘트: { type: 'string' },
          },
          required: HEADERS,
        },
      },
    },
    required: ['rows'],
  };

  function isPrologueChapter(title) {
    return /프롤로그|오프닝|인트로|^인트$/i.test(title || '');
  }

  function isClosingChapter(title) {
    return /총평|클로징|마무리/i.test(title || '');
  }

  function proseHeading(chapter) {
    if (window.DdditChapterTitleQc?.headingForProse) {
      return window.DdditChapterTitleQc.headingForProse(chapter);
    }
    if (!chapter) return '';
    if (chapter.titleCard === false || isPrologueChapter(chapter.title)) return '';
    return String(chapter?.title || '').trim();
  }

  function getNarrationRhythmBlock() {
    return `
# 대본 호흡·행 분할 (변환 단계 필수 · 정밀)
- 1행 = 성우가 **한 호흡에 말하기 좋은 단위**. 문장 단위로 기계 분할하지 마세요.
- 행당 공백 포함 목표 **${ROW_CHARS_TARGET_MIN}~${ROW_CHARS_TARGET_MAX}자**, 권장 상한 **${ROW_CHARS_HARD_MAX}자**.
  (이보다 길면 화면 자막이 답답해집니다.)
- 긴 문장은 호흡 쉼에서 나눕니다: 연결 어미·쉼표 (고 / 서 / 며 / 는데 / 지만 / ,).
- **나쁜 절단(금지)**: 조사만 남김 — "배터리는" / "하루 종일" 처럼 은·는·이·가·을·를·의 로 끝.
- 마침표마다 무조건 1행 X. 아주 짧은 호흡 2개를 억지로 한 행에 합치지 마세요.
- 좋은 예:
  - "배터리는 하루 종일 버팁니다." (한 호흡·완결)
  - "충전은 USB-C로 연결하고," / "케이블 하나로 끝납니다." (긴 문장의 호흡 분할)
- 나쁜 예:
  - "배터리는 하루" + "종일 버팁니다." (의미 중간 절단)
  - 70자짜리 한 행에 문장 두 개를 몰아넣기 (자막 과다)`;
  }

  function bareScript(text) {
    return String(text || '')
      .trim()
      .replace(/["'”’」』)\]]+$/g, '')
      .trim();
  }

  /** True when the cut leaves a hanging particle / unfinished fragment (not speakable alone). */
  function isDanglingFragment(text) {
    const bare = bareScript(text);
    if (!bare) return false;
    if (/(은|는|이|가|을|를|의|와|과|도|만|께|로|으로|라고|이라는|라는)$/.test(bare)) return true;
    if (/(보다|마다|만큼|대로|마저|조차|부터|까지)$/.test(bare) && bare.length < 28) return true;
    // dangling adjective/noun stem without ending (very short mid-chunks)
    if (bare.length <= 10 && !/[.?!…]$/.test(bare) && !/(다|요|죠|네|고|서|며|데|니)$/.test(bare)) {
      return true;
    }
    return false;
  }

  /** Korean sentence-final (strong end). */
  function endsCompleteSentence(text) {
    const bare = bareScript(text);
    if (!bare) return true;
    if (/[.?!…～~]$/.test(bare)) return true;
    if (/(보다|마다|만큼|대로|마저|조차|부터|까지)$/.test(bare)) return false;
    if (/(습니다|습니까|세요|셔요|군요|네요|데요|죠|예요|이에요|답니다|거든요|니까요|에요|이요)[.?!…]*$/.test(bare)) {
      return true;
    }
    if (/요$/.test(bare) && bare.length >= 6) return true;
    if (/(았|었|였|했|됐|됩|합|입|갑|옵|습)다$/.test(bare)) return true;
    if (/(ㄴ다|는다|운다|인다|한다|된다|이다)$/.test(bare) && bare.length >= 8) return true;
    return false;
  }

  /** Soft breath-ok ending: sentence end OR clause pause suitable for one breath. */
  function endsBreathUnit(text) {
    if (endsCompleteSentence(text)) return true;
    const bare = bareScript(text);
    if (!bare || isDanglingFragment(bare)) return false;
    if (/(고|서|며|데|니|지만|는데|니까|다가|면서|거나|싶어|해서)$/.test(bare) && bare.length >= ROW_CHARS_MIN) {
      return true;
    }
    if (/[,，、]$/.test(bare) && bare.length >= ROW_CHARS_MIN) return true;
    return false;
  }

  function detectChoppyRhythm(rows) {
    if (rows.length < 6) return null;
    const shortRows = rows.filter((r) => r.대본.length < ROW_CHARS_MIN);
    if (shortRows.length / rows.length > 0.35) {
      return `${shortRows.length}행이 ${ROW_CHARS_MIN}자 미만 — 너무 잘게 쪼갬`;
    }
    return null;
  }

  function detectOverlongRows(rows) {
    const longRows = rows.filter((r) => r.대본.length > ROW_CHARS_FORCE_SPLIT);
    if (longRows.length) {
      return `${longRows.length}행이 ${ROW_CHARS_FORCE_SPLIT}자 초과 — 호흡 경계에서 분할`;
    }
    return null;
  }

  function detectBadBreathCuts(rows) {
    if (rows.length < 2) return null;
    let cuts = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      if (isDanglingFragment(rows[i].대본)) cuts += 1;
    }
    if (cuts > 0) return `${cuts}행이 조사·미완성으로 끊김`;
    return null;
  }

  /** Soft checklist (logging). Soft issues alone do not force API retry. */
  function validateScriptRows(rows) {
    const issues = [];
    if (!rows.length) issues.push('행이 없습니다');
    rows.forEach((r, i) => {
      if (!r.대본.trim()) issues.push(`${i + 1}행 대본 누락`);
      const len = r.대본.length;
      if (len > ROW_CHARS_FORCE_SPLIT) issues.push(`${i + 1}행 ${len}자 (${ROW_CHARS_FORCE_SPLIT}자 초과)`);
      else if (len > ROW_CHARS_HARD_MAX) issues.push(`${i + 1}행 ${len}자 (권장 ${ROW_CHARS_HARD_MAX}자 초과 · 자막 과다)`);
      else if (len < ROW_CHARS_MIN && rows.length >= 6) issues.push(`${i + 1}행 ${len}자 (너무 짧음)`);
    });
    const choppy = detectChoppyRhythm(rows);
    if (choppy) issues.push(choppy);
    const overlong = detectOverlongRows(rows);
    if (overlong) issues.push(overlong);
    const bad = detectBadBreathCuts(rows);
    if (bad) issues.push(bad);
    return issues;
  }

  /** Only these trigger another Gemini convert attempt. */
  function validateHardIssues(rows) {
    const issues = [];
    if (!rows.length) issues.push('행이 없습니다');
    rows.forEach((r, i) => {
      if (!r.대본.trim()) issues.push(`${i + 1}행 대본 누락`);
      if (r.대본.length > ROW_CHARS_FORCE_SPLIT) {
        issues.push(`${i + 1}행 ${r.대본.length}자 (${ROW_CHARS_FORCE_SPLIT}자 초과)`);
      }
    });
    const bad = detectBadBreathCuts(rows);
    if (bad) issues.push(bad);
    return issues;
  }

  function buildConvertRetryHint(issues) {
    return `\n\n[재시도] 이전 변환 문제: ${issues.slice(0, 4).join(' · ')}. 한 호흡 ${ROW_CHARS_TARGET_MIN}~${ROW_CHARS_TARGET_MAX}자·상한 ${ROW_CHARS_HARD_MAX}자. 조사 중간 절단 금지. 긴 문장은 고/서/는데/, 에서 나누세요.`;
  }

  function mergeRowPair(a, b) {
    const script = `${a.대본} ${b.대본}`.replace(/\s+/g, ' ').trim();
    return {
      대본: script,
      장면: a.장면 || b.장면,
      사이즈: a.사이즈 || b.사이즈,
      자막: [a.자막, b.자막].filter(Boolean).join(' · '),
      코멘트: [a.코멘트, b.코멘트].filter(Boolean).join(' · '),
    };
  }

  function findBreathSplitIndex(text, maxLen) {
    const t = String(text || '');
    if (t.length <= maxLen) return -1;
    const window = t.slice(0, maxLen);
    const patterns = [
      /[.?!…]\s*/g,
      /(?:습니다|습니까|세요|네요|군요|죠|다|요)[.?!…]?\s*/g,
      /(?:고|서|며|데|니|지만|는데|니까|다가|면서|거나)\s*/g,
      /[,，、]\s*/g,
      /\s+/g,
    ];
    for (const re of patterns) {
      let last = -1;
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(window)) !== null) {
        const end = m.index + m[0].length;
        if (end >= Math.floor(maxLen * 0.4)) last = end;
      }
      if (last > 0) {
        const head = t.slice(0, last).trim();
        if (!isDanglingFragment(head)) return last;
      }
    }
    return maxLen;
  }

  function forceSplitRow(row, maxLen = ROW_CHARS_HARD_MAX) {
    const text = row.대본;
    if (text.length <= maxLen) return [row];
    const out = [];
    let rest = text;
    while (rest.length > maxLen) {
      const cut = findBreathSplitIndex(rest, maxLen);
      const head = rest.slice(0, cut).trim();
      rest = rest.slice(cut).trim();
      if (head) {
        out.push({
          대본: head,
          장면: out.length ? '컷 유지' : row.장면,
          사이즈: row.사이즈,
          자막: out.length ? '' : row.자막,
          코멘트: out.length ? '' : row.코멘트,
        });
      } else {
        break;
      }
    }
    if (rest) {
      out.push({
        대본: rest,
        장면: out.length ? '컷 유지' : row.장면,
        사이즈: row.사이즈,
        자막: out.length ? '' : row.자막,
        코멘트: out.length ? '' : row.코멘트,
      });
    }
    return out.length ? out : [row];
  }

  /**
   * Merge dangling particle cuts, then split long caption rows at breath pauses.
   */
  function healBreathRows(rows) {
    const list = normalizeRows(rows);
    if (!list.length) return [];
    const merged = [];
    let buf = { ...list[0] };
    for (let i = 1; i < list.length; i++) {
      const next = list[i];
      const dangling = isDanglingFragment(buf.대본);
      const tooShort = buf.대본.length < ROW_CHARS_MIN;
      const mergedLen = `${buf.대본} ${next.대본}`.replace(/\s+/g, ' ').trim().length;
      if ((dangling || tooShort) && mergedLen <= ROW_CHARS_FORCE_SPLIT + 12) {
        buf = mergeRowPair(buf, next);
        continue;
      }
      merged.push(buf);
      buf = { ...next };
    }
    merged.push(buf);

    // Glue residual dangling fragments
    const glued = [];
    for (let i = 0; i < merged.length; i++) {
      let cur = merged[i];
      while (
        i + 1 < merged.length &&
        isDanglingFragment(cur.대본) &&
        `${cur.대본} ${merged[i + 1].대본}`.replace(/\s+/g, ' ').trim().length <= ROW_CHARS_FORCE_SPLIT
      ) {
        i += 1;
        cur = mergeRowPair(cur, merged[i]);
      }
      glued.push(cur);
    }

    // Split rows that would make captions too long
    return glued.flatMap((row) => forceSplitRow(row, ROW_CHARS_HARD_MAX));
  }

  /** @deprecated alias — breath heal */
  function healSentenceRows(rows) {
    return healBreathRows(rows);
  }

  function normalizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => {
        const row = {};
        HEADERS.forEach((h) => {
          row[h] = String(r?.[h] ?? '').trim();
        });
        return row;
      })
      .filter((r) => HEADERS.some((h) => r[h]));
  }

  function parseRowsJson(text) {
    const raw = String(text || '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('JSON 파싱 실패');
    const data = JSON.parse(raw.slice(start, end + 1));
    return normalizeRows(data.rows || data);
  }

  function buildProsePrompt(ctx, chapter, chapterIndex, chapterTotal, options = {}) {
    const includeContext = options.includeContext !== false;
    const adMode = Boolean(options.adMode);
    const title = chapter?.title || '전체';
    const notes = chapter?.notes || '';
    const roleHints = [];
    // Prefer explicit option from runProseDraft (product brief only). Never sniff style-anchor text.
    const detectSource = options.roundupDetectText || `${notes}${title}`;
    const isRoundup =
      typeof options.roundup === 'boolean'
        ? options.roundup
        : window.DIDIDIT_CONFIG?.isRoundupFormat
          ? window.DIDIDIT_CONFIG.isRoundupFormat(detectSource)
          : window.DIDIDIT_PROMPT?.isRoundupFormat?.(detectSource) ?? false;
    if (chapterIndex === 0 || isPrologueChapter(title)) {
      roleHints.push('- 이 챕터에 [오프닝] 고정 멘트 4줄을 자연스럽게 포함하세요.');
    }
    if (chapterIndex === chapterTotal - 1 || isClosingChapter(title)) {
      roleHints.push(
        isRoundup
          ? '- 이 챕터 마지막에 [클로징 — N개 아이템 라운드업]만 포함하세요. 「어떠셨나요?」·「정보를 정리」·「감사합니다!」. 단일(장단점·평점) 멘트 금지. [콘셉트·제품군명]은 주제에 맞게.'
          : '- 이 챕터 마지막에 [클로징 — 단일 제품]만 포함하세요. 「장단점과 평점을 정리해드리며」. 라운드업(어떠셨나요/정보 정리/감사합니다) 멘트 금지.',
      );
    }
    if (adMode) {
      roleHints.push('- **광고 모드**: 단점·한계·아쉬운 점·비추천 표현 금지. 필수 고지만 허용.');
    }
    const roleBlock = roleHints.length ? `\n${roleHints.join('\n')}` : '';
    const roundupCategoryHint =
      isRoundup && window.DIDIDIT_CONFIG?.buildRoundupCategoryHint
        ? window.DIDIDIT_CONFIG.buildRoundupCategoryHint(detectSource)
        : isRoundup && window.DIDIDIT_PROMPT?.buildRoundupCategoryHint
          ? window.DIDIDIT_PROMPT.buildRoundupCategoryHint(detectSource)
          : '';
    const roundup = isRoundup
        ? `\n- **N개 아이템 라운드업**: 제품마다 \`[제품명]\` 단독 행 후 4~8호흡. 심층 리뷰보다 짧고 빠르게.\n${roundupCategoryHint}`
        : '';
    const exclusiveScope =
      '\n- **챕터 범위 고정**: 이 챕터 제목·메모에 적힌 범위만 다룹니다. 다른 챕터에 배정된 소구·시연·편의/공간 설명을 반복하지 마세요.\n';
    // 챕터 유형은 제목 기준으로만 판별 (메모의 '중간투입' 등이 시연으로 오인되지 않게)
    const diffChapter = /차별/.test(title)
        ? `\n- 제품 차별점 챕터: 내솥·칼날 등 **구조·재질·첫인상**만. 투입·가루·건조 시연은 성능 챕터로 넘기세요.\n`
        : '';
    const demoChapter = /시연/.test(title)
        ? `\n- 성능 시연 챕터: 투입→결과(가루)·건조·살균·탈취 체감. UI·세척·모드는 편의 챕터로, 배치·소음은 공간 챕터로 넘기세요.\n`
        : '';
    const convenienceChapter =
      /사용\s*편의|편의성/.test(title) && !/한계/.test(title)
        ? `\n- 사용 편의성 챕터: 디스플레이·세척·모드·중간투입(센서)만. 분쇄 시연·공간 배치를 다시 펼치지 마세요.\n`
        : '';
    const spaceChapter = /공간|설치|라이프/.test(title)
        ? `\n- 공간·설치 챕터: 배치·용량·야간 소음만. 편의 UI·성능 시연 재설명 금지.\n`
        : '';
    const specChapter =
      /제원|스펙/.test(title) || (/성능/.test(title) && !/시연/.test(title))
        ? `\n- 성능·제원 챕터: 스펙을 화면/칩·저장/배터리 등 **덩어리로 묶어** 문장 속에 녹이세요. \`무게는 X, Y는 Z\` 식 나열 금지. 짧은 해석·판단 한 줄 포함.\n`
        : '';
    const designChapter =
      /디자인|외관|첫인상/.test(title) || /디자인|외관/.test(notes)
        ? adMode
          ? `\n- 디자인 챕터: 형태·크기·재질·조작부 중심의 긍정적 체감. 단점·트레이드오프 나열 금지.\n`
          : `\n- 디자인 챕터: 형태·크기·재질·조작부 중심. 실사용 시나리오(빨래·퇴근 후 등) 반복 금지. 외관 vs 실용성 트레이드오프 한 줄.\n`
        : '';
    const limitChapter =
      /한계|단점/.test(title) || /한계|단점/.test(notes)
        ? adMode
          ? `\n- 제목에 한계·단점이 있어도 **광고 모드**에서는 사용 편의·관리 팁만 다루고 단점·한계 서술은 피하세요.\n`
          : `\n- 편의와 함께 한계·아쉬운 점을 왜곡 없이 짧게 다룹니다.\n`
        : '';
    const prologueChapter =
      chapterIndex === 0 || isPrologueChapter(title)
        ? `\n- 프롤로그: \`안녕하세요, 디디딧입니다.\` + \`그럼 바로 리뷰 시작하겠습니다.\` 필수. 기획에 따라 **기본형**(짧은 훅) / **결론 선행형**(타겟·포지션) / **후속·비교형**(이전 제품 대비) 중 선택. 본문 내용 선행 반복 금지.\n`
        : '';
    const priceChapter =
      (/^가격$|가성비/i.test(title.trim()) || /^가격$/i.test(notes.trim())) &&
      !/총평|마무리/i.test(title)
        ? adMode
          ? `\n- 가격 챕터(광고 모드): 가격·구성 안내 중심. 비싸다는 불만·비추천 톤 금지.\n`
          : `\n- 가격 단독 챕터: 모델·채널별 가격, 라인업 비교, 구매 전 주의사항(정발·구성품·기능 제한). 가격이 핵심일 때 타사·다른 라인업 비교.\n`
        : '';
    const closingChapter =
      /총평|마무리|정리/i.test(title) || chapterIndex === chapterTotal - 1
        ? adMode
          ? `\n- 총평(광고 모드): 잘 맞는 사용 장면·추천 대상·구매/보조금 안내 중심. **단점 요약·한계 나열·솔직한 비추천 금지.** 앞 챕터 시연 재방송 금지. \`적극 추천\`·\`확신\` 과잉도 금지.\n`
          : `\n- 총평: 가격 적정성 판단 + 추천 대상 + 앞 챕터 핵심만 한 줄 요약. 새 스펙 장황 나열 금지. \`적극 추천\`·\`확신\` 금지.\n`
        : '';
    const ctxBlock = includeContext && ctx ? `${ctx}\n\n` : '';
    const continuity =
      options.hasSession && chapterIndex > 0
        ? '- 앞 챕터와 **같은 톤·호흡·문장 리듬**을 유지하세요. 이미 쓴 내용·다른 챕터 범위는 반복하지 마세요.\n'
        : '- 이미 작성된 줄글이 있으면 톤·흐름을 맞춰 이어 쓰고, 반복하지 마세요.\n';
    const planWeight =
      '- **내용 우선순위**: 기획안 구성·챕터 메모·필수 장면/소구 > 일반 시스템 프롬프트 관례.\n';

    const heading = proseHeading(chapter);
    const titleLine = heading
      ? `- 챕터 제목은 \`## ${heading}\` 로 시작합니다. (본문에는 제목 행을 다시 쓰지 마세요)`
      : `- 이 챕터는 **인트로**입니다. \`##\` 제목 행을 넣지 마세요. 타이틀 카드 없이 바로 오프닝 멘트로 시작합니다.`;
    const lengthRule =
      chapterIndex === 0 || isPrologueChapter(title)
        ? '- **분량**: 오프닝·인트로는 짧게 (훅 + 고정 오프닝 멘트). 본문 내용 선행 나열 금지.\n'
        : chapterIndex === chapterTotal - 1 || isClosingChapter(title)
          ? '- **분량**: 총평·클로징은 핵심만 압축. 새 스펙 장황 나열 금지.\n'
          : '- **분량**: 본문 챕터는 **상한 없음**. 이 챕터 범위의 필수·서브 소구만 충분히. (이 응답에는 이 챕터만)\n';
    return `${ctxBlock}# 작업: 줄글 대본 작성
- 성우 내레이션 중심의 **자연스러운 줄글**만 작성합니다.
- 표·행 분할·장면·자막·JSON은 넣지 않습니다.
${planWeight}${titleLine}
${lengthRule}${exclusiveScope}${notes ? `- 챕터 메모(범위): ${notes}` : ''}${roleBlock}${roundup}${prologueChapter}${diffChapter}${demoChapter}${convenienceChapter}${spaceChapter}${specChapter}${designChapter}${limitChapter}${priceChapter}${closingChapter}
${continuity}`;
  }

  function buildConvertPrompt(ctx, prose, retryHint) {
    // Slim prompt: full product brief slows convert and is unused for row splitting.
    const productHint = String(ctx || '').trim()
      ? `- 제품·톤 힌트(참고만): ${String(ctx).replace(/\s+/g, ' ').slice(0, 200)}\n`
      : '';
    return `${getNarrationRhythmBlock()}

# 작업: 대본 → 시트(대본 열) 변환
아래 대본을 JSON \`rows\` 배열로 변환하세요.
- **대본 열만** 채우고 장면·사이즈·자막·코멘트는 빈 문자열.
- 대본 내용을 삭제·왜곡하지 말고 **말하기 호흡 단위**로만 나눕니다.
- 목표 ${ROW_CHARS_TARGET_MIN}~${ROW_CHARS_TARGET_MAX}자 / 상한 ${ROW_CHARS_HARD_MAX}자. 긴 문장은 호흡 쉼에서 분할.
${productHint}${retryHint || ''}

## 대본 원문
${prose}`;
  }

  function buildScenePrompt(ctx, rows, options = {}) {
    const scriptOnly = rows.map((r) => r.대본).join('\n');
    const checklist = String(options.shootChecklist || '').trim();
    const allowUnbox =
      options.allowUnboxing === true ||
      /언박싱|택배/.test(`${ctx || ''}\n${checklist}`);
    const checklistBlock = checklist
      ? `\n## 팀 촬영 체크리스트·필수 장면 (장면 열에 반영)\n${checklist}\n`
      : '';
    return `${ctx}
${checklistBlock}
# 작업: 장면·사이즈 추가
대본은 **수정하지 마세요**. 장면·사이즈 열만 채우세요. 자막·코멘트는 빈 문자열.
- 연속 호흡: 장면에 '컷 유지'
- 사이즈: 와이드/미디엄/클로즈업/탑뷰 등
- 체크리스트·필수 장면이 대본에 대응되면 장면 설명에 구체적으로 적으세요. (예: 가루 부어 보이기, 내솥 클로즈업)
- 고가 비교 세팅·작위적 감정 연기 장면 금지
- 언박싱: ${allowUnbox ? '가이드에 있으므로 **허용** (택배 개봉·제품 전경)' : '가이드에 없으면 넣지 마세요'}

## 현재 대본 (행 순서)
${scriptOnly}

JSON rows 전체를 반환 (대본·장면·사이즈·자막·코멘트 키 필수).`;
  }

  function buildCaptionPrompt(ctx, rows) {
    return `${ctx}

# 작업: 자막·코멘트 추가
대본·장면·사이즈는 **수정하지 마세요**. 자막·코멘트만 채우세요.
- 자막: 대본에 수치·스펙이 나올 때만 요약
- 코멘트: 준비물·앱 세팅 등 촬영 메모가 필요할 때만

## 현재 표 (JSON)
${JSON.stringify(rows, null, 0)}

JSON rows 전체를 반환.`;
  }

  function splitProseChunks(prose, maxChars) {
    const text = String(prose || '').trim();
    if (!text || text.length <= maxChars) return [text];
    const parts = [];
    let rest = text;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf('\n\n', maxChars);
      if (cut < maxChars * 0.4) cut = rest.lastIndexOf('\n', maxChars);
      if (cut < maxChars * 0.3) cut = maxChars;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
    return parts.filter(Boolean);
  }

  return {
    HEADERS,
    ROWS_SCHEMA,
    ROW_CHARS_MIN,
    ROW_CHARS_HARD_MAX,
    ROW_CHARS_FORCE_SPLIT,
    normalizeRows,
    parseRowsJson,
    validateScriptRows,
    validateHardIssues,
    healBreathRows,
    healSentenceRows,
    endsCompleteSentence,
    endsBreathUnit,
    isDanglingFragment,
    buildConvertRetryHint,
    buildProsePrompt,
    buildConvertPrompt,
    buildScenePrompt,
    buildCaptionPrompt,
    splitProseChunks,
    isPrologueChapter,
    isClosingChapter,
    proseHeading,
  };
})();

/**
 * Gemini 멀티턴 세션 — 채팅처럼 이전 응답 맥락을 유지해 대본 스타일 수렴
 */
window.DIDIDIT_SESSION = (function () {
  const MAX_TURNS = 24;
  const MAX_CHARS = 96000;

  let turns = [];

  function reset() {
    turns = [];
  }

  function charCount() {
    return turns.reduce((n, t) => n + String(t.parts?.[0]?.text || '').length, 0);
  }

  function trim() {
    while (turns.length > MAX_TURNS || charCount() > MAX_CHARS) {
      if (turns.length <= 2) break;
      turns.shift();
      if (turns[0]?.role === 'model') turns.shift();
    }
  }

  function push(role, text) {
    const body = String(text || '').trim();
    if (!body) return;
    turns.push({ role, parts: [{ text: body }] });
    trim();
  }

  function getContents() {
    return turns.map((t) => ({ role: t.role, parts: t.parts }));
  }

  function hasHistory() {
    return turns.length > 0;
  }

  /** 사용자가 다듬은 줄글을 '승인된 스타일'로 세션에 심기 */
  function seedApprovedProse(prose, preamble) {
    reset();
    if (preamble) push('user', preamble);
    push('model', prose);
  }

  function storageKey(project) {
    return `dididit-session-v1-${String(project || 'default').toLowerCase()}`;
  }

  function save(project) {
    try {
      if (!turns.length) {
        localStorage.removeItem(storageKey(project));
        return;
      }
      localStorage.setItem(
        storageKey(project),
        JSON.stringify({ turns, savedAt: new Date().toISOString() }),
      );
    } catch {
      /* quota */
    }
  }

  function load(project) {
    try {
      const raw = localStorage.getItem(storageKey(project));
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.turns)) return false;
      turns = parsed.turns.filter((t) => t?.role && t?.parts?.[0]?.text);
      return turns.length > 0;
    } catch {
      return false;
    }
  }

  return {
    reset,
    push,
    getContents,
    hasHistory,
    seedApprovedProse,
    charCount,
    turnCount: () => turns.length,
    save,
    load,
  };
})();

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
let SESSION = null;

const state = {
  apiKey: '',
  modelPro: 'gemini-3.1-pro-preview',
  /** 'single' | 'roundup' | 'both' — 줄글 단계에서 클로징 멘트 선택 */
  scriptFormat: 'both',
  /** 광고·협찬 톤 (단점 표현 지양). 프로젝트별로 저장 */
  adMode: true,
  productSpecs: {},
  priceInfo: '',
  categoryId: 'other',
  referenceScripts: [],
  chapters: [],
  proseDraft: '',
  /** @type {{ id: string, savedAt: string, label: string, text: string }[]} */
  proseHistory: [],
  allRows: [],
  pipelineStep: 1,
  sheetOpenUrl: '',
};

/** 진행 중인 AI 작업 취소 */
let jobAbort = null;
let selectedProseHistoryId = null;
const PROSE_HISTORY_MAX = 8;

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
  SESSION = window.DIDIDIT_SESSION;
  if (!PM || !REF || !BRIEF || !PIPE || !SESSION) throw new Error('스크립트 모듈 로드 실패');
}

function getSystemRules(stage) {
  if (stage && PM.getSystemRulesForStage) {
    return PM.getSystemRulesForStage(stage, {
      format: state.scriptFormat || 'both',
      adMode: Boolean(state.adMode),
    });
  }
  return PM?.getActiveSystemRules?.() || '';
}

function getCategories() {
  return window.DIDIDIT_CONFIG?.CATEGORIES || [];
}

function getCategory(id) {
  const cats = getCategories();
  return cats.find((c) => c.id === id) || cats.find((c) => c.id === 'other') || { id: 'other', name: '기타', focusHints: '' };
}

function loadPlanData() {
  const project = getSheetSlug();
  if (!project || project === 'default') return null;
  return window.DdditPlanBriefSync?.loadPlan(project) || null;
}

function formatPlanUpdatedAt(ts) {
  const n = Number(ts) || 0;
  if (!n) return '기본 기획안';
  try {
    return new Date(n).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '저장됨';
  }
}

function renderPlanProjectPicker() {
  const SYNC = window.DdditPlanBriefSync;
  const select = $('#plan-project-select');
  const list = $('#plan-project-list');
  const hint = $('#plan-load-hint');
  if (!SYNC?.listProjects || !select) return;

  const current = getSheetSlug();
  const projects = SYNC.listProjects();
  const previous = select.value;

  select.innerHTML = [
    '<option value="">프로젝트 선택…</option>',
    ...projects.map((p) => {
      const mark = p.hasSaved ? '저장됨' : (p.source === 'default' ? '기본' : '');
      const title = p.title ? ` — ${p.title}` : '';
      const suffix = mark ? ` (${mark})` : '';
      return `<option value="${esc(p.slug)}">${esc(p.label)}${esc(title)}${esc(suffix)}</option>`;
    }),
  ].join('');

  const preferred = projects.some((p) => p.slug === current && current !== 'default')
    ? current
    : (projects.some((p) => p.slug === previous) ? previous : '');
  select.value = preferred;

  if (list) {
    list.innerHTML = projects.map((p) => {
      const active = p.slug === current && current !== 'default';
      const status = p.hasSaved
        ? `로컬 저장 · ${formatPlanUpdatedAt(p.updatedAt)}`
        : (p.hasPlan ? '기본 기획안' : '기획안 없음');
      return `
        <li>
          <button type="button" class="plan-project-item${active ? ' is-active' : ''}" data-plan-project="${esc(p.slug)}">
            <span class="plan-project-item-label">${esc(p.label)}</span>
            <span class="plan-project-item-title">${esc(p.title || '제목 없음')}</span>
            <span class="plan-project-item-meta">${esc(status)}${active ? ' · 현재' : ''}</span>
          </button>
        </li>`;
    }).join('');
  }

  if (hint) {
    if (current && current !== 'default') {
      const active = projects.find((p) => p.slug === current);
      hint.textContent = active?.hasPlan
        ? `${SYNC.projectLabel(current)} 기획안을 사용 중입니다.`
        : `${SYNC.projectLabel(current)}에 저장된 기획안이 없습니다.`;
    } else {
      hint.textContent = '프로젝트를 고른 뒤 「기획안 불러오기」를 누르세요.';
    }
  }
}

function setProjectSlug(slug) {
  const next = String(slug || '').trim().toLowerCase();
  const url = new URL(location.href);
  if (!next || next === 'default') url.searchParams.delete('project');
  else url.searchParams.set('project', next);
  history.replaceState({}, '', url);
}

function switchToProject(slug, options = {}) {
  const next = String(slug || '').trim().toLowerCase();
  if (!next) {
    showToast('프로젝트를 선택하세요.', true);
    return false;
  }
  const current = getSheetSlug();
  if (next === current && !options.forceReload) {
    renderPlanSummary();
    renderChapters();
    updateProjectChrome();
    showToast(`${window.DdditPlanBriefSync?.projectLabel?.(next) || next} 기획안을 확인했습니다.`);
    return true;
  }

  saveProject();
  setProjectSlug(next);
  loadProject();
  // 기획안 구성으로 챕터 제목 QC 강제 적용 (로컬에 긴 제목이 남아 있어도 덮어씀)
  applyChaptersFromPlan({ force: true });
  state.pipelineStep = 1;
  applyBriefToDOM();
  updateProjectChrome();
  updatePipelineUI();
  renderPlanProjectPicker();

  const plan = loadPlanData();
  const label = window.DdditPlanBriefSync?.projectLabel?.(next) || next;
  if (plan?.title) {
    const n = state.chapters.length;
    showToast(n ? `${label} 기획안 · 챕터 ${n}개 짧은 제목 적용` : `${label} 기획안을 불러왔습니다.`);
  } else showToast(`${label}에 기획안이 없습니다. 「기획안 편집」에서 작성하세요.`, true);
  return true;
}

function loadSelectedPlanProject() {
  const slug = $('#plan-project-select')?.value || '';
  switchToProject(slug, { forceReload: true });
}

function chaptersNeedQc(chapters) {
  const QC = window.DdditChapterTitleQc;
  if (!Array.isArray(chapters) || !chapters.length) return true;
  if (!QC) return false;
  if (QC.missingClosingChapter?.(chapters)) return true;
  // 기획안 구성보다 챕터가 적으면(저장본이 잘린 경우) 재적용
  const proposed = chaptersFromPlanStructure(loadPlanData()?.structure);
  if (proposed.length && chapters.length < proposed.length) return true;
  return chapters.some((ch) => {
    const title = String(ch?.title || '');
    if (QC.looksTooLong?.(title)) return true;
    if ((QC.qcIssues?.(ch) || []).length) return true;
    if (ch.sourceTitle && ch.sourceTitle === title && /[（(]/.test(title)) return true;
    return false;
  });
}

/** 저장된 챕터에 총평이 없으면 붙입니다 (기획안 미반영·옛 로컬 데이터 대비). */
function ensureClosingChapterInState() {
  const QC = window.DdditChapterTitleQc;
  if (!QC?.ensureClosingChapter || !state.chapters.length) return false;
  if (!QC.missingClosingChapter?.(state.chapters)) return false;
  state.chapters = QC.ensureClosingChapter(state.chapters);
  renderChapters();
  saveProject();
  return true;
}

function chaptersFromPlanStructure(structure) {
  const SYNC = window.DdditPlanBriefSync;
  if (!structure || !SYNC?.parseStructureToChapters) return [];
  return SYNC.parseStructureToChapters(structure);
}

/** 기획안 구성 → QC된 챕터 제목 적용 */
function applyChaptersFromPlan(options = {}) {
  const plan = loadPlanData();
  const structure = plan?.structure;
  if (!structure) return { ok: false, reason: 'empty' };
  const next = chaptersFromPlanStructure(structure);
  if (!next.length) return { ok: false, reason: 'empty' };
  if (!options.force && state.chapters.length && !chaptersNeedQc(state.chapters)) {
    return { ok: true, skipped: true, chapters: state.chapters };
  }
  state.chapters = next;
  // DOM 동기화 전에 렌더해야 saveProject가 챕터를 지우지 않음
  renderChapters();
  saveProject();
  return { ok: true, chapters: next };
}

function renderChapterQcPreview(chapters) {
  const list = $('#chapter-qc-preview');
  const empty = $('#chapter-qc-empty');
  const panel = $('#chapter-qc-panel');
  if (!list) return;
  const plan = loadPlanData();
  const preview = Array.isArray(chapters) ? chapters : state.chapters;
  if (!preview.length) {
    // 제안 미리보기: 아직 적용 전이면 구성에서 계산한 단축안을 보여 줌
    const proposed = chaptersFromPlanStructure(plan?.structure);
    if (proposed.length) {
      empty?.classList.add('hidden');
      panel?.classList.remove('hidden');
      list.innerHTML = proposed.map((ch) => {
        const noCard = ch.titleCard === false || window.DdditChapterTitleQc?.isIntroTitle?.(ch.title);
        const notes = String(ch.notes || '').trim();
        return `<li>
          <span class="chapter-qc-title">${esc(ch.title)}${noCard ? '<span class="chapter-qc-badge">타이틀 카드 없음</span>' : ''}</span>
          ${notes ? `<span class="chapter-qc-notes">${esc(notes)}</span>` : ''}
        </li>`;
      }).join('');
      return;
    }
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    panel?.classList.toggle('hidden', !plan?.structure);
    return;
  }
  empty?.classList.add('hidden');
  panel?.classList.remove('hidden');
  list.innerHTML = preview.map((ch) => {
    const noCard = ch.titleCard === false || window.DdditChapterTitleQc?.isIntroTitle?.(ch.title);
    const notes = String(ch.notes || '').trim();
    return `<li>
      <span class="chapter-qc-title">${esc(ch.title)}${noCard ? '<span class="chapter-qc-badge">타이틀 카드 없음</span>' : ''}</span>
      ${notes ? `<span class="chapter-qc-notes">${esc(notes)}</span>` : ''}
    </li>`;
  }).join('');
}

function reloadChaptersFromPlanQc(options = {}) {
  const plan = loadPlanData();
  if (!plan?.structure) return showToast('기획안 구성이 없습니다.', true);
  if (
    !options.silent
    && state.chapters.length
    && !chaptersNeedQc(state.chapters)
    && !confirm('현재 챕터 목록을 기획안 구성 기준 짧은 제목으로 바꿀까요?')
  ) {
    return;
  }
  const result = applyChaptersFromPlan({ force: true });
  if (!result.ok) return showToast('구성에서 챕터를 만들 수 없습니다.', true);
  renderChapterQcPreview(state.chapters);
  renderChapters();
  saveProject();
  const count = state.chapters.length;
  if (!options.silent) {
    showToast(`챕터 ${count}개 · 짧은 제목 적용`);
    if (count > 0 && options.goNext !== false) navigatePipeline(2);
  }
}

function renderPlanSummary() {
  const project = getSheetSlug();
  const SYNC = window.DdditPlanBriefSync;
  const container = $('#plan-summary');
  const missing = $('#plan-missing');
  const link = $('#plan-edit-link');

  renderPlanProjectPicker();

  if (link && SYNC) {
    const url = SYNC.planEditUrl(project);
    if (url) link.href = url;
    link.classList.toggle('hidden', !url || project === 'default');
  }

  const plan = loadPlanData();
  if (!plan || !container) {
    container && (container.innerHTML = '');
    missing?.classList.remove('hidden');
    renderChapterQcPreview([]);
    return;
  }
  missing?.classList.add('hidden');

  const rows = [
    ['제목', plan.title],
    ['요약', plan.summary],
    ['콘셉트', plan.concept],
    ['핵심 메시지', plan.keyMessage],
    ['타깃', plan.targetAudience],
    ['톤', plan.tone],
    ['구성', plan.structure],
    ['필수 언급', plan.brandMust],
    ['지양', plan.brandAvoid],
    ['리뷰 가이드', plan.reviewGuide],
    ['촬영 체크리스트', plan.shootChecklist],
  ].filter(([, v]) => String(v || '').trim());

  const envelope = SYNC?.loadPlanEnvelope?.(project);
  const sourceNote = envelope?.source === 'default'
    ? '<p class="hint muted">기본 기획안입니다. 수정 내용은 기획안 페이지에 저장됩니다.</p>'
    : '';

  container.innerHTML = sourceNote + rows.map(([k, v]) => `
    <div class="plan-summary-row">
      <span class="plan-summary-key">${esc(k)}</span>
      <div class="plan-summary-val">${esc(v)}</div>
    </div>`).join('');

  // 기획안 구성 → 챕터: 비어 있거나 긴 제목이면 자동 QC
  if (plan.structure && (!state.chapters.length || chaptersNeedQc(state.chapters))) {
    applyChaptersFromPlan({ force: true });
  }
  renderChapterQcPreview(state.chapters);
  renderGuideCoverageQc();
}

function renderGuideCoverageQc() {
  const panel = $('#guide-qc-panel');
  const list = $('#guide-qc-list');
  const empty = $('#guide-qc-empty');
  const failEl = $('#guide-qc-fail-count');
  if (!panel || !list || !window.DdditBrandGuideQc?.checkCoverage) return;

  const plan = loadPlanData();
  if (!plan) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  const prose = ($('#prose-draft')?.value || state.proseDraft || '').trim();
  const sceneText = (state.allRows || []).map((r) => `${r.대본 || ''} ${r.장면 || ''} ${r.자막 || ''}`).join('\n');
  const report = window.DdditBrandGuideQc.checkCoverage(plan, prose, sceneText);
  const guide = report.guide || {};

  const sections = [
    { title: '제품·제원 (기획안)', items: report.productChecks, note: '기획안 반영 여부' },
    { title: '필수 멘션', items: report.mustMentions },
    { title: '필수 소구', items: report.mustSell },
    { title: '서브 소구', items: report.subSell },
    { title: '필수 장면·촬영', items: report.scenes },
  ];

  const hasAny = sections.some((s) => s.items?.length);
  empty?.classList.toggle('hidden', hasAny);
  if (failEl) failEl.textContent = String(report.summary?.failCount ?? 0);

  const meta = [];
  if (guide.allowUnboxing) meta.push('<li class="guide-qc-meta">언박싱: 가이드 허용 → 장면 단계에서 반영</li>');
  if (guide.productSpecs?.model) meta.push(`<li class="guide-qc-meta">인식 제원: ${esc(Object.entries(guide.productSpecs).map(([k, v]) => `${k}=${v}`).join(' · '))}</li>`);

  list.innerHTML =
    meta.join('') +
    sections
      .filter((s) => s.items?.length)
      .map((sec) => {
        const items = sec.items
          .map((it) => {
            const cls = it.severity === 'fail' ? 'is-fail' : it.severity === 'warn' ? 'is-warn' : 'is-pass';
            const mark = it.ok ? '✓' : it.severity === 'fail' ? '✗' : '·';
            const scope = it.inPlan != null ? (it.inPlan ? '기획안' : '미기재') : prose || sceneText ? '대본' : '대기';
            return `<li class="guide-qc-item ${cls}"><span class="guide-qc-mark">${mark}</span><span class="guide-qc-text">${esc(it.item)}</span><span class="guide-qc-scope">${esc(scope)}</span></li>`;
          })
          .join('');
        return `<li class="guide-qc-group"><strong>${esc(sec.title)}</strong><ul>${items}</ul></li>`;
      })
      .join('');
}

function getEffectiveState() {
  const project = getSheetSlug();
  const plan = loadPlanData();
  const fromPlan = plan && window.DdditPlanBriefSync
    ? window.DdditPlanBriefSync.planToBriefState(plan, project)
    : {};
  const chapters = state.chapters.length ? state.chapters : (fromPlan.chapters || []);
  return {
    ...fromPlan,
    adMode: Boolean(state.adMode),
    productSpecs: state.productSpecs,
    priceInfo: state.priceInfo,
    categoryId: state.categoryId,
    referenceScripts: state.referenceScripts,
    chapters,
  };
}

function hasPlanTitle() {
  const plan = loadPlanData();
  return Boolean(String(plan?.title || '').trim());
}

function buildProductContext() {
  const effective = getEffectiveState();
  const refBlock = REF?.buildReferenceContext?.(state.referenceScripts) || '';
  return BRIEF.buildPromptContext(effective, getCategory(effective.categoryId), refBlock);
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

function setLoading(on, text, options = {}) {
  const el = $('#loading-overlay');
  if (!el) return;
  el.classList.toggle('hidden', !on);
  el.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (text) $('#loading-text').textContent = text;
  const cancelBtn = $('#btn-cancel-job');
  if (cancelBtn) {
    const showCancel = Boolean(on && options.cancellable !== false && jobAbort);
    cancelBtn.classList.toggle('hidden', !showCancel);
    cancelBtn.disabled = !showCancel;
  }
}

function isAbortError(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.aborted) return true;
  return /abort|cancelled|canceled|작성 취소/i.test(String(err.message || ''));
}

function makeAbortError() {
  const e = new Error('작성을 취소했습니다.');
  e.name = 'AbortError';
  e.aborted = true;
  return e;
}

function getJobSignal() {
  return jobAbort?.signal || null;
}

function throwIfCancelled() {
  if (jobAbort?.signal?.aborted) throw makeAbortError();
}

function beginJob() {
  if (jobAbort) {
    try { jobAbort.abort(); } catch { /* ignore */ }
  }
  jobAbort = new AbortController();
  return jobAbort.signal;
}

function cancelJob() {
  if (!jobAbort) {
    showToast('진행 중인 작성이 없습니다.');
    return;
  }
  jobAbort.abort();
  setLoading(true, '취소 중…', { cancellable: false });
}

function endJob() {
  jobAbort = null;
  setLoading(false);
}

function pushProseHistory(text, label) {
  const body = String(text || '').trim();
  if (!body) return null;
  const last = state.proseHistory[0];
  if (last && last.text === body) return last;
  const entry = {
    id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: new Date().toISOString(),
    label: label || '이전 대본',
    text: body,
  };
  state.proseHistory = [entry, ...state.proseHistory].slice(0, PROSE_HISTORY_MAX);
  saveProject();
  return entry;
}

function formatHistoryWhen(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function renderProseHistoryList() {
  const list = $('#prose-history-list');
  const empty = $('#prose-history-empty');
  const preview = $('#prose-history-preview');
  const btnRestore = $('#btn-prose-history-restore');
  const btnDelete = $('#btn-prose-history-delete');
  if (!list) return;

  const items = state.proseHistory || [];
  if (!items.length) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    if (preview) preview.value = '';
    if (btnRestore) btnRestore.disabled = true;
    if (btnDelete) btnDelete.disabled = true;
    selectedProseHistoryId = null;
    return;
  }
  empty?.classList.add('hidden');
  if (!selectedProseHistoryId || !items.some((x) => x.id === selectedProseHistoryId)) {
    selectedProseHistoryId = items[0].id;
  }
  list.innerHTML = items
    .map((item) => {
      const chars = String(item.text || '').length;
      const when = formatHistoryWhen(item.savedAt);
      const active = item.id === selectedProseHistoryId ? ' is-active' : '';
      return `<li>
        <button type="button" class="prose-history-item${active}" data-history-id="${esc(item.id)}">
          <strong>${esc(item.label || '이전 대본')}</strong>
          <span>${esc(when)} · ${chars.toLocaleString('ko-KR')}자</span>
        </button>
      </li>`;
    })
    .join('');

  const selected = items.find((x) => x.id === selectedProseHistoryId);
  if (preview) preview.value = selected?.text || '';
  if (btnRestore) btnRestore.disabled = !selected;
  if (btnDelete) btnDelete.disabled = !selected;
}

function openProseHistoryPanel() {
  renderProseHistoryList();
  openToolModal('#prose-history-panel');
}

function restoreProseHistory(id) {
  const entry = (state.proseHistory || []).find((x) => x.id === id);
  if (!entry) return showToast('버전을 찾을 수 없습니다.', true);
  const current = ($('#prose-draft')?.value || state.proseDraft || '').trim();
  if (current && current !== entry.text) {
    pushProseHistory(current, '복원 전 현재본');
  }
  state.proseDraft = entry.text;
  if ($('#prose-draft')) $('#prose-draft').value = entry.text;
  saveProject();
  $('#btn-convert-sheet')?.toggleAttribute('disabled', !isApiReady() || !state.proseDraft.trim());
  renderGuideCoverageQc();
  closeAllToolModals();
  showToast('이전 대본을 복원했습니다.');
}

function deleteProseHistory(id) {
  state.proseHistory = (state.proseHistory || []).filter((x) => x.id !== id);
  if (selectedProseHistoryId === id) selectedProseHistoryId = state.proseHistory[0]?.id || null;
  saveProject();
  renderProseHistoryList();
  showToast('히스토리에서 삭제했습니다.');
}

function isQuotaOrBillingError(err) {
  const msg = String(err?.message || err || '');
  // Google AI Studio spend limit / billing / hard quota (≠ temporary high demand)
  return /quota.?exceeded|exceed(?:ed|ing).{0,40}quota|billing|spend\s*limit|spending\s*limit|budget|결제|청구|한도|크레딧|insufficient.+fund|payment|consumer.*(suspend|disabled)|RESOURCE_EXHAUSTED.*quota/i.test(
    msg,
  );
}

function isTransientGeminiError(err) {
  if (isQuotaOrBillingError(err)) return false; // 한도는 기다려도 안 풀림 → 재시도·과부하 문구 금지
  const status = Number(err?.apiStatus || err?.status || 0);
  if (status === 429 || status === 503 || status === 502 || status === 504) {
    // 429만으로 과부하 단정하지 않음 — 메시지에 수요/레이트리밋 신호가 있을 때
    if (status === 429) {
      const msg = String(err?.message || err || '');
      return /high demand|try again later|overloaded|rate.?limit|too many requests|temporar(?:y|ily)/i.test(msg)
        || !/quota|billing|spend|budget|한도/i.test(msg);
    }
    return true;
  }
  const msg = String(err?.message || err || '');
  return /high demand|try again later|resource.?exhausted|overloaded|rate.?limit|too many requests|temporar(?:y|ily)|현재.*지연|사용량이 많/i.test(
    msg,
  );
}

function isModelNotFoundError(err) {
  const status = Number(err?.apiStatus || err?.status || 0);
  const msg = String(err?.message || err || '');
  if (status === 404) return true;
  return /not found|is not supported|unknown model|does not exist|유효하지 않은 모델/i.test(msg);
}

function friendlyGeminiError(err) {
  const raw = String(err?.message || err || 'API 오류');
  if (isQuotaOrBillingError(err)) {
    return `API 지출 한도·쿼터에 걸렸습니다. Google AI Studio/Cloud 결제·한도를 확인하세요. (${raw})`;
  }
  if (isModelNotFoundError(err)) {
    return `모델을 사용할 수 없습니다 (${err?.apiModel || 'unknown'}). ${raw}`;
  }
  if (isTransientGeminiError(err)) {
    return `모델 일시 과부하·지연입니다. ${raw}`;
  }
  return raw;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 과부하·429 시 짧은 재시도 (같은 모델) */
async function withGeminiRetry(fn, { retries = 2, label = 'API', signal } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    throwIfCancelled();
    if (signal?.aborted) throw makeAbortError();
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (isAbortError(e) || signal?.aborted || jobAbort?.signal?.aborted) throw makeAbortError();
      if (!isTransientGeminiError(e) || attempt === retries) break;
      const wait = Math.min(12000, 1200 * 2 ** attempt);
      const sec = Math.max(1, Math.round(wait / 1000));
      // 원문 오류를 로그에 남기고, 토스트는 한 줄로만
      reportError(`${label}.retry`, e, { attempt: attempt + 1, wait });
      showToast(`${label} 지연 · ${sec}초 후 재시도 (${attempt + 1}/${retries})`, true);
      await sleepMs(wait);
      if (signal?.aborted || jobAbort?.signal?.aborted) throw makeAbortError();
    }
  }
  const out = new Error(friendlyGeminiError(last));
  out.apiStatus = last?.apiStatus;
  out.apiModel = last?.apiModel;
  out.cause = last;
  throw out;
}

function fastModelCandidates(preferred) {
  const cfg = window.DIDIDIT_CONFIG || {};
  const list = [
    preferred,
    cfg.FAST_GEMINI_MODEL,
    ...(cfg.FAST_GEMINI_FALLBACKS || []),
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
  ].filter(Boolean);
  return [...new Set(list)];
}

function buildFastGenerationConfig({ temperature, json, model }) {
  const config = {
    temperature,
  };
  if (json) {
    config.responseMimeType = 'application/json';
    config.responseSchema = PIPE.ROWS_SCHEMA;
  }
  // 3.x thinking 모델만 budget 0 — Flash-Lite에는 보내지 않음
  if (/gemini-3\.5-flash|gemini-3-flash-preview/i.test(String(model || ''))) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

async function callGeminiTextSession(userPrompt, temperature = 0.75, stage = 'prose') {
  throwIfCancelled();
  SESSION.push('user', userPrompt);
  const model = state.modelPro;
  const signal = getJobSignal();
  const body = {
    systemInstruction: { parts: [{ text: getSystemRules(stage) }] },
    contents: SESSION.getContents(),
    generationConfig: {
      temperature,
      maxOutputTokens: stage === 'prose' ? 8192 : 4096,
    },
  };
  try {
    const text = await withGeminiRetry(() => postGeminiAndExtractText(model, body, signal), {
      retries: 2,
      label: '대본',
      signal,
    });
    throwIfCancelled();
    SESSION.push('model', text);
    return text;
  } catch (e) {
    throw e;
  }
}

async function postGeminiAndExtractText(model, body, signal) {
  let data;
  if (window.DdditWorksApi?.isBackendMode?.()) {
    data = await window.DdditWorksApi.postGemini(model, body, state.apiKey, { signal });
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `API ${res.status}`;
      const e = new Error(msg);
      e.apiStatus = res.status;
      e.apiModel = model;
      throw e;
    }
    data = await res.json();
  }
  const text = extractGeminiText(data);
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'empty';
    const e = new Error(`응답이 비어 있습니다 (${reason})`);
    e.apiModel = model;
    e.apiBody = data;
    throw e;
  }
  return text.trim();
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p && !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
}

async function postGeminiJsonRows(model, body, signal) {
  let data;
  if (window.DdditWorksApi?.isBackendMode?.()) {
    data = await window.DdditWorksApi.postGemini(model, body, state.apiKey, { signal });
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `API ${res.status}`;
      const e = new Error(msg);
      e.apiStatus = res.status;
      e.apiModel = model;
      throw e;
    }
    data = await res.json();
  }
  const text = extractGeminiText(data);
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'empty';
    const e = new Error(`JSON 응답이 비어 있습니다 (${reason})`);
    e.apiModel = model;
    e.apiBody = data;
    throw e;
  }
  return PIPE.parseRowsJson(text);
}

async function callGeminiJson(userPrompt, temperature = 0.4, stage = 'convert') {
  const cfg = window.DIDIDIT_CONFIG || {};
  const preferred = cfg.FAST_GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const models = fastModelCandidates(preferred);
  const signal = getJobSignal();
  const label = stage === 'convert' ? '시트 변환' : stage === 'scene' ? '장면' : '자막';
  const bodyBase = {
    systemInstruction: { parts: [{ text: getSystemRules(stage) }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  };

  let lastErr;
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    throwIfCancelled();
    const body = {
      ...bodyBase,
      generationConfig: buildFastGenerationConfig({ temperature, json: true, model }),
    };
    try {
      return await withGeminiRetry(() => postGeminiJsonRows(model, body, signal), {
        retries: mi === 0 ? 1 : 0,
        label: `${label}`,
        signal,
      });
    } catch (e) {
      lastErr = e;
      if (isAbortError(e)) throw e;
      const canFallback = isTransientGeminiError(e) || isModelNotFoundError(e) || /thinking|빈어|empty|JSON 응답/i.test(String(e.message || ''));
      reportError(`${label}.model`, e, { model, next: models[mi + 1] || null });
      if (!canFallback || mi === models.length - 1) break;
      showToast(`${label}: ${model} 실패 → ${models[mi + 1]} 로 전환`, true);
    }
  }
  const out = new Error(friendlyGeminiError(lastErr));
  out.apiStatus = lastErr?.apiStatus;
  out.apiModel = lastErr?.apiModel;
  out.cause = lastErr;
  throw out;
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: state.apiKey, modelPro: state.modelPro }));
}

function saveProject() {
  try {
    syncSupplementsFromDOM();
    syncChaptersFromDOM();
    state.proseDraft = $('#prose-draft')?.value || state.proseDraft;
    localStorage.setItem(projectStorageKey(), JSON.stringify({
      adMode: Boolean(state.adMode),
      productSpecs: state.productSpecs,
      priceInfo: state.priceInfo,
      categoryId: state.categoryId,
      referenceScripts: state.referenceScripts,
      chapters: state.chapters,
      proseDraft: state.proseDraft,
      proseHistory: state.proseHistory || [],
      pipelineStep: state.pipelineStep,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* quota */ }
}

function defaultAdModeForProject() {
  // 브랜드 기획안이 있는 프로젝트는 광고 모드 기본 ON
  return Boolean(loadPlanData());
}

function loadProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(projectStorageKey()) || '{}');
    state.priceInfo = saved.priceInfo || '';
    state.categoryId = saved.categoryId || 'other';
    state.productSpecs = saved.productSpecs || {};
    state.referenceScripts = saved.referenceScripts || [];
    state.chapters = saved.chapters || [];
    state.proseDraft = saved.proseDraft || '';
    state.proseHistory = Array.isArray(saved.proseHistory) ? saved.proseHistory : [];
    state.pipelineStep = saved.pipelineStep || 1;
    state.adMode = typeof saved.adMode === 'boolean' ? saved.adMode : defaultAdModeForProject();
  } catch { /* ignore */ }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.apiKey) state.apiKey = saved.apiKey;
    if (saved.modelPro) state.modelPro = saved.modelPro;
  } catch { /* ignore */ }
}

function applyBriefToDOM() {
  renderPlanSummary();
  $('#price-info').value = state.priceInfo;
  $('#category').value = state.categoryId;
  $('#prose-draft').value = state.proseDraft || '';
  renderSpecFields();
  renderChapters();
  renderReferenceList();
  syncAdModeUI();
}

function syncAdModeUI() {
  const on = Boolean(state.adMode);
  const check = $('#ad-mode-check');
  if (check) check.checked = on;
  const btn = $('#ad-mode-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('is-on', on);
    btn.classList.toggle('is-off', !on);
    btn.textContent = on ? '광고 ON' : '광고 OFF';
  }
}

function setAdMode(on, options = {}) {
  state.adMode = Boolean(on);
  syncAdModeUI();
  updateProjectChrome();
  if (!options.silent) {
    saveProject();
    showToast(state.adMode ? '광고 모드 ON — 단점·한계 표현 지양' : '광고 모드 OFF — 솔직한 장단점');
  }
}

function syncSupplementsFromDOM() {
  state.priceInfo = $('#price-info')?.value || '';
  state.categoryId = $('#category')?.value || state.categoryId;
}

function syncChaptersFromDOM() {
  const nodes = document.querySelectorAll('#chapter-list .chapter-item');
  // 1단계에서는 챕터 목록이 display:none + 미렌더라 항목이 없음.
  // 빈 DOM으로 state.chapters를 []로 덮어쓰지 않는다.
  if (!nodes.length) return;
  const items = [];
  nodes.forEach((el) => {
    const title = el.querySelector('.chapter-title')?.value.trim();
    const notes = el.querySelector('.chapter-notes')?.value.trim() || '';
    if (!title) return;
    const prev = state.chapters.find((c) => c.id === el.dataset.id);
    const titleCard = window.DdditChapterTitleQc?.isIntroTitle?.(title)
      ? false
      : (prev?.titleCard !== false);
    items.push({
      id: el.dataset.id,
      title,
      notes,
      titleCard,
      sourceTitle: prev?.sourceTitle,
    });
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

function reorderChapters(fromId, toId) {
  const fromIdx = state.chapters.findIndex((c) => c.id === fromId);
  const toIdx = state.chapters.findIndex((c) => c.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
  const next = [...state.chapters];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  state.chapters = next;
  renderChapters();
  saveProject();
}

function bindChapterDragDrop(list) {
  let dragId = null;

  function startChapterDrag(e) {
    if (e.target.closest('.btn-chapter-remove')) {
      e.preventDefault();
      return;
    }
    const item = e.currentTarget.closest('.chapter-item');
    dragId = item?.dataset.id || '';
    if (!dragId) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    item.classList.add('is-dragging');
  }

  function endChapterDrag() {
    dragId = null;
    list.querySelectorAll('.chapter-item').forEach((el) => {
      el.classList.remove('is-dragging', 'is-drag-over');
    });
  }

  list.querySelectorAll('.chapter-item-head').forEach((head) => {
    head.addEventListener('dragstart', startChapterDrag);
    head.addEventListener('dragend', endChapterDrag);
  });

  list.querySelectorAll('.chapter-item').forEach((item) => {
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('is-drag-over');
    });
    item.addEventListener('dragleave', (e) => {
      if (!item.contains(e.relatedTarget)) item.classList.remove('is-drag-over');
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('is-drag-over');
      const fromId = e.dataTransfer.getData('text/plain') || dragId;
      reorderChapters(fromId, item.dataset.id);
    });
  });
}

function renderChapters() {
  const list = $('#chapter-list');
  if (!list) return;
  if (!state.chapters.length) {
    list.innerHTML = '<p class="hint muted">챕터 없이 한 번에 작성하거나, 아래에서 챕터를 추가하세요.</p>';
    return;
  }
  list.innerHTML = state.chapters.map((ch, i) => {
    const issues = window.DdditChapterTitleQc?.qcIssues?.(ch) || [];
    const noCard = ch.titleCard === false || window.DdditChapterTitleQc?.isIntroTitle?.(ch.title);
    const hint = noCard
      ? '<p class="hint muted">인트로 — 영상 타이틀 카드 없음 (더보기 타임라인만)</p>'
      : (issues.length ? `<p class="hint muted">QC: ${esc(issues.join(' · '))}</p>` : '');
    return `
    <div class="chapter-item" data-id="${esc(ch.id)}">
      <div class="chapter-item-head" draggable="true" title="드래그하여 순서 변경">
        <span class="chapter-drag-handle" aria-hidden="true">⋮⋮</span>
        <span class="chapter-item-num">챕터 ${i + 1}${noCard ? ' · 인트로' : ''}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-chapter-remove">삭제</button>
      </div>
      <label class="field">제목<input class="chapter-title" type="text" value="${esc(ch.title)}" /></label>
      ${hint}
      <label class="field">메모<textarea class="chapter-notes" rows="2" placeholder="이 챕터에서 다룰 내용">${esc(ch.notes)}</textarea></label>
    </div>`;
  }).join('');
  list.querySelectorAll('.chapter-item').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('.chapter-title')?.addEventListener('input', (e) => {
      const ch = state.chapters.find((c) => c.id === id);
      if (ch) {
        ch.title = e.target.value;
        if (window.DdditChapterTitleQc?.isIntroTitle?.(ch.title)) ch.titleCard = false;
        else if (ch.titleCard === false) ch.titleCard = true;
      }
      saveProject();
    });
    el.querySelector('.chapter-notes')?.addEventListener('input', (e) => {
      const ch = state.chapters.find((c) => c.id === id);
      if (ch) ch.notes = e.target.value;
      saveProject();
    });
  });
  list.querySelectorAll('.btn-chapter-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.chapter-item')?.dataset.id;
      state.chapters = state.chapters.filter((c) => c.id !== id);
      renderChapters();
      saveProject();
    });
  });
  bindChapterDragDrop(list);
}

function addChapter() {
  const title = $('#new-chapter-title')?.value.trim();
  if (!title) return showToast('챕터 제목을 입력하세요.', true);
  const qc = window.DdditChapterTitleQc?.normalizeChapterSegment?.(title, state.chapters.length);
  state.chapters.push({
    id: `ch-${Date.now()}`,
    title: qc?.title || title,
    notes: ($('#new-chapter-notes')?.value.trim() || '') || (qc?.notes || ''),
    titleCard: qc ? qc.titleCard : true,
    sourceTitle: title,
  });
  $('#new-chapter-title').value = '';
  $('#new-chapter-notes').value = '';
  renderChapterQcPreview(state.chapters);
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
  const labels = ['', '기획안', '대본', '시트 변환', '장면·사이즈', '자막·공유'];
  const hints = [
    '',
    '기획안 확인 후 대본 단계로',
    '챕터 지정 후 AI 생성, 또는 직접 작성',
    '대본을 시트 5열로 변환',
    '장면·사이즈 열 자동 생성',
    '자막·코멘트 추가 후 시트 전송',
  ];
  const effective = getEffectiveState();
  const stage = $('#pipeline-stage-label');
  if (stage) stage.textContent = labels[state.pipelineStep] || '';
  const toolbarHint = $('#toolbar-stage-hint');
  if (toolbarHint) toolbarHint.textContent = hints[state.pipelineStep] || '';
  const productEl = $('#header-product');
  if (productEl) {
    const name = String(effective.productName || '').trim();
    productEl.textContent = name;
    productEl.classList.toggle('hidden', !name);
  }
  $('#btn-pipeline-prev')?.toggleAttribute('disabled', state.pipelineStep <= 1);
  $('#btn-pipeline-next')?.toggleAttribute('disabled', state.pipelineStep >= 5);
  const ready = hasPlanTitle();
  $('#btn-gen-prose')?.toggleAttribute('disabled', !isApiReady() || !ready);
  $('#btn-convert-sheet')?.toggleAttribute('disabled', !isApiReady() || !state.proseDraft.trim());
  $('#btn-add-scenes')?.toggleAttribute('disabled', !isApiReady() || !state.allRows.length);
  $('#btn-add-captions')?.toggleAttribute('disabled', !isApiReady() || !state.allRows.length);
  if (state.pipelineStep === 1) renderPlanSummary();
  updateProjectChrome();
}

async function runProseDraft() {
  if (!requireApiReady()) return;
  if (!hasPlanTitle()) return showToast('기획안에 제목을 입력하세요.', true);
  if (jobAbort) return showToast('이미 작성 중입니다. 취소 후 다시 시도하세요.', true);
  syncSupplementsFromDOM();
  syncChaptersFromDOM();
  ensureClosingChapterInState();
  const effective = getEffectiveState();
  const ctx = buildProductContext();
  const styleAnchor = await PM.getStyleAnchorBlock?.();
  // Detect only from product brief — never from style-anchor (contains "라운드업" docs).
  const isRoundup = Boolean(
    PM.isRoundupFormat ? PM.isRoundupFormat(ctx) : window.DIDIDIT_CONFIG?.isRoundupFormat?.(ctx),
  );
  state.scriptFormat = isRoundup ? 'roundup' : 'single';
  const formatAnchor = isRoundup ? await PM.getFormatAnchorBlock?.() : '';
  const ctxWithStyle = [ctx, styleAnchor, formatAnchor].filter(Boolean).join('\n\n');
  const existingProse = ($('#prose-draft')?.value || state.proseDraft || '').trim();
  const continueFromEdit = existingProse && confirm(
    '기존 대본을 스타일 기준으로 이어 쓸까요?\n\n확인 = 다듬은 톤 유지 · 취소 = 처음부터 새로 생성',
  );
  // confirm에서 취소를 눌러도 null이 아니라 false — 이어쓰기 거절 = 새로 생성.
  // 대화상자 X/ESC는 브라우저에 따라 null → 작업 중단
  if (existingProse && continueFromEdit === null) return;

  if (existingProse) {
    pushProseHistory(
      existingProse,
      continueFromEdit ? '이어쓰기 전' : '재생성 전',
    );
  }

  SESSION.reset();
  if (continueFromEdit) {
    SESSION.seedApprovedProse(
      existingProse,
      `${ctxWithStyle}\n\n[승인된 대본] 작성자가 다듬은 대본입니다. 이 톤·호흡·리듬을 그대로 유지하세요.`,
    );
  }

  beginJob();
  setLoading(true, '대본 초안 작성 중…');
  let prose = continueFromEdit ? existingProse : '';
  try {
    const chapters = state.chapters.length ? state.chapters : [{ title: '전체', notes: effective.contentDirection, titleCard: true }];
    const chapterMarker = (ch) => {
      const heading = PIPE.proseHeading?.(ch) ?? (ch?.titleCard === false ? '' : ch?.title);
      return heading ? `## ${heading}` : null;
    };
    const startIndex = prose
      ? chapters.findIndex((ch) => {
          const marker = chapterMarker(ch);
          if (!marker) {
            // intro: consider done if prose already has opening greeting
            return !/안녕하세요,\s*디디딧입니다/.test(prose);
          }
          return !prose.includes(marker);
        })
      : 0;
    const from = startIndex < 0 ? chapters.length : Math.max(0, startIndex);
    if (from >= chapters.length) {
      showToast('이미 모든 챕터가 작성되어 있습니다.');
      return;
    }

    for (let i = from; i < chapters.length; i++) {
      throwIfCancelled();
      setLoading(true, `대본 작성 중… (${i + 1}/${chapters.length}, 대화 ${SESSION.turnCount()}턴)`);
      const prompt = PIPE.buildProsePrompt(ctxWithStyle, chapters[i], i, chapters.length, {
        includeContext: i === from && !SESSION.hasHistory(),
        hasSession: SESSION.turnCount() > 0,
        roundup: isRoundup,
        roundupDetectText: ctx,
        adMode: Boolean(state.adMode),
      });
      let chunk = await callGeminiTextSession(prompt, 0.72, 'prose');
      const marker = chapterMarker(chapters[i]);
      // model sometimes echoes ## heading — strip duplicate
      if (marker) {
        chunk = String(chunk || '').replace(new RegExp(`^\\s*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?`), '').trim();
        prose = prose ? `${prose}\n\n${marker}\n${chunk}` : `${marker}\n${chunk}`;
      } else {
        chunk = String(chunk || '').replace(/^\s*##\s+.+\n?/, '').trim();
        prose = prose ? `${prose}\n\n${chunk}` : chunk;
      }
      // 중간 진행분도 에디터에 반영 (취소 시 어디까지 썼는지 확인 가능)
      state.proseDraft = prose;
      if ($('#prose-draft')) $('#prose-draft').value = prose;
    }
    state.proseDraft = prose;
    $('#prose-draft').value = prose;
    SESSION.save(getSheetSlug());
    saveProject();
    renderGuideCoverageQc();
    const fail = Number($('#guide-qc-fail-count')?.textContent || 0);
    showToast(
      fail > 0
        ? `대본 완성 · 가이드 미커버 ${fail}항 (1단계 QC 확인)`
        : `대본 완성 (대화 ${SESSION.turnCount()}턴 — 스타일 맥락 유지)`,
    );
    navigatePipeline(3);
  } catch (e) {
    if (isAbortError(e)) {
      // 새로 쓰기 중 취소했고 본문이 거의 없으면 이전본 복원
      if (!continueFromEdit && existingProse && (!prose || prose.length < existingProse.length * 0.3)) {
        state.proseDraft = existingProse;
        if ($('#prose-draft')) $('#prose-draft').value = existingProse;
      } else {
        state.proseDraft = prose;
        if ($('#prose-draft') && prose) $('#prose-draft').value = prose;
      }
      saveProject();
      showToast('대본 생성을 취소했습니다. 「이전 대본」에서 복원할 수 있습니다.');
      return;
    }
    reportError('runProseDraft', e);
    showToast(e.message || '대본 작성 실패', true);
  } finally {
    endJob();
  }
}

async function runConvertToSheet() {
  if (!requireApiReady()) return;
  if (jobAbort) return showToast('이미 작성 중입니다. 취소 후 다시 시도하세요.', true);
  const prose = ($('#prose-draft')?.value || state.proseDraft).trim();
  if (!prose) return showToast('대본 초안이 없습니다.', true);
  state.proseDraft = prose;
  const ctx = buildProductContext();
  beginJob();
  setLoading(true, '시트 변환 중…');
  try {
    const chunks = PIPE.splitProseChunks(prose, 14000);
    let rows = [];
    for (let i = 0; i < chunks.length; i++) {
      throwIfCancelled();
      setLoading(true, `시트 변환 중… (${i + 1}/${chunks.length})`);
      let part = [];
      let retryHint = '';
      // At most 2 API attempts; heal locally instead of soft-issue retries.
      for (let attempt = 0; attempt < 2; attempt++) {
        throwIfCancelled();
        part = await callGeminiJson(
          PIPE.buildConvertPrompt(ctx, chunks[i], retryHint),
          attempt > 0 ? 0.2 : 0.3,
          'convert',
        );
        part = PIPE.healBreathRows ? PIPE.healBreathRows(part) : PIPE.healSentenceRows(part);
        const hard = PIPE.validateHardIssues(part);
        if (!hard.length) break;
        retryHint = PIPE.buildConvertRetryHint(hard);
        if (attempt === 1) {
          reportError('runConvertToSheet.validate', new Error(hard.join('; ')), { chunk: i + 1 });
        }
      }
      part = PIPE.healBreathRows ? PIPE.healBreathRows(part) : PIPE.healSentenceRows(part);
      rows = rows.concat(part);
    }
    state.allRows = PIPE.normalizeRows(rows);
    renderTable();
    saveProject();
    showToast(`${state.allRows.length}행으로 변환했습니다.`);
    navigatePipeline(4);
  } catch (e) {
    if (isAbortError(e)) {
      showToast('시트 변환을 취소했습니다.');
      return;
    }
    reportError('runConvertToSheet', e, {
      cause: e?.cause?.message || null,
      model: e?.apiModel || e?.cause?.apiModel || null,
      status: e?.apiStatus || e?.cause?.apiStatus || null,
    });
    showToast(e.message || '시트 변환 실패', true);
  } finally {
    endJob();
  }
}

async function runAddScenes() {
  if (!requireApiReady() || !state.allRows.length) return;
  if (jobAbort) return showToast('이미 작성 중입니다. 취소 후 다시 시도하세요.', true);
  beginJob();
  setLoading(true, '장면·사이즈 추가 중…');
  try {
    const plan = loadPlanData();
    const guide = window.DdditBrandGuideQc?.extractFromPlan?.(plan) || {};
    const sceneOpts = {
      shootChecklist: plan?.shootChecklist || (guide.mustScenes || []).map((s) => `□ ${s}`).join('\n'),
      allowUnboxing: Boolean(guide.allowUnboxing),
    };
    state.allRows = await callGeminiJson(
      PIPE.buildScenePrompt(buildProductContext(), state.allRows, sceneOpts),
      0.4,
      'scene',
    );
    renderTable();
    renderGuideCoverageQc();
    const miss = ($('#guide-qc-fail-count')?.textContent || '').trim();
    showToast(miss && miss !== '0' ? `장면 반영 · 가이드 미커버 ${miss}항 확인` : '장면·사이즈를 반영했습니다.');
    navigatePipeline(5);
  } catch (e) {
    if (isAbortError(e)) {
      showToast('장면 생성을 취소했습니다.');
      return;
    }
    reportError('runAddScenes', e);
    showToast(e.message || '장면 추가 실패', true);
  } finally {
    endJob();
  }
}

async function runAddCaptions() {
  if (!requireApiReady() || !state.allRows.length) return;
  if (jobAbort) return showToast('이미 작성 중입니다. 취소 후 다시 시도하세요.', true);
  beginJob();
  setLoading(true, '자막·코멘트 추가 중…');
  try {
    state.allRows = await callGeminiJson(PIPE.buildCaptionPrompt(buildProductContext(), state.allRows), 0.4, 'caption');
    renderTable();
    showToast('자막·코멘트를 반영했습니다.');
  } catch (e) {
    if (isAbortError(e)) {
      showToast('자막 생성을 취소했습니다.');
      return;
    }
    reportError('runAddCaptions', e);
    showToast(e.message || '자막 추가 실패', true);
  } finally {
    endJob();
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

function reportError(tag, err, extra) {
  const kind = isQuotaOrBillingError(err)
    ? 'quota_billing'
    : isTransientGeminiError(err)
      ? 'transient_overload'
      : isModelNotFoundError(err)
        ? 'model_not_found'
        : 'other';
  const meta = { ...(extra && typeof extra === 'object' ? extra : {}), kind, apiStatus: err?.apiStatus, apiModel: err?.apiModel };
  if (meta) {
    const wrapped = new Error(`${err?.message || err} | ${JSON.stringify(meta)}`);
    wrapped.cause = err;
    wrapped.apiStatus = err?.apiStatus;
    wrapped.apiModel = err?.apiModel;
    LOG?.log(tag, wrapped, meta);
    return;
  }
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

function updateProjectChrome() {
  const project = getSheetSlug();
  const badge = $('#workspace-project-badge');
  if (badge) {
    if (project && project !== 'default') {
      badge.textContent = window.DdditPlanBriefSync?.projectLabel?.(project) || project;
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  }
  syncAdModeUI();
}

async function initSheetIntegration() {
  const project = getSheetSlug();
  try {
    const store = JSON.parse(localStorage.getItem(SHEET_SETTINGS_KEY) || '{}');
    const savedUrl = store.projects?.[project]?.url;
    if (savedUrl) rememberSheetUrl(project, savedUrl);
  } catch { /* ignore */ }
  if (window.DdditWorksApi?.isBackendMode?.()) {
    $('#backend-settings-note')?.removeAttribute('hidden');
    await window.DdditWorksApi.loadConfig().catch(() => null);
  }
  updateProjectChrome();
}

function renderReferenceList() {
  const list = $('#ref-file-list');
  if (!list) return;
  list.innerHTML = state.referenceScripts.length
    ? state.referenceScripts.map((s) => `<li>${esc(s.name)} (${s.text.length}자)</li>`).join('')
    : '<li class="muted">없음</li>';
  $('#ref-stats').textContent = `${state.referenceScripts.length}개`;
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

const TOOL_MODALS = [
  { panel: '#error-log-panel', btn: '#toggle-error-log' },
  { panel: '#settings-panel', btn: '#toggle-settings' },
  { panel: '#prompt-panel', btn: '#toggle-prompt' },
  { panel: '#prose-history-panel', btn: '#btn-prose-history' },
];

function syncToolModalChrome() {
  const anyOpen = TOOL_MODALS.some(({ panel }) => {
    const el = $(panel);
    return el && !el.classList.contains('collapsed');
  });
  document.body.classList.toggle('tool-modal-open', anyOpen);
  TOOL_MODALS.forEach(({ panel, btn }) => {
    const el = $(panel);
    const open = Boolean(el && !el.classList.contains('collapsed'));
    $(btn)?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (el) {
      el.hidden = !open;
      el.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
  });
}

function closeAllToolModals() {
  TOOL_MODALS.forEach(({ panel }) => $(panel)?.classList.add('collapsed'));
  syncToolModalChrome();
}

function openToolModal(panelSel) {
  TOOL_MODALS.forEach(({ panel }) => {
    const el = $(panel);
    if (!el) return;
    el.classList.toggle('collapsed', panel !== panelSel);
  });
  syncToolModalChrome();
}

function togglePanel(panelSel) {
  const panel = $(panelSel);
  if (!panel) return;
  const isOpen = !panel.classList.contains('collapsed');
  if (isOpen) closeAllToolModals();
  else openToolModal(panelSel);
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

function bindDrawerPanels() {
  $('#toggle-settings')?.addEventListener('click', () => togglePanel('#settings-panel'));
  $('#toggle-prompt')?.addEventListener('click', () => togglePanel('#prompt-panel'));
  $('#toggle-error-log')?.addEventListener('click', () => togglePanel('#error-log-panel'));
  document.querySelectorAll('[data-close-tool-modal]').forEach((el) => {
    el.addEventListener('click', closeAllToolModals);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (jobAbort && !$('#loading-overlay')?.classList.contains('hidden')) {
      e.preventDefault();
      cancelJob();
      return;
    }
    if (document.body.classList.contains('tool-modal-open')) {
      closeAllToolModals();
    }
  });
  syncToolModalChrome();
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
  $('#btn-prompt-export')?.addEventListener('click', () => {
    const text = $('#prompt-editor')?.value || '';
    if (!text.trim()) return showToast('프롬프트 내용이 비어 있습니다.', true);
    const filename = $('#prompt-filename')?.value || `dididit-prompt-v${PM.PROMPT_VERSION}.txt`;
    PM?.downloadPromptTxt?.(text, filename);
  });
  $('#prompt-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      $('#prompt-editor').value = text;
      $('#prompt-filename').value = file.name;
      showToast(`${file.name} 불러옴 — [적용]으로 반영하세요.`);
    } catch (err) {
      showToast(err.message || '파일 읽기 실패', true);
    }
    e.target.value = '';
  });
}

function renderCategoryOptions() {
  const sel = $('#category');
  const cats = getCategories();
  if (!sel || !cats.length) return;
  sel.innerHTML = cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  sel.value = cats.some((c) => c.id === state.categoryId) ? state.categoryId : 'other';
}

function bindEvents() {
  document.querySelectorAll('.step-rail-item').forEach((btn) => {
    btn.addEventListener('click', () => navigatePipeline(Number(btn.dataset.rail)));
  });
  $('#btn-pipeline-prev')?.addEventListener('click', () => navigatePipeline(state.pipelineStep - 1));
  $('#btn-pipeline-next')?.addEventListener('click', () => navigatePipeline(state.pipelineStep + 1));
  $('#btn-gen-prose')?.addEventListener('click', runProseDraft);
  $('#btn-prose-history')?.addEventListener('click', () => openProseHistoryPanel());
  $('#btn-cancel-job')?.addEventListener('click', () => cancelJob());
  $('#prose-history-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-history-id]');
    if (!btn) return;
    selectedProseHistoryId = btn.getAttribute('data-history-id');
    renderProseHistoryList();
  });
  $('#btn-prose-history-restore')?.addEventListener('click', () => {
    if (selectedProseHistoryId) restoreProseHistory(selectedProseHistoryId);
  });
  $('#btn-prose-history-delete')?.addEventListener('click', () => {
    if (!selectedProseHistoryId) return;
    if (!confirm('이 히스토리 버전을 삭제할까요?')) return;
    deleteProseHistory(selectedProseHistoryId);
  });
  $('#btn-convert-sheet')?.addEventListener('click', runConvertToSheet);
  $('#btn-add-scenes')?.addEventListener('click', runAddScenes);
  $('#btn-add-captions')?.addEventListener('click', runAddCaptions);
  $('#btn-add-chapter')?.addEventListener('click', addChapter);
  $('#btn-chapter-qc')?.addEventListener('click', () => reloadChaptersFromPlanQc());
  $('#btn-chapter-qc-step2')?.addEventListener('click', () => reloadChaptersFromPlanQc());
  $('#btn-guide-qc-refresh')?.addEventListener('click', () => {
    renderGuideCoverageQc();
    showToast('가이드 QC를 갱신했습니다.');
  });
  $('#btn-sheet-push')?.addEventListener('click', pushToSheet);
  $('#btn-sheet-pull')?.addEventListener('click', pullFromSheet);
  $('#btn-pipeline-next-brief')?.addEventListener('click', () => navigatePipeline(2));
  $('#btn-plan-load')?.addEventListener('click', loadSelectedPlanProject);
  $('#ad-mode-check')?.addEventListener('change', (e) => setAdMode(e.target.checked));
  $('#ad-mode-toggle')?.addEventListener('click', () => setAdMode(!state.adMode));
  $('#plan-project-select')?.addEventListener('change', () => {
    const slug = $('#plan-project-select')?.value || '';
    if (slug) switchToProject(slug);
  });
  $('#plan-project-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-plan-project]');
    if (!btn) return;
    const slug = btn.getAttribute('data-plan-project') || '';
    const select = $('#plan-project-select');
    if (select && slug) select.value = slug;
    switchToProject(slug);
  });
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => navigatePipeline(Number(btn.dataset.goto)));
  });
  $('#btn-sheet-open')?.addEventListener('click', openSheetUrl);
  $('#prose-draft')?.addEventListener('input', (e) => {
    state.proseDraft = e.target.value;
    saveProject();
    updatePipelineUI();
    clearTimeout(renderGuideCoverageQc._t);
    renderGuideCoverageQc._t = setTimeout(() => renderGuideCoverageQc(), 400);
  });
  $('#price-info')?.addEventListener('input', (e) => { state.priceInfo = e.target.value; saveProject(); });
  $('#category')?.addEventListener('change', (e) => { state.categoryId = e.target.value; renderSpecFields(); saveProject(); });
  $('#api-key')?.addEventListener('input', (e) => { state.apiKey = e.target.value.trim(); saveSettings(); updatePipelineUI(); });
  $('#model-pro')?.addEventListener('change', (e) => { state.modelPro = e.target.value; saveSettings(); });
  $('#btn-ref-add-paste')?.addEventListener('click', addReferenceFromPaste);
  $('#ref-file-input')?.addEventListener('change', (e) => addReferenceFiles(e.target.files));
  $('#btn-ref-clear')?.addEventListener('click', clearReferences);
  bindDrawerPanels();
}

function openSheetUrl() {
  if (state.sheetOpenUrl) window.open(state.sheetOpenUrl, '_blank');
  else showToast('시트 URL이 없습니다. 먼저 시트로 보내기를 실행하세요.', true);
}

async function initPromptOnBoot() {
  const src = String(PM.getActivePromptSource?.() || '');
  if (!PM.loadPromptState()?.text) await PM.loadDefaultPromptFile();
  else if (/v1\.0\.0|v1\.1\.0/.test(src)) {
    await PM.loadDefaultPromptFile();
    showToast('프롬프트 v1.1.1로 갱신했습니다. (기획안 우선·챕터 중복 금지)');
  }
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
    ensureClosingChapterInState();
    // 기획안 대비 챕터가 부족·긴 제목이면 구성 기준으로 맞춤 (2단계 진입 시에도)
    if (loadPlanData()?.structure && chaptersNeedQc(state.chapters)) {
      applyChaptersFromPlan({ force: true });
    }
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
      openToolModal('#settings-panel');
    }
  } catch (e) {
    $('#boot-error')?.classList.remove('hidden');
    $('#boot-error').textContent = `초기화 오류: ${e.message}`;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
