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
