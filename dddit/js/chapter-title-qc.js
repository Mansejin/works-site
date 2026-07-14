/**
 * 디디딧 챕터 제목 QC
 * - 채널 더보기 타임라인 패턴 기준 단축
 * - 인트로는 타이틀 카드 없음 (description에는 "인트로" 가능)
 */
window.DdditChapterTitleQc = (function () {
  const INTRO_RE = /오프닝|인트로|^인트$|프롤로그/;
  const CLOSING_RE = /총평|마무리|클로징|정리|이벤트/;

  /** 채널 타임라인용 단축 제목 — 구체적 규칙이 일반 규칙보다 앞 */
  const RULES = [
    { re: /오프닝|인트로|^인트$|프롤로그/, title: '인트로', titleCard: false },
    { re: /제품\s*차별|차별점/, title: '제품 차별점', titleCard: true },
    { re: /성능\s*시연|시연|데모/, title: '성능 시연', titleCard: true },
    { re: /^사용\s*편의성$|사용\s*편의/, title: '사용 편의성', titleCard: true },
    { re: /공간|라이프|설치|배치|콤팩트|한\s*뼘/, title: '공간·설치', titleCard: true },
    { re: /가성비/, title: '가성비', titleCard: true },
    { re: /악세서리|액세서리|노즐|케이스/, title: '악세서리 활용', titleCard: true },
    { re: /디자인|외형|외관|폼팩터|휴대|착용|구성\s*소개|제품\s*구성/, title: '디자인', titleCard: true },
    { re: /^디스플레이$|^화면$/, title: '디스플레이', titleCard: true },
    { re: /가격.*총평|총평.*가격/, title: '가격 및 총평', titleCard: true },
    { re: /^가격$|가격\s*만족/, title: '가격 만족도', titleCard: true },
    { re: /핵심\s*성능|제원|스펙|기능|흡입|필터|먼지/, title: '핵심 성능', titleCard: true },
    { re: /실사용/, title: '실사용', titleCard: true },
    { re: /^성능$/, title: '핵심 성능', titleCard: true },
    { re: /편의성|관리|세척|유지|한계|거치/, title: '편의성 및 한계점', titleCard: true },
    { re: /배터리/, title: '배터리', titleCard: true },
    { re: /총평|마무리|클로징|정리|링크|이벤트/, title: '총평', titleCard: true },
  ];

  /** 겹치기 쉬운 제목 쌍 — 연속·유사 시 구분 강제 */
  const OVERLAP_GROUPS = [
    ['사용 편의성', '편의성 및 한계점', '편의성'],
    ['핵심 성능', '성능 시연', '핵심 성능 및 실사용', '실사용', '실사용 및 한계점'],
  ];

  const MAX_TITLE_LEN = 16;

  function stripParens(text) {
    const raw = String(text || '').trim();
    const notes = [];
    const title = raw
      .replace(/[（(]([^）)]+)[）)]/g, (_, inner) => {
        const bit = String(inner || '').trim();
        if (bit) notes.push(bit);
        return '';
      })
      .replace(/\s+/g, ' ')
      .replace(/^[·\-–—\s]+|[·\-–—\s]+$/g, '')
      .trim();
    return { title, notes: notes.join(' · ') };
  }

  function isIntroTitle(title) {
    return INTRO_RE.test(String(title || ''));
  }

  function isClosingTitle(title) {
    return CLOSING_RE.test(String(title || ''));
  }

  function looksTooLong(title) {
    const t = String(title || '').trim();
    if (!t) return true;
    if (/[（(].+[）)]/.test(t)) return true;
    if ((t.match(/·/g) || []).length >= 2) return true;
    if (t.length > MAX_TITLE_LEN) return true;
    return false;
  }

  function matchPreferred(title) {
    const t = String(title || '').trim();
    for (const rule of RULES) {
      if (rule.re.test(t)) {
        return { title: rule.title, titleCard: rule.titleCard !== false };
      }
    }
    return null;
  }

  /**
   * 기획안 structure 세그먼트 → QC된 챕터
   * @returns {{ title: string, notes: string, titleCard: boolean, sourceTitle: string }}
   */
  function normalizeChapterSegment(segment, index) {
    const sourceTitle = String(segment || '').replace(/^[\d.)\s]+/, '').trim();
    const { title: bare, notes: parenNotes } = stripParens(sourceTitle);
    // 괄호(메모) 내용은 제목 매칭에 쓰지 않음 — "공간(…저소음)"이 편의성·한계로 빨려가는 것 방지
    const matched = matchPreferred(bare);

    let title = matched?.title || bare || sourceTitle;
    let titleCard = matched ? matched.titleCard : true;

    if (index === 0 && isIntroTitle(sourceTitle || title)) {
      title = '인트로';
      titleCard = false;
    }

    if (!matched && looksTooLong(title)) {
      const shortened = title.split(/\s*[/|·]\s*|\s+및\s+/)[0].trim();
      title = shortened.slice(0, MAX_TITLE_LEN) || title.slice(0, MAX_TITLE_LEN);
    }

    if (title.length > MAX_TITLE_LEN && matched) {
      // preferred titles can be up to ~16; leave as-is if matched
    } else if (title.length > MAX_TITLE_LEN) {
      title = title.slice(0, MAX_TITLE_LEN).trim();
    }

    const extraNotes = [];
    if (parenNotes) extraNotes.push(parenNotes);
    const leftover = bare && matched && bare !== title && !isIntroTitle(bare) ? bare : '';
    if (leftover && leftover !== title) extraNotes.push(leftover);

    return {
      title,
      notes: extraNotes.filter(Boolean).join('\n'),
      titleCard,
      sourceTitle,
    };
  }

  /** 인접 챕터가 같은 축으로 중복되면 source 메모를 보고 제목을 다시 가름 */
  function dedupeOverlappingTitles(chapters) {
    const list = Array.isArray(chapters) ? chapters.map((ch) => ({ ...ch })) : [];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const same = prev.title === cur.title;
      const overlap = OVERLAP_GROUPS.some(
        (g) => g.includes(prev.title) && g.includes(cur.title) && prev.title !== cur.title,
      );
      if (!same && !overlap) continue;

      const src = `${cur.sourceTitle || ''} ${cur.notes || ''}`;
      if (/차별/.test(src)) cur.title = '제품 차별점';
      else if (/시연|가루|투입|건조|탈취|살균/.test(src)) cur.title = '성능 시연';
      else if (/공간|한\s*뼘|라이프|설치|틈/.test(src)) cur.title = '공간·설치';
      else if (/디스플레이|세척|모드|중간\s*투입|편의/.test(src) && cur.title !== '사용 편의성') {
        cur.title = '사용 편의성';
      } else if (same) {
        // last resort: keep distinct by appending short disambiguator from notes
        const bit = String(cur.notes || cur.sourceTitle || '')
          .split(/[·\n]/)[0]
          .trim()
          .slice(0, 6);
        if (bit) cur.title = `${cur.title.replace(/\s*및.*$/, '').slice(0, 8)}·${bit}`.slice(0, MAX_TITLE_LEN);
      }
    }
    return list;
  }

  function parseStructureToChapters(structure) {
    const text = String(structure || '').trim();
    if (!text) return [];
    const chapters = text
      .split(/\s*→\s*|\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((segment, i) => {
        const qc = normalizeChapterSegment(segment, i);
        return {
          id: `ch-plan-${i}`,
          title: qc.title,
          notes: qc.notes,
          titleCard: qc.titleCard,
          sourceTitle: qc.sourceTitle,
        };
      });

    // 같은 단축 제목이 연속이면 하나로 합치고 메모만 이어 붙임
    const merged = [];
    for (const ch of chapters) {
      const prev = merged[merged.length - 1];
      if (prev && prev.title === ch.title) {
        prev.notes = [prev.notes, ch.notes, ch.sourceTitle !== ch.title ? ch.sourceTitle : '']
          .filter(Boolean)
          .join('\n');
        if (ch.sourceTitle && ch.sourceTitle !== prev.sourceTitle) {
          prev.sourceTitle = `${prev.sourceTitle} → ${ch.sourceTitle}`;
        }
        continue;
      }
      merged.push({ ...ch });
    }
    const deduped = dedupeOverlappingTitles(merged);
    // after dedupe, titles may collide again — re-merge identical adjacent only
    const final = [];
    for (const ch of deduped) {
      const prev = final[final.length - 1];
      if (prev && prev.title === ch.title) {
        prev.notes = [prev.notes, ch.notes].filter(Boolean).join('\n');
        continue;
      }
      final.push(ch);
    }
    return ensureClosingChapter(final.map((ch, i) => ({ ...ch, id: `ch-plan-${i}` })));
  }

  /** 구성에 총평·마무리·클로징이 없으면 마지막에 총평 챕터를 붙입니다. */
  function ensureClosingChapter(chapters) {
    const list = Array.isArray(chapters) ? chapters.slice() : [];
    if (!list.length) return list;
    const hasClosing = list.some((ch) => isClosingTitle(ch?.title) || /가격\s*및\s*총평/i.test(ch?.title || ''));
    if (hasClosing) return list.map((ch, i) => ({ ...ch, id: ch.id || `ch-plan-${i}` }));
    list.push({
      id: `ch-plan-${list.length}`,
      title: '총평',
      notes: '핵심 소구 요약·추천 대상·구매 안내 (다른 챕터 내용 재나열 금지)',
      titleCard: true,
      sourceTitle: '(자동 추가 · 총평)',
    });
    return list;
  }

  function missingClosingChapter(chapters) {
    if (!Array.isArray(chapters) || !chapters.length) return true;
    return !chapters.some((ch) => isClosingTitle(ch?.title) || /가격\s*및\s*총평/i.test(ch?.title || ''));
  }

  /** YouTube 더보기 설명란 타임라인 파서 */
  function parseDescriptionChapters(description) {
    const lines = String(description || '').split(/\r?\n/);
    const re = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+?)\s*$/;
    const chapters = [];
    for (const line of lines) {
      const m = line.match(re);
      if (!m) continue;
      let title = String(m[2] || '').replace(/^\s*[-–—]\s*/, '').trim();
      if (!title || title.length > 40 || title.includes('→') || title.startsWith('"')) continue;
      if (/https?:\/\//i.test(title)) continue;
      chapters.push({
        timestamp: m[1],
        title,
        titleCard: !isIntroTitle(title),
        seconds: timestampToSeconds(m[1]),
      });
    }
    // Need a 0:00 start for valid YouTube chapters
    if (!chapters.length) return [];
    if (chapters[0].seconds !== 0) return [];
    return chapters;
  }

  function timestampToSeconds(label) {
    const parts = String(label || '')
      .split(':')
      .map((n) => Number(n));
    if (parts.some((n) => Number.isNaN(n))) return -1;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return -1;
  }

  function qcIssues(chapter) {
    const issues = [];
    const title = String(chapter?.title || '').trim();
    if (!title) {
      issues.push('제목 없음');
      return issues;
    }
    if (/[（(].+[）)]/.test(title)) issues.push('괄호 설명은 메모로 옮기세요');
    if ((title.match(/·/g) || []).length >= 2) issues.push('중간점 나열형 제목');
    if (title.length > MAX_TITLE_LEN) issues.push(`제목이 ${MAX_TITLE_LEN}자를 넘김`);
    if (isIntroTitle(title) && chapter?.titleCard !== false) {
      issues.push('인트로는 타이틀 카드를 넣지 않습니다');
    }
    return issues;
  }

  function headingForProse(chapter) {
    if (!chapter) return '';
    if (chapter.titleCard === false || isIntroTitle(chapter.title)) return '';
    return String(chapter.title || '').trim();
  }

  return {
    MAX_TITLE_LEN,
    RULES,
    stripParens,
    isIntroTitle,
    isClosingTitle,
    looksTooLong,
    normalizeChapterSegment,
    parseStructureToChapters,
    dedupeOverlappingTitles,
    ensureClosingChapter,
    missingClosingChapter,
    parseDescriptionChapters,
    timestampToSeconds,
    qcIssues,
    headingForProse,
  };
})();
