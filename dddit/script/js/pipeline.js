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
