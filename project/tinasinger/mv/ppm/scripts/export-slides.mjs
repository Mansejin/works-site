/**
 * localStorage JSON → data/slides.js
 * Usage: node scripts/export-slides.mjs < slides.json
 *    or: node scripts/export-slides.mjs path/to/dump.json
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2];
const raw = inputPath ? readFileSync(inputPath, "utf8") : readFileSync(0, "utf8");
const parsed = JSON.parse(raw);
const slides = parsed.slides || parsed;

if (!Array.isArray(slides)) {
  console.error("Expected { slides: [...] } or array");
  process.exit(1);
}

const body = JSON.stringify(slides, null, 2);
const stamp = new Date().toISOString().slice(0, 10);
const file = `/**
 * 이겸비 (Tina Singer) — Right Here, Right Now MV PPM
 * 배포 기본값 — 편집 후 「slides.js 저장」 버튼 또는 scripts/export-slides.mjs
 */
window.PPM_SLIDES_UPDATED = "${stamp}";
window.PPM_SLIDES = ${body};
`;

writeFileSync(join(__dir, "../data/slides.js"), file, "utf8");
console.log(`Wrote ${slides.length} slides → data/slides.js`);
