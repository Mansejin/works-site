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
