/**
 * 기획안 → 유튜브 업로드 메타 (제목 · 더보기 설명란)
 * - 챕터 QC 결과로 타임라인 추정
 * - descriptionDraft · tags · brandMust 링크를 조합
 */
window.DdditUploadMeta = (function () {
  const YT_TITLE_MAX = 100;

  function parseTargetMinutes(targetLength) {
    const text = String(targetLength || '');
    const range = text.match(/(\d+)\s*~\s*(\d+)\s*분/);
    if (range) return (Number(range[1]) + Number(range[2])) / 2;
    const single = text.match(/(\d+)\s*분/);
    if (single) return Number(single[1]);
    const hours = text.match(/(\d+)\s*~\s*(\d+)\s*시간/);
    if (hours) return ((Number(hours[1]) + Number(hours[2])) / 2) * 60;
    return 15;
  }

  function formatTimestamp(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function extractUrls(...texts) {
    const urls = [];
    for (const text of texts) {
      const matches = String(text || '').matchAll(/https?:\/\/[^\s)>\]"']+/g);
      for (const m of matches) urls.push(m[0].replace(/[.,;]+$/, ''));
    }
    return [...new Set(urls)];
  }

  function extractTitleKeywords(plan) {
    const combined = [plan?.brandMust, plan?.reviewGuide, plan?.notes].filter(Boolean).join('\n');
    const m = combined.match(/제목\s*키워드\s*[:：]\s*([^\n]+)/i);
    if (!m) return [];
    return m[1]
      .split(/[,，·/|]/)
      .map((s) => s.replace(/[()]/g, '').trim())
      .filter(Boolean);
  }

  function cleanDraftTitle(raw) {
    return String(raw || '')
      .trim()
      .replace(/\s*[—–-]\s*(콘텐츠\s*협업|리뷰\s*기획|브랜드\s*협업).*$/i, '')
      .replace(/\s*\(가제\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 기획안 필드로 유튜브 업로드 제목 생성 */
  function buildUploadTitle(plan, options = {}) {
    const keywords = extractTitleKeywords(plan);
    let title = cleanDraftTitle(plan?.title);

    if (!title) {
      title = String(plan?.summary || plan?.keyMessage || '')
        .split(/[.·!\n]/)[0]
        .trim()
        .slice(0, 80);
    }

    if (keywords.length && !keywords.every((kw) => title.includes(kw))) {
      const missing = keywords.filter((kw) => !title.includes(kw));
      const suffix = missing.slice(0, 2).join(' ');
      if (suffix && title.length + suffix.length + 3 <= YT_TITLE_MAX) {
        title = `${title} | ${suffix}`;
      }
    }

    if (options.maxLen && title.length > options.maxLen) {
      title = title.slice(0, options.maxLen - 1).trim() + '…';
    }
    if (title.length > YT_TITLE_MAX) {
      title = title.slice(0, YT_TITLE_MAX - 1).trim() + '…';
    }
    return title;
  }

  /** 챕터 목록 → 더보기 타임라인 (목표 러닝타임 기준 균등 배분) */
  function buildChapterTimeline(chapters, totalMinutes) {
    const list = Array.isArray(chapters) ? chapters.filter((ch) => ch?.title) : [];
    if (!list.length) return '';

    const totalSec = Math.max(60, Math.round(Number(totalMinutes) || 15) * 60);
    const weights = list.map((ch, i) => {
      const t = String(ch.title || '');
      if (i === 0 || /인트로|오프닝|프롤로그/.test(t)) return 0.6;
      if (/총평|마무리|클로징|정리/.test(t)) return 1.1;
      return 1;
    });
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;

    const lines = [];
    let cursor = 0;
    for (let i = 0; i < list.length; i += 1) {
      if (i === 0) {
        lines.push(`${formatTimestamp(0)} ${list[i].title}`);
        cursor += (weights[i] / weightSum) * totalSec;
        continue;
      }
      lines.push(`${formatTimestamp(cursor)} ${list[i].title}`);
      cursor += (weights[i] / weightSum) * totalSec;
    }
    return lines.join('\n');
  }

  function firstParagraph(text) {
    return String(text || '')
      .split(/\n\s*\n/)[0]
      .trim();
  }

  function stripTimelineFromDescription(text) {
    const lines = String(text || '').split(/\r?\n/);
    const re = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s+.+/;
    const kept = lines.filter((line) => !re.test(line));
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function extractDisclaimer(text) {
    const lines = String(text || '').split(/\r?\n/);
    const disclaimer = lines.filter((l) => /^※/.test(l.trim())).join('\n').trim();
    return disclaimer;
  }

  /** 기획안 + QC 챕터 → 유튜브 더보기 설명란 */
  function buildUploadDescription(plan, chapters, options = {}) {
    const draft = String(plan?.descriptionDraft || '').trim();
    const summaryIntro = firstParagraph(plan?.summary) || firstParagraph(plan?.concept);
    const intro = draft ? firstParagraph(draft) : summaryIntro;

    const urls = extractUrls(plan?.descriptionDraft, plan?.brandMust, plan?.reviewGuide, plan?.notes);
    const linkLines = urls.map((url) => {
      if (/brand\.naver\.com/i.test(url)) return `📦 상세페이지: ${url}`;
      if (/instagram\.com/i.test(url)) return `📱 ${url}`;
      if (/i-nic\.co\.kr|wlo\.link|link/i.test(url)) return `🛒 구매 링크: ${url}`;
      return `🔗 ${url}`;
    });

    const tags = String(plan?.tags || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .join(' ');

    const totalMinutes = options.totalMinutes ?? parseTargetMinutes(plan?.targetLength);
    const timeline = buildChapterTimeline(chapters, totalMinutes);

    const blocks = [];
    if (intro) blocks.push(intro);

    const draftBody = draft ? stripTimelineFromDescription(draft) : '';
    const draftLinks = draftBody && draftBody !== intro ? draftBody.replace(intro, '').trim() : '';
    if (draftLinks && !linkLines.length) {
      blocks.push(draftLinks);
    } else if (linkLines.length) {
      blocks.push(linkLines.join('\n'));
    }

    if (tags) blocks.push(tags);
    if (timeline) blocks.push(timeline);

    const disclaimer =
      extractDisclaimer(draft) ||
      (plan?.brandMust && /유료\s*프로모션|유료광고|제품\s*협찬|#제품협찬/i.test(plan.brandMust)
        ? '※ 유료광고·협찬 포함'
        : '');

    if (disclaimer) blocks.push(disclaimer);

    return blocks.filter(Boolean).join('\n\n').trim();
  }

  /** 기획안 + 챕터 QC → { uploadTitle, uploadDescription, meta } */
  function generateFromPlan(plan, chapters, options = {}) {
    if (!plan || typeof plan !== 'object') {
      return { uploadTitle: '', uploadDescription: '', meta: { empty: true } };
    }
    const totalMinutes = options.totalMinutes ?? parseTargetMinutes(plan.targetLength);
    const uploadTitle = buildUploadTitle(plan, options);
    const uploadDescription = buildUploadDescription(plan, chapters, { totalMinutes });
    return {
      uploadTitle,
      uploadDescription,
      meta: {
        totalMinutes,
        chapterCount: Array.isArray(chapters) ? chapters.length : 0,
        hasDraft: Boolean(plan.descriptionDraft),
        generatedAt: new Date().toISOString(),
      },
    };
  }

  return {
    YT_TITLE_MAX,
    parseTargetMinutes,
    formatTimestamp,
    buildUploadTitle,
    buildChapterTimeline,
    buildUploadDescription,
    generateFromPlan,
    extractTitleKeywords,
  };
})();
