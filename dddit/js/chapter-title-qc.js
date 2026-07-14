/**
 * 디디딧 챕터 제목 QC
 * - 채널 더보기 타임라인 패턴 기준 단축
 * - 인트로는 타이틀 카드 없음 (description에는 "인트로" 가능)
 */
window.DdditChapterTitleQc = (function () {
  const INTRO_RE = /오프닝|인트로|^인트$|프롤로그/;
  const CLOSING_RE = /총평|마무리|클로징|정리|이벤트/;

  /** 채널 실사용 단축 제목 우선순위 매핑 */
  const RULES = [
    { re: /오프닝|인트로|^인트$|프롤로그/, title: '인트로', titleCard: false },
    { re: /가성비/, title: '가성비', titleCard: true },
    { re: /악세서리|액세서리|노즐|케이스/, title: '악세서리 활용', titleCard: true },
    { re: /^사용\s*편의성$|사용\s*편의/, title: '사용 편의성', titleCard: true },
    { re: /편의성|관리|세척|유지|한계|소음|거치/, title: '편의성 및 한계점', titleCard: true },
    { re: /디자인|외형|외관|폼팩터|휴대|착용|구성\s*소개|제품\s*구성/, title: '디자인', titleCard: true },
    { re: /^디스플레이$|디스플레이|화면/, title: '디스플레이', titleCard: true },
    { re: /가격.*총평|총평.*가격/, title: '가격 및 총평', titleCard: true },
    { re: /가격|가격\s*만족/, title: '가격 만족도', titleCard: true },
    { re: /실사용/, title: '실사용 및 한계점', titleCard: true },
    { re: /성능|시연|제원|스펙|핵심|차별|기능|흡입|데모|필터|먼지/, title: '핵심 성능 및 실사용', titleCard: true },
    { re: /배터리/, title: '배터리', titleCard: true },
    { re: /총평|마무리|클로징|정리|링크|이벤트/, title: '총평', titleCard: true },
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
    // 괄호 안 키워드보다 바깥 제목을 우선 매칭 (사용 편의성(디스플레이…) → 편의성)
    const matched = matchPreferred(bare) || matchPreferred(sourceTitle);

    let title = matched?.title || bare || sourceTitle;
    let titleCard = matched ? matched.titleCard : true;

    if (index === 0 && isIntroTitle(sourceTitle || title)) {
      title = '인트로';
      titleCard = false;
    }

    if (!matched && looksTooLong(title)) {
      // 긴 제목은 앞 토큰만 남김 (공백/·/및 기준)
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
    return ensureClosingChapter(merged.map((ch, i) => ({ ...ch, id: `ch-plan-${i}` })));
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
      notes: '가격 적정성·추천 대상·단점 요약',
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
    ensureClosingChapter,
    missingClosingChapter,
    parseDescriptionChapters,
    timestampToSeconds,
    qcIssues,
    headingForProse,
  };
})();
