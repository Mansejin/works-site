/**
 * 시나리오 파이프라인 — 줄글 초안 → 4열 시트 변환 (단계별)
 */
window.DIDIDIT_PIPELINE = (function () {
  const HEADERS = ['대본', '장면', '자막', '코멘트'];

  function makeEmptyRow() {
    return { 대본: '', 장면: '', 자막: '', 코멘트: '' };
  }

  function isChapterMarkerRow(row) {
    const script = String((row && row['대본']) || '').trim();
    const scene = String((row && row['장면']) || '').trim();
    if (!script) return false;
    if (/^【.+】$/.test(script)) return true;
    if (scene === '챕터' || scene === 'CHAPTER') return true;
    if (/^##\s+\S/.test(script)) return true;
    return false;
  }

  function makeChapterMarkerRow(title) {
    const raw = String(title || '')
      .replace(/^#+\s*/, '')
      .trim()
      .replace(/^【\s*|\s*】$/g, '');
    if (!raw) return makeEmptyRow();
    return { 대본: `【${raw}】`, 장면: '챕터', 자막: '', 코멘트: '' };
  }

  /** Split prose on ## headings into [{ title, body }] (title empty for intro). */
  function splitProseByChapters(prose) {
    const text = String(prose || '').replace(/\r\n/g, '\n');
    if (!text.trim()) return [];
    const re = /^##\s+(.+)$/gm;
    const matches = [...text.matchAll(re)];
    if (!matches.length) return [{ title: '', body: text.trim() }];
    const sections = [];
    if (matches[0].index > 0) {
      const intro = text.slice(0, matches[0].index).trim();
      if (intro) sections.push({ title: '', body: intro });
    }
    for (let i = 0; i < matches.length; i += 1) {
      const title = String(matches[i][1] || '').trim();
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const body = text.slice(start, end).trim();
      sections.push({ title, body });
    }
    return sections.filter((s) => s.body || s.title);
  }

  function preserveChapterMarkers(prevRows, nextRows) {
    const prev = Array.isArray(prevRows) ? prevRows : [];
    const next = Array.isArray(nextRows) ? nextRows : [];
    if (!prev.some(isChapterMarkerRow)) return normalizeRows(next);
    const out = [];
    let ni = 0;
    for (let i = 0; i < prev.length; i += 1) {
      if (isChapterMarkerRow(prev[i])) {
        out.push(makeChapterMarkerRow(String(prev[i]['대본'] || '').replace(/^【|】$/g, '') || prev[i]['대본']));
        // Prefer exact prior marker text
        out[out.length - 1] = {
          대본: String(prev[i]['대본'] || '').trim(),
          장면: String(prev[i]['장면'] || '챕터').trim() || '챕터',
          자막: '',
          코멘트: String(prev[i]['코멘트'] || ''),
        };
        continue;
      }
      out.push(next[ni] || makeEmptyRow());
      ni += 1;
    }
    while (ni < next.length) {
      out.push(next[ni]);
      ni += 1;
    }
    return normalizeRows(out);
  }

  /** If rows lack chapter markers, insert from prose ## headings by proportional slots. */
  function ensureChapterMarkersFromProse(prose, rows) {
    const list = normalizeRows(rows);
    if (!list.length) return list;
    if (list.some(isChapterMarkerRow)) return list;
    const sections = splitProseByChapters(prose).filter((s) => s.title);
    if (!sections.length) return list;
    const step = Math.max(1, Math.floor(list.length / sections.length));
    const out = [];
    let si = 0;
    for (let i = 0; i < list.length; i += 1) {
      if (si < sections.length && (i === 0 || i % step === 0)) {
        out.push(makeChapterMarkerRow(sections[si].title));
        si += 1;
      }
      out.push(list[i]);
    }
    while (si < sections.length) {
      out.push(makeChapterMarkerRow(sections[si].title));
      si += 1;
    }
    return normalizeRows(out);
  }

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
    // purpose / intent connective cut: 버리러 / 가려 / 하고자
    if (/(러|려|고자)$/.test(bare)) return true;
    // half connective like 안내해 / 보여줘→보여줘 is OK ending wait 줘 is speech end
    // 해/어/아/여 alone without 요·서·도·야 → unfinished clause
    if (/(해|어|아|여)$/.test(bare) && !/(해서|해요|해도|해야|해요|어[요서도야]|아[요서도야]|여[요서도야]|줘요|줘요)$/.test(bare)) {
      return true;
    }
    // dangling adjective/noun stem without ending (very short mid-chunks)
    if (bare.length <= 10 && !/[.?!…]$/.test(bare) && !/(다|요|죠|네|고|서|며|데|니)$/.test(bare)) {
      return true;
    }
    return false;
  }

  /** Row that is neither a speakable breath nor a finished sentence — must glue with next. */
  function isIncompleteCut(text) {
    const bare = bareScript(text);
    if (!bare) return false;
    if (endsCompleteSentence(bare) || endsBreathUnit(bare)) return false;
    return true;
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
    const content = (rows || []).filter((r) => !isChapterMarkerRow(r));
    if (content.length < 6) return null;
    const shortRows = content.filter((r) => r.대본.length < ROW_CHARS_MIN);
    if (shortRows.length / content.length > 0.35) {
      return `${shortRows.length}행이 ${ROW_CHARS_MIN}자 미만 — 너무 잘게 쪼갬`;
    }
    return null;
  }

  function detectOverlongRows(rows) {
    const longRows = (rows || []).filter((r) => !isChapterMarkerRow(r) && r.대본.length > ROW_CHARS_FORCE_SPLIT);
    if (longRows.length) {
      return `${longRows.length}행이 ${ROW_CHARS_FORCE_SPLIT}자 초과 — 호흡 경계에서 분할`;
    }
    return null;
  }

  function detectBadBreathCuts(rows) {
    const content = (rows || []).filter((r) => !isChapterMarkerRow(r));
    if (content.length < 2) return null;
    let cuts = 0;
    for (let i = 0; i < content.length - 1; i++) {
      if (isIncompleteCut(content[i].대본) || isDanglingFragment(content[i].대본)) cuts += 1;
    }
    if (cuts > 0) return `${cuts}행이 미완성·조사 중간 절단`;
    return null;
  }

  /** Soft checklist (logging). Soft issues alone do not force API retry. */
  function validateScriptRows(rows) {
    const issues = [];
    const list = rows || [];
    if (!list.length) issues.push('행이 없습니다');
    list.forEach((r, i) => {
      if (isChapterMarkerRow(r)) return;
      if (!r.대본.trim()) issues.push(`${i + 1}행 대본 누락`);
      const len = r.대본.length;
      if (len > ROW_CHARS_FORCE_SPLIT) issues.push(`${i + 1}행 ${len}자 (${ROW_CHARS_FORCE_SPLIT}자 초과)`);
      else if (len > ROW_CHARS_HARD_MAX) issues.push(`${i + 1}행 ${len}자 (권장 ${ROW_CHARS_HARD_MAX}자 초과 · 자막 과다)`);
      else if (len < ROW_CHARS_MIN && list.filter((x) => !isChapterMarkerRow(x)).length >= 6) {
        issues.push(`${i + 1}행 ${len}자 (너무 짧음)`);
      }
    });
    const choppy = detectChoppyRhythm(list);
    if (choppy) issues.push(choppy);
    const overlong = detectOverlongRows(list);
    if (overlong) issues.push(overlong);
    const bad = detectBadBreathCuts(list);
    if (bad) issues.push(bad);
    return issues;
  }

  /** Only these trigger another Gemini convert attempt. */
  function validateHardIssues(rows) {
    const issues = [];
    const list = rows || [];
    if (!list.length) issues.push('행이 없습니다');
    list.forEach((r, i) => {
      if (isChapterMarkerRow(r)) return;
      if (!r.대본.trim()) issues.push(`${i + 1}행 대본 누락`);
      if (r.대본.length > ROW_CHARS_FORCE_SPLIT) {
        issues.push(`${i + 1}행 ${r.대본.length}자 (${ROW_CHARS_FORCE_SPLIT}자 초과)`);
      }
    });
    const bad = detectBadBreathCuts(list);
    if (bad) issues.push(bad);
    return issues;
  }

  function buildConvertRetryHint(issues) {
    return `\n\n[재시도] 이전 변환 문제: ${issues.slice(0, 4).join(' · ')}. 한 호흡 ${ROW_CHARS_TARGET_MIN}~${ROW_CHARS_TARGET_MAX}자·상한 ${ROW_CHARS_HARD_MAX}자. 조사 중간 절단 금지. 긴 문장은 고/서/는데/, 에서 나누세요.`;
  }

  function mergeRowPair(a, b) {
    const left = String(a.대본 || '').trim();
    const right = String(b.대본 || '').trim();
    let script;
    if (!left) script = right;
    else if (!right) script = left;
    // 미완성 한글 어절 재접합: "드리"+"고…" → "드리고…" / "버리러"+"나갈" → 공백 유지
    else if (/[가-힣]$/.test(left) && /^[가-힣]/.test(right) && (isIncompleteCut(left) || isDanglingFragment(left))) {
      const trial = left + [...right][0];
      if (endsBreathUnit(trial) || endsCompleteSentence(trial)) script = `${left}${right}`;
      else script = `${left} ${right}`.replace(/\s+/g, ' ').trim();
    } else {
      script = `${left} ${right}`.replace(/\s+/g, ' ').trim();
    }
    return {
      대본: script,
      장면: a.장면 || b.장면,
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
        // Only accept splits at a real breath/sentence boundary (avoid cutting 드리고 → 드리|고)
        if (endsBreathUnit(head) || endsCompleteSentence(head)) return last;
      }
    }
    // last resort: never bisect a Hangul word — back up to previous whitespace
    for (let i = maxLen; i >= Math.floor(maxLen * 0.45); i -= 1) {
      if (/\s/.test(t[i])) {
        const head = t.slice(0, i).trim();
        if (head) return i;
      }
    }
    return maxLen;
  }

  function forceSplitRow(row, maxLen = ROW_CHARS_HARD_MAX) {
    const text = row.대본;
    if (text.length <= maxLen) return [row];
    // slightly over long but incomplete cuts cost more than one longer caption
    if (text.length <= ROW_CHARS_FORCE_SPLIT && isIncompleteCut(text)) return [row];
    const out = [];
    let rest = text;
    while (rest.length > maxLen) {
      // Prefer keeping a mildly-long speakable line over a broken Hangul clause
      if (rest.length <= ROW_CHARS_FORCE_SPLIT + 8) {
        out.push({
          대본: rest,
          장면: out.length ? '컷 유지' : row.장면,
          자막: out.length ? '' : row.자막,
          코멘트: out.length ? '' : row.코멘트,
        });
        rest = '';
        break;
      }
      const cut = findBreathSplitIndex(rest, maxLen);
      const head = rest.slice(0, cut).trim();
      const next = rest.slice(cut).trim();
      if (!head) break;
      if (isIncompleteCut(head) || isDanglingFragment(head)) {
        // refuse this cut — keep remainder intact
        out.push({
          대본: rest,
          장면: out.length ? '컷 유지' : row.장면,
          자막: out.length ? '' : row.자막,
          코멘트: out.length ? '' : row.코멘트,
        });
        rest = '';
        break;
      }
      out.push({
        대본: head,
        장면: out.length ? '컷 유지' : row.장면,
        자막: out.length ? '' : row.자막,
        코멘트: out.length ? '' : row.코멘트,
      });
      rest = next;
    }
    if (rest) {
      out.push({
        대본: rest,
        장면: out.length ? '컷 유지' : row.장면,
        자막: out.length ? '' : row.자막,
        코멘트: out.length ? '' : row.코멘트,
      });
    }
    return out.length ? out : [row];
  }

  /**
   * Merge dangling / incomplete cuts, then split long caption rows at breath pauses.
   */
  function healBreathRows(rows) {
    const list = normalizeRows(rows);
    if (!list.length) return [];

    const shouldGlue = (left, right) => {
      if (!left || !right) return false;
      if (isChapterMarkerRow(left) || isChapterMarkerRow(right)) return false;
      // Completed breath/sentence units must stay separate
      if (endsCompleteSentence(left.대본) || endsBreathUnit(left.대본)) return false;
      const incomplete = isIncompleteCut(left.대본) || isDanglingFragment(left.대본);
      const tooShort = left.대본.length < ROW_CHARS_MIN;
      if (!incomplete && !tooShort) return false;
      const mergedLen = `${left.대본} ${right.대본}`.replace(/\s+/g, ' ').trim().length;
      // Prefer one slightly-long speakable line over a broken clause
      return mergedLen <= ROW_CHARS_FORCE_SPLIT + 24;
    };

    const merged = [];
    let buf = { ...list[0] };
    for (let i = 1; i < list.length; i++) {
      const next = list[i];
      if (isChapterMarkerRow(buf) || isChapterMarkerRow(next)) {
        merged.push(buf);
        buf = { ...next };
        continue;
      }
      if (shouldGlue(buf, next)) {
        buf = mergeRowPair(buf, next);
        continue;
      }
      merged.push(buf);
      buf = { ...next };
    }
    merged.push(buf);

    // Second pass: keep gluing residual incomplete tails
    const glued = [];
    for (let i = 0; i < merged.length; i++) {
      let cur = merged[i];
      while (i + 1 < merged.length && shouldGlue(cur, merged[i + 1])) {
        i += 1;
        cur = mergeRowPair(cur, merged[i]);
      }
      glued.push(cur);
    }

    // Split rows that would make captions too long — but never leave incomplete heads
    return glued.flatMap((row) => {
      if (isChapterMarkerRow(row)) return [row];
      const parts = forceSplitRow(row, ROW_CHARS_HARD_MAX);
      if (parts.length <= 1) return parts;
      // re-glue any accidental incomplete cut introduced by force split
      const fixed = [];
      let acc = parts[0];
      for (let i = 1; i < parts.length; i++) {
        if (shouldGlue(acc, parts[i])) acc = mergeRowPair(acc, parts[i]);
        else {
          fixed.push(acc);
          acc = parts[i];
        }
      }
      fixed.push(acc);
      return fixed;
    });
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
- **대본 열만** 채우고 장면·자막·코멘트는 빈 문자열.
- 대본 내용을 삭제·왜곡하지 말고 **말하기 호흡 단위**로만 나눕니다.
- 목표 ${ROW_CHARS_TARGET_MIN}~${ROW_CHARS_TARGET_MAX}자 / 상한 ${ROW_CHARS_HARD_MAX}자. 긴 문장은 호흡 쉼에서 분할.
- **금지**: "버리러" / "안내해"처럼 목적·연결 어미만 남기고 끊기. 다음 절이 이어지면 한 행으로 유지.
- 챕터 구분 행(【…】)은 넣지 마세요. (시스템이 별도로 넣습니다)
${productHint}${retryHint || ''}

## 대본 원문
${prose}`;
  }

  function buildScenePrompt(ctx, rows, options = {}) {
    const contentRows = (rows || []).filter((r) => !isChapterMarkerRow(r));
    const scriptOnly = contentRows.map((r) => r.대본).join('\n');
    const checklist = String(options.shootChecklist || '').trim();
    const allowUnbox =
      options.allowUnboxing === true ||
      /언박싱|택배/.test(`${ctx || ''}\n${checklist}`);
    const checklistBlock = checklist
      ? `\n## 팀 촬영 체크리스트·필수 장면 (장면 열에 반영)\n${checklist}\n`
      : '';
    return `${ctx}
${checklistBlock}
# 작업: 장면 추가
대본은 **수정하지 마세요**. 장면 열만 채우세요. 자막·코멘트는 빈 문자열.
- 연속 호흡: 장면에 '컷 유지' (구도 힌트는 장면 문장에 포함: 와이드/미디엄/클로즈업/탑뷰 등)
- 체크리스트·필수 장면이 대본에 대응되면 장면 설명에 구체적으로 적으세요. (예: 가루 부어 보이기, 내솥 클로즈업)
- 고가 비교 세팅·작위적 감정 연기 장면 금지
- 언박싱: ${allowUnbox ? '가이드에 있으므로 **허용** (택배 개봉·제품 전경)' : '가이드에 없으면 넣지 마세요'}
- 입력에 챕터 구분 행은 없습니다. 행 수를 늘 말고 대본→장면만 채우세요.

## 현재 대본 (행 순서)
${scriptOnly}

JSON rows 전체를 반환 (대본·장면·자막·코멘트 키 필수).`;
  }

  function buildCaptionPrompt(ctx, rows) {
    const contentRows = (rows || []).filter((r) => !isChapterMarkerRow(r));
    return `${ctx}

# 작업: 자막·코멘트 추가
대본·장면은 **수정하지 마세요**. 자막·코멘트만 채우세요.
- 자막: 대본에 수치·스펙이 나올 때만 요약
- 코멘트: 준비물·앱 세팅 등 촬영 메모가 필요할 때만

## 현재 표 (JSON)
${JSON.stringify(contentRows, null, 0)}

JSON rows 전체를 반환 (대본·장면·자막·코멘트).`;
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
    isIncompleteCut,
    isChapterMarkerRow,
    makeChapterMarkerRow,
    makeEmptyRow,
    splitProseByChapters,
    preserveChapterMarkers,
    ensureChapterMarkersFromProse,
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
