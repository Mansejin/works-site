/** 프롬프트 — txt 파일 기반 관리 (단계별 시스템 규칙 분리) */
(function () {
  const PROMPT_VERSION = '1.1.0';
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
- 스펙·수치는 문장 속에 자연스럽게 녹이고, 나열형 낭독은 피합니다.
- 브리프·기획안의 mustHighlight는 빠뜨리지 말고, carefulPoints는 솔직히 다룹니다.
- 첫 챕터(프롤로그)에는 [오프닝] 고정 멘트를 포함합니다.
- 마지막 챕터: **단일 제품**은 [클로징—단일], **N개 아이템 라운드업**은 [클로징—라운드업] 고정 멘트.
- 출력: 마크다운·JSON·표 없이 줄글 본문만`,

    convert: `# 현재 작업 단계: 줄글 → 대본 열 변환 (최우선)
- 줄글을 JSON \`rows\` 배열로 변환합니다. **대본 열만** 채우고 장면·사이즈·자막·코멘트는 빈 문자열.
- 1행 = 성우 한 호흡. 행당 공백 포함 **25~45자** (50자 초과 금지).
- 마침표마다 무조건 분리 X. 호흡이 바뀔 때 새 행. 15자 내외 초단문 연속 나열 금지.
- 대본에 제품을 '이 녀석'이라 지칭하지 말 것.
- 출력: 유효한 JSON만. {"rows":[{"대본":"...","장면":"","사이즈":"","자막":"","코멘트":""}]}`,

    scene: `# 현재 작업 단계: 장면·사이즈 추가 (최우선)
- 대본 열은 **한 글자도 수정하지 않습니다**.
- 장면: 모델 행동·카메라 구도. 연속 호흡은 '컷 유지'.
- 사이즈: 와이드/미디엄/클로즈업/탑뷰 등.
- 자막·코멘트는 빈 문자열 유지.
- 언박싱·고가 비교 세팅·작위적 감정 연기 장면 금지.
- 출력: JSON rows 전체`,

    caption: `# 현재 작업 단계: 자막·코멘트 추가 (최우선)
- 대본·장면·사이즈는 **수정하지 않습니다**.
- 자막: 대본에 수치·스펙이 나올 때만 요약 (예: "무게 406g").
- 코멘트: 준비물·앱 세팅 등 촬영 메모가 필요할 때만.
- 출력: JSON rows 전체`,
  };

  function buildBaseSystemRules() {
    return `# 디디딧 시스템 프롬프트 (기본)

## 역할·톤
Role: IT 리뷰 채널 '디디딧' 메인 작가
Target Audience: 퇴근 후 혼자만의 시간을 즐기는 1인 가구 직장인
Content Format: 모델 실사용 연기(화면) + 성우 내레이션(음성)
Tone & Manner: 솔직 담백, 과장 없는 팩트, 실생활 밀착형 공감 화법

## 콘텐츠 원칙
- 스펙·기능 설명 시 기본 구성품과 별매품을 구분합니다.
- 제품 지칭: '이 녀석' 사용 금지.
- 사실 왜곡·허위 장점 금지. 리뷰 가이드·브리프 우선 반영.
- 진행자 등장 배제. 모델의 담백한 행동 묘사 중심.

## 촬영 제약
- 렌탈 스튜디오·최소 장비 기준. 고가 비교 제품 세팅 배제.
- 언박싱 장면 금지 (촬영 불가).
- 복잡한 더미 세팅 대신 웹서핑·게임 등 직관적 화면.
- 작위적·어색한 감정 연기 지양.

## 참고 대본 (제공 시)
- 팩트 체크·누락 파악용. 문장·표현 복사 금지, 디디딧 톤으로 재작성.

## 고정 멘트
[오프닝 — 프롤로그·첫 챕터에만]
${MANDATORY_OPENING.map((l) => `- ${l}`).join('\n')}

[클로징 — 단일 제품 · 총평·마지막 챕터]
${MANDATORY_CLOSING.map((l) => `- ${l}`).join('\n')}

[클로징 — N개 아이템 라운드업 · 마지막]
${MANDATORY_CLOSING_ROUNDUP.map((l) => `- ${l}`).join('\n')}

## 파이프라인 안내
줄글 → 대본 분할 → 장면·사이즈 → 자막·코멘트 순으로 작성합니다.
**행 분할·JSON·표 형식 규칙은 요청 메시지 상단의 [현재 작업 단계] 지침만 따릅니다.**`;
  }

  /** 하위 호환: 편집기·내장값 표시용 */
  function buildDefaultSystemRules() {
    return buildBaseSystemRules();
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

  function getActiveSystemRules() {
    const saved = loadPromptState();
    if (saved.text) return saved.text;
    return buildBaseSystemRules();
  }

  /**
   * API 호출용 — 기본 프롬프트 + 단계 규칙.
   * 커스텀 프롬프트를 쓰더라도 단계 규칙이 최우선으로 앞에 붙어 패러독스를 방지합니다.
   */
  function getSystemRulesForStage(stage) {
    const stageBlock = STAGE_RULES[stage];
    if (!stageBlock) return getActiveSystemRules();
    return `${stageBlock}\n\n---\n\n${getActiveSystemRules()}`;
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
        if (e.meta.model) metaBits.push(`모델: ${esc(e.meta.model)}`);
        if (e.meta.part) metaBits.push(`파트: ${esc(e.meta.part)}`);
        if (e.meta.status) metaBits.push(`HTTP ${esc(e.meta.status)}`);
        const metaHtml = metaBits.length
          ? `<div class="error-log-meta">${metaBits.join(' · ')}</div>`
          : '';
        const stackHtml = e.stack
          ? `<details class="error-log-stack"><summary>스택</summary><pre>${esc(e.stack)}</pre></details>`
          : '';
        return `<li class="error-log-item">
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

  function buildPromptContext(state, category, refBlock) {
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
${briefBlock}${refBlock ? `\n${refBlock}` : ''}`.trim();
  }

  window.DIDIDIT_BRIEF = {
    getSpecFields,
    emptySpecsForCategory,
    emptyReviewBrief,
    formatSpecsBlock,
    formatReviewBriefBlock,
    buildPromptContext,
  };
})();

/**
 * 시나리오 파이프라인 — 줄글 초안 → 5열 시트 변환 (단계별)
 */
window.DIDIDIT_PIPELINE = (function () {
  const HEADERS = ['대본', '장면', '사이즈', '자막', '코멘트'];

  const ROW_CHARS_MIN = 20;
  const ROW_CHARS_TARGET_MAX = 45;
  const ROW_CHARS_HARD_MAX = 50;

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
    return /프롤로그|오프닝/i.test(title || '');
  }

  function isClosingChapter(title) {
    return /총평|클로징|마무리/i.test(title || '');
  }

  function getNarrationRhythmBlock() {
    return `
# 대본 호흡·행 분할 (변환 단계 필수)
- 1행 = 성우 한 호흡. 행당 공백 포함 **25~45자** (50자 초과 금지).
- 호흡이 바뀔 때 새 행. 마침표마다 무조건 분리 X.
- 15자 내외 초단문만 연속 나열 금지. 여러 문장을 한 행에 합치기 금지.
- 좋은 예: 3문장을 호흡 단위로 3행 분할
- 나쁜 예: 3문장을 1행에 합침 / 10자짜리 행만 10개 연속`;
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
    const longRows = rows.filter((r) => r.대본.length > ROW_CHARS_HARD_MAX);
    if (longRows.length) {
      return `${longRows.length}행이 ${ROW_CHARS_HARD_MAX}자 초과 — 호흡마다 분할 필요`;
    }
    const avg = rows.reduce((s, r) => s + r.대본.length, 0) / rows.length;
    if (avg > 48) return `평균 ${Math.round(avg)}자/행 — 장문 합침`;
    return null;
  }

  function validateScriptRows(rows) {
    const issues = [];
    if (!rows.length) issues.push('행이 없습니다');
    rows.forEach((r, i) => {
      if (!r.대본.trim()) issues.push(`${i + 1}행 대본 누락`);
      const len = r.대본.length;
      if (len > ROW_CHARS_HARD_MAX) issues.push(`${i + 1}행 ${len}자 (50자 초과)`);
      else if (len < ROW_CHARS_MIN && rows.length >= 6) issues.push(`${i + 1}행 ${len}자 (너무 짧음)`);
    });
    const choppy = detectChoppyRhythm(rows);
    if (choppy) issues.push(choppy);
    const overlong = detectOverlongRows(rows);
    if (overlong) issues.push(overlong);
    return issues;
  }

  function buildConvertRetryHint(issues) {
    return `\n\n[재시도] 이전 변환 문제: ${issues.slice(0, 4).join(' · ')}. 호흡마다 행 분할, 행당 25~45자, 50자 초과 금지.`;
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
    const title = chapter?.title || '전체';
    const notes = chapter?.notes || '';
    const roleHints = [];
    const roundupCtx = `${ctx || ''}${notes}${title}`;
    const isRoundup =
      options.roundup ||
      (window.DIDIDIT_CONFIG?.isRoundupFormat
        ? window.DIDIDIT_CONFIG.isRoundupFormat(roundupCtx)
        : window.DIDIDIT_PROMPT?.isRoundupFormat?.(roundupCtx) ?? false);
    if (chapterIndex === 0 || isPrologueChapter(title)) {
      roleHints.push('- 이 챕터에 [오프닝] 고정 멘트 4줄을 자연스럽게 포함하세요.');
    }
    if (chapterIndex === chapterTotal - 1 || isClosingChapter(title)) {
      roleHints.push(
        isRoundup
          ? '- 이 챕터 마지막에 [클로징 — N개 아이템] 고정 멘트를 포함하세요. 첫 줄의 [콘셉트·제품군명]은 영상 주제에 맞게 채웁니다. (장단점·평점 아님 → 정보 정리)'
          : '- 이 챕터 마지막에 [클로징 — 단일 제품] 고정 멘트를 포함하세요. (장단점·평점 정리)',
      );
    }
    const roleBlock = roleHints.length ? `\n${roleHints.join('\n')}` : '';
    const roundupCategoryHint =
      isRoundup && window.DIDIDIT_CONFIG?.buildRoundupCategoryHint
        ? window.DIDIDIT_CONFIG.buildRoundupCategoryHint(roundupCtx)
        : isRoundup && window.DIDIDIT_PROMPT?.buildRoundupCategoryHint
          ? window.DIDIDIT_PROMPT.buildRoundupCategoryHint(roundupCtx)
          : '';
    const roundup = isRoundup
        ? `\n- **N개 아이템 라운드업**: 제품마다 \`[제품명]\` 단독 행 후 4~8호흡. 심층 리뷰보다 짧고 빠르게.\n${roundupCategoryHint}`
        : '';
    const specChapter =
      /성능|제원|스펙|디스플레이/i.test(title) || /성능|제원|스펙/i.test(notes)
        ? `\n- 성능·제원 챕터: 스펙을 화면/칩·저장/배터리 등 **덩어리로 묶어** 문장 속에 녹이세요. \`무게는 X, Y는 Z\` 식 나열 금지. 짧은 해석·판단 한 줄 포함.\n`
        : '';
    const designChapter =
      /디자인|외관|첫인상/i.test(title) || /디자인|외관/i.test(notes)
        ? `\n- 디자인 챕터: 형태·크기·재질·조작부 중심. 실사용 시나리오(빨래·퇴근 후 등) 반복 금지. 외관 vs 실용성 트레이드오프 한 줄.\n`
        : '';
    const prologueChapter =
      chapterIndex === 0 || isPrologueChapter(title)
        ? `\n- 프롤로그: \`안녕하세요, 디디딧입니다.\` + \`그럼 바로 리뷰 시작하겠습니다.\` 필수. 기획에 따라 **기본형**(짧은 훅) / **결론 선행형**(타겟·포지션) / **후속·비교형**(이전 제품 대비) 중 선택. 본문 내용 선행 반복 금지.\n`
        : '';
    const priceChapter =
      (/^가격$|가성비/i.test(title.trim()) || /^가격$/i.test(notes.trim())) &&
      !/총평|마무리/i.test(title)
        ? `\n- 가격 단독 챕터: 모델·채널별 가격, 라인업 비교, 구매 전 주의사항(정발·구성품·기능 제한). 가격이 핵심일 때 타사·다른 라인업 비교.\n`
        : '';
    const closingChapter =
      /총평|마무리|정리/i.test(title) || chapterIndex === chapterTotal - 1
        ? `\n- 총평: 가격 적정성 판단 + 추천 대상 + 앞 챕터 단점 요약. 가격 중점이 낮으면 가격을 총평에 엮음. 가격이 핵심이면 타사·라인업 비교·솔직한 비추천 포함. \`적극 추천\`·\`확신\` 금지.\n`
        : '';
    const ctxBlock = includeContext && ctx ? `${ctx}\n\n` : '';
    const continuity =
      options.hasSession && chapterIndex > 0
        ? '- 앞 챕터와 **같은 톤·호흡·문장 리듬**을 유지하세요. 이미 쓴 내용은 반복하지 마세요.\n'
        : '- 이미 작성된 줄글이 있으면 톤·흐름을 맞춰 이어 쓰고, 반복하지 마세요.\n';

    return `${ctxBlock}# 작업: 줄글 대본 작성
- 성우 내레이션 중심의 **자연스러운 줄글**만 작성합니다.
- 표·행 분할·장면·자막·JSON은 넣지 않습니다.
- 챕터 제목은 \`## ${title}\` 로 시작합니다.
${notes ? `- 챕터 메모: ${notes}` : ''}${roleBlock}${roundup}${prologueChapter}${specChapter}${designChapter}${priceChapter}${closingChapter}
${continuity}`;
  }

  function buildConvertPrompt(ctx, prose, retryHint) {
    return `${ctx}
${getNarrationRhythmBlock()}

# 작업: 줄글 → 대본 열 변환
아래 줄글을 JSON \`rows\` 배열로 변환하세요.
- **대본 열만** 채우고 장면·사이즈·자막·코멘트는 빈 문자열.
- 줄글 문장을 삭제·왜곡하지 말고 호흡 단위로만 나눕니다.
${retryHint || ''}

## 줄글 원문
${prose}`;
  }

  function buildScenePrompt(ctx, rows) {
    const scriptOnly = rows.map((r) => r.대본).join('\n');
    return `${ctx}

# 작업: 장면·사이즈 추가
대본은 **수정하지 마세요**. 장면·사이즈 열만 채우세요. 자막·코멘트는 빈 문자열.
- 연속 호흡: 장면에 '컷 유지'
- 사이즈: 와이드/미디엄/클로즈업/탑뷰 등
- 언박싱·고가 비교 세팅·작위적 감정 연기 장면 금지

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
    normalizeRows,
    parseRowsJson,
    validateScriptRows,
    buildConvertRetryHint,
    buildProsePrompt,
    buildConvertPrompt,
    buildScenePrompt,
    buildCaptionPrompt,
    splitProseChunks,
    isPrologueChapter,
    isClosingChapter,
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
  productSpecs: {},
  priceInfo: '',
  categoryId: 'other',
  referenceScripts: [],
  chapters: [],
  proseDraft: '',
  allRows: [],
  pipelineStep: 1,
  sheetOpenUrl: '',
};

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
  if (stage && PM.getSystemRulesForStage) return PM.getSystemRulesForStage(stage);
  return PM.getActiveSystemRules();
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
    updateProjectChrome();
    showToast(`${window.DdditPlanBriefSync?.projectLabel?.(next) || next} 기획안을 확인했습니다.`);
    return true;
  }

  saveProject();
  setProjectSlug(next);
  loadProject();
  state.pipelineStep = 1;
  applyBriefToDOM();
  updateProjectChrome();
  updatePipelineUI();
  renderPlanProjectPicker();

  const plan = loadPlanData();
  const label = window.DdditPlanBriefSync?.projectLabel?.(next) || next;
  if (plan?.title) showToast(`${label} 기획안을 불러왔습니다.`);
  else showToast(`${label}에 기획안이 없습니다. 「기획안 편집」에서 작성하세요.`, true);
  return true;
}

function loadSelectedPlanProject() {
  const slug = $('#plan-project-select')?.value || '';
  switchToProject(slug, { forceReload: true });
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

  if (!state.chapters.length && plan.structure) {
    state.chapters = SYNC.parseStructureToChapters(plan.structure);
  }
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

function setLoading(on, text) {
  const el = $('#loading-overlay');
  if (!el) return;
  el.classList.toggle('hidden', !on);
  el.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (text) $('#loading-text').textContent = text;
}

async function callGeminiTextSession(userPrompt, temperature = 0.75, stage = 'prose') {
  SESSION.push('user', userPrompt);
  const model = state.modelPro;
  const body = {
    systemInstruction: { parts: [{ text: getSystemRules(stage) }] },
    contents: SESSION.getContents(),
    generationConfig: { temperature },
  };
  const text = await postGeminiAndExtractText(model, body);
  SESSION.push('model', text);
  return text;
}

async function postGeminiAndExtractText(model, body) {
  let data;
  if (window.DdditWorksApi?.isBackendMode?.()) {
    data = await window.DdditWorksApi.postGemini(model, body, state.apiKey);
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message || `API ${res.status}`);
    data = await res.json();
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('응답이 비어 있습니다.');
  return text.trim();
}

async function callGeminiJson(userPrompt, temperature = 0.4, stage = 'convert') {
  const model = state.modelPro;
  const body = {
    systemInstruction: { parts: [{ text: getSystemRules(stage) }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: PIPE.ROWS_SCHEMA,
    },
  };
  let data;
  if (window.DdditWorksApi?.isBackendMode?.()) {
    data = await window.DdditWorksApi.postGemini(model, body, state.apiKey);
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message || `API ${res.status}`);
    data = await res.json();
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('JSON 응답이 비어 있습니다.');
  return PIPE.parseRowsJson(text);
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
      productSpecs: state.productSpecs,
      priceInfo: state.priceInfo,
      categoryId: state.categoryId,
      referenceScripts: state.referenceScripts,
      chapters: state.chapters,
      proseDraft: state.proseDraft,
      pipelineStep: state.pipelineStep,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* quota */ }
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
    state.pipelineStep = saved.pipelineStep || 1;
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
}

function syncSupplementsFromDOM() {
  state.priceInfo = $('#price-info')?.value || '';
  state.categoryId = $('#category')?.value || state.categoryId;
}

function syncChaptersFromDOM() {
  const items = [];
  document.querySelectorAll('#chapter-list .chapter-item').forEach((el) => {
    const title = el.querySelector('.chapter-title')?.value.trim();
    const notes = el.querySelector('.chapter-notes')?.value.trim() || '';
    if (title) items.push({ id: el.dataset.id, title, notes });
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
  list.innerHTML = state.chapters.map((ch, i) => `
    <div class="chapter-item" data-id="${esc(ch.id)}">
      <div class="chapter-item-head" draggable="true" title="드래그하여 순서 변경">
        <span class="chapter-drag-handle" aria-hidden="true">⋮⋮</span>
        <span class="chapter-item-num">챕터 ${i + 1}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-chapter-remove">삭제</button>
      </div>
      <label class="field">제목<input class="chapter-title" type="text" value="${esc(ch.title)}" /></label>
      <label class="field">메모<textarea class="chapter-notes" rows="2" placeholder="이 챕터에서 다룰 내용">${esc(ch.notes)}</textarea></label>
    </div>`).join('');
  list.querySelectorAll('.chapter-item').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('.chapter-title')?.addEventListener('input', (e) => {
      const ch = state.chapters.find((c) => c.id === id);
      if (ch) ch.title = e.target.value;
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
  state.chapters.push({ id: `ch-${Date.now()}`, title, notes: $('#new-chapter-notes')?.value.trim() || '' });
  $('#new-chapter-title').value = '';
  $('#new-chapter-notes').value = '';
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
  const labels = ['', '기획안', '줄글 초안', '시트 변환', '장면·사이즈', '자막·공유'];
  const hints = [
    '',
    '기획안 확인 후 줄글 단계로',
    '챕터 지정 후 AI 생성, 또는 직접 작성',
    '줄글을 5열 대본으로 변환',
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
  syncSupplementsFromDOM();
  syncChaptersFromDOM();
  const effective = getEffectiveState();
  const ctx = buildProductContext();
  const styleAnchor = await PM.getStyleAnchorBlock?.();
  const isRoundup = PM.isRoundupFormat ? PM.isRoundupFormat(ctx) : window.DIDIDIT_CONFIG?.isRoundupFormat?.(ctx);
  const formatAnchor = isRoundup ? await PM.getFormatAnchorBlock?.() : '';
  const ctxWithStyle = [ctx, styleAnchor, formatAnchor].filter(Boolean).join('\n\n');
  const existingProse = ($('#prose-draft')?.value || state.proseDraft || '').trim();
  const continueFromEdit = existingProse && confirm(
    '기존 줄글을 스타일 기준으로 이어 쓸까요?\n\n확인 = 다듬은 톤 유지 · 취소 = 처음부터 새로 생성',
  );

  SESSION.reset();
  if (continueFromEdit) {
    SESSION.seedApprovedProse(
      existingProse,
      `${ctxWithStyle}\n\n[승인된 줄글] 작성자가 다듬은 줄글입니다. 이 톤·호흡·리듬을 그대로 유지하세요.`,
    );
  }

  setLoading(true, '줄글 초안 작성 중…');
  try {
    let prose = continueFromEdit ? existingProse : '';
    const chapters = state.chapters.length ? state.chapters : [{ title: '전체', notes: effective.contentDirection }];
    const startIndex = prose ? chapters.findIndex((ch) => !prose.includes(`## ${ch.title}`)) : 0;
    const from = startIndex < 0 ? chapters.length : Math.max(0, startIndex);
    if (from >= chapters.length) {
      showToast('이미 모든 챕터가 작성되어 있습니다.');
      return;
    }

    for (let i = from; i < chapters.length; i++) {
      setLoading(true, `줄글 작성 중… (${i + 1}/${chapters.length}, 대화 ${SESSION.turnCount()}턴)`);
      const prompt = PIPE.buildProsePrompt(ctxWithStyle, chapters[i], i, chapters.length, {
        includeContext: i === from && !SESSION.hasHistory(),
        hasSession: SESSION.turnCount() > 0,
      });
      const chunk = await callGeminiTextSession(prompt, 0.72, 'prose');
      prose = prose ? `${prose}\n\n## ${chapters[i].title}\n${chunk}` : `## ${chapters[i].title}\n${chunk}`;
    }
    state.proseDraft = prose;
    $('#prose-draft').value = prose;
    SESSION.save(getSheetSlug());
    saveProject();
    showToast(`줄글 완성 (대화 ${SESSION.turnCount()}턴 — 스타일 맥락 유지)`);
    navigatePipeline(3);
  } catch (e) {
    reportError('runProseDraft', e);
    showToast(e.message || '줄글 작성 실패', true);
  } finally {
    setLoading(false);
  }
}

async function runConvertToSheet() {
  if (!requireApiReady()) return;
  const prose = ($('#prose-draft')?.value || state.proseDraft).trim();
  if (!prose) return showToast('줄글 초안이 없습니다.', true);
  state.proseDraft = prose;
  const ctx = buildProductContext();
  setLoading(true, '5열 대본으로 변환 중…');
  try {
    const chunks = PIPE.splitProseChunks(prose, 14000);
    let rows = [];
    for (let i = 0; i < chunks.length; i++) {
      setLoading(true, `변환 중… (${i + 1}/${chunks.length})`);
      let part = [];
      let retryHint = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        part = await callGeminiJson(
          PIPE.buildConvertPrompt(ctx, chunks[i], retryHint),
          attempt > 0 ? 0.25 : 0.35,
          'convert',
        );
        const issues = PIPE.validateScriptRows(part);
        if (!issues.length) break;
        retryHint = PIPE.buildConvertRetryHint(issues);
        if (attempt === 2) {
          reportError('runConvertToSheet.validate', new Error(issues.join('; ')), { chunk: i + 1 }, { silent: true });
        }
      }
      rows = rows.concat(part);
    }
    state.allRows = PIPE.normalizeRows(rows);
    renderTable();
    saveProject();
    showToast(`${state.allRows.length}행으로 변환했습니다.`);
    navigatePipeline(4);
  } catch (e) {
    reportError('runConvertToSheet', e);
    showToast(e.message || '변환 실패', true);
  } finally {
    setLoading(false);
  }
}

async function runAddScenes() {
  if (!requireApiReady() || !state.allRows.length) return;
  setLoading(true, '장면·사이즈 추가 중…');
  try {
    state.allRows = await callGeminiJson(PIPE.buildScenePrompt(buildProductContext(), state.allRows), 0.4, 'scene');
    renderTable();
    showToast('장면·사이즈를 반영했습니다.');
    navigatePipeline(5);
  } catch (e) {
    reportError('runAddScenes', e);
    showToast(e.message || '장면 추가 실패', true);
  } finally {
    setLoading(false);
  }
}

async function runAddCaptions() {
  if (!requireApiReady() || !state.allRows.length) return;
  setLoading(true, '자막·코멘트 추가 중…');
  try {
    state.allRows = await callGeminiJson(PIPE.buildCaptionPrompt(buildProductContext(), state.allRows), 0.4, 'caption');
    renderTable();
    showToast('자막·코멘트를 반영했습니다.');
  } catch (e) {
    reportError('runAddCaptions', e);
    showToast(e.message || '자막 추가 실패', true);
  } finally {
    setLoading(false);
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

function reportError(tag, err) {
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
  const effective = getEffectiveState();
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
  $('#ad-mode-badge')?.classList.toggle('hidden', !effective.adMode);
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

function togglePanel(panelSel, btnSel) {
  const panel = $(panelSel);
  const btn = $(btnSel);
  if (!panel) return;
  const collapsed = panel.classList.toggle('collapsed');
  btn?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
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
  $('#toggle-settings')?.addEventListener('click', () => togglePanel('#settings-panel', '#toggle-settings'));
  $('#toggle-prompt')?.addEventListener('click', () => togglePanel('#prompt-panel', '#toggle-prompt'));
  $('#toggle-error-log')?.addEventListener('click', () => togglePanel('#error-log-panel', '#toggle-error-log'));
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
  $('#btn-convert-sheet')?.addEventListener('click', runConvertToSheet);
  $('#btn-add-scenes')?.addEventListener('click', runAddScenes);
  $('#btn-add-captions')?.addEventListener('click', runAddCaptions);
  $('#btn-add-chapter')?.addEventListener('click', addChapter);
  $('#btn-sheet-push')?.addEventListener('click', pushToSheet);
  $('#btn-sheet-pull')?.addEventListener('click', pullFromSheet);
  $('#btn-pipeline-next-brief')?.addEventListener('click', () => navigatePipeline(2));
  $('#btn-plan-load')?.addEventListener('click', loadSelectedPlanProject);
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
  $('#prose-draft')?.addEventListener('input', (e) => { state.proseDraft = e.target.value; saveProject(); updatePipelineUI(); });
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
  if (!PM.loadPromptState()?.text) await PM.loadDefaultPromptFile();
  else if (String(PM.getActivePromptSource?.() || '').includes('v1.0.0')) {
    await PM.loadDefaultPromptFile();
    showToast('프롬프트 v1.1.0으로 갱신했습니다. (단계별 규칙 분리)');
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
      $('#settings-panel')?.classList.remove('collapsed');
    }
  } catch (e) {
    $('#boot-error')?.classList.remove('hidden');
    $('#boot-error').textContent = `초기화 오류: ${e.message}`;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
