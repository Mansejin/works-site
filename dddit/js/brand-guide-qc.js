/**
 * 브랜드 협업 가이드 QC — 형식이 달라도 섹션 헤더·리스트를 폭넓게 인식
 * 기획안 필드(brandMust/reviewGuide/shootChecklist/…) → 구조화 → 줄글·장면 커버리지 점검
 */
window.DdditBrandGuideQc = (function () {
  /** 브랜드마다 다르게 써도 잡히는 섹션 헤더 */
  const SECTION_DEFS = [
    {
      id: 'product',
      label: '제품·제원',
      re: /[【\[]?\s*(?:제품\s*(?:소개|정보|제원|구성)|제품명|모델명)\s*[】\]]?/i,
    },
    {
      id: 'mustSell',
      label: '필수 소구',
      re: /[【\[]?\s*(?:필수\s*소구(?:\s*포인트)?|핵심\s*소구|메인\s*포인트|Key\s*Selling)\s*[】\]]?/i,
    },
    {
      id: 'subSell',
      label: '서브 소구',
      re: /[【\[]?\s*(?:서브\s*소구(?:\s*포인트)?|부가\s*소구|Secondary)\s*[】\]]?/i,
    },
    {
      id: 'mustMention',
      label: '필수 멘션',
      re: /[【\[]?\s*(?:필수\s*(?:멘션|언급)|스크립트\s*필수|Mandatory\s*Mention)\s*[】\]]?/i,
    },
    {
      id: 'mustScene',
      label: '필수 장면',
      re: /[【\[]?\s*(?:필수\s*장면|촬영\s*필수|Mandatory\s*Scene)\s*[】\]]?/i,
    },
    {
      id: 'caution',
      label: '주의·금지',
      re: /[【\[]?\s*(?:(?:콘텐츠\s*)?주의\s*사항|촬영\s*금지(?:사항)?|금지\s*사항)\s*[】\]]?/i,
    },
    {
      id: 'hooks',
      label: '후킹 문구',
      re: /[【\[]?\s*(?:후킹(?:\s*문구)?|훅\s*문구)\s*[】\]]?/i,
    },
  ];

  const BULLET_RE = /^\s*(?:[-•●▪◦□■]\s*|\d+[.)]\s*|[A-Za-z]\.\s*)/;
  const SKIP_ITEM_RE = /https?:\/\/|^@|^#|^\d+$|surl|자동\s*DM|프로필\s*링크\)?$/i;

  function norm(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactKey(s) {
    return norm(s)
      .toLowerCase()
      .replace(/[\s·・,/|·：:]/g, '');
  }

  function planGuideCorpus(plan) {
    if (!plan || typeof plan !== 'object') return '';
    return [
      plan.title,
      plan.summary,
      plan.concept,
      plan.keyMessage,
      plan.reviewGuide,
      plan.brandMust,
      plan.brandAvoid,
      plan.shootChecklist,
      plan.structure,
      plan.notes,
      plan.tags,
      plan.descriptionDraft,
    ]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  function splitSections(text) {
    const raw = String(text || '');
    if (!raw.trim()) return {};
    const hits = [];
    for (const def of SECTION_DEFS) {
      const re = new RegExp(def.re.source, 'ig');
      let m;
      while ((m = re.exec(raw)) !== null) {
        hits.push({ id: def.id, label: def.label, index: m.index, len: m[0].length });
        // one hit per id is enough (first)
        break;
      }
    }
    hits.sort((a, b) => a.index - b.index);
    const sections = {};
    for (let i = 0; i < hits.length; i++) {
      const bodyStart = hits[i].index;
      const end = i + 1 < hits.length ? hits[i + 1].index : raw.length;
      sections[hits[i].id] = {
        label: hits[i].label,
        text: raw.slice(bodyStart, end).trim(),
      };
    }
    return sections;
  }

  function splitInlineList(body) {
    // Prefer spaced separators; avoid breaking inside parentheses.
    const parts = [];
    let buf = '';
    let depth = 0;
    const s = String(body || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(' || ch === '（') depth += 1;
      if (ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
      const sep =
        depth === 0 &&
        ((ch === '·') ||
          (ch === '/' && s[i - 1] === ' ' && s[i + 1] === ' ') ||
          (ch === '|' && s[i - 1] === ' '));
      if (sep) {
        const t = buf.trim();
        if (t.length >= 4) parts.push(t);
        buf = '';
        continue;
      }
      buf += ch;
    }
    const last = buf.trim();
    if (last.length >= 4) parts.push(last);
    return parts.length ? parts : [s.trim()].filter((x) => x.length >= 4);
  }

  function listItems(block) {
    const text = String(block || '');
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const items = [];
    for (const line of lines) {
      if (SECTION_DEFS.some((d) => d.re.test(line) && line.replace(d.re, '').trim().length < 2)) continue;
      let body = line.replace(BULLET_RE, '').trim();
      body = body.replace(/^[【\[][^】\]]+[】\]]\s*/, '').trim();
      body = body.replace(/^(?:필수|서브|핵심)\s*소구(?:\s*포인트)?\s*/i, '').trim();
      body = body.replace(/^필수\s*(?:멘션|언급)\s*[:：]?\s*/i, '').trim();
      if (body.length < 4) continue;
      if (SKIP_ITEM_RE.test(body) || /https?:\/\//i.test(body)) continue;
      if (/[:：]/.test(body) && !/^\d+\s/.test(body)) {
        const parts = body.split(/[:：]/);
        const label = parts[0];
        const after = parts.slice(1).join(':').trim();
        // Keep "보조금: 지자체별…" as one caution-like item when short label
        if (after.length >= 4 && label.length <= 20) {
          splitInlineList(after).forEach((p) => {
            if (!SKIP_ITEM_RE.test(p) && !/https?:\/\//i.test(p)) items.push(p);
          });
          continue;
        }
      }
      splitInlineList(body).forEach((p) => {
        if (!SKIP_ITEM_RE.test(p) && !/https?:\/\//i.test(p) && p.length < 160) items.push(p);
      });
    }
    return dedupeItems(items);
  }

  function checklistItems(text) {
    return String(text || '')
      .split(/\n+/)
      .map((l) => l.replace(/^[□■☐☑✓✔\s]+/, '').trim())
      .filter((l) => l.length >= 3 && !SKIP_ITEM_RE.test(l) && !/https?:\/\//i.test(l));
  }

  function numberedSceneItems(text) {
    const items = [];
    // Scene beats: "1 오프닝: …" / "1. 차별점 …" (avoid matching years/temps like 2026, 180)
    const re = /(?:^|\n)\s*([1-9]|1[0-5])\s*[.)]?\s+([가-힣A-Za-z【].{8,})/g;
    let m;
    while ((m = re.exec(String(text || ''))) !== null) {
      let body = m[2].trim();
      body = body.replace(/^[【\[][^】\]]+[】\]]\s*/, '');
      if (body.length >= 8) items.push(body);
    }
    return dedupeItems(items);
  }

  function dedupeItems(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const k = compactKey(it).slice(0, 48);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    return out;
  }

  function mentionTokens(item) {
    const t = norm(item);
    const tokens = [];
    const patterns = [
      /미네랄\s*스톤/,
      /180\s*°?\s*C|180도|고온\s*건조/,
      /90\s*%|부피/,
      /99\s*%|살균/,
      /7중|칼날/,
      /활성탄|탈취|125\s*%/,
      /40\s*dB|저소음/,
      /습도\s*(?:감지\s*)?센서/,
      /중간\s*투입/,
      /보조금|Q\s*마크/,
      /디스플레이|진행률/,
      /이중\s*밀폐/,
      /분리\s*세척|완전\s*분리|자동\s*세척/,
      /한\s*뼘|21\s*cm|컴팩트/,
      /3\s*L|대용량/,
      /#?\s*제품협찬/,
      /inic\.inc/i,
      /테스트\s*(?:촬영|연출)/,
      /구매\s*링크/,
      /국내\s*최초/,
      /내마모|75\s*%/,
      /언박싱|택배/,
      /가루/,
      /역광/,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m) tokens.push(m[0]);
    }
    if (!tokens.length && t.length <= 48) tokens.push(t);
    if (!tokens.length) {
      const chunk = t.split(/[,(（·→]/)[0].trim();
      if (chunk.length >= 4) tokens.push(chunk.slice(0, 28));
    }
    return tokens;
  }

  function textHasToken(haystack, token) {
    const h = compactKey(haystack);
    const tok = compactKey(token);
    if (!tok) return false;
    if (h.includes(tok)) return true;
    if (/180/.test(tok) && /180/.test(h) && /(c|도|건조)/.test(h)) return true;
    if (/40db|저소음/.test(tok) && ((/40/.test(h) && /db|소음/.test(h)) || /저소음|조용/.test(h))) return true;
    if (/가루/.test(tok) && /가루/.test(h)) return true;
    if (/습도/.test(tok) && /센서/.test(tok) && /습도/.test(h) && /센서/.test(h)) return true;
    if (/중간/.test(tok) && /투입/.test(tok) && /중간/.test(h) && /투입/.test(h)) return true;
    if (/디스플레이|진행률/.test(tok) && /디스플레이|진행률|percent|%/.test(h)) return true;
    if (/보조금|지자체/.test(tok) && /보조금|지자체/.test(h)) return true;
    if (/테스트/.test(tok) && /테스트|연출|분쇄력/.test(h)) return true;
    if (/제품협찬|공정위/.test(tok) && /제품협찬|공정위|협찬/.test(h)) return true;
    return false;
  }

  function parseField(text) {
    const sections = splitSections(text);
    return {
      sections,
      mustSell: listItems(sections.mustSell?.text || ''),
      subSell: listItems(sections.subSell?.text || ''),
      mustMention: listItems(sections.mustMention?.text || ''),
      mustScenes: (() => {
        const numbered = numberedSceneItems(sections.mustScene?.text || '');
        return numbered.length ? numbered : listItems(sections.mustScene?.text || '');
      })(),
      cautions: listItems(sections.caution?.text || ''),
      productBits: listItems(sections.product?.text || ''),
    };
  }

  function extractProductSpecs(...texts) {
    const blob = texts.join('\n');
    const productSpecs = {};
    const model = blob.match(/모델명?\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9 \-]{1,40})/i) || blob.match(/\b(iFD\d+[^\s,]*)\b/i);
    const capacity = blob.match(/(?:용량\s*[:：]?\s*)?(\d+)\s*L\b/i);
    const price = blob.match(/정가\s*[:：]?\s*([\d,]+)\s*원/) || blob.match(/([\d,]{3,})\s*원/);
    const name = blob.match(/제품명\s*[:：]\s*([^\n]+)/);
    if (model) productSpecs.model = model[1].replace(/\s+/g, ' ').trim().slice(0, 40);
    if (capacity) productSpecs.capacity = `${capacity[1]}L`;
    if (price) productSpecs.price = `${String(price[1]).replace(/,/g, ',')}원`.replace(/원원$/, '원');
    if (name) productSpecs.productName = name[1].trim().slice(0, 60);
    return productSpecs;
  }

  function extractFromPlan(plan) {
    const fields = {
      reviewGuide: parseField(plan?.reviewGuide || ''),
      brandMust: parseField(plan?.brandMust || ''),
      brandAvoid: parseField(plan?.brandAvoid || ''),
      concept: parseField(plan?.concept || ''),
      notes: parseField(plan?.notes || ''),
    };

    const shootChecklist = checklistItems(plan?.shootChecklist || '');
    let mustSell = fields.reviewGuide.mustSell;
    let subSell = fields.reviewGuide.subSell;

    // Prefer a single "필수 멘션: …" line (avoid swallowing purchase-link / test-shoot lines)
    let mustMention = [];
    const mentionLine = String(plan?.brandMust || '').match(/필수\s*(?:멘션|언급)\s*[:：]\s*([^\n]+)/i);
    if (mentionLine) mustMention = splitInlineList(mentionLine[1]);
    else if (fields.brandMust.mustMention.length) mustMention = fields.brandMust.mustMention;
    mustMention = mustMention.filter((x) => x.length >= 6 && !/https?:|surl|구매\s*링크/i.test(x));

    // Disclosure/test lines as extra must-mentions when present
    const brandMustText = String(plan?.brandMust || '');
    if (/보조금/.test(brandMustText) && /지자체/.test(brandMustText)) {
      mustMention.push('보조금은 지자체별로 상이·별도 확인');
    }
    if (/테스트\s*(?:촬영|연출)/.test(brandMustText)) {
      mustMention.push('분쇄력 확인을 위한 테스트 촬영/연출 고지');
    }
    if (/#?\s*제품협찬|공정위/.test(brandMustText)) {
      mustMention.push('#제품협찬·공정위 표기');
    }
    mustMention = dedupeItems(mustMention);
    // Prefer numbered 필수 장면 from reviewGuide; else checklist
    let mustScenes = fields.reviewGuide.mustScenes;
    if (!mustScenes.length) mustScenes = shootChecklist;

    let cautions = fields.brandAvoid.cautions;
    if (!cautions.length) cautions = listItems(plan?.brandAvoid || '');

    const productSpecs = extractProductSpecs(plan?.reviewGuide || '', plan?.brandMust || '', plan?.title || '');
    const corpus = planGuideCorpus(plan);

    return {
      mustSell,
      subSell,
      mustMention,
      mustScenes,
      shootChecklist,
      cautions,
      productSpecs,
      productBits: fields.reviewGuide.productBits,
      allowUnboxing: /언박싱|택배/.test(corpus),
      corpus,
    };
  }

  function checkCoverage(plan, prose, sceneText) {
    const guide = extractFromPlan(plan);
    const planText = planGuideCorpus(plan);
    const hay = `${prose || ''}\n${sceneText || ''}`;

    const checkList = (items, mode, againstPlan) =>
      items.map((item) => {
        const tokens = mentionTokens(item);
        const source = againstPlan ? planText : hay;
        const ok = tokens.some((tok) => textHasToken(source, tok));
        return {
          item,
          tokens,
          ok,
          severity: mode === 'must' ? (ok ? 'pass' : 'fail') : ok ? 'pass' : 'warn',
          inPlan: againstPlan ? ok : tokens.some((tok) => textHasToken(planText, tok)),
        };
      });

    // Product specs: plan presence matters most
    const productChecks = Object.entries(guide.productSpecs).map(([k, v]) => {
      const inPlan = textHasToken(planText, v);
      const inDraft = textHasToken(hay, v);
      return {
        item: `${k}: ${v}`,
        tokens: [v],
        ok: inPlan,
        inPlan,
        inDraft,
        severity: inPlan ? 'pass' : 'fail',
      };
    });

    const mustMentions = checkList(guide.mustMention, 'must', false);
    const mustSell = checkList(guide.mustSell, 'must', false);
    const subSell = checkList(guide.subSell, 'soft', false);
    // Scenes: when no prose yet, check plan has them; with draft/rows check coverage
    const hasDraft = Boolean(norm(hay));
    const scenes = checkList(guide.mustScenes, 'must', !hasDraft);

    const summary = {
      mustMentionPass: mustMentions.filter((x) => x.ok).length,
      mustMentionTotal: mustMentions.length,
      mustSellPass: mustSell.filter((x) => x.ok).length,
      mustSellTotal: mustSell.length,
      subSellPass: subSell.filter((x) => x.ok).length,
      subSellTotal: subSell.length,
      scenePass: scenes.filter((x) => x.ok).length,
      sceneTotal: scenes.length,
      productPass: productChecks.filter((x) => x.ok).length,
      productTotal: productChecks.length,
      failCount:
        mustMentions.filter((x) => !x.ok).length +
        mustSell.filter((x) => !x.ok).length +
        scenes.filter((x) => !x.ok).length +
        productChecks.filter((x) => !x.ok).length,
    };

    return { guide, mustMentions, mustSell, subSell, scenes, productChecks, summary };
  }

  function buildPromptGuideBlock(plan) {
    const g = extractFromPlan(plan);
    const lines = ['# 브랜드 가이드 구조화 (형식 무관 추출 · 최우선 반영)'];
    if (Object.keys(g.productSpecs).length) {
      lines.push('## 제품·제원');
      Object.entries(g.productSpecs).forEach(([k, v]) => lines.push(`- ${k}: ${v}`));
    }
    if (g.mustSell.length) {
      lines.push('## 필수 소구 포인트 (본문에 반드시 녹일 것)');
      g.mustSell.forEach((x) => lines.push(`- ${x}`));
    }
    if (g.subSell.length) {
      lines.push('## 서브 소구 포인트 (적절히 포함)');
      g.subSell.forEach((x) => lines.push(`- ${x}`));
    }
    if (g.mustMention.length) {
      lines.push('## 필수 멘션·고지');
      g.mustMention.slice(0, 16).forEach((x) => lines.push(`- ${x}`));
    }
    if (g.mustScenes.length) {
      lines.push('## 필수 장면·촬영 체크');
      g.mustScenes.forEach((x) => lines.push(`- ${x}`));
    }
    if (g.cautions.length) {
      lines.push('## 주의·금지');
      g.cautions.forEach((x) => lines.push(`- ${x}`));
    }
    if (g.allowUnboxing) {
      lines.push('- 이 가이드는 언박싱·택배 개봉 장면을 허용합니다.');
    }
    return lines.length > 1 ? lines.join('\n') : '';
  }

  return {
    SECTION_DEFS,
    planGuideCorpus,
    extractFromPlan,
    checkCoverage,
    buildPromptGuideBlock,
    mentionTokens,
  };
})();
