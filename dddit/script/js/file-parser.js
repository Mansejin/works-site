/** 참고 대본 파일 파싱 (txt, md, docx) */
(function () {
  const MAX_PER_FILE = 12000;
  const MAX_TOTAL = 30000;

  function decodeXmlEntities(str) {
    return str
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  async function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`${file.name} 읽기 실패`));
      reader.readAsText(file, 'UTF-8');
    });
  }

  async function readDocxFile(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('docx 읽기에 JSZip이 필요합니다. 인터넷 연결 후 다시 시도하세요.');
    }
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const docXml = zip.file('word/document.xml');
    if (!docXml) throw new Error(`${file.name}: document.xml 없음`);

    const xml = await docXml.async('string');
    const paragraphs = xml.split(/<\/w:p>/i);
    const lines = paragraphs.map((p) => {
      const texts = [];
      const re = /<w:t[^>]*>([^<]*)<\/w:t>/gi;
      let m;
      while ((m = re.exec(p))) texts.push(m[1]);
      return decodeXmlEntities(texts.join('')).trim();
    });
    return lines.filter(Boolean).join('\n');
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    return text.slice(0, max) + '\n…(이하 생략)';
  }

  async function parseReferenceFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    let text = '';

    if (['txt', 'md', 'csv', 'tsv', 'log'].includes(ext)) {
      text = await readTextFile(file);
    } else if (ext === 'docx') {
      text = await readDocxFile(file);
    } else if (ext === 'doc') {
      throw new Error(`${file.name}: .doc 형식은 지원하지 않습니다. docx 또는 txt로 저장해 주세요.`);
    } else {
      text = await readTextFile(file);
    }

    return {
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      source: 'file',
      text: truncate(text.trim(), MAX_PER_FILE),
      chars: text.length,
    };
  }

  function buildReferenceContext(scripts) {
    if (!scripts.length) return '';
    let total = 0;
    const blocks = [];

    for (const s of scripts) {
      if (total >= MAX_TOTAL) break;
      const budget = Math.min(MAX_PER_FILE, MAX_TOTAL - total);
      const body = s.text.length > budget ? truncate(s.text, budget) : s.text;
      total += body.length;
      blocks.push(`## ${s.name}\n${body}`);
    }

    return `
# 참고 리뷰 대본 (팩트 체크·차별화용)
- 아래 내용은 타 유튜버 리뷰 참고 자료입니다. 문장 그대로 복사 금지.
- 스펙·사용감 팩트만 교차 검증하고, 디디딧 톤으로 재작성하세요.

${blocks.join('\n\n')}`.trim();
  }

  window.DIDIDIT_REF = {
    parseReferenceFile,
    buildReferenceContext,
    MAX_PER_FILE,
    MAX_TOTAL,
  };
})();
