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
