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

/** 서치 감사 로그 — Cursor 리뷰·링크 검증 추적 */
(function () {
  const RESEARCH_LOG_KEY = 'dididit-research-log-v1';
  const RESEARCH_LOG_MAX = 30;

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
      const saved = JSON.parse(localStorage.getItem(RESEARCH_LOG_KEY) || '[]');
      entries.length = 0;
      if (Array.isArray(saved)) entries.push(...saved.slice(-RESEARCH_LOG_MAX));
    } catch {
      entries.length = 0;
    }
  }

  function save() {
    try {
      localStorage.setItem(RESEARCH_LOG_KEY, JSON.stringify(entries.slice(-RESEARCH_LOG_MAX)));
    } catch {
      /* quota */
    }
  }

  function logRun(audit) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
      ...audit,
    };
    entries.push(entry);
    if (entries.length > RESEARCH_LOG_MAX) {
      entries.splice(0, entries.length - RESEARCH_LOG_MAX);
    }
    save();
    render();
    updateBadge();
    console.info('[research-audit]', entry);
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
        const header = `[${formatTime(e.time)}] ${e.deviceLabel || e.deviceId || '서치'} · ${e.model || '?'}`;
        const summary = e.summary
          ? `\nsummary: ${JSON.stringify(e.summary, null, 2)}`
          : '';
        const phases = e.phases?.length
          ? `\nphases:\n${JSON.stringify(e.phases, null, 2)}`
          : '';
        const products = e.finalProducts?.length
          ? `\nfinalProducts:\n${JSON.stringify(e.finalProducts, null, 2)}`
          : '';
        const criteria = e.criteria
          ? `\ncriteria: ${JSON.stringify(e.criteria, null, 2)}`
          : '';
        return `${header}${criteria}${summary}${phases}${products}`;
      })
      .join('\n\n==========\n\n');
  }

  function render() {
    const list = document.getElementById('research-log-list');
    const empty = document.getElementById('research-log-empty');
    const countEl = document.getElementById('research-log-count');
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
        const sum = e.summary || {};
        const verified = sum.verifiedCount ?? '?';
        const total = sum.totalProducts ?? '?';
        const stripped = sum.strippedLinks ?? 0;
        const model = esc(e.model || '?');
        const issues = (e.finalProducts || [])
          .filter((p) => p.verificationStatus !== 'verified' || p.linkWarnings?.length)
          .map(
            (p) =>
              `${esc(p.brand)} ${esc(p.model)}: ${esc(p.verificationStatus || (p.verified ? 'verified' : 'unverified'))}${p.linkWarnings?.length ? ` (${p.linkWarnings.join(', ')})` : ''}`
          )
          .join('<br/>');
        const issuesHtml = issues
          ? `<details class="error-log-stack"><summary>링크·모델 이슈</summary><p class="hint">${issues}</p></details>`
          : '';
        const phasesHtml = e.phases?.length
          ? `<details class="error-log-stack"><summary>단계별 raw (${e.phases.length})</summary><pre>${esc(JSON.stringify(e.phases, null, 2).slice(0, 12000))}</pre></details>`
          : '';
        return `<li class="error-log-item">
        <div class="error-log-head">
          <time>${esc(formatTime(e.time))}</time>
          <span class="error-log-ctx">${esc(e.deviceLabel || e.deviceId)}</span>
        </div>
        <p class="error-log-msg">검증 ${verified}/${total} · 링크 제거 ${stripped} · ${model}</p>
        ${issuesHtml}
        ${phasesHtml}
      </li>`;
      })
      .join('');
  }

  function updateBadge() {
    const badge = document.getElementById('research-log-badge');
    if (!badge) return;
    const issueCount = entries.filter((e) => {
      const sum = e.summary || {};
      return (sum.verifiedCount ?? 0) < (sum.totalProducts ?? 0) || (sum.strippedLinks ?? 0) > 0;
    }).length;
    if (issueCount) {
      badge.textContent = issueCount > 99 ? '99+' : String(issueCount);
      badge.classList.remove('hidden');
    } else if (entries.length) {
      badge.textContent = String(entries.length);
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
    a.download = `dididit-research-log_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  }

  window.DIDIDIT_RESEARCH_LOG = {
    load,
    logRun,
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

    return `
# 제품 브리프
제품명: ${state.productName}
카테고리: ${cat.name || '기타'} — ${cat.focusHints || ''}
콘텐츠 방향: ${state.contentDirection || '(미입력)'}
가격·라인업: ${state.priceInfo || '(미입력)'}

## 구조화 제원
${specsBlock}
${extraNotes ? `\n## 추가 메모\n${extraNotes}` : ''}

## 리뷰 방향 (콘티·대본에 반영)
${briefBlock}

## 콘티 출력 규칙
- 최종 산출물은 스프레드시트 5열: 대본 | 장면 | 사이즈 | 자막 | 코멘트
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

(function () {
'use strict';

let CATEGORIES = [];
let GEMINI_MODELS = [];
let DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
let LITE_GEMINI_MODEL = 'gemini-3.1-flash-lite';
let PRO_GEMINI_MODEL = 'gemini-3.1-pro-preview';
let PART_NAME_POOL = [];
let isSupportedGeminiModel = () => false;
let detectCategory = () => null;
let utf8ByteLength = (s) => new TextEncoder().encode(s).length;
let PM = null;

let REF = null;
let LOG = null;
let RESEARCH_LOG = null;
let BRIEF = null;
let RESEARCH = null;

const REQUIRED_PART_KEYWORDS = ['디자인', '실사용', '가격', '총평'];

const STORAGE_KEY = 'dididit-script-machine-v1';
const PROJECT_SLUG = new URLSearchParams(location.search).get('project') || 'default';
const PROJECT_STORAGE_KEY = `dididit-project-v1:${PROJECT_SLUG}`;

const WORKSPACE_PROJECTS = {
  xenics: {
    label: 'Xenics 데스크테리어',
    contentDirection: '제닉스 제품 데스크 세팅 완성',
    adMode: true,
    adBrand: '제닉스',
  },
};

const state = {
  apiKey: '',
  modelLite: 'gemini-3.1-flash-lite',
  modelPro: 'gemini-3.1-pro-preview',
  productName: '',
  contentDirection: '',
  productNotes: '',
  productSpecs: {},
  reviewBrief: {
    thesis: '',
    targetScenario: '',
    mustHighlight: '',
    carefulPoints: '',
    compareWith: '',
  },
  priceInfo: '',
  categoryId: 'other',
  referenceScripts: [],
  adMode: false,
  adBrand: '',
  adToneLevel: 'balanced',
  adDisclosure: true,
  adGuides: [],
  partLineup: [],
  draftLineup: [],
  draftReason: '',
  lineupConfirmed: false,
  currentPartIndex: -1,
  allRows: [],
  partSegments: [],
  selectedPartIndex: null,
  searchResults: null,
  searchDeviceId: 'dehumidifier',
  workflowStep: 1,
  currentPage: 1,
  sheetApiUrl: '',
  sheetToken: '',
  sheetOpenUrl: '',
};

const $ = (sel) => document.querySelector(sel);

function bindModules() {
  const cfg = window.DIDIDIT_CONFIG;
  PM = window.DIDIDIT_PROMPT;
  REF = window.DIDIDIT_REF;
  LOG = window.DIDIDIT_LOG || null;
  RESEARCH_LOG = window.DIDIDIT_RESEARCH_LOG || null;
  BRIEF = window.DIDIDIT_BRIEF || null;
  RESEARCH = window.DIDIDIT_RESEARCH || null;
  if (!cfg || !PM || !REF) {
    throw new Error('스크립트 로드 실패. index.html과 js 폴더가 같은 위치에 있는지 확인하세요.');
  }
  CATEGORIES = cfg.CATEGORIES;
  GEMINI_MODELS = cfg.GEMINI_MODELS;
  DEFAULT_GEMINI_MODEL = cfg.DEFAULT_GEMINI_MODEL;
  LITE_GEMINI_MODEL = cfg.LITE_GEMINI_MODEL || cfg.DEFAULT_GEMINI_MODEL;
  PRO_GEMINI_MODEL = cfg.PRO_GEMINI_MODEL || 'gemini-3.1-pro-preview';
  isSupportedGeminiModel = cfg.isSupportedGeminiModel;
  PART_NAME_POOL = cfg.PART_NAME_POOL || [];
  detectCategory = cfg.detectCategory;
  utf8ByteLength = cfg.utf8ByteLength;
}

function getSystemRules() {
  return PM.getActiveSystemRules();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.apiKey) state.apiKey = saved.apiKey;
    if (saved.modelLite && isSupportedGeminiModel(saved.modelLite)) {
      state.modelLite = saved.modelLite;
    } else if (saved.model && isSupportedGeminiModel(saved.model)) {
      state.modelLite = saved.model;
    } else if (saved.model) {
      state.modelLite = LITE_GEMINI_MODEL;
    }
    if (saved.modelPro && isSupportedGeminiModel(saved.modelPro)) {
      state.modelPro = saved.modelPro;
    } else if (saved.model && isSupportedGeminiModel(saved.model)) {
      /* legacy: single model was lite default */
    }
    if (saved.sheetApiUrl) state.sheetApiUrl = saved.sheetApiUrl;
    if (saved.sheetToken) state.sheetToken = saved.sheetToken;
    if (saved.sheetOpenUrl) state.sheetOpenUrl = saved.sheetOpenUrl;
  } catch {
    /* ignore */
  }
}

function modelOptionHtml() {
  return GEMINI_MODELS.map(
    (m) => `<option value="${m.id}">${m.label} — ${m.hint}</option>`
  ).join('');
}

function syncModelSelect(selectId, current, fallback) {
  const select = $(selectId);
  if (!select || !GEMINI_MODELS.length) return fallback;
  select.innerHTML = modelOptionHtml();
  const value = isSupportedGeminiModel(current) ? current : fallback;
  select.value = value;
  return value;
}

function renderModelOptions() {
  state.modelLite = syncModelSelect('#model-lite', state.modelLite, LITE_GEMINI_MODEL);
  state.modelPro = syncModelSelect('#model-pro', state.modelPro, PRO_GEMINI_MODEL);
}

function getLineupModel() {
  return state.modelLite;
}

function getPartScriptModel(partName) {
  return isProloguePart(partName) ? state.modelLite : state.modelPro;
}

function getModelLabel(modelId) {
  const m = GEMINI_MODELS.find((x) => x.id === modelId);
  return m ? m.label : modelId;
}

function saveSettings() {
  syncSheetSettingsFromDOM();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      apiKey: state.apiKey,
      modelLite: state.modelLite,
      modelPro: state.modelPro,
      sheetApiUrl: state.sheetApiUrl,
      sheetToken: state.sheetToken,
      sheetOpenUrl: state.sheetOpenUrl,
    })
  );
}

function syncSheetSettingsFromDOM() {
  state.sheetApiUrl = $('#sheet-api-url')?.value.trim() || '';
  state.sheetToken = $('#sheet-api-token')?.value.trim() || '';
  state.sheetOpenUrl = $('#sheet-open-url')?.value.trim() || '';
}

function applySheetSettingsToDOM() {
  if ($('#sheet-api-url')) $('#sheet-api-url').value = state.sheetApiUrl || '';
  if ($('#sheet-api-token')) $('#sheet-api-token').value = state.sheetToken || '';
  if ($('#sheet-open-url')) $('#sheet-open-url').value = state.sheetOpenUrl || '';
  updateSheetSyncStatus();
}

function sheetConfig() {
  return {
    apiUrl: state.sheetApiUrl,
    token: state.sheetToken,
    openUrl: state.sheetOpenUrl,
  };
}

function updateSheetSyncStatus() {
  const el = $('#sheet-sync-status');
  if (!el) return;
  const cfg = sheetConfig();
  const project = window.DdditSheetSync?.projectSlug() || 'default';
  const tab = window.DdditSheetSync?.tabLabel(project) || project;
  if (!cfg.apiUrl || !cfg.token) {
    el.textContent = `연동 미설정 · 프로젝트 탭: ${tab}`;
    return;
  }
  el.textContent = `연동 준비됨 · 프로젝트 탭: ${tab}`;
}

async function pushContiToSheet() {
  if (!state.allRows.length) return showToast('보낼 콘티가 없습니다.', true);
  if (!window.DdditSheetSync) return showToast('시트 연동 모듈을 불러오지 못했습니다.', true);
  syncSheetSettingsFromDOM();
  saveSettings();
  const project = PROJECT_SLUG;
  const tab = window.DdditSheetSync.tabLabel(project);
  if (
    !confirm(
      `「${tab}」 탭에 콘티 ${state.allRows.length}행을 덮어씁니다.\n시트에서 수정한 내용이 사라질 수 있습니다. 계속할까요?`
    )
  ) {
    return;
  }
  try {
    showToast('시트로 보내는 중…');
    const result = await window.DdditSheetSync.pushReplace(sheetConfig(), state.allRows, project);
    showToast(`시트 「${result.tab || tab}」에 ${result.rowCount}행 저장됨`);
    saveProject();
  } catch (err) {
    reportError('pushContiToSheet', err);
    showToast(err.message || '시트 저장 실패', true);
  }
}

async function pullContiFromSheet() {
  if (!window.DdditSheetSync) return showToast('시트 연동 모듈을 불러오지 못했습니다.', true);
  syncSheetSettingsFromDOM();
  saveSettings();
  const project = PROJECT_SLUG;
  const tab = window.DdditSheetSync.tabLabel(project);
  if (state.allRows.length) {
    if (!confirm(`시트 「${tab}」에서 불러오면 현재 콘티(${state.allRows.length}행)를 덮어씁니다. 계속할까요?`)) {
      return;
    }
  }
  try {
    showToast('시트에서 불러오는 중…');
    const result = await window.DdditSheetSync.pull(sheetConfig(), project);
    state.allRows = (result.rows || []).map((r) => ({
      대본: r.대본 || '',
      장면: r.장면 || '',
      사이즈: r.사이즈 || '',
      자막: r.자막 || '',
      코멘트: r.코멘트 || '',
    }));
    state.partSegments =
      state.allRows.length > 0
        ? [{ partIndex: 0, partName: '시트', start: 0, end: state.allRows.length - 1 }]
        : [];
    state.selectedPartIndex = null;
    renderTable();
    saveProject();
    updateWorkflowStep(4);
    showToast(`시트 「${result.tab || tab}」에서 ${state.allRows.length}행 불러옴`);
  } catch (err) {
    reportError('pullContiFromSheet', err);
    showToast(err.message || '시트 불러오기 실패', true);
  }
}

function openContiSheet() {
  syncSheetSettingsFromDOM();
  saveSettings();
  const url = state.sheetOpenUrl?.trim();
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  showToast('시트 열기 URL을 API 설정에 입력해 주세요.', true);
}

function saveProject() {
  try {
    syncBriefFromDOM();
    syncSpecsFromDOM();
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({
        productName: state.productName,
        contentDirection: state.contentDirection,
        productNotes: state.productNotes,
        productSpecs: state.productSpecs,
        reviewBrief: state.reviewBrief,
        priceInfo: state.priceInfo,
        categoryId: state.categoryId,
        referenceScripts: state.referenceScripts,
        adMode: state.adMode,
        adBrand: state.adBrand,
        adToneLevel: state.adToneLevel,
        adDisclosure: state.adDisclosure,
        adGuides: state.adGuides,
        partLineup: state.partLineup,
        draftLineup: state.draftLineup,
        draftReason: state.draftReason,
        lineupConfirmed: state.lineupConfirmed,
        currentPartIndex: state.currentPartIndex,
        allRows: state.allRows,
        partSegments: state.partSegments,
        searchResults: state.searchResults,
        searchDeviceId: state.searchDeviceId,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    /* quota */
  }
}

function loadProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) || '{}');
    if (saved.productName) state.productName = saved.productName;
    if (saved.contentDirection) state.contentDirection = saved.contentDirection;
    if (saved.productNotes) state.productNotes = saved.productNotes;
    if (saved.priceInfo) state.priceInfo = saved.priceInfo;
    if (saved.categoryId) state.categoryId = saved.categoryId;
    if (saved.productSpecs && typeof saved.productSpecs === 'object') {
      state.productSpecs = saved.productSpecs;
    }
    if (saved.reviewBrief && typeof saved.reviewBrief === 'object') {
      state.reviewBrief = { ...state.reviewBrief, ...saved.reviewBrief };
    }
    if (Array.isArray(saved.referenceScripts)) state.referenceScripts = saved.referenceScripts;
    if (typeof saved.adMode === 'boolean') state.adMode = saved.adMode;
    if (saved.adBrand) state.adBrand = saved.adBrand;
    if (saved.adToneLevel) state.adToneLevel = saved.adToneLevel;
    if (typeof saved.adDisclosure === 'boolean') state.adDisclosure = saved.adDisclosure;
    if (Array.isArray(saved.adGuides)) state.adGuides = saved.adGuides;
    if (Array.isArray(saved.partLineup) && saved.partLineup.length) {
      state.partLineup = saved.partLineup;
      state.draftLineup = saved.draftLineup || [...saved.partLineup];
      state.draftReason = saved.draftReason || '';
      state.lineupConfirmed = !!saved.lineupConfirmed;
      state.currentPartIndex = saved.currentPartIndex ?? -1;
      state.allRows = saved.allRows || [];
      state.partSegments = saved.partSegments || [];
    }
    if (saved.searchResults) state.searchResults = saved.searchResults;
    if (saved.searchDeviceId) state.searchDeviceId = saved.searchDeviceId;
  } catch {
    /* ignore */
  }
}

function applyBriefToDOM() {
  $('#product-name').value = state.productName;
  $('#content-direction').value = state.contentDirection;
  $('#product-notes').value = state.productNotes;
  $('#price-info').value = state.priceInfo;
  if ($('#category')) $('#category').value = state.categoryId;
  $('#brief-thesis').value = state.reviewBrief.thesis || '';
  $('#brief-scenario').value = state.reviewBrief.targetScenario || '';
  $('#brief-must').value = state.reviewBrief.mustHighlight || '';
  $('#brief-careful').value = state.reviewBrief.carefulPoints || '';
  $('#brief-compare').value = state.reviewBrief.compareWith || '';
  renderSpecFields();
}

function syncBriefFromDOM() {
  state.reviewBrief = {
    thesis: $('#brief-thesis')?.value.trim() || '',
    targetScenario: $('#brief-scenario')?.value.trim() || '',
    mustHighlight: $('#brief-must')?.value.trim() || '',
    carefulPoints: $('#brief-careful')?.value.trim() || '',
    compareWith: $('#brief-compare')?.value.trim() || '',
  };
}

function syncSpecsFromDOM() {
  if (!BRIEF) return;
  document.querySelectorAll('[data-spec-key]').forEach((inp) => {
    const key = inp.dataset.specKey;
    if (key) state.productSpecs[key] = inp.value.trim();
  });
}

function renderSpecFields() {
  const container = $('#spec-fields');
  if (!container || !BRIEF) return;

  syncSpecsFromDOM();
  const fields = BRIEF.getSpecFields(state.categoryId, state.searchDeviceId);
  const merged = {
    ...BRIEF.emptySpecsForCategory(state.categoryId, state.searchDeviceId),
    ...state.productSpecs,
  };
  state.productSpecs = merged;

  container.innerHTML = fields
    .map(
      (f) => `
    <label>${esc(f.label)}
      <input type="text" data-spec-key="${esc(f.key)}" value="${esc(merged[f.key] || '')}" placeholder="${esc(f.placeholder || '')}" />
    </label>`
    )
    .join('');

  container.querySelectorAll('[data-spec-key]').forEach((inp) => {
    inp.addEventListener('input', () => {
      state.productSpecs[inp.dataset.specKey] = inp.value;
      saveProject();
    });
  });
}

function onCategoryChange(categoryId) {
  const prev = { ...state.productSpecs };
  state.categoryId = categoryId;
  if (BRIEF) {
    state.productSpecs = BRIEF.emptySpecsForCategory(categoryId, state.searchDeviceId);
    BRIEF.getSpecFields(categoryId, state.searchDeviceId).forEach((f) => {
      if (prev[f.key]) state.productSpecs[f.key] = prev[f.key];
    });
    renderSpecFields();
  }
  updateCategoryHint();
  saveProject();
}

function loadAirPurifierExample() {
  if (!BRIEF) return;
  if (state.productName.trim() && !confirm('현재 브리프를 공기청정기 예시로 덮어쓸까요?')) return;

  const ex = BRIEF.getAirPurifierExample();
  state.productName = ex.productName;
  state.contentDirection = ex.contentDirection;
  state.priceInfo = ex.priceInfo;
  state.productNotes = ex.productNotes;
  state.categoryId = ex.categoryId;
  state.productSpecs = { ...ex.productSpecs };
  state.reviewBrief = { ...ex.reviewBrief };

  applyBriefToDOM();
  updateCategoryHint();
  saveProject();
  if (state.apiKey && state.productName.trim()) updateWorkflowStep(3);
  showToast('공기청정기 예시 브리프를 불러왔습니다. 실제 제품 정보로 수정하세요.');
}

function getSearchCriteriaFromDOM() {
  const deviceId = $('#search-device')?.value || state.searchDeviceId || RESEARCH?.DEFAULT_DEVICE_ID;
  const profile = RESEARCH?.getDeviceProfile(deviceId);
  const priorities = [];
  document.querySelectorAll('input[name="search-pri"]:checked').forEach((el) => {
    priorities.push(el.value);
  });
  return {
    deviceId,
    season: profile?.season || '2026',
    budget: $('#search-budget')?.value || profile?.budget || '40-60',
    roomSize: $('#search-room')?.value || profile?.roomSize || '10-15',
    priorities: priorities.length ? priorities : RESEARCH?.getDefaultPriorities(deviceId) || [],
    extra: $('#search-extra')?.value.trim() || '',
    exclude: profile?.exclude,
    count: 5,
  };
}

function renderSearchDeviceSelect() {
  const sel = $('#search-device');
  if (!sel || !RESEARCH) return;

  sel.innerHTML = RESEARCH.DEVICE_GROUPS.map(
    (g) =>
      `<optgroup label="${esc(g.label)}">${g.ids
        .map((id) => {
          const d = RESEARCH.getDeviceProfile(id);
          const selected = id === (state.searchDeviceId || RESEARCH.DEFAULT_DEVICE_ID) ? ' selected' : '';
          return `<option value="${esc(id)}"${selected}>${esc(d.label)}</option>`;
        })
        .join('')}</optgroup>`
  ).join('');
}

function updateSearchProfileUI(deviceId) {
  if (!RESEARCH) return;
  const id = deviceId || $('#search-device')?.value || state.searchDeviceId;
  state.searchDeviceId = id;
  const profile = RESEARCH.getDeviceProfile(id);

  const badge = $('#search-season-badge');
  if (badge) badge.textContent = profile.badge || '';

  const budgetSel = $('#search-budget');
  if (budgetSel && profile.budget) budgetSel.value = profile.budget;

  const roomRow = $('#search-room-row');
  if (roomRow) roomRow.classList.toggle('hidden', !profile.useRoomSize);

  const priBox = $('#search-priorities');
  if (priBox) {
    const priorities = RESEARCH.getPrioritiesForUI
      ? RESEARCH.getPrioritiesForUI(id)
      : profile.priorities;
    priBox.innerHTML = priorities
      .map(
        (p) =>
          `<label class="checkbox-inline"><input type="checkbox" name="search-pri" value="${esc(p.label)}"${p.default ? ' checked' : ''} /> ${esc(p.label)}</label>`
      )
      .join('');
  }

  const hint = $('#search-device-hint');
  if (hint) hint.textContent = `리서치 포인트: ${profile.searchFocus}`;
}

function renderSearchResults(result) {
  const list = $('#search-results');
  const summary = $('#search-summary');
  const tips = $('#search-buying-tips');
  const toolbar = $('#search-results-toolbar');
  if (!list || !result) {
    $('#search-results-toolbar')?.classList.add('hidden');
    return;
  }

  const deviceLabel = result.deviceLabel || result.criteria?.deviceId || '제품';
  const hasProducts = result.products?.length > 0;
  if (toolbar) toolbar.classList.toggle('hidden', !hasProducts);

  if (summary) {
    summary.classList.remove('hidden');
    const planned = (result.plannedQueries || []).join(' · ');
    const executed = (result.webSearchQueries || []).slice(0, 8).join(', ');
    const sum = result.summary || result.audit?.summary || {};
    const verifyLine =
      sum.verifiedCount != null
        ? ` · 검증 ${sum.verifiedCount}/${sum.totalProducts}${sum.partialCount ? ` (부분 ${sum.partialCount})` : ''}${sum.strippedLinks ? ` · 링크 제거 ${sum.strippedLinks}` : ''}`
        : '';
    summary.innerHTML = `<strong>[${esc(deviceLabel)}] ${esc(result.querySummary || '검색 완료')}</strong>${verifyLine}${planned ? `<br><span class="hint">계획 쿼리: ${esc(planned)}</span>` : ''}${executed ? `<br><span class="hint">실행 검색: ${esc(executed)}</span>` : ''}`;
  }

  if (tips) {
    if (result.buyingTips) {
      tips.classList.remove('hidden');
      tips.innerHTML = `<strong>구매 체크리스트</strong> ${esc(result.buyingTips)}`;
    } else {
      tips.classList.add('hidden');
    }
  }

  list.innerHTML = result.products
    .map((p, idx) => {
      const specsHtml = (p.keySpecs || [])
        .map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`)
        .join('');
      const pros = (p.pros || []).map((x) => `<li>${esc(x)}</li>`).join('');
      const cons = (p.cons || []).map((x) => `<li>${esc(x)}</li>`).join('');
      const yt = (p.youtubeRefs || [])
        .map(
          (y) =>
            `<li><a href="${esc(y.url)}" target="_blank" rel="noopener">${esc(y.title || y.url)}</a>${y.note ? ` — ${esc(y.note)}` : ''}</li>`
        )
        .join('');
      const src = (p.sources || [])
        .slice(0, 5)
        .map(
          (s) =>
            `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></li>`
        )
        .join('');
      const status = p.verificationStatus || (p.verified ? 'verified' : 'unverified');
      const statusLabels = { verified: '검증됨', partial: '부분검증', unverified: '미검증' };
      const verifyBadge = `<span class="search-verify search-verify-${status}" title="${esc(statusLabels[status] || status)}">${esc(statusLabels[status] || status)}</span>`;
      const modelCodeHtml = p.modelCode
        ? `<span class="search-model-code">${esc(p.modelCode)}</span>`
        : '';
      const linkWarnHtml =
        p.linkWarnings?.length
          ? `<p class="search-link-warn hint">링크 제거: ${esc(p.linkWarnings.join(', '))}</p>`
          : '';
      const verifyNoteHtml = p.verificationNotes
        ? `<p class="search-verify-note hint">${esc(p.verificationNotes)}</p>`
        : '';
      const officialHtml = p.officialUrl
        ? `<p class="search-label">공식</p><ul class="search-links"><li><a href="${esc(p.officialUrl)}" target="_blank" rel="noopener">${esc(p.officialUrl)}</a></li></ul>`
        : '';
      const purchaseHtml = p.purchaseUrl
        ? `<p class="search-label">구매</p><ul class="search-links"><li><a href="${esc(p.purchaseUrl)}" target="_blank" rel="noopener">${esc(p.purchaseUrl)}</a></li></ul>`
        : '';
      return `<li class="search-card" data-search-idx="${idx}">
        <div class="search-card-head">
          <span class="search-rank">#${p.rank}</span>
          <h4 class="search-card-title">${esc(p.brand)} ${esc(p.model)}</h4>
          ${modelCodeHtml}
          ${verifyBadge}
          ${p.releaseYear ? `<span class="search-year">${esc(p.releaseYear)}</span>` : ''}
          <span class="search-price">${esc(p.priceKrw)}${p.priceNote ? ` <span class="hint">(${esc(p.priceNote)})</span>` : ''}</span>
          <button type="button" class="btn btn-ghost btn-sm btn-delete-search" data-idx="${idx}" title="삭제">삭제</button>
        </div>
        ${linkWarnHtml}
        ${verifyNoteHtml}
        ${specsHtml ? `<dl class="search-specs">${specsHtml}</dl>` : ''}
        ${p.timingFit ? `<p class="search-summer">${esc(p.timingFit)}</p>` : ''}
        ${p.maintenanceCost ? `<p class="search-maint hint">유지비: ${esc(p.maintenanceCost)}</p>` : ''}
        ${pros ? `<p class="search-label">장점</p><ul class="search-pros">${pros}</ul>` : ''}
        ${cons ? `<p class="search-label">단점</p><ul class="search-cons">${cons}</ul>` : ''}
        ${p.reviewAngle ? `<p class="search-angle"><strong>리뷰 각도</strong> ${esc(p.reviewAngle)}</p>` : ''}
        ${officialHtml}
        ${purchaseHtml}
        ${yt ? `<p class="search-label">유튜브</p><ul class="search-links">${yt}</ul>` : ''}
        ${src && !p.officialUrl && !p.purchaseUrl ? `<p class="search-label">출처</p><ul class="search-links">${src}</ul>` : ''}
        <button type="button" class="btn btn-primary btn-sm btn-apply-search" data-idx="${idx}">브리프에 적용</button>
      </li>`;
    })
    .join('');

  list.querySelectorAll('.btn-apply-search').forEach((btn) => {
    btn.addEventListener('click', () => applyResearchProduct(Number(btn.dataset.idx)));
  });
  list.querySelectorAll('.btn-delete-search').forEach((btn) => {
    btn.addEventListener('click', () => deleteSearchResult(Number(btn.dataset.idx)));
  });
}

function resetSearchResultsUI() {
  const list = $('#search-results');
  if (list) list.innerHTML = '';
  $('#search-summary')?.classList.add('hidden');
  $('#search-buying-tips')?.classList.add('hidden');
  $('#search-results-toolbar')?.classList.add('hidden');
  const statusEl = $('#search-status');
  if (statusEl) statusEl.textContent = '';
}

function clearSearchResults() {
  if (state.searchResults?.products?.length && !confirm('서치 결과를 모두 지울까요?')) return;
  state.searchResults = null;
  resetSearchResultsUI();
  saveProject();
  showToast('서치 결과를 초기화했습니다.');
}

function deleteSearchResult(index) {
  if (!state.searchResults?.products?.length) return;
  const product = state.searchResults.products[index];
  if (!product) return;
  const label = `${product.brand} ${product.model}`.trim() || '후보';
  if (!confirm(`«${label}» 후보를 목록에서 삭제할까요?`)) return;
  state.searchResults.products.splice(index, 1);
  state.searchResults.products.forEach((p, i) => {
    p.rank = i + 1;
  });
  if (!state.searchResults.products.length) {
    state.searchResults = null;
    resetSearchResultsUI();
    showToast('서치 결과를 초기화했습니다.');
  } else {
    renderSearchResults(state.searchResults);
    showToast('후보를 삭제했습니다.');
  }
  saveProject();
}

async function runDeviceSearch() {
  if (!state.apiKey) return showToast('Google API 키를 입력하세요. (상단 API)', true);
  if (!RESEARCH) return showToast('리서치 모듈을 불러오지 못했습니다.', true);

  const criteria = getSearchCriteriaFromDOM();
  const profile = RESEARCH.getDeviceProfile(criteria.deviceId);
  if (criteria.extra) criteria.priorities = [...criteria.priorities, criteria.extra];

  const statusEl = $('#search-status');
  if (statusEl) statusEl.textContent = `${profile.label} 쿼리 계획 중… (3.1 Pro, 2~4분)`;

  setLoading(true, `${profile.label} 서치 중…`);
  try {
    const result = await RESEARCH.searchDevices(state.apiKey, criteria, {
      model: state.modelPro,
      onProgress: (p) => {
        const phaseLabels = {
          plan: '쿼리 계획',
          discover: '후보 발굴',
          verify: '제품 검증',
          synthesize: '순위 정리',
        };
        const label = p.message || phaseLabels[p.phase] || p.label || p.phase;
        if (statusEl) {
          if (p.phase === 'verify' && p.total != null) {
            statusEl.textContent = `${profile.label} ${label} (${p.index + 1}/${p.total})`;
          } else {
            statusEl.textContent = `${profile.label} ${label}`;
          }
        }
        setLoading(true, label);
      },
    });
    state.searchResults = result;
    state.searchDeviceId = criteria.deviceId;
    renderSearchResults(result);
    const sum = result.summary || result.audit?.summary;
    if (statusEl) {
      const verified = sum ? ` · 검증 ${sum.verifiedCount}/${sum.totalProducts}` : '';
      statusEl.textContent = `${profile.label} ${result.products.length}개 후보${verified} · ${new Date().toLocaleString('ko-KR')}`;
    }
    RESEARCH_LOG?.logRun({
      deviceId: criteria.deviceId,
      deviceLabel: profile.label,
      model: result.model || state.modelPro,
      criteria,
      phases: result.auditPhases || result.audit?.phases,
      summary: sum,
      finalProducts: result.products.map((p) => ({
        brand: p.brand,
        model: p.model,
        modelCode: p.modelCode,
        verified: p.verified,
        verificationStatus: p.verificationStatus,
        officialUrl: p.officialUrl,
        purchaseUrl: p.purchaseUrl,
        linkWarnings: p.linkWarnings,
        verificationNotes: p.verificationNotes,
      })),
    });
    saveProject();
    updateWorkflowStep(2);
    const vCount = sum?.verifiedCount ?? 0;
    showToast(`${profile.label} 후보 ${result.products.length}개 (검증 ${vCount}개) — 브리프에 적용하세요.`);
  } catch (e) {
    reportError('searchDevice', e, { model: state.modelPro, device: criteria.deviceId });
    if (statusEl) statusEl.textContent = '';
  } finally {
    setLoading(false);
  }
}

function applyResearchProduct(index) {
  const product = state.searchResults?.products?.[index];
  if (!product || !RESEARCH) return;

  const deviceId = state.searchResults.deviceId || state.searchDeviceId;
  const patch = RESEARCH.productToBriefPatch(product, deviceId);
  state.searchDeviceId = patch.deviceId || deviceId;
  state.categoryId = patch.categoryId;
  state.productName = patch.productName;
  state.priceInfo = patch.priceInfo;
  state.contentDirection = patch.contentDirection;
  state.productSpecs = { ...patch.productSpecs };
  state.reviewBrief = { ...patch.reviewBrief };
  state.productNotes = patch.productNotes;

  applyBriefToDOM();
  updateCategoryHint();
  saveProject();
  updateWorkflowStep(3);
  updateGenerateButtons();
  showToast(`«${patch.productName}» 브리프에 적용했습니다.`);
}

function hasUnsavedWork() {
  return !!(
    state.productName.trim() ||
    state.contentDirection.trim() ||
    state.productNotes.trim() ||
    state.priceInfo.trim() ||
    Object.values(state.productSpecs || {}).some((v) => String(v).trim()) ||
    Object.values(state.reviewBrief || {}).some((v) => String(v).trim()) ||
    state.referenceScripts.length ||
    state.adGuides.length ||
    state.adMode ||
    state.adBrand.trim() ||
    state.partLineup.length ||
    state.allRows.length
  );
}

function bindBeforeUnload() {
  window.addEventListener('beforeunload', (e) => {
    if (!hasUnsavedWork()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function renderCategoryOptions() {
  const select = $('#category');
  if (!select || !CATEGORIES.length) return;
  select.innerHTML = CATEGORIES.map(
    (c) => `<option value="${c.id}">${c.name} — ${c.examples}</option>`
  ).join('');
  select.value = state.categoryId;
}

function updateCategoryHint() {
  const cat =
    CATEGORIES.find((c) => c.id === state.categoryId) ||
    CATEGORIES.find((c) => c.id === 'other');
  const hint = $('#category-hint');
  if (hint) hint.textContent = `촬영 포인트: ${cat.focusHints}`;
}

function autoDetectCategory() {
  syncSpecsFromDOM();
  const detected = detectCategory(
    state.productName,
    state.productNotes,
    state.contentDirection
  );
  onCategoryChange(detected.id);
  $('#category').value = detected.id;
  showToast(`카테고리 자동 감지: ${detected.name}`);
}

function hideToast() {
  const el = $('#toast');
  if (!el) return;
  clearTimeout(showToast._t);
  showToast._t = null;
  el.classList.remove('visible');
  el.setAttribute('aria-hidden', 'true');
}

function showToast(msg, isError = false) {
  const el = $('#toast');
  if (!el) return;
  if (!msg) {
    hideToast();
    return;
  }

  const now = Date.now();
  if (showToast._lastMsg === msg && now - (showToast._lastAt || 0) < 600) return;
  showToast._lastMsg = msg;
  showToast._lastAt = now;

  el.textContent = msg;
  el.className = `toast${isError ? ' error' : ''}`;
  requestAnimationFrame(() => {
    el.classList.add('visible');
    el.setAttribute('aria-hidden', 'false');
  });

  clearTimeout(showToast._t);
  showToast._t = setTimeout(hideToast, isError ? 4000 : 2500);
}

function bindToastDismiss() {
  const el = $('#toast');
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('click', hideToast);
}

function reportError(context, err, meta = {}, options = {}) {
  const error = err instanceof Error ? err : new Error(String(err));
  const merged = {
    ...meta,
    ...(error.apiModel ? { model: error.apiModel } : {}),
    ...(error.apiStatus ? { status: error.apiStatus } : {}),
    ...(error.finishReason ? { finishReason: error.finishReason } : {}),
  };
  if (LOG) LOG.log(context, error, merged);
  else console.error(`[${context}]`, error, merged);
  if (!options.silent) {
    const toastKey = `${context}:${error.message}`;
    const now = Date.now();
    if (
      reportError._toastKey === toastKey &&
      now - (reportError._toastAt || 0) < 2500
    ) {
      return;
    }
    reportError._toastKey = toastKey;
    reportError._toastAt = now;
    showToast(error.message, true);
  }
}

function closeOtherDrawers(exceptPanelId) {
  const drawers = [
    ['#settings-panel', '#toggle-settings'],
    ['#prompt-panel', '#toggle-prompt'],
    ['#error-log-panel', '#toggle-error-log'],
  ];
  drawers.forEach(([panelId, btnId]) => {
    if (panelId === exceptPanelId) return;
    $(panelId)?.classList.add('collapsed');
    $(btnId)?.classList.remove('btn-active');
  });
}

function bindErrorLogging() {
  window.addEventListener('unhandledrejection', (e) => {
    reportError(
      'unhandledrejection',
      e.reason instanceof Error ? e.reason : new Error(String(e.reason))
    );
  });
  flushEarlyErrors();
}

function flushEarlyErrors() {
  const early = window.__earlyErrors;
  if (!early?.length || !LOG) return;
  early.forEach((item) => {
    LOG.log('window.error', new Error(item.message || '스크립트 오류'), {
      source: item.filename,
      line: item.lineno,
    });
  });
  window.__earlyErrors = [];
}

function switchLogTab(tabId) {
  const isError = tabId === 'error';
  document.querySelectorAll('.log-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.logTab === tabId);
  });
  $('#log-tab-error')?.classList.toggle('hidden', !isError);
  $('#log-tab-research')?.classList.toggle('hidden', isError);
  if (isError) LOG?.render();
  else RESEARCH_LOG?.render();
}

function bindErrorLogUI() {
  $('#toggle-error-log')?.addEventListener('click', () => {
    togglePanel('#error-log-panel', '#toggle-error-log');
  });
  document.querySelectorAll('.log-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchLogTab(btn.dataset.logTab));
  });
  $('#btn-log-clear')?.addEventListener('click', () => {
    const activeTab = document.querySelector('.log-tab.active')?.dataset.logTab || 'error';
    if (activeTab === 'research') {
      if (RESEARCH_LOG?.getEntries().length && !confirm('서치 감사 로그를 모두 삭제할까요?')) return;
      RESEARCH_LOG?.clear();
      showToast('서치 감사 로그를 비웠습니다.');
      return;
    }
    if (LOG?.getEntries().length && !confirm('오류 로그를 모두 삭제할까요?')) return;
    LOG?.clear();
    showToast('오류 로그를 비웠습니다.');
  });
  $('#btn-log-copy')?.addEventListener('click', async () => {
    const activeTab = document.querySelector('.log-tab.active')?.dataset.logTab || 'error';
    const text = activeTab === 'research' ? RESEARCH_LOG?.toExportText() : LOG?.toExportText();
    if (!text) return showToast('복사할 로그가 없습니다.', true);
    try {
      await navigator.clipboard.writeText(text);
      showToast(activeTab === 'research' ? '서치 감사 로그를 복사했습니다.' : '오류 로그를 복사했습니다.');
    } catch (e) {
      reportError('error-log.copy', e);
    }
  });
  $('#btn-log-export')?.addEventListener('click', () => {
    const activeTab = document.querySelector('.log-tab.active')?.dataset.logTab || 'error';
    const ok =
      activeTab === 'research' ? RESEARCH_LOG?.downloadTxt() : LOG?.downloadTxt();
    if (!ok) showToast('저장할 로그가 없습니다.', true);
    else showToast(activeTab === 'research' ? '서치 감사 로그를 저장했습니다.' : '오류 로그 txt를 저장했습니다.');
  });
}

function setLoading(on, text = '생성 중…') {
  const overlay = $('#loading-overlay');
  if (overlay) overlay.classList.toggle('hidden', !on);
  const loadingText = $('#loading-text');
  if (loadingText) loadingText.textContent = text;
  document
    .querySelectorAll(
      'main button, main input, main textarea, main select, .action-dock button, .action-dock input, .drawer button, .drawer input, .drawer textarea, .drawer select'
    )
    .forEach((el) => {
      el.disabled = on;
    });
}

function togglePanel(panelId, btnId) {
  const panel = $(panelId);
  const btn = $(btnId);
  if (!panel) return;
  const willOpen = panel.classList.contains('collapsed');
  if (willOpen) closeOtherDrawers(panelId);
  panel.classList.toggle('collapsed');
  if (btn) btn.classList.toggle('btn-active', willOpen);
  if (willOpen && panelId === '#prompt-panel') loadPromptEditor();
  if (willOpen && panelId === '#error-log-panel') {
    const activeTab = document.querySelector('.log-tab.active')?.dataset.logTab || 'error';
    if (activeTab === 'research') RESEARCH_LOG?.render();
    else LOG?.render();
  }
}

function workflowPageForStep(step) {
  if (step <= 1) return 1;
  if (step <= 3) return 2;
  if (step <= 6) return 3;
  return 4;
}

function updateRailDoneState() {
  const maxPage = workflowPageForStep(state.workflowStep || 1);
  document.querySelectorAll('.step-rail-item').forEach((el) => {
    const n = Number(el.dataset.rail);
    el.classList.toggle('done', n < maxPage);
  });
}

function navigateToPage(page) {
  const shell = document.querySelector('.app-shell');
  if (shell) {
    shell.dataset.page = String(page);
    shell.classList.toggle('page-conti', page === 4);
  }
  document.body.dataset.workflowPage = String(page);
  state.currentPage = page;

  document.querySelectorAll('.step-rail-item').forEach((el) => {
    const n = Number(el.dataset.rail);
    el.classList.toggle('active', n === page);
  });
  updateRailDoneState();

  document.querySelectorAll('.work-column .step-section').forEach((el) => {
    const n = Number(el.dataset.step);
    const visible = n === page;
    el.classList.toggle('page-visible', visible);
    el.classList.toggle('step-active', visible);
    el.classList.toggle('step-collapsed', !visible);
    el.classList.toggle('step-done', n < page);
  });

  updateActionDock();
}

function updateWorkflowStep(step) {
  state.workflowStep = step;
  navigateToPage(workflowPageForStep(step));
}

function getSegmentForRow(rowIndex) {
  return state.partSegments.find(
    (s) => rowIndex >= s.start && rowIndex <= s.end
  );
}

function isPartGenerated(partIndex) {
  return state.partSegments.some((s) => s.partIndex === partIndex);
}

function countGeneratedParts() {
  return state.partSegments.length;
}

function getInsertPosition(partIndex) {
  let pos = 0;
  for (let i = 0; i < partIndex; i++) {
    const seg = state.partSegments.find((s) => s.partIndex === i);
    if (seg) pos = seg.end + 1;
  }
  return pos;
}

function removePartRows(partIndex) {
  const segIdx = state.partSegments.findIndex((s) => s.partIndex === partIndex);
  if (segIdx < 0) return 0;
  const seg = state.partSegments[segIdx];
  const count = seg.end - seg.start + 1;
  state.allRows.splice(seg.start, count);
  state.partSegments.splice(segIdx, 1);
  for (const s of state.partSegments) {
    if (s.start > seg.start) {
      s.start -= count;
      s.end -= count;
    }
  }
  return count;
}

function insertPartRows(partIndex, partName, rows) {
  removePartRows(partIndex);
  const insertAt = getInsertPosition(partIndex);
  state.allRows.splice(insertAt, 0, ...rows);
  const len = rows.length;
  for (const s of state.partSegments) {
    if (s.start >= insertAt) {
      s.start += len;
      s.end += len;
    }
  }
  recordPartSegment(partIndex, partName, insertAt, insertAt + len - 1);
  state.currentPartIndex = Math.max(state.currentPartIndex, partIndex);
}

function recordPartSegment(partIndex, partName, start, end) {
  const seg = { partIndex, partName, start, end };
  const existing = state.partSegments.findIndex((s) => s.partIndex === partIndex);
  if (existing >= 0) state.partSegments[existing] = seg;
  else state.partSegments.push(seg);
  state.partSegments.sort((a, b) => a.partIndex - b.partIndex);
}

function getPreviousPartsContext(partIndex) {
  const prior = state.partSegments
    .filter((s) => s.partIndex < partIndex)
    .sort((a, b) => a.partIndex - b.partIndex);
  if (!prior.length) return '';
  const last = prior[prior.length - 1];
  return `\n이전 파트에서 다룬 내용 요약:\n${state.allRows
    .slice(last.start, last.end + 1)
    .slice(-5)
    .map((r) => r.대본)
    .join(' ')}`;
}

function getPendingPartsLabel() {
  const pending = state.partLineup
    .map((name, i) => (!isPartGenerated(i) ? name : null))
    .filter(Boolean);
  return pending.length ? pending.join(', ') : '(없음)';
}

function selectPart(partIndex) {
  if (!state.lineupConfirmed) return;
  state.selectedPartIndex = partIndex;
  const name = state.partLineup[partIndex];
  const hasSeg = isPartGenerated(partIndex);
  renderPartLineup();
  renderTable();
  updateActionDock();
  updateGenerateButtons();
  if (hasSeg) {
    showToast(`"${name}" 선택 — AI 수정 또는 [파트 생성]으로 다시 작성`);
  } else {
    showToast(`"${name}" 선택 — [파트 생성]으로 작성`);
  }
}

/** @deprecated use selectPart */
function selectPartForRevision(partIndex) {
  selectPart(partIndex);
}

function updateActionDock() {
  const label = $('#dock-part-label');
  const progress = $('#dock-progress');
  const btnRevise = $('#btn-revise-part');
  const btnReviseLineup = $('#btn-revise-lineup');

  if (btnReviseLineup) {
    btnReviseLineup.disabled =
      !state.apiKey || !state.partLineup.length || state.lineupConfirmed;
  }

  if (!state.lineupConfirmed) {
    if (label) label.textContent = '파트 구성을 확정하세요';
    if (progress) progress.textContent = state.partLineup.length
      ? `${state.partLineup.length}개 파트 초안`
      : '';
    if (btnRevise) btnRevise.disabled = true;
    return;
  }

  const done = countGeneratedParts();
  const total = state.partLineup.length;

  if (state.selectedPartIndex !== null) {
    const name = state.partLineup[state.selectedPartIndex];
    const hasSeg = isPartGenerated(state.selectedPartIndex);
    if (label) {
      label.textContent = hasSeg ? `수정 대상: ${name}` : `작성 대상: ${name}`;
    }
    if (progress) progress.textContent = `${done}/${total} 파트 완료 · 미작성: ${getPendingPartsLabel()}`;
    if (btnRevise) btnRevise.disabled = !state.apiKey || !hasSeg;
  } else if (done < total) {
    const nextIdx = state.partLineup.findIndex((_, i) => !isPartGenerated(i));
    const next = nextIdx >= 0 ? state.partLineup[nextIdx] : '';
    if (label) label.textContent = next ? `다음 추천: ${next}` : '파트를 선택하세요';
    if (progress) progress.textContent = `${done}/${total} 파트 완료`;
    if (btnRevise) btnRevise.disabled = true;
  } else if (done >= total && total > 0) {
    if (label) label.textContent = '전체 파트 완료';
    if (progress) progress.textContent = `${total}/${total}`;
    if (btnRevise) {
      btnRevise.disabled =
        state.selectedPartIndex === null || !isPartGenerated(state.selectedPartIndex) || !state.apiKey;
    }
  }
}

async function callGemini(userPrompt, temperature = 0.7, modelId = null, options = {}) {
  const model = modelId || state.modelLite;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;

  const generationConfig = {
    temperature,
    responseMimeType: 'application/json',
  };
  if (options.responseSchema) {
    generationConfig.responseSchema = options.responseSchema;
  }

  const body = {
    systemInstruction: { parts: [{ text: getSystemRules() }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig,
  };

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
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = candidate?.finishReason || '';
    const blockReason = data?.promptFeedback?.blockReason || '';
    const hint = finishReason || blockReason;
    const msg =
      finishReason === 'SAFETY' || blockReason
        ? `응답 차단${hint ? `: ${hint}` : ''}`
        : '응답이 비어 있습니다.';
    const e = new Error(msg);
    e.apiModel = model;
    e.finishReason = finishReason;
    throw e;
  }
  return text;
}

const LINEUP_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    lineup: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    reason: { type: 'STRING' },
  },
  required: ['lineup'],
};

const LINEUP_SCHEMA_LINEUP_ONLY = {
  type: 'OBJECT',
  properties: {
    lineup: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: ['lineup'],
};

function stripJsonFences(text) {
  return String(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function findJsonObjectBounds(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

function repairJsonText(s) {
  return s
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([\]}])/g, '$1');
}

function parseJsonLoose(raw) {
  const candidates = [
    String(raw).trim(),
    stripJsonFences(raw),
    findJsonObjectBounds(stripJsonFences(raw)),
    repairJsonText(findJsonObjectBounds(stripJsonFences(raw))),
  ];
  const seen = new Set();
  let lastErr;
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return JSON.parse(candidate);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('JSON 파싱 실패');
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

function extractReasonLoose(text) {
  const m = text.match(/"reason"\s*:\s*"([\s\S]*?)"\s*[,}]/i);
  if (!m) return '';
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1].replace(/\\"/g, '"').trim();
  }
}

function extractLineupStringsLoose(text) {
  const arr = extractBracketArray(text, 'lineup') || extractBracketArray(text, 'parts');
  if (arr?.length) return arr;
  const block = text.match(/"lineup"\s*:\s*\[([\s\S]*?)\]/i) || text.match(/"parts"\s*:\s*\[([\s\S]*?)\]/i);
  if (!block) return null;
  const items = [];
  const itemRe = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = itemRe.exec(block[1]))) {
    try {
      items.push(JSON.parse(`"${m[1]}"`));
    } catch {
      items.push(m[1]);
    }
  }
  return items.length ? items : null;
}

function parseLineupJson(raw) {
  const text = stripJsonFences(raw);
  let lineup;
  let reason = '';

  try {
    const parsed = parseJsonLoose(text);
    lineup = parsed.lineup || parsed.parts;
    reason = String(parsed.reason || '');
  } catch (e) {
    lineup = extractLineupStringsLoose(text);
    reason = extractReasonLoose(text);
    if (!lineup?.length) {
      throw new Error(`파트 구성 JSON 파싱 실패: ${e.message}`);
    }
  }

  if (!Array.isArray(lineup) || !lineup.length) {
    throw new Error('lineup 배열이 없거나 비어 있습니다.');
  }

  return {
    lineup: lineup.map((p) => String(p).trim()).filter(Boolean),
    reason,
  };
}

async function requestLineupFromGemini(prompt, temperature = 0.35) {
  const model = getLineupModel();
  const jsonRule =
    '\n\nreason은 한 줄 설명만(큰따옴표·줄바꿈 없이). 파트 이름은 1~3단어. JSON만 출력.';
  const attempts = [
    { text: prompt + jsonRule, temp: temperature, schema: LINEUP_RESPONSE_SCHEMA },
    {
      text: `${prompt}${jsonRule}\n\n[재시도] {"lineup":["프롤로그","디자인",...],"reason":"한줄"}`,
      temp: 0.15,
      schema: LINEUP_RESPONSE_SCHEMA,
    },
    {
      text: `${prompt}\n\nreason 생략. {"lineup":["프롤로그","디자인","실사용","가격","총평"]} 만 출력.`,
      temp: 0.1,
      schema: LINEUP_SCHEMA_LINEUP_ONLY,
    },
  ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      const raw = await callGemini(attempt.text, attempt.temp, model, {
        responseSchema: attempt.schema,
      });
      return parseLineupJson(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('파트 구성 JSON 파싱 실패');
}

function parseRowsJson(raw) {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`대본 JSON 파싱 실패: ${e.message}`);
  }
  const rows = parsed.rows || parsed;
  if (!Array.isArray(rows)) throw new Error('rows 배열이 없습니다.');
  if (!rows.length) throw new Error('rows가 비어 있습니다.');
  return rows.map((r) => ({
    대본: String(r.대본 || r.script || '').trim(),
    장면: String(r.장면 || r.scene || '').trim(),
    사이즈: String(r.사이즈 || r.size || '').trim(),
    자막: String(r.자막 || r.subtitle || '').trim(),
    코멘트: String(r.코멘트 || r.comment || '').trim(),
  }));
}

const ROW_CHARS_MIN = 20;
const ROW_CHARS_TARGET_MAX = 45;
const ROW_CHARS_HARD_MAX = 50;

function getNarrationRhythmBlock() {
  return `
# [대본 호흡·행 분할 — 반드시 준수]
- **반드시 호흡마다 행을 나눕니다.** 한 행 = 성우가 한 번에 읽는 한 호흡.
- 1행 길이: 공백 포함 **25~45자** (절대 **50자 초과 금지**). 100자 넘는 장문을 한 행에 넣지 마세요.
- 마침표마다 무조건 분리하지 말되, **호흡이 바뀌면 새 행**. 이어지는 절은 쉼표·연결어미에서 나눌 수 있음.
- **금지①**: 문장마다 15자 내외 초단문만 연속 나열
- **금지②**: 여러 문장·장문을 한 셀에 합침 (스프레드시트 1행 = 대본 1호흡)
- 연속 내레이션·같은 장면: 장면 열에 '컷 유지'
- 좋은 예 (3행):
  "물론 별도로 판매하는 전용 커버를 사용하면 스탠드 기능을 추가할 수 있습니다."
  "저는 개인적으로 영상 시청이 주 목적이라면 이런 액세서리를 활용해"
  "거치 환경을 만드는 것을 적극적으로 추천해 드리고 싶습니다."
- 나쁜 예: 위 3문장을 한 행에 합침 / "전체적인 외관은 깔끔합니다."만 단독 10자 행 반복`;
}

function detectChoppyRhythm(rows, partName = '') {
  if (isProloguePart(partName) || rows.length < 6) return null;
  const shortRows = rows.filter((r) => r.대본.length < ROW_CHARS_MIN);
  if (shortRows.length / rows.length > 0.35) {
    return `호흡 리듬: ${rows.length}행 중 ${shortRows.length}행이 ${ROW_CHARS_MIN}자 미만 (너무 잘게 쪼갬)`;
  }
  return null;
}

function detectOverlongRows(rows, partName = '') {
  if (isProloguePart(partName)) return null;
  const longRows = rows.filter((r) => r.대본.length > ROW_CHARS_HARD_MAX);
  if (longRows.length) {
    return `행 분할 부족: ${longRows.length}행이 ${ROW_CHARS_HARD_MAX}자 초과 — 호흡마다 나눠 행당 25~45자`;
  }
  const avg = rows.reduce((s, r) => s + r.대본.length, 0) / rows.length;
  if (avg > 48) {
    return `평균 ${Math.round(avg)}자/행 — 장문 합침. 호흡 단위로 더 잘게 나누세요 (목표 25~45자)`;
  }
  return null;
}

function shortenPartName(name) {
  const rules = [
    [/프롤로그|오프닝/i, '프롤로그'],
    [/구성품|언박싱/i, '구성품'],
    [/디자인|첫인상|외관/i, '디자인'],
    [/성능|기술|스펙|디스플레이/i, '성능'],
    [/실사용|환경/i, '실사용'],
    [/편의|연결|앱/i, '편의성'],
    [/관리|유지/i, '관리'],
    [/단점|한계|아쉬운/i, '단점'],
    [/가격/i, '가격'],
    [/총평|클로징/i, '총평'],
  ];
  const text = String(name || '').trim();
  for (const [re, label] of rules) {
    if (re.test(text)) return label;
  }
  const word = text.split(/[\s 및·]+/).find(Boolean) || text;
  return word.length > 8 ? word.slice(0, 6) : word;
}

function normalizePartLineup(lineup) {
  const seen = new Set();
  return lineup
    .map((p) => shortenPartName(p))
    .filter((p) => {
      if (!p || seen.has(p)) return false;
      seen.add(p);
      return true;
    });
}

function isProloguePart(partName) {
  return /프롤로그|오프닝/i.test(partName || '');
}

function isClosingPart(partName) {
  return /총평|클로징/i.test(partName || '');
}

function getPartVolumePrompt(partName) {
  if (isProloguePart(partName)) {
    return `[프롤로그 전용 분량 — 시스템 프롬프트보다 이 지침 우선]
- 반드시 8행 이하로 작성 (9행 이상 절대 금지)
- 일반 파트 규칙(20~25행, 1,600~2,000 bytes)은 이 파트에 적용하지 마세요
- 오프닝 고정 멘트(안녕하세요 디디딧입니다 ~ 리뷰 시작하겠습니다)를 모두 포함
- 권장 4~8행, 대본 총 약 400~800 UTF-8 bytes
- 행마다 장면·사이즈 포함. 대본은 호흡에 맞게 짧게`;
  }
  if (isClosingPart(partName)) {
    return `이 파트만 14~20행, 대본 총 1,600~2,000 UTF-8 bytes로 작성하세요.
클로징 고정 멘트를 반드시 포함할 것.
${getNarrationRhythmBlock()}
행마다 장면(모델 행동·카메라 구도)·사이즈(샷 크기) 포함.`;
  }
  return `이 파트만 14~20행, 대본 총 1,600~2,000 UTF-8 bytes로 작성하세요.
${getNarrationRhythmBlock()}
행마다 장면(모델 행동·카메라 구도)·사이즈(샷 크기) 포함.`;
}

function getPartRetryHint(partName) {
  if (isProloguePart(partName)) {
    return '\n\n[재시도] 프롤로그는 8행 이하만 허용. 9행 이상·1600bytes·20행 규칙 적용 금지. 오프닝 고정 멘트 포함.';
  }
  return '\n\n[재시도] 50자 넘는 행 절대 금지. 호흡마다 행 분할(행당 25~45자). 장문 합치지 말 것. 14~22행, 1600~2000 bytes.';
}

function shouldAcceptPartRows(rows, validation, partName) {
  if (isProloguePart(partName)) {
    return rows.length <= 8 && rows.length >= 3;
  }
  if (detectOverlongRows(rows, partName)) return false;
  if (detectChoppyRhythm(rows, partName)) return false;
  if (rows.some((r) => r.대본.length > ROW_CHARS_HARD_MAX)) return false;
  return validation.issues.length <= 3;
}

function validatePartRows(rows, partName = '') {
  const issues = [];
  const totalBytes = rows.reduce((s, r) => s + utf8ByteLength(r.대본), 0);

  if (isProloguePart(partName)) {
    if (rows.length > 8) {
      issues.push(`행 수 ${rows.length}개 (프롤로그 최대 8행)`);
    }
    if (rows.length < 3) {
      issues.push(`행 수 ${rows.length}개 (프롤로그 최소 3행)`);
    }
    if (totalBytes > 1000) {
      issues.push(`총 바이트 ${totalBytes} (프롤로그는 약 800 이하 권장)`);
    }
    rows.forEach((r, i) => {
      if (!r.장면) issues.push(`${i + 1}행 장면 누락`);
      if (!r.대본.trim()) issues.push(`${i + 1}행 대본 누락`);
    });
    return { totalBytes, rowCount: rows.length, issues };
  }

  if (rows.length < 14 || rows.length > 22) {
    issues.push(`행 수 ${rows.length}개 (목표 14~22, 호흡 단위)`);
  }
  if (totalBytes < 1600 || totalBytes > 2000) {
    issues.push(`총 바이트 ${totalBytes} (목표 1,600~2,000)`);
  }

  const choppy = detectChoppyRhythm(rows, partName);
  if (choppy) issues.push(choppy);
  const overlong = detectOverlongRows(rows, partName);
  if (overlong) issues.push(overlong);

  rows.forEach((r, i) => {
    const chars = r.대본.length;
    const bytes = utf8ByteLength(r.대본);
    if (chars < ROW_CHARS_MIN) {
      issues.push(`${i + 1}행 너무 짧음 (${chars}자) — 인접 호흡과 합치거나 내용 보강`);
    } else if (chars > ROW_CHARS_HARD_MAX) {
      issues.push(`${i + 1}행 너무 김 (${chars}자) — 호흡마다 나눠 25~45자로`);
    } else if (chars > ROW_CHARS_TARGET_MAX) {
      issues.push(`${i + 1}행 다소 김 (${chars}자, 목표 25~45)`);
    }
    if (bytes > 135) {
      issues.push(`${i + 1}행 바이트 ${bytes} (한 호흡 분량 초과)`);
    }
    if (!r.장면) issues.push(`${i + 1}행 장면 누락`);
  });

  return { totalBytes, rowCount: rows.length, issues };
}

function getRevisionRhythmBoost(notes) {
  if (!notes) return '';
  if (/나눠|분할|길|장문|쪼개|행\s*나|잘라/.test(notes)) {
    return `
[수정 최우선 — 행 분할]
- 50자 넘는 대본은 반드시 여러 행으로 나누세요.
- 행당 25~45자, 호흡 단위. 같은 장면은 '컷 유지'.`;
  }
  if (/호흡|리듬|끊|합쳐|병합|짧게|나열/.test(notes)) {
    return `
[수정 최우선 — 호흡 리듬]
- 너무 잘게 쪼갠 행은 인접 호흡끼리만 합치세요 (행당 25~45자 유지).
- 50자 넘게 합치지 마세요.`;
  }
  return '';
}

function renderPartLineup() {
  const editor = $('#part-lineup-editor');
  const chips = $('#part-lineup');
  const status = $('#lineup-status');

  if (!state.partLineup.length) {
    if (editor) editor.innerHTML = '<p class="muted">① [파트 초안 생성]을 눌러 AI 초안을 만드세요.</p>';
    if (chips) chips.innerHTML = '';
    if (status) status.textContent = '상태: 초안 없음';
    updateGenerateButtons();
    return;
  }

  if (!state.lineupConfirmed && editor) {
    editor.innerHTML = state.partLineup
      .map(
        (p, i) => `
      <div class="lineup-row" data-idx="${i}">
        <span class="lineup-drag-num">${i + 1}</span>
        <input class="lineup-name-input" data-idx="${i}" value="${esc(p)}" />
        <div class="lineup-row-actions">
          <button class="btn-icon btn-part-up" data-idx="${i}" type="button" title="위로" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-icon btn-part-down" data-idx="${i}" type="button" title="아래로" ${i === state.partLineup.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-icon btn-part-del" data-idx="${i}" type="button" title="삭제">✕</button>
        </div>
      </div>`
      )
      .join('');

    editor.querySelectorAll('.lineup-name-input').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.idx);
        state.partLineup[idx] = e.target.value.trim();
      });
    });
    editor.querySelectorAll('.btn-part-up').forEach((btn) => {
      btn.addEventListener('click', () => movePart(Number(btn.dataset.idx), -1));
    });
    editor.querySelectorAll('.btn-part-down').forEach((btn) => {
      btn.addEventListener('click', () => movePart(Number(btn.dataset.idx), 1));
    });
    editor.querySelectorAll('.btn-part-del').forEach((btn) => {
      btn.addEventListener('click', () => removePart(Number(btn.dataset.idx)));
    });
    if (editor) editor.classList.remove('hidden');
    if (chips) chips.innerHTML = '';
  } else if (chips) {
    chips.innerHTML = state.partLineup
      .map((p, i) => {
        const hasSeg = isPartGenerated(i);
        const isSelected = state.selectedPartIndex === i;
        const classes = [
          'part-chip',
          'clickable',
          hasSeg ? 'done' : 'pending',
          isSelected ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const mark = hasSeg ? '✓' : '○';
        const title = hasSeg
          ? '클릭: 수정·재생성 대상 선택'
          : '클릭: 이 파트만 작성';
        return `
      <div class="${classes}" data-part-idx="${i}" role="button" tabindex="0" title="${title}">
        <span class="part-num">${mark}</span>
        <span class="part-name">${esc(p)}</span>
      </div>`;
      })
      .join('');
    chips.querySelectorAll('.part-chip.clickable').forEach((chip) => {
      chip.addEventListener('click', () => selectPart(Number(chip.dataset.partIdx)));
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectPart(Number(chip.dataset.partIdx));
        }
      });
    });
    if (editor) editor.innerHTML = '';
  }

  if (status) {
    if (!state.lineupConfirmed) {
      status.textContent = '상태: 초안 — 수정 후 ② [파트 구성 확정]';
    } else {
      const done = countGeneratedParts();
      const total = state.partLineup.length;
      if (done === total) {
        status.textContent = `상태: 전체 완료 (${total}/${total} 파트)`;
      } else if (done > 0) {
        status.textContent = `상태: ${done}/${total} 파트 작성됨 — 칩 클릭으로 원하는 파트만 추가 작성`;
      } else {
        status.textContent = `상태: 확정됨 (${total}개) — 칩 클릭 후 [파트 생성]`;
      }
    }
  }

  const addRow = document.querySelector('.lineup-add-row');
  if (addRow) {
    addRow.classList.toggle('hidden', state.lineupConfirmed || !state.partLineup.length);
  }

  const selectHint = $('#part-select-hint');
  if (selectHint) {
    selectHint.classList.toggle('hidden', !state.lineupConfirmed || !state.partLineup.length);
  }

  updateGenerateButtons();
  updateActionDock();
}

function movePart(index, dir) {
  const next = index + dir;
  if (next < 0 || next >= state.partLineup.length) return;
  const arr = [...state.partLineup];
  [arr[index], arr[next]] = [arr[next], arr[index]];
  state.partLineup = arr;
  renderPartLineup();
}

function removePart(index) {
  if (state.partLineup.length <= 3) {
    return showToast('최소 3개 파트는 유지해야 합니다.', true);
  }
  state.partLineup.splice(index, 1);
  renderPartLineup();
}

function addPartFromInput() {
  if (state.lineupConfirmed) return showToast('확정된 구성입니다. [구성 다시 편집]을 누르세요.', true);
  const name = $('#new-part-name')?.value.trim();
  if (!name) return showToast('추가할 파트 이름을 입력하세요.', true);
  state.partLineup.push(name);
  $('#new-part-name').value = '';
  renderPartLineup();
  showToast(`"${name}" 파트 추가됨`);
}

function addPartFromPool() {
  if (state.lineupConfirmed) return showToast('확정된 구성입니다. [구성 다시 편집]을 누르세요.', true);
  const sel = $('#part-pool-select');
  const name = sel?.value;
  if (!name) return;
  if (state.partLineup.includes(name)) {
    return showToast('이미 있는 파트입니다.', true);
  }
  state.partLineup.push(name);
  renderPartLineup();
}

function resetLineupToDraft() {
  if (!state.draftLineup.length) return showToast('되돌릴 초안이 없습니다.', true);
  state.partLineup = [...state.draftLineup];
  state.lineupConfirmed = false;
  state.currentPartIndex = -1;
  state.allRows = [];
  state._lastPartRows = [];
  state.partSegments = [];
  state.selectedPartIndex = null;
  renderPartLineup();
  renderTable();
  showToast('AI 초안으로 되돌렸습니다.');
}

function unlockLineupEdit() {
  if (state.allRows.length && !confirm('이미 생성된 대본이 있습니다. 구성을 수정하면 대본이 초기화됩니다. 계속할까요?')) {
    return;
  }
  state.lineupConfirmed = false;
  state.currentPartIndex = -1;
  state.allRows = [];
  state._lastPartRows = [];
  state.partSegments = [];
  state.selectedPartIndex = null;
  renderPartLineup();
  renderTable();
  showToast('파트 구성 편집 모드입니다.');
}

function validateLineupRequired() {
  const joined = state.partLineup.join(' ');
  const missing = REQUIRED_PART_KEYWORDS.filter((kw) => !joined.includes(kw));
  return missing;
}

function updateGenerateButtons() {
  const btnDraft = $('#btn-draft');
  const btnConfirm = $('#btn-confirm-lineup');
  const btnPart = $('#btn-generate-part');
  const btnUnlock = $('#btn-unlock-lineup');

  if (btnDraft) btnDraft.disabled = !state.apiKey || !state.productName.trim();
  if (btnConfirm) {
    btnConfirm.disabled = !state.partLineup.length || state.lineupConfirmed;
  }
  if (btnUnlock) {
    btnUnlock.classList.toggle('hidden', !state.lineupConfirmed);
  }
  if (btnPart) {
    const setGenBtn = (label, title) => {
      btnPart.textContent = label;
      btnPart.title = title || label;
    };
    if (!state.lineupConfirmed || !state.partLineup.length) {
      btnPart.disabled = true;
      setGenBtn('③ 생성', '파트 생성');
    } else if (countGeneratedParts() >= state.partLineup.length) {
      if (state.selectedPartIndex !== null && isPartGenerated(state.selectedPartIndex)) {
        const name = state.partLineup[state.selectedPartIndex];
        btnPart.disabled = !state.apiKey;
        setGenBtn('③ 재생성', `다시 생성: ${name}`);
      } else {
        btnPart.disabled = true;
        setGenBtn('③ 완료', '전체 파트 완료');
      }
    } else if (state.selectedPartIndex !== null) {
      btnPart.disabled = !state.apiKey;
      const name = state.partLineup[state.selectedPartIndex];
      setGenBtn(
        isPartGenerated(state.selectedPartIndex) ? '③ 재생성' : '③ 생성',
        isPartGenerated(state.selectedPartIndex) ? `다시 생성: ${name}` : `파트 생성: ${name}`
      );
    } else {
      btnPart.disabled = !state.apiKey;
      const nextIdx = state.partLineup.findIndex((_, i) => !isPartGenerated(i));
      const next = nextIdx >= 0 ? state.partLineup[nextIdx] : '';
      setGenBtn('③ 생성', next ? `파트 생성: ${next}` : '파트 생성');
    }
  }
  updateActionDock();
}

function renderTable() {
  const tbody = $('#script-table tbody');
  if (!state.allRows.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty">대본이 여기에 쌓입니다</td></tr>';
    updateStats();
    return;
  }

  const highlight = state.selectedPartIndex !== null;

  tbody.innerHTML = state.allRows
    .map((r, i) => {
      const seg = getSegmentForRow(i);
      const rowClasses = [];
      if (highlight && seg) {
        if (seg.partIndex === state.selectedPartIndex) rowClasses.push('part-selected');
        else rowClasses.push('part-dim');
      }
      return `
    <tr data-idx="${i}" class="${rowClasses.join(' ')}">
      <td><textarea class="cell-edit" data-field="대본" rows="2">${esc(r.대본)}</textarea></td>
      <td><textarea class="cell-edit" data-field="장면" rows="2">${esc(r.장면)}</textarea></td>
      <td><input class="cell-edit" data-field="사이즈" value="${esc(r.사이즈)}" /></td>
      <td><input class="cell-edit" data-field="자막" value="${esc(r.자막)}" /></td>
      <td><input class="cell-edit" data-field="코멘트" value="${esc(r.코멘트)}" /></td>
    </tr>`;
    })
    .join('');

  tbody.querySelectorAll('.cell-edit').forEach((el) => {
    el.addEventListener('change', onCellEdit);
  });

  updateStats();
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function onCellEdit(e) {
  const tr = e.target.closest('tr');
  const idx = Number(tr.dataset.idx);
  const field = e.target.dataset.field;
  state.allRows[idx][field] = e.target.value;
  updateStats();
}

function updateStats() {
  const totalBytes = state.allRows.reduce((s, r) => s + utf8ByteLength(r.대본), 0);
  $('#stat-rows').textContent = state.allRows.length;
  $('#stat-bytes').textContent = totalBytes.toLocaleString();

  const currentPart = state.partLineup[state.currentPartIndex];
  const partRows = state._lastPartRows || [];
  if (partRows.length && currentPart) {
    const v = validatePartRows(partRows, currentPart);
    const el = $('#part-validation');
    el.innerHTML =
      v.issues.length === 0
        ? `<span class="ok">✓ ${currentPart}: ${v.rowCount}행 / ${v.totalBytes} bytes</span>`
        : `<span class="warn">⚠ ${currentPart}: ${v.issues.slice(0, 3).join(', ')}${v.issues.length > 3 ? '…' : ''}</span>`;
  }
}

function renderReferenceList() {
  const list = $('#ref-file-list');
  if (!state.referenceScripts.length) {
    list.innerHTML = '<li class="muted">추가된 참고 대본이 없습니다.</li>';
  } else {
    list.innerHTML = state.referenceScripts
      .map(
        (s) => `
      <li class="ref-item">
        <div class="ref-item-info">
          <strong>${esc(s.name)}</strong>
          <span class="ref-meta">${s.source === 'paste' ? '붙여넣기' : '파일'} · ${s.text.length.toLocaleString()}자</span>
        </div>
        <button class="btn-icon btn-ref-remove" data-id="${s.id}" type="button" title="삭제">✕</button>
      </li>`
      )
      .join('');
    list.querySelectorAll('.btn-ref-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeReference(btn.dataset.id));
    });
  }

  const totalChars = state.referenceScripts.reduce((n, s) => n + s.text.length, 0);
  $('#ref-stats').textContent = `${state.referenceScripts.length}개 · ${totalChars.toLocaleString()}자`;
}

function addReferenceFromPaste() {
  const text = $('#ref-paste').value.trim();
  if (!text) return showToast('붙여넣을 대본을 입력하세요.', true);

  const name = `붙여넣기 ${state.referenceScripts.filter((s) => s.source === 'paste').length + 1}`;
  state.referenceScripts.push({
    id: `ref-paste-${Date.now()}`,
    name,
    source: 'paste',
    text,
    chars: text.length,
  });
  $('#ref-paste').value = '';
  renderReferenceList();
  showToast(`"${name}" 추가됨`);
}

async function addReferenceFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  setLoading(true, '파일 읽는 중…');
  let ok = 0;
  try {
    for (const file of files) {
      try {
        const parsed = await REF.parseReferenceFile(file);
        state.referenceScripts.push(parsed);
        ok++;
      } catch (e) {
        reportError('reference.file', e, { file: file.name }, { silent: true });
      }
    }
    renderReferenceList();
    if (ok) showToast(`${ok}개 파일 추가됨`);
    else if (files.length) showToast('파일 추가 실패 — 상단 [로그]에서 확인하세요.', true);
  } finally {
    setLoading(false);
    $('#ref-file-input').value = '';
  }
}

function removeReference(id) {
  state.referenceScripts = state.referenceScripts.filter((s) => s.id !== id);
  renderReferenceList();
}

function clearReferences() {
  if (state.referenceScripts.length && !confirm('참고 대본을 모두 삭제할까요?')) return;
  state.referenceScripts = [];
  renderReferenceList();
}

function buildAdModeContext() {
  if (!state.adMode) return '';

  const toneHints = {
    mild:
      '긍정 가중치: 낮음. 장점은 자연스럽게, 단점은 솔직히 다루되 공격적 표현·과장된 비판은 피하세요. 디디딧 담백함 유지.',
    balanced:
      '긍정 가중치: 중간(권장). 본사 가이드 강조 포인트를 충실히 반영하고, 단점은 "아쉬운 점·개선 여지"로 완화해 서술하세요. 전체 톤은 추천 쪽으로 기울되 허위·과장 금지.',
    strong:
      '긍정 가중치: 높음. 가이드의 핵심 메시지·USP·차별점을 적극 부각하세요. 단점 파트는 짧게, 장점·실사용 만족·가성비(해당 시) 비중을 높이세요. 그래도 명백한 허위·날조는 금지.',
  };

  const guideBlock = REF.buildAdGuideContext(state.adGuides);
  const brandLine = state.adBrand ? `광고주/브랜드: ${state.adBrand}` : '광고주/브랜드: (미입력)';

  return `
# [광고·협찬 모드]
${brandLine}
콘텐츠 성격: 유료 광고·협찬 리뷰
긍정 톤 지침: ${toneHints[state.adToneLevel] || toneHints.balanced}
${state.adDisclosure ? '- 프롤로그에 "유료광고포함" 또는 "협찬" 표기를 자연스럽게 포함하세요.' : '- 별도 유료광고 표기 요청 없음 (필요 시 사용자 지시 따름).'}
- 본사 가이드의 필수 키워드·강조 문구·금지 표현을 대본 전반에 반영하세요.
- 일반 리뷰 대비 긍정적 평가·추천 의사에 가중치를 두되, 디디딧 채널의 신뢰를 해치는 허위·과장은 금지합니다.
${guideBlock ? `\n${guideBlock}` : '\n[경고] 본사 리뷰 가이드가 첨부되지 않았습니다. 가이드를 추가하면 품질이 크게 향상됩니다.'}`.trim();
}

function buildProductContext() {
  syncBriefFromDOM();
  syncSpecsFromDOM();
  const cat = CATEGORIES.find((c) => c.id === state.categoryId);
  const refBlock = REF.buildReferenceContext(state.referenceScripts);
  const adBlock = buildAdModeContext();
  if (BRIEF) {
    return BRIEF.buildPromptContext(state, cat, refBlock, adBlock);
  }
  return `
제품명: ${state.productName}
콘텐츠 방향: ${state.contentDirection || '(미입력)'}
가격 정보: ${state.priceInfo || '(미입력)'}
카테고리: ${cat?.name || '기타'}
제품 메모/스펙:
${state.productNotes || '(없음)'}
${adBlock ? `\n${adBlock}\n` : ''}${refBlock ? `\n${refBlock}` : ''}`.trim();
}

function updateAdModeUI() {
  const panel = $('#ad-mode-panel');
  const fields = $('#ad-mode-fields');
  const badge = $('#ad-mode-badge');
  const checkbox = $('#ad-mode');

  if (checkbox) checkbox.checked = state.adMode;
  if (fields) fields.classList.toggle('hidden', !state.adMode);
  if (panel) panel.classList.toggle('active', state.adMode);
  if (badge) badge.classList.toggle('hidden', !state.adMode);
  document.body.classList.toggle('ad-mode-on', state.adMode);

  const brand = $('#ad-brand');
  if (brand) brand.value = state.adBrand;
  const tone = $('#ad-tone-level');
  if (tone) tone.value = state.adToneLevel;
  const disclosure = $('#ad-disclosure');
  if (disclosure) disclosure.checked = state.adDisclosure;
}

function renderAdGuideList() {
  const list = $('#ad-guide-list');
  if (!list) return;

  if (!state.adGuides.length) {
    list.innerHTML = '<li class="muted">첨부된 본사 가이드가 없습니다.</li>';
  } else {
    list.innerHTML = state.adGuides
      .map(
        (s) => `
      <li class="ref-item">
        <div class="ref-item-info">
          <strong>${esc(s.name)}</strong>
          <span class="ref-meta">${s.source === 'paste' ? '붙여넣기' : '파일'} · ${s.text.length.toLocaleString()}자</span>
        </div>
        <button class="btn-icon btn-ad-guide-remove" data-id="${s.id}" type="button" title="삭제">✕</button>
      </li>`
      )
      .join('');
    list.querySelectorAll('.btn-ad-guide-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeAdGuide(btn.dataset.id));
    });
  }

  const totalChars = state.adGuides.reduce((n, s) => n + s.text.length, 0);
  const stats = $('#ad-guide-stats');
  if (stats) stats.textContent = `${state.adGuides.length}개 · ${totalChars.toLocaleString()}자`;
}

function addAdGuideFromPaste() {
  const text = $('#ad-guide-paste')?.value.trim();
  if (!text) return showToast('붙여넣을 가이드를 입력하세요.', true);

  const name = `가이드 ${state.adGuides.filter((s) => s.source === 'paste').length + 1}`;
  state.adGuides.push({
    id: `ad-guide-paste-${Date.now()}`,
    name,
    source: 'paste',
    text,
    chars: text.length,
  });
  $('#ad-guide-paste').value = '';
  renderAdGuideList();
  showToast(`"${name}" 추가됨`);
}

async function addAdGuideFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  setLoading(true, '가이드 파일 읽는 중…');
  let ok = 0;
  try {
    for (const file of files) {
      try {
        const parsed = await REF.parseReferenceFile(file);
        parsed.id = `ad-guide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        state.adGuides.push(parsed);
        ok++;
      } catch (e) {
        reportError('adGuide.file', e, { file: file.name }, { silent: true });
      }
    }
    renderAdGuideList();
    if (ok) showToast(`${ok}개 가이드 파일 추가됨`);
    else if (files.length) showToast('가이드 파일 추가 실패 — 상단 [로그]에서 확인하세요.', true);
  } finally {
    setLoading(false);
    const input = $('#ad-guide-file-input');
    if (input) input.value = '';
  }
}

function removeAdGuide(id) {
  state.adGuides = state.adGuides.filter((s) => s.id !== id);
  renderAdGuideList();
}

function clearAdGuides() {
  if (state.adGuides.length && !confirm('본사 가이드를 모두 삭제할까요?')) return;
  state.adGuides = [];
  renderAdGuideList();
}

function adModePromptExtra() {
  if (!state.adMode) return '';
  return `
[광고·협찬 모드 추가 지침]
- 파트 구성 시 "치명적 단점" 대신 "아쉬운 점" 또는 "한계점"처럼 완화된 파트명을 사용할 수 있습니다.
- 장점·핵심 성능·실사용·가격(가성비) 파트 비중을 상대적으로 늘리세요.
- 본사 가이드의 필수 언급 사항이 있으면 해당 파트에 배치하세요.`;
}

function adPartPromptExtra(partName) {
  if (!state.adMode) return '';
  const isWeakPart =
    /단점|한계|아쉬운|호불호/.test(partName) || partName.includes('치명적');
  const isPrologue = /프롤로그|오프닝/.test(partName);
  const isClosing = /총평|클로징/.test(partName);

  let extra = `
[광고·협찬 모드 — 이 파트 작성 지침]
- 본사 리뷰 가이드의 강조 포인트·필수 키워드를 우선 반영하세요.
- 긍정적 평가에 가중치를 두되 사실 왜곡·허위 장점은 금지합니다.`;

  if (isPrologue && state.adDisclosure) {
    extra += `
- 프롤로그에 유료광고 표기(예: "오늘 영상은 유료광고를 포함합니다" 또는 "협찬으로 제작된 영상입니다")를 자연스럽게 넣으세요.`;
  }
  if (isWeakPart) {
    extra += `
- 단점 파트: 짧고 균형 있게. 과도한 비판·조롱 금지. "개선 여지", "취향에 따라 다를 수 있는 부분" 등 완화 표현 사용.`;
  }
  if (isClosing) {
    extra += `
- 총평: 전체적으로 긍정적 결론·추천 대상을 명확히. 가이드의 핵심 메시지로 마무리하세요.`;
  }
  return extra;
}

function startEmptyLineup() {
  if (state.partLineup.length && !confirm('현재 파트 구성을 카테고리 기본값으로 바꿀까요?')) return;
  const cat = CATEGORIES.find((c) => c.id === state.categoryId);
  state.partLineup = [...(cat?.suggestedParts || PART_NAME_POOL)];
  state.draftLineup = [];
  state.draftReason = '카테고리 기본 파트 구성 (수동 시작)';
  state.lineupConfirmed = false;
  state.currentPartIndex = -1;
  state.allRows = [];
  state._lastPartRows = [];
  state.partSegments = [];
  state.selectedPartIndex = null;
  $('#structure-reason').textContent = state.draftReason;
  renderPartLineup();
  renderTable();
  updateWorkflowStep(5);
  showToast('기본 파트 구성으로 시작했습니다. 수정 후 ② [파트 구성 확정]');
}

async function generatePartDraft() {
  if (!state.apiKey) return showToast('Google API 키를 입력하세요.', true);
  if (!state.productName.trim()) return showToast('제품명을 입력하세요.', true);
  if (state.adMode && !state.adGuides.length) {
    if (!confirm('광고 모드인데 본사 가이드가 없습니다. 가이드 없이 초안을 만들까요?')) return;
  }

  if (state.partLineup.length && !confirm('새 초안을 만들면 현재 파트 구성과 대본이 초기화됩니다. 계속할까요?')) {
    return;
  }

  setLoading(true, '파트 초안 작성 중… (라이트)');
  try {
    const cat = CATEGORIES.find((c) => c.id === state.categoryId);
    const directionHint = state.contentDirection
      ? `\n콘텐츠 방향: ${state.contentDirection}`
      : '';

    const prompt = `${buildProductContext()}
${directionHint}
${adModePromptExtra()}

디디딧 리뷰의 **파트 구성 초안**만 작성하세요. (대본 본문 X)
카테고리 후보 파트: ${cat.suggestedParts.join(', ')}
필수 포함: 디자인, 실사용, 가격, 총평 (파트 제목에 반영)
파트 이름 규칙: **1~3단어 짧은 라벨만** (예: 프롤로그, 디자인, 성능, 실사용, 편의성, 단점, 가격, 총평). "디자인 및 첫인상" 같은 긴 설명형 제목 금지.
reason: 구성 이유 한 줄 (큰따옴표·줄바꿈 없이)

JSON만 출력:
{"lineup":["프롤로그","디자인","성능"],"reason":"이 구성을 선택한 이유"}`;

    const { lineup, reason } = await requestLineupFromGemini(prompt, 0.4);

    state.partLineup = normalizePartLineup(lineup);
    state.draftLineup = [...state.partLineup];
    state.draftReason = reason;
    state.lineupConfirmed = false;
    state.currentPartIndex = -1;
    state.allRows = [];
    state._lastPartRows = [];
    state.partSegments = [];
    state.selectedPartIndex = null;

    $('#structure-reason').textContent = state.draftReason;
    renderPartLineup();
    renderTable();
    updateWorkflowStep(5);
    showToast('초안이 생성됐습니다. 파트를 수정한 뒤 [② 파트 구성 확정]을 누르세요.');
    saveProject();
  } catch (e) {
    reportError('generatePartDraft', e, { model: getLineupModel() });
  } finally {
    setLoading(false);
  }
}

function confirmPartLineup() {
  if (!state.partLineup.length) return showToast('먼저 파트 초안을 생성하세요.', true);

  syncLineupFromInputs();
  const missing = validateLineupRequired();
  if (missing.length) {
    return showToast(`필수 파트 누락: ${missing.join(', ')} (파트 이름에 포함되어야 함)`, true);
  }

  state.lineupConfirmed = true;
  state.currentPartIndex = -1;
  state.selectedPartIndex = null;
  renderPartLineup();
  updateWorkflowStep(6);
  showToast('파트 구성이 확정됐습니다. 칩을 클릭해 원하는 파트만 [③ 파트 생성]하세요.');
  saveProject();
}

function syncLineupFromInputs() {
  document.querySelectorAll('.lineup-name-input').forEach((inp) => {
    const idx = Number(inp.dataset.idx);
    state.partLineup[idx] = inp.value.trim();
  });
  state.partLineup = state.partLineup.filter(Boolean);
}

async function generatePartAtIndex(partIndex) {
  if (!state.lineupConfirmed || !state.partLineup.length) {
    return showToast('먼저 ② [파트 구성 확정]을 완료하세요.', true);
  }
  if (partIndex < 0 || partIndex >= state.partLineup.length) {
    return showToast('유효하지 않은 파트입니다.', true);
  }

  const partName = state.partLineup[partIndex];
  const scriptModel = getPartScriptModel(partName);
  setLoading(true, `${partName} 작성 중… (${getModelLabel(scriptModel)})`);

  try {
    const prevContext = getPreviousPartsContext(partIndex);
    const writtenParts = state.partSegments
      .filter((s) => s.partIndex !== partIndex)
      .map((s) => state.partLineup[s.partIndex])
      .join(', ');
    const pendingParts = getPendingPartsLabel();

    const directionHint = state.contentDirection
      ? `\n콘텐츠 방향 우선 반영: ${state.contentDirection}`
      : '';

    const prompt = `${buildProductContext()}
${directionHint}
${adPartPromptExtra(partName)}

전체 파트 구성: ${state.partLineup.join(' → ')}
현재 작성 파트: "${partName}" (${partIndex + 1}/${state.partLineup.length})
이미 작성된 파트: ${writtenParts || '(없음)'}
아직 미작성 파트: ${pendingParts}
${prevContext}

${getPartVolumePrompt(partName)}`;

    let rows;
    let validation;
    let attempts = 0;
    const maxAttempts = 4;

    while (attempts < maxAttempts) {
      attempts++;
      const raw = await callGemini(
        attempts > 1 ? prompt + getPartRetryHint(partName) : prompt,
        0.7,
        scriptModel
      );
      rows = parseRowsJson(raw);
      validation = validatePartRows(rows, partName);
      if (shouldAcceptPartRows(rows, validation, partName)) break;
    }

    insertPartRows(partIndex, partName, rows);
    state._lastPartRows = rows;
    state.selectedPartIndex = partIndex;

    renderPartLineup();
    renderTable();
    updateGenerateButtons();

    const msg =
      validation.issues.length === 0
        ? `${partName} 완료 (${validation.rowCount}행 / ${validation.totalBytes}B)`
        : `${partName} 완료 — 검증 참고: ${validation.issues[0]}`;
    showToast(msg);
    saveProject();

    if (countGeneratedParts() >= state.partLineup.length) {
      updateWorkflowStep(8);
    } else {
      updateWorkflowStep(7);
    }
  } catch (e) {
    reportError('generatePartAtIndex', e, { model: scriptModel, part: partName });
  } finally {
    setLoading(false);
  }
}

async function generateNextPart() {
  if (!state.lineupConfirmed || !state.partLineup.length) {
    return showToast('먼저 ② [파트 구성 확정]을 완료하세요.', true);
  }

  let partIndex =
    state.selectedPartIndex !== null
      ? state.selectedPartIndex
      : state.partLineup.findIndex((_, i) => !isPartGenerated(i));

  if (partIndex < 0) {
    return showToast('모든 파트가 완료되었습니다.');
  }

  if (isPartGenerated(partIndex)) {
    const name = state.partLineup[partIndex];
    if (!confirm(`"${name}" 파트를 다시 생성할까요? 기존 대본이 교체됩니다.`)) return;
  }

  await generatePartAtIndex(partIndex);
}

async function reviseLineupWithAI() {
  if (!state.apiKey) return showToast('Google API 키를 입력하세요.', true);
  if (!state.partLineup.length) return showToast('먼저 파트 초안을 만드세요.', true);
  if (state.lineupConfirmed) return showToast('확정된 구성입니다. [구성 다시 편집]을 누르세요.', true);

  const notes = $('#lineup-revision-notes')?.value.trim();
  if (!notes) return showToast('파트 구성 수정 요청을 입력하세요.', true);

  syncLineupFromInputs();
  setLoading(true, '파트 구성 수정 중…');
  try {
    const prompt = `${buildProductContext()}

현재 파트 구성: ${JSON.stringify(state.partLineup)}
구성 이유: ${state.draftReason || '(없음)'}
${adModePromptExtra()}

사용자 수정 요청:
${notes}

위 요청을 반영해 파트 구성만 다시 작성하세요. (대본 본문 X)
파트 이름은 1~3단어 짧은 라벨만 (긴 설명형 제목 금지).
필수 포함: 디자인, 실사용, 가격, 총평 (파트 제목에 반영)
reason: 수정 반영 이유 한 줄 (큰따옴표·줄바꿈 없이)

JSON만 출력:
{"lineup":["..."],"reason":"수정 반영 이유"}`;

    const { lineup, reason } = await requestLineupFromGemini(prompt, 0.5);

    state.partLineup = normalizePartLineup(lineup);
    state.draftLineup = [...state.partLineup];
    state.draftReason = reason || state.draftReason;
    $('#structure-reason').textContent = state.draftReason;
    $('#lineup-revision-notes').value = '';
    renderPartLineup();
    showToast('AI가 파트 구성을 수정했습니다.');
  } catch (e) {
    reportError('reviseLineupWithAI', e, { model: getLineupModel() });
  } finally {
    setLoading(false);
  }
}

async function revisePartWithAI() {
  if (!state.apiKey) return showToast('Google API 키를 입력하세요.', true);
  if (!state.lineupConfirmed) return showToast('먼저 파트 구성을 확정하세요.', true);

  const partIndex =
    state.selectedPartIndex !== null
      ? state.selectedPartIndex
      : state.currentPartIndex >= 0
        ? state.currentPartIndex
        : null;

  if (partIndex === null) {
    return showToast('수정할 파트를 클릭해 선택하세요.', true);
  }

  const seg = state.partSegments.find((s) => s.partIndex === partIndex);
  if (!seg) return showToast('아직 생성되지 않은 파트입니다.', true);

  const notes = $('#part-revision-notes')?.value.trim();
  if (!notes) return showToast('AI 수정 요청을 입력하세요.', true);

  const partName = state.partLineup[partIndex];
  const scriptModel = getPartScriptModel(partName);
  const currentRows = state.allRows.slice(seg.start, seg.end + 1);

  setLoading(true, `${partName} AI 수정 중… (${getModelLabel(scriptModel)})`);
  try {
    const prevContext =
      seg.start > 0
        ? `\n이전 파트 마지막 대사:\n${state.allRows
            .slice(Math.max(0, seg.start - 3), seg.start)
            .map((r) => r.대본)
            .join('\n')}`
        : '';

    const nextContext =
      seg.end < state.allRows.length - 1
        ? `\n다음 파트 시작 대사:\n${state.allRows
            .slice(seg.end + 1, seg.end + 4)
            .map((r) => r.대본)
            .join('\n')}`
        : '';

    const prompt = `${buildProductContext()}
${adPartPromptExtra(partName)}

전체 파트 구성: ${state.partLineup.join(' → ')}
수정 대상 파트: "${partName}" (${partIndex + 1}/${state.partLineup.length})
${prevContext}
${nextContext}

현재 파트 대본 (${currentRows.length}행):
${JSON.stringify(currentRows, null, 0)}

사용자 수정 요청:
${notes}
${getRevisionRhythmBoost(notes)}

${getPartVolumePrompt(partName)}

JSON만 출력: {"rows":[...]}`;

    let rows;
    let validation;
    let attempts = 0;
    const maxAttempts = 4;

    while (attempts < maxAttempts) {
      attempts++;
      const raw = await callGemini(
        attempts > 1 ? prompt + getPartRetryHint(partName) : prompt,
        0.65,
        scriptModel
      );
      rows = parseRowsJson(raw);
      validation = validatePartRows(rows, partName);
      if (shouldAcceptPartRows(rows, validation, partName)) break;
    }

    state.allRows.splice(seg.start, seg.end - seg.start + 1, ...rows);
    const existing = state.partSegments.findIndex((s) => s.partIndex === partIndex);
    const newSeg = {
      partIndex,
      partName,
      start: seg.start,
      end: seg.start + rows.length - 1,
    };
    if (existing >= 0) state.partSegments[existing] = newSeg;
    state._lastPartRows = rows;
    state.selectedPartIndex = partIndex;
    $('#part-revision-notes').value = '';

    reindexPartSegments();
    renderPartLineup();
    renderTable();
    updateGenerateButtons();

    const msg =
      validation.issues.length === 0
        ? `"${partName}" AI 수정 완료 (${validation.rowCount}행 / ${validation.totalBytes}B)`
        : `"${partName}" 수정 완료 — ${validation.issues[0]}`;
    showToast(msg);
  } catch (e) {
    reportError('revisePartWithAI', e, { model: scriptModel, part: partName });
  } finally {
    setLoading(false);
  }
}

function reindexPartSegments() {
  let offset = 0;
  state.partSegments = state.partSegments
    .sort((a, b) => a.partIndex - b.partIndex)
    .map((seg) => {
      const len = seg.end - seg.start + 1;
      const start = offset;
      const end = offset + len - 1;
      offset = end + 1;
      return { ...seg, start, end };
    });
}

function exportTsv() {
  if (!state.allRows.length) return showToast('보낼 대본이 없습니다.', true);

  const header = ['대본', '장면', '사이즈', '자막', '코멘트'];
  const lines = [
    header.join('\t'),
    ...state.allRows.map((r) =>
      header.map((h) => String(r[h] || '').replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t')
    ),
  ];

  const blob = new Blob(['\uFEFF' + lines.join('\n')], {
    type: 'text/tab-separated-values;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `디디딧_${state.productName || '대본'}_${new Date().toISOString().slice(0, 10)}.tsv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('TSV 파일을 저장했습니다.');
}

function copyTable() {
  if (!state.allRows.length) return showToast('복사할 대본이 없습니다.', true);
  const header = ['대본', '장면', '사이즈', '자막', '코멘트'];
  const text = [
    header.join('\t'),
    ...state.allRows.map((r) => header.map((h) => r[h] || '').join('\t')),
  ].join('\n');
  navigator.clipboard.writeText(text).then(
    () => showToast('클립보드에 복사했습니다.'),
    (err) => reportError('copyTable', err)
  );
}

function resetProject() {
  if (state.allRows.length && !confirm('진행 중인 대본을 초기화할까요?')) return;
  state.partLineup = [];
  state.draftLineup = [];
  state.draftReason = '';
  state.lineupConfirmed = false;
  state.currentPartIndex = -1;
  state.allRows = [];
  state._lastPartRows = [];
  state.partSegments = [];
  state.selectedPartIndex = null;
  state.adGuides = [];
  state.adMode = false;
  state.adBrand = '';
  state.adToneLevel = 'balanced';
  state.adDisclosure = true;
  $('#structure-reason').textContent = '';
  updateAdModeUI();
  renderAdGuideList();
  renderPartLineup();
  renderTable();
  updateWorkflowStep(state.apiKey ? 2 : 1);
  showToast('프로젝트를 초기화했습니다.');
}

/* ── 프롬프트 UI (txt 파일) ── */

function updatePromptBadge() {
  const source = PM.getActivePromptSource();
  const short = source.split('/').pop() || source;
  $('#prompt-version-badge').textContent = short;
  $('#active-prompt-label').textContent = source;
  const fn = $('#prompt-filename');
  if (fn && !fn.value) fn.value = short.endsWith('.txt') ? short : `dididit-prompt-v${PM.PROMPT_VERSION}.txt`;
}

function loadPromptEditor() {
  $('#prompt-editor').value = getSystemRules();
  const fn = $('#prompt-filename');
  if (fn) {
    const short = PM.getActivePromptSource().split('/').pop();
    if (short?.endsWith('.txt')) fn.value = short;
  }
  updatePromptBadge();
}

function applyPromptFromEditor() {
  const text = $('#prompt-editor').value.trim();
  if (!text) return showToast('프롬프트 내용이 비어 있습니다.', true);
  const filename = $('#prompt-filename')?.value.trim() || `dididit-prompt-v${PM.PROMPT_VERSION}.txt`;
  PM.setActivePrompt(text, filename);
  loadPromptEditor();
  showToast(`적용됨: ${filename}`);
}

function exportPromptToTxt() {
  const text = $('#prompt-editor').value.trim();
  if (!text) return showToast('저장할 내용이 없습니다.', true);
  const filename = $('#prompt-filename')?.value.trim() || `dididit-prompt-v${PM.PROMPT_VERSION}.txt`;
  PM.downloadPromptTxt(text, filename);
  PM.setActivePrompt(text, filename);
  updatePromptBadge();
  showToast(`${filename} 저장 — prompts 폴더에 넣어 Git으로 관리하세요.`);
}

async function loadPromptFromFileInput(fileList) {
  const file = fileList?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (!text.trim()) return showToast('빈 파일입니다.', true);
    PM.setActivePrompt(text, file.name);
    loadPromptEditor();
    showToast(`불러옴: ${file.name}`);
  } catch (e) {
    reportError('prompt.loadFile', e);
  } finally {
    const input = $('#prompt-file-input');
    if (input) input.value = '';
  }
}

async function loadBundledDefaultPrompt() {
  setLoading(true, '기본 프롬프트 불러오는 중…');
  try {
    const { source } = await PM.loadDefaultPromptFile();
    loadPromptEditor();
    showToast(`불러옴: ${source}`);
  } catch (e) {
    reportError('prompt.loadDefault', e);
  } finally {
    setLoading(false);
  }
}

function resetPromptEditorToBuiltin() {
  $('#prompt-editor').value = PM.buildDefaultSystemRules();
  $('#prompt-filename').value = PM.DEFAULT_PROMPT_FILE.split('/').pop();
  showToast('내장 기본값을 편집창에 넣었습니다. [적용] 또는 [txt로 저장]하세요.');
}

function clearPromptToBuiltin() {
  PM.clearActivePrompt();
  loadPromptEditor();
  showToast('내장 기본 프롬프트로 복원했습니다.');
}

async function initPromptOnBoot() {
  const saved = PM.loadPromptState();
  if (!saved.text) {
    await PM.loadDefaultPromptFile();
  }
  loadPromptEditor();
}

function bindEvents() {
  $('#api-key').addEventListener('input', (e) => {
    state.apiKey = e.target.value.trim();
    saveSettings();
    if (state.apiKey) updateWorkflowStep(2);
    updateGenerateButtons();
  });
  $('#api-key').addEventListener('change', (e) => {
    state.apiKey = e.target.value.trim();
    saveSettings();
    if (state.apiKey) updateWorkflowStep(2);
    updateGenerateButtons();
  });
  $('#model-lite').addEventListener('change', (e) => {
    state.modelLite = e.target.value;
    saveSettings();
  });
  $('#model-pro').addEventListener('change', (e) => {
    state.modelPro = e.target.value;
    saveSettings();
  });
  $('#product-name').addEventListener('input', (e) => {
    state.productName = e.target.value;
    if (state.productName.trim() && state.apiKey) updateWorkflowStep(3);
    updateGenerateButtons();
    saveProject();
  });
  $('#content-direction').addEventListener('input', (e) => {
    state.contentDirection = e.target.value;
    saveProject();
  });
  $('#product-notes').addEventListener('input', (e) => {
    state.productNotes = e.target.value;
    saveProject();
  });
  $('#price-info').addEventListener('input', (e) => {
    state.priceInfo = e.target.value;
    saveProject();
  });
  ['brief-thesis', 'brief-scenario', 'brief-must', 'brief-careful', 'brief-compare'].forEach((id) => {
    $(`#${id}`)?.addEventListener('input', () => {
      syncBriefFromDOM();
      saveProject();
    });
  });
  $('#category').addEventListener('change', (e) => {
    onCategoryChange(e.target.value);
  });
  $('#btn-detect').addEventListener('click', autoDetectCategory);
  $('#btn-load-air-example')?.addEventListener('click', loadAirPurifierExample);
  $('#btn-search-device')?.addEventListener('click', runDeviceSearch);
  $('#btn-search-clear')?.addEventListener('click', clearSearchResults);

  document.querySelectorAll('.step-rail-item').forEach((btn) => {
    btn.addEventListener('click', () => navigateToPage(Number(btn.dataset.rail)));
  });
  $('#search-device')?.addEventListener('change', (e) => {
    updateSearchProfileUI(e.target.value);
    saveProject();
  });
  $('#btn-draft').addEventListener('click', generatePartDraft);
  $('#btn-empty-lineup').addEventListener('click', startEmptyLineup);
  $('#btn-confirm-lineup').addEventListener('click', confirmPartLineup);
  $('#btn-generate-part').addEventListener('click', generateNextPart);
  $('#btn-add-part').addEventListener('click', addPartFromInput);
  $('#btn-add-part-pool').addEventListener('click', addPartFromPool);
  $('#btn-reset-lineup').addEventListener('click', resetLineupToDraft);
  $('#btn-unlock-lineup').addEventListener('click', unlockLineupEdit);
  $('#btn-revise-lineup').addEventListener('click', reviseLineupWithAI);
  $('#btn-revise-part').addEventListener('click', revisePartWithAI);
  $('#btn-export').addEventListener('click', exportTsv);
  $('#btn-copy').addEventListener('click', copyTable);
  $('#btn-sheet-push').addEventListener('click', pushContiToSheet);
  $('#btn-sheet-pull').addEventListener('click', pullContiFromSheet);
  $('#btn-sheet-open').addEventListener('click', openContiSheet);
  $('#btn-reset').addEventListener('click', resetProject);
  ['sheet-api-url', 'sheet-api-token', 'sheet-open-url'].forEach((id) => {
    $('#' + id)?.addEventListener('change', () => {
      syncSheetSettingsFromDOM();
      saveSettings();
      updateSheetSyncStatus();
    });
  });
  $('#toggle-settings').addEventListener('click', () => {
    togglePanel('#settings-panel', '#toggle-settings');
  });
  $('#toggle-prompt').addEventListener('click', () => {
    togglePanel('#prompt-panel', '#toggle-prompt');
  });
  $('#btn-prompt-apply').addEventListener('click', applyPromptFromEditor);
  $('#btn-prompt-export').addEventListener('click', exportPromptToTxt);
  $('#btn-prompt-load-default').addEventListener('click', loadBundledDefaultPrompt);
  $('#btn-prompt-reset').addEventListener('click', resetPromptEditorToBuiltin);
  $('#prompt-file-input').addEventListener('change', (e) => loadPromptFromFileInput(e.target.files));
  $('#btn-ref-add-paste').addEventListener('click', addReferenceFromPaste);
  $('#ref-file-input').addEventListener('change', (e) => addReferenceFiles(e.target.files));
  $('#btn-ref-clear').addEventListener('click', clearReferences);

  $('#ad-mode').addEventListener('change', (e) => {
    state.adMode = e.target.checked;
    updateAdModeUI();
    if (state.adMode && !state.adGuides.length) {
      showToast('본사 리뷰 가이드를 첨부해 주세요.');
    }
  });
  $('#ad-brand').addEventListener('input', (e) => {
    state.adBrand = e.target.value;
  });
  $('#ad-tone-level').addEventListener('change', (e) => {
    state.adToneLevel = e.target.value;
  });
  $('#ad-disclosure').addEventListener('change', (e) => {
    state.adDisclosure = e.target.checked;
  });
  $('#btn-ad-guide-add-paste').addEventListener('click', addAdGuideFromPaste);
  $('#ad-guide-file-input').addEventListener('change', (e) => addAdGuideFiles(e.target.files));
  $('#btn-ad-guide-clear').addEventListener('click', clearAdGuides);
}

function renderPartPoolSelect() {
  const sel = $('#part-pool-select');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">파트 후보에서 추가…</option>' +
    PART_NAME_POOL.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
}

function applyWorkspaceProject() {
  const badge = $('#workspace-project-badge');
  const preset = WORKSPACE_PROJECTS[PROJECT_SLUG];
  if (!preset) {
    badge?.classList.add('hidden');
    return;
  }
  if (badge) {
    badge.textContent = preset.label;
    badge.classList.remove('hidden');
  }
  const hasSaved = !!localStorage.getItem(PROJECT_STORAGE_KEY);
  if (hasSaved) return;
  if (preset.contentDirection) state.contentDirection = preset.contentDirection;
  if (preset.adMode) state.adMode = true;
  if (preset.adBrand) state.adBrand = preset.adBrand;
}

async function boot() {
  try {
    bindModules();
    hideToast();
    bindToastDismiss();
    LOG?.load();
    LOG?.updateBadge();
    RESEARCH_LOG?.load();
    RESEARCH_LOG?.updateBadge();
    loadState();
    applyWorkspaceProject();
    loadProject();
    renderModelOptions();
    renderCategoryOptions();
    applyBriefToDOM();
    updateCategoryHint();
    renderReferenceList();
    renderAdGuideList();
    updateAdModeUI();
    $('#api-key').value = state.apiKey;
    applySheetSettingsToDOM();
    bindEvents();
    bindErrorLogUI();
    bindErrorLogging();
    bindBeforeUnload();
    renderPartPoolSelect();
    renderPartLineup();
    renderTable();
    updateGenerateButtons();
    await initPromptOnBoot();

    renderSearchDeviceSelect();
    updateSearchProfileUI(state.searchDeviceId);
    if (state.searchResults) renderSearchResults(state.searchResults);

    if (!state.apiKey) {
      updateWorkflowStep(1);
      $('#settings-panel')?.classList.remove('collapsed');
      $('#toggle-settings')?.classList.add('btn-active');
    } else {
      updateWorkflowStep(state.searchResults ? 2 : 1);
    }

    const bootEl = $('#boot-error');
    if (bootEl) bootEl.classList.add('hidden');
  } catch (err) {
    reportError('boot', err, {}, { silent: true });
    const bootEl = $('#boot-error');
    if (bootEl) {
      bootEl.classList.remove('hidden');
      bootEl.textContent = `초기화 오류: ${err.message}`;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
