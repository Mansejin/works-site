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
  /href=["']\.\.\/?["']/i,
  /href=["']\.\.\/["']/i,
  /디디딧\s*워크스페이스/i,
];

function listBrandHtmlFiles() {
  const files = [];
  for (const entry of fs.readdirSync(DDDIT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_BRAND_DIRS.has(entry.name)) continue;
    const brandDir = path.join(DDDIT_ROOT, entry.name);
    const indexPath = path.join(brandDir, "index.html");
    if (fs.existsSync(indexPath)) files.push(indexPath);
    for (const sub of ["plan", "conti", "productlist"]) {
      const subPath = path.join(brandDir, sub, "index.html");
      if (fs.existsSync(subPath)) files.push(subPath);
    }
  }
  return files;
}

let failed = false;

for (const filePath of listBrandHtmlFiles()) {
  const html = fs.readFileSync(filePath, "utf8");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(html)) {
      console.error(`[brand-portal] FAIL ${path.relative(process.cwd(), filePath)}: forbidden ${pattern}`);
      failed = true;
    }
  }
  if (!html.includes("brand-portal-page.js")) {
    console.error(`[brand-portal] FAIL ${path.relative(process.cwd(), filePath)}: missing brand-portal-page.js`);
    failed = true;
  }
}

if (failed) {
  console.error(
    "\nBrand portals must not link upward to the workspace. Use brand-portal-page.js and team-only hub navigation."
  );
  process.exit(1);
}

console.log(`[brand-portal] OK (${listBrandHtmlFiles().length} page(s))`);
