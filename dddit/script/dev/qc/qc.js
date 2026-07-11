/**
 * 대본 QC — 개발 전용 (콘티 작성기 미연동)
 */
(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    format: null,
    categories: null,
    checklist: null,
    anchors: { tone: '', roundup: '' },
    sampleTsv: '',
  };

  async function loadText(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} (${res.status})`);
    return res.text();
  }

  async function loadJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} (${res.status})`);
    return res.json();
  }

  function parseTsvScript(text) {
    const lines = text.trim().split(/\r?\n/).slice(1);
    return lines.map((line) => line.split('\t')[0]?.trim() || '').filter(Boolean);
  }

  function tsvBlockToProse(lines) {
    return lines.join('\n');
  }

  function isRoundupFormat(fmt) {
    return fmt === 'item-roundup';
  }

  function getChecklistId(fmt) {
    if (isRoundupFormat(fmt)) return 'prose-roundup-item';
    return 'prose-sponsored';
  }

  function listRoundupCategoryIds() {
    return Object.keys(state.categories || {}).filter((id) => id.startsWith('roundup-'));
  }

  function renderCategoryOptions() {
    const fmt = $('format').value;
    const catSel = $('category');
    catSel.innerHTML = '';
    const entries = Object.entries(state.categories || {}).filter(([id]) => !id.startsWith('_'));
    const filtered = isRoundupFormat(fmt)
      ? entries.filter(([id, c]) => c.format === 'item-roundup' || id.startsWith('roundup-'))
      : entries.filter(([id, c]) => c.format !== 'item-roundup' && !id.startsWith('roundup-'));

    filtered.forEach(([id, c]) => {
      const opt = document.createElement('option');
      opt.value = id;
      const label = c.label || id;
      opt.textContent = c.notes ? `${label} — ${c.notes}` : label;
      catSel.appendChild(opt);
    });

    if (isRoundupFormat(fmt)) {
      catSel.value = listRoundupCategoryIds().includes('roundup-daiso') ? 'roundup-daiso' : filtered[0]?.[0] || '';
    } else {
      catSel.value = filtered.some(([id]) => id === 'it-device') ? 'it-device' : filtered[0]?.[0] || '';
    }
  }

  function renderChapters() {
    const fmt = $('format').value;
    const catId = $('category').value;
    const desc = $('format-desc');
    const list = $('chapter-list');
    list.innerHTML = '';

    if (isRoundupFormat(fmt)) {
      const f = state.format?.roundup;
      const cat = state.categories?.[catId];
      desc.textContent = cat?.openingExample
        ? `${f?.description || ''} · 예: ${cat.openingExample}`
        : f?.description || '';
      ['오프닝 6행 전후', '[제품명] 블록 × N (4~10행/개)', '클로징 (N개 아이템)'].forEach((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        list.appendChild(li);
      });
      if (cat?.conceptHints?.length) {
        const li = document.createElement('li');
        li.textContent = `소스 힌트: ${cat.conceptHints.join(', ')}`;
        list.appendChild(li);
      }
      return;
    }

    const f = state.format?.sponsored;
    const cat = state.categories?.[catId];
    desc.textContent = f?.description || '';
    const chapters = cat?.suggestedChapters || f?.defaultChapters?.map((c) => c.title) || [];
    chapters.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t + (t === '실사용' ? ' ★ 톤 QC' : '');
      list.appendChild(li);
    });
  }

  function renderChecklist() {
    const box = $('checklist');
    const cl = state.checklist;
    if (!cl?.items?.length) {
      box.innerHTML = '<p class="sub">체크리스트 로드 실패</p>';
      return;
    }
    box.innerHTML = cl.items
      .map(
        (item) => `
      <label class="check">
        <input type="checkbox" data-id="${item.id}" />
        <span>
          <strong>${item.label}</strong>
          <div class="hint">${item.hint}</div>
        </span>
      </label>`,
      )
      .join('');
    box.querySelectorAll('input[type=checkbox]').forEach((inp) => {
      inp.addEventListener('change', updateStatus);
    });
    updateStatus();
  }

  function allChecked() {
    const inputs = $('checklist').querySelectorAll('input[type=checkbox]');
    return inputs.length > 0 && [...inputs].every((i) => i.checked);
  }

  function updateStatus() {
    const status = $('qc-status');
    const pass = allChecked();
    const prose = $('prose').value.trim();
    const fmt = $('format').value;
    status.hidden = false;
    if (pass && prose) {
      status.className = 'status pass';
      status.textContent = 'QC Pass — 앵커 복사 버튼으로 반영하세요.';
    } else if (!prose) {
      status.className = 'status fail';
      status.textContent = '대본을 붙여넣으세요.';
    } else {
      status.className = 'status fail';
      status.textContent = '미통과 항목이 있습니다.';
    }
    $('btn-export-tone').disabled = !(pass && prose && fmt === 'sponsored-review');
    $('btn-export-roundup').disabled = !(pass && prose && isRoundupFormat(fmt));
  }

  function buildToneAnchorExport(prose) {
    return `# 디디딧 줄글 스타일 앵커 (QC Pass ${new Date().toISOString().slice(0, 10)})

## 문장 습관
- "~인데요", "~편이에요" — 담백한 구어체
- 과장·이 녀석 금지
- 단점 솔직히, 스펙은 문장 속에

## 실사용 예시 (복사 금지 — 톤·호흡만 참고)
${prose.trim()}`;
  }

  function buildRoundupAnchorExport(prose) {
    const cat = state.categories?.[$('category').value];
    const catLine = cat?.label ? `\n소스 카테고리: ${cat.label}` : '';
    return `# N개 아이템 라운드업 QC Pass (${new Date().toISOString().slice(0, 10)})${catLine}

## Pass 블록
${prose.trim()}

---
${state.anchors.roundup.split('## 아이템 예시')[0].trim()}`;
  }

  async function reloadChecklist() {
    state.checklist = await loadJson(`checklists/${getChecklistId($('format').value)}.json`);
    renderChecklist();
  }

  async function init() {
    const [sponsored, roundup, categories, tone, roundupAnchor, sample] = await Promise.all([
      loadJson('formats/sponsored-review.json'),
      loadJson('formats/item-roundup.json'),
      loadJson('formats/categories.json'),
      loadText('anchors/tone-sponsored-prose.txt'),
      loadText('anchors/format-item-roundup.txt'),
      loadText('samples/daiso-summer-20.tsv'),
    ]);

    state.format = { sponsored, roundup };
    state.categories = categories;
    state.anchors.tone = tone;
    state.anchors.roundup = roundupAnchor;
    state.sampleTsv = sample;

    renderCategoryOptions();
    state.checklist = await loadJson('checklists/prose-sponsored.json');
    renderChapters();
    renderChecklist();
    $('anchor-preview').textContent = tone.slice(0, 1200) + (tone.length > 1200 ? '\n…' : '');

    $('format').addEventListener('change', async () => {
      renderCategoryOptions();
      renderChapters();
      await reloadChecklist();
    });
    $('category').addEventListener('change', renderChapters);
    $('prose').addEventListener('input', updateStatus);

    $('btn-sample-roundup').addEventListener('click', () => {
      const lines = parseTsvScript(state.sampleTsv);
      $('prose').value = tsvBlockToProse(lines);
      $('format').value = 'item-roundup';
      $('category').value = 'roundup-daiso';
      renderChapters();
      reloadChecklist();
      updateStatus();
    });

    $('btn-sample-tone').addEventListener('click', () => {
      const m = state.anchors.tone.match(/## 실사용 예시[\s\S]*/);
      $('prose').value = m ? m[0].replace(/^##[^\n]+\n/, '').trim() : state.anchors.tone;
      $('format').value = 'sponsored-review';
      renderCategoryOptions();
      $('category').value = 'it-device';
      renderChapters();
      reloadChecklist();
      updateStatus();
    });

    $('btn-clear').addEventListener('click', () => {
      $('prose').value = '';
      $('checklist').querySelectorAll('input').forEach((i) => { i.checked = false; });
      updateStatus();
    });

    $('btn-export-tone').addEventListener('click', async () => {
      const text = buildToneAnchorExport($('prose').value);
      await navigator.clipboard.writeText(text);
      alert('톤 앵커 텍스트를 복사했습니다.\nprompts/style-anchor.txt 에 붙여넣으세요.');
    });

    $('btn-export-roundup').addEventListener('click', async () => {
      const text = buildRoundupAnchorExport($('prose').value);
      await navigator.clipboard.writeText(text);
      alert('라운드업 포맷 앵커를 복사했습니다.\nprompts/format-item-roundup.txt 에 반영하세요.');
    });
  }

  init().catch((e) => {
    document.body.innerHTML = `<p style="padding:24px;color:#b91c1c">QC 로드 실패: ${e.message}<br>로컬 서버(works-site 루트)에서 열어야 합니다.</p>`;
  });
})();
