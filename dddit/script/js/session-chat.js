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
