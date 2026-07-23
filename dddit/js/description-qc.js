/**
 * 디디딧 유튜브 설명란(더보기) QC
 * 채널 업로드본 패턴: 훅 문단 → 구독 CTA → 📌 Timeline → #태그 → Contact
 */
window.DdditDescriptionQc = (function () {
  const CONTACT_EMAIL = 'ddditchannel@gmail.com';
  const FORBIDDEN_CHANNEL_RE =
    /테크몽|techmong|참고\s*영상|참고\s*:|youtu\.be\/|youtube\.com\/watch/i;
  const SPONSOR_LEAK_RE = /유료광고|제품협찬|#제품협찬|유료\s*프로모션/i;

  function issuesFor(draft, options = {}) {
    const text = String(draft || '').trim();
    const issues = [];
    const sponsored = options.sponsored === true;

    if (!text) {
      issues.push({ level: 'error', code: 'empty', message: '설명란 초안이 비어 있습니다.' });
      return issues;
    }

    if (FORBIDDEN_CHANNEL_RE.test(text)) {
      issues.push({
        level: 'error',
        code: 'external_ref',
        message: '타 채널·참고 영상 링크/언급은 설명란에 넣지 마세요.',
      });
    }

    if (!sponsored && SPONSOR_LEAK_RE.test(text)) {
      issues.push({
        level: 'warn',
        code: 'sponsor_leak',
        message: '비협찬 영상인데 유료광고·제품협찬 표기가 있습니다.',
      });
    }

    if (!/직접\s*(사용|써|써\s*봤)|써봤|사용해봤|실사용/i.test(text)) {
      issues.push({
        level: 'warn',
        code: 'no_handson',
        message: '‘직접 사용/써봤습니다’ 등 실사용 톤이 없습니다. 채널 더보기란 톤을 맞추세요.',
      });
    }

    if (!/구독\s*&\s*좋아요|구독과\s*좋아요/i.test(text)) {
      issues.push({
        level: 'error',
        code: 'missing_cta',
        message: '구독 & 좋아요 CTA 문장이 없습니다.',
      });
    }

    if (!/📌\s*Timeline|Timeline/i.test(text)) {
      issues.push({
        level: 'error',
        code: 'missing_timeline',
        message: '📌 Timeline 블록이 없습니다.',
      });
    } else if (!/\d{1,2}:\d{2}\s+\S+/.test(text)) {
      issues.push({
        level: 'warn',
        code: 'thin_timeline',
        message: '타임라인 시각(00:00 제목) 형식이 약합니다.',
      });
    }

    if (!/#디디딧/.test(text)) {
      issues.push({
        level: 'warn',
        code: 'missing_channel_tag',
        message: '#디디딧 해시태그가 없습니다.',
      });
    }

    if (!new RegExp(CONTACT_EMAIL.replace('.', '\\.'), 'i').test(text)) {
      issues.push({
        level: 'error',
        code: 'missing_contact',
        message: `Contact 메일(${CONTACT_EMAIL})이 없습니다.`,
      });
    }

    if (/본인\s*구매\s*예정|구매\s*예정\s*비교/.test(text)) {
      issues.push({
        level: 'warn',
        code: 'prebuy_wording',
        message: '설명란은 시청자용입니다. ‘구매 예정’보다 실사용 리뷰 톤으로 쓰세요.',
      });
    }

    if (/news\.samsung\.com|공식\s*:|Samsung\s*Newsroom/i.test(text)) {
      issues.push({
        level: 'warn',
        code: 'press_dump',
        message: '뉴스룸·공식 링크 나열은 채널 더보기란 패턴과 다릅니다. 본문은 체감 중심으로.',
      });
    }

    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines[0] && lines[0].length < 12) {
      issues.push({
        level: 'warn',
        code: 'weak_hook',
        message: '첫 줄이 너무 짧습니다. 훅/문제 제기로 시작하세요.',
      });
    }

    return issues;
  }

  function summary(draft, options) {
    const list = issuesFor(draft, options);
    const errors = list.filter((i) => i.level === 'error').length;
    const warns = list.filter((i) => i.level === 'warn').length;
    return {
      ok: errors === 0,
      errors,
      warns,
      issues: list,
      label:
        errors === 0 && warns === 0
          ? '설명란 QC 통과'
          : errors === 0
            ? `설명란 QC 주의 ${warns}`
            : `설명란 QC 실패 · 오류 ${errors}`,
    };
  }

  /** 비협찬 실사용 리뷰용 초안 스캐폴드 */
  function scaffoldOrganic(options = {}) {
    const product = options.product || '제품명';
    const paras = options.paras || [
      '이번 영상에서는 직접 구매해 사용해 본 경험을 솔직하게 정리했습니다.',
      '디자인과 스펙만 보면 괜찮지만, 며칠 써 보니 장단점이 더 분명해졌습니다.',
      '구매를 고민하고 계셨다면 이번 영상 참고해 보세요!',
    ];
    const timeline = options.timeline || [
      '00:00 인트로',
      '00:30 디자인',
      '02:00 실사용',
      '04:00 총평',
    ];
    const tags = options.tags || '#디디딧';
    return `${paras.join('\n\n')}\n\n구독 & 좋아요는 리뷰 제작에 큰 힘이 됩니다. 감사합니다 :)\n\n📌 Timeline\n${timeline.join('\n')}\n\n${tags}\n\n협업 및 출연자 지원은 아래 메일로 문의 바랍니다 :)\n📩 Contact: ${CONTACT_EMAIL}`;
  }

  return {
    CONTACT_EMAIL,
    issuesFor,
    summary,
    scaffoldOrganic,
  };
})();
