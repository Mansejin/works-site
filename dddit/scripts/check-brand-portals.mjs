#!/usr/bin/env node
/**
 * 브랜드 포털(dddit/{slug}/index.html)에 시나리오 머신 링크가 없는지 검사합니다.
 * CI 및 로컬: node dddit/scripts/check-brand-portals.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DDDIT_ROOT = path.resolve(__dirname, "..");

const SKIP_BRAND_DIRS = new Set([
  "script",
  "conti",
  "report",
  "productlist",
  "js",
  "_template",
  "docs",
  "scripts",
]);

const FORBIDDEN = [
  /href=["'][^"']*\/script\//i,
  /href=["'][^"']*script\/\?project=/i,
  /시나리오\s*머신/i,
];

function listBrandPortalIndexes() {
  return fs
    .readdirSync(DDDIT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SKIP_BRAND_DIRS.has(entry.name))
    .map((entry) => path.join(DDDIT_ROOT, entry.name, "index.html"))
    .filter((filePath) => fs.existsSync(filePath));
}

let failed = false;

for (const filePath of listBrandPortalIndexes()) {
  const html = fs.readFileSync(filePath, "utf8");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(html)) {
      console.error(`[brand-portal] FAIL ${path.relative(process.cwd(), filePath)}: forbidden ${pattern}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error(
    "\nBrand portals must not link to the script machine. Use dddit/ hub → 채널 도구 instead."
  );
  process.exit(1);
}

console.log(`[brand-portal] OK (${listBrandPortalIndexes().length} page(s))`);
