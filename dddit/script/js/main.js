/** 프롬프트 — txt 파일 기반 관리 */
(function () {
  const PROMPT_VERSION = '1.0.0';
  const DEFAULT_PROMPT_FILE = `prompts/default-v${PROMPT_VERSION}.txt`;
  const PROMPT_STORAGE_KEY = 'dididit-prompt-file-v2';

  const MANDATORY_OPENING = [
    '안녕하세요, 디디딧입니다.',
    '오늘 가져온 제품은 [제품명] 인데요',
    '[콘텐츠 방향 한 줄 요약]',
    '그럼 바로 리뷰 시작하겠습니다.',
  ];

  const MANDATORY_CLOSING = [
    '오늘 준비한 리뷰는 여기까지입니다.',
    '혹시 영상 보시고 궁금한 점이나 여러분이 직접 써보신 후기가 있다면 댓글로 마음껏 공유해 주세요.',
    '구독과 좋아요는 다음 리뷰 제작에 큰 힘이 됩니다.',
    '그럼 오늘 소개해드린 제품의 장단점과 평점을 정리해드리며 다음 영상에서 뵙겠습니다.',
  ];

  function buildDefaultSystemRules() {
    return `# System Context
Role: IT 리뷰 채널 '디디딧' 메인 작가
Target Audience: 퇴근 후 혼자만의 시간을 즐기는 1인 가구 직장인
Content Format: 모델 실사용 연기(화면) + 성우 내레이션(음성)
Tone & Manner: 솔직 담백, 과장 없는 팩트 폭격, 실생활 밀착형 공감 화법
Output: JSON 배열 (각 행: 대본, 장면, 사이즈, 자막, 코멘트)

# Strict Formatting & Volume Rule
- 호흡마다 행 분할. 1행 = 한 호흡, **25~45자** (50자 초과 금지). 장문 한 행에 합치기 금지.
- 마침표마다 무조건 분리 X. 15자 내외 초단문 연속 나열도 금지.
- 일반 파트: 14~22행, 1,600~2,000 Byte.
- [예외] 프롤로그만 8행 이하.
- 연속된 호흡의 대본인 경우 억지로 장면을 나누지 말고 장면 열에 '컷 유지'라고 표기할 것.
- 대본 작성 시 제품을 '이 녀석'이라고 지칭하지 말 것.
- '자막' 열: 대본에 제품의 수치나 스펙이 나올 때만 요약해서 작성.
- '코멘트' 열: 챙겨야 할 준비물이나 앱 세팅 등이 필요한 경우에만 작성.
- '사이즈' 열: 카메라 구도 (예: 미디엄샷, 클로즈업, 탑뷰 등).

# Production Constraints
- 한정된 렌탈 스튜디오 환경과 최소 장비 세팅 고려. 고가 비교 제품 세팅 배제.
- 복잡한 서류/엑셀 더미 세팅 대신 디디딧 유튜브 시청, 단순 웹서핑, 게임 등 직관적 화면.
- 모델의 작위적 감정 연기 지양. 제품 조작 등 단순하고 자연스러운 행동.
- 진행자 등장 배제. 모델의 담백한 행동 묘사와 구체적 카메라 구도를 장면 열에 명시.

# Reference Scripts (when provided)
- 타 유튜버 리뷰 대본은 팩트 체크·누락 포인트 파악용으로만 활용할 것.
- 문장·표현을 그대로 복사하지 말고 디디딧 톤으로 재작성할 것.
- 콘텐츠 방향에 맞게 강조·축소할 파트를 우선 반영할 것.

# Mandatory Phrases
[오프닝 - 프롤로그 파트에만]
${MANDATORY_OPENING.map((l) => `- ${l}`).join('\n')}

[클로징 - 총평 파트에만]
${MANDATORY_CLOSING.map((l) => `- ${l}`).join('\n')}

# Response Format (반드시 준수)
유효한 JSON만 출력. 마크다운 코드블록 없이:
{"rows":[{"대본":"...","장면":"...","사이즈":"...","자막":"","코멘트":""}]}

# Dynamic Structure
- 필수 파트: 디자인, 실사용, 가격, 총평 반드시 포함.
- 제품 특성에 맞게 파트 후보에서 유동 조합.`;
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
    return buildDefaultSystemRules();
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

  async function loadDefaultPromptFile() {
    try {
      const text = await fetchPromptTxt(DEFAULT_PROMPT_FILE);
      setActivePrompt(text, DEFAULT_PROMPT_FILE);
      return { text, source: DEFAULT_PROMPT_FILE };
    } catch {
      const text = buildDefaultSystemRules();
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
    buildDefaultSystemRules,
    getActiveSystemRules,
    getActivePromptSource,
    setActivePrompt,
    clearActivePrompt,
    fetchPromptTxt,
    loadDefaultPromptFile,
    downloadPromptTxt,
    loadPromptState,
  };
})();

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

  function buildAdGuideContext(guides) {
    if (!guides.length) return '';
    let total = 0;
    const blocks = [];

    for (const s of guides) {
      if (total >= MAX_TOTAL) break;
      const budget = Math.min(MAX_PER_FILE, MAX_TOTAL - total);
      const body = s.text.length > budget ? truncate(s.text, budget) : s.text;
      total += body.length;
      blocks.push(`## ${s.name}\n${body}`);
    }

    return `
# 본사 리뷰 가이드 (광고·협찬 — 최우선 준수)
- 아래는 브랜드/본사에서 제공한 공식 리뷰 가이드입니다. 강조 포인트·필수 멘트·금지 표현을 반드시 따르세요.
- 가이드와 사실이 충돌하면 사실을 우선하되, 표현은 가이드 톤에 맞게 조정하세요.
- 가이드에 없는 비방·허위 장점은 추가하지 마세요.

${blocks.join('\n\n')}`.trim();
  }

  window.DIDIDIT_REF = {
    parseReferenceFile,
    buildReferenceContext,
    buildAdGuideContext,
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

/**
 * 시나리오 파이프라인 — 줄글 초안 → 5열 시트 변환 (단계별)
 */
window.DIDIDIT_PIPELINE = (function () {
  const HEADERS = ['대본', '장면', '사이즈', '자막', '코멘트'];

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

  function buildProsePrompt(ctx, chapter, chapterIndex, chapterTotal) {
    const chapterBlock = chapter
      ? `\n## 이번에 작성할 챕터 (${chapterIndex + 1}/${chapterTotal})\n제목: ${chapter.title}\n메모: ${chapter.notes || '(없음)'}\n`
      : '';
    return `${ctx}

# 작업: 줄글 대본 초안 (1단계)
- 스프레드시트 행 분할·장면·자막 규칙은 **아직 적용하지 마세요**.
- 성우 내레이션 중심의 **자연스러운 줄글**로 작성합니다.
- 챕터가 있으면 \`## 챕터제목\` 으로 구분합니다.
- 디디딧 톤: 솔직·담백·과장 없음. 고정 오프닝/클로징 멘트는 시스템 규칙을 따릅니다.
${chapterBlock}
이전에 작성된 줄글이 있으면 이어서 작성하고, 이미 쓴 내용은 반복하지 마세요.`;
  }

  function buildConvertPrompt(ctx, prose) {
    return `${ctx}

# 작업: 줄글 → 스프레드시트 5열 변환 (2단계)
아래 줄글을 JSON \`rows\` 배열로 변환하세요.
- 열: 대본, 장면, 사이즈, 자막, 코멘트
- **이 단계에서는 대본 열만 채우고**, 장면·사이즈·자막·코멘트는 빈 문자열로 둡니다.
- 대본 분할 규칙: 1행=성우 한 호흡, 25~45자(50자 초과 금지), UTF-8 바이트·호흡 규칙은 시스템 규칙 준수.

## 줄글 원문
${prose}`;
  }

  function buildScenePrompt(ctx, rows) {
    const scriptOnly = rows.map((r) => r.대본).join('\n');
    return `${ctx}

# 작업: 장면·사이즈 추가 (3단계)
대본은 유지하고 **장면·사이즈** 열만 채우세요. 자막·코멘트는 빈 문자열.
- 연속 호흡은 장면에 '컷 유지'
- 사이즈: 와이드/미디엄/클로즈업 등

## 현재 대본 (행 순서)
${scriptOnly}

JSON rows 전체를 반환 (대본·장면·사이즈·자막·코멘트 키 필수).`;
  }

  function buildCaptionPrompt(ctx, rows) {
    return `${ctx}

# 작업: 자막·코멘트 추가 (4단계)
대본·장면·사이즈는 유지. **자막·코멘트**만 채우세요.
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
    normalizeRows,
    parseRowsJson,
    buildProsePrompt,
    buildConvertPrompt,
    buildScenePrompt,
    buildCaptionPrompt,
    splitProseChunks,
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

const state = {
  apiKey: '',
  modelPro: 'gemini-3.1-pro-preview',
  productName: '',
  contentDirection: '',
  productNotes: '',
  productSpecs: {},
  reviewBrief: { thesis: '', targetScenario: '', mustHighlight: '', carefulPoints: '', compareWith: '' },
  priceInfo: '',
  categoryId: 'other',
  referenceScripts: [],
  adMode: false,
  adBrand: '',
  adToneLevel: 'balanced',
  adDisclosure: true,
  adGuides: [],
  teamBriefNotes: '',
  briefSource: '',
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
  if (!PM || !REF || !BRIEF || !PIPE) throw new Error('스크립트 모듈 로드 실패');
}

function getSystemRules() {
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
    adGuides: state.adGuides,
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
  const adBlock = effective.adMode ? (REF?.buildAdGuideContext?.(state.adGuides) || '') : '';
  return BRIEF.buildPromptContext(effective, getCategory(effective.categoryId), refBlock, adBlock);
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

async function callGeminiText(userPrompt, temperature = 0.75) {
  const model = state.modelPro;
  const body = {
    systemInstruction: { parts: [{ text: getSystemRules() }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature },
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
  if (!text) throw new Error('응답이 비어 있습니다.');
  return text.trim();
}

async function callGeminiJson(userPrompt, temperature = 0.4) {
  const model = state.modelPro;
  const body = {
    systemInstruction: { parts: [{ text: getSystemRules() }] },
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

function renderPlanSummary() {
  const project = getSheetSlug();
  const SYNC = window.DdditPlanBriefSync;
  const container = $('#plan-summary');
  const missing = $('#plan-missing');
  const link = $('#plan-edit-link');

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

  container.innerHTML = rows.map(([k, v]) => `
    <div class="plan-summary-row">
      <span class="plan-summary-key">${esc(k)}</span>
      <div class="plan-summary-val">${esc(v)}</div>
    </div>`).join('');

  if (!state.chapters.length && plan.structure) {
    state.chapters = SYNC.parseStructureToChapters(plan.structure);
  }
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
}

async function runProseDraft() {
  if (!requireApiReady()) return;
  if (!hasPlanTitle()) return showToast('기획안에 제목을 입력하세요.', true);
  syncSupplementsFromDOM();
  syncChaptersFromDOM();
  const effective = getEffectiveState();
  const ctx = buildProductContext();
  setLoading(true, '줄글 초안 작성 중…');
  try {
    let prose = '';
    const chapters = state.chapters.length ? state.chapters : [{ title: '전체', notes: effective.contentDirection }];
    for (let i = 0; i < chapters.length; i++) {
      setLoading(true, `줄글 작성 중… (${i + 1}/${chapters.length})`);
      const prompt = PIPE.buildProsePrompt(ctx, chapters[i], i, chapters.length) +
        (prose ? `\n\n## 지금까지 작성된 줄글\n${prose.slice(-12000)}` : '');
      const chunk = await callGeminiText(prompt, 0.75);
      prose = prose ? `${prose}\n\n## ${chapters[i].title}\n${chunk}` : chunk;
    }
    state.proseDraft = prose;
    $('#prose-draft').value = prose;
    saveProject();
    showToast('줄글 초안이 완성되었습니다.');
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
      const part = await callGeminiJson(PIPE.buildConvertPrompt(ctx, chunks[i]), 0.35);
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
    state.allRows = await callGeminiJson(PIPE.buildScenePrompt(buildProductContext(), state.allRows), 0.4);
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
    state.allRows = await callGeminiJson(PIPE.buildCaptionPrompt(buildProductContext(), state.allRows), 0.4);
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

async function initSheetIntegration() {
  const project = getSheetSlug();
  const badge = $('#workspace-project-badge');
  if (badge && project !== 'default') {
    badge.textContent = `프로젝트: ${project}`;
    badge.classList.remove('hidden');
  }
  try {
    const store = JSON.parse(localStorage.getItem(SHEET_SETTINGS_KEY) || '{}');
    const savedUrl = store.projects?.[project]?.url;
    if (savedUrl) rememberSheetUrl(project, savedUrl);
  } catch { /* ignore */ }
  if (window.DdditWorksApi?.isBackendMode?.()) {
    $('#backend-settings-note')?.removeAttribute('hidden');
    await window.DdditWorksApi.loadConfig().catch(() => null);
  }
}

/* ── Ad / ref UI (minimal) ── */
function updateAdModeUI() {
  $('#ad-mode').checked = state.adMode;
  const fields = $('#ad-mode-fields');
  fields?.classList.toggle('hidden', !state.adMode);
  if (state.adMode) document.querySelector('#ad-mode-panel')?.setAttribute('open', '');
  $('#ad-mode-badge')?.classList.toggle('hidden', !state.adMode);
  $('#ad-brand').value = state.adBrand || '';
  $('#ad-tone-level').value = state.adToneLevel || 'balanced';
  $('#ad-disclosure').checked = state.adDisclosure !== false;
}

function renderReferenceList() {
  const list = $('#ref-file-list');
  if (!list) return;
  list.innerHTML = state.referenceScripts.length
    ? state.referenceScripts.map((s) => `<li>${esc(s.name)} (${s.text.length}자)</li>`).join('')
    : '<li class="muted">없음</li>';
  $('#ref-stats').textContent = `${state.referenceScripts.length}개`;
}

function renderAdGuideList() {
  const list = $('#ad-guide-list');
  if (!list) return;
  list.innerHTML = state.adGuides.length
    ? state.adGuides.map((g) => `<li>${esc(g.name)}</li>`).join('')
    : '<li class="muted">없음</li>';
  const totalChars = state.adGuides.reduce((n, s) => n + (s.text?.length || 0), 0);
  const stats = $('#ad-guide-stats');
  if (stats) stats.textContent = state.adGuides.length ? `${state.adGuides.length}개 · ${totalChars.toLocaleString()}자` : '0개';
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

async function addAdGuideFromPaste() {
  const text = $('#ad-guide-paste')?.value.trim();
  if (!text) return showToast('가이드를 붙여넣으세요.', true);
  state.adGuides.push({ id: `ad-${Date.now()}`, name: '붙여넣기', source: 'paste', text, chars: text.length });
  $('#ad-guide-paste').value = '';
  renderAdGuideList();
  saveProject();
}

async function addAdGuideFiles(fileList) {
  if (!fileList?.length || !REF) return;
  for (const file of fileList) {
    try {
      state.adGuides.push(await REF.parseReferenceFile(file));
    } catch (e) {
      showToast(e.message, true);
    }
  }
  renderAdGuideList();
  saveProject();
}

function clearAdGuides() {
  state.adGuides = [];
  renderAdGuideList();
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
  $('#btn-sheet-push-inline')?.addEventListener('click', pushToSheet);
  $('#btn-sheet-pull')?.addEventListener('click', pullFromSheet);
  $('#btn-sheet-pull-inline')?.addEventListener('click', pullFromSheet);
  $('#btn-pipeline-next-brief')?.addEventListener('click', () => navigatePipeline(2));
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => navigatePipeline(Number(btn.dataset.goto)));
  });
  $('#btn-sheet-open')?.addEventListener('click', openSheetUrl);
  $('#btn-sheet-open-inline')?.addEventListener('click', openSheetUrl);
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
