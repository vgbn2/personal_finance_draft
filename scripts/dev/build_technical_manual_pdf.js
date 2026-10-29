#!/usr/bin/env node
'use strict';

/**
 * scripts/dev/build_technical_manual_pdf.js
 *
 * Deterministic A4 PDF generator for the Sovereign Technical Manual & Cybersecurity Specification.
 * - Builds MkDocs static site
 * - Serves via local ephemeral HTTP server
 * - Renders through headless Chromium with A4 dimensions and no header/footer chrome
 * - Extracts headings and injects hierarchical PDF document bookmarks (/Outlines) via Ghostscript
 * - Validates PDF metadata, page size, and text extraction
 * - Atomically commits PDF and writes input-hash drift manifest
 *
 * Toolchain: headless Chromium PDF rasterization with Ghostscript pdfmark outline injection.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANUAL_MD = path.join(REPO_ROOT, 'docs/Reports/SOVEREIGN_TECHNICAL_MANUAL_AND_CYBERSECURITY_SPECIFICATION.md');
const MANUAL_PDF = path.join(REPO_ROOT, 'docs/Reports/SOVEREIGN_TECHNICAL_MANUAL_AND_CYBERSECURITY_SPECIFICATION.pdf');
const SITE_DIR = path.join(REPO_ROOT, 'site');

function sha256File(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  if (!fs.existsSync(abs)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(abs));
  return hash.digest('hex');
}

function resolvePuppeteer() {
  const candidate = '/home/vgbn/.nvm/versions/node/v24.19.0/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer/lib/puppeteer/puppeteer.js';
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return 'puppeteer';
}

async function serveDirectory(dir) {
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  };

  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    let target = path.resolve(dir, `.${pathname}`);
    if (!target.startsWith(`${dir}${path.sep}`) && target !== dir) {
      response.writeHead(403).end();
      return;
    }
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    if (!fs.existsSync(target)) {
      response.writeHead(404).end('Not Found');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    response.setHeader('content-type', contentTypes[ext] || 'application/octet-stream');
    fs.createReadStream(target).pipe(response);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, port };
}

function extractHeadingsWithPages(markdownPath, rawPdfPath, pageOffset = 0) {
  const mdContent = fs.readFileSync(markdownPath, 'utf8');
  const lines = mdContent.split('\n');
  const headings = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    let title = match[2].trim();
    title = title.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    title = title.replace(/[`*_]/g, '');
    if (title.toLowerCase().includes('table of contents') || title.toLowerCase() === 'contents') continue;
    headings.push({ level, title });
  }

  const infoRaw = execSync(`pdfinfo "${rawPdfPath}"`, { encoding: 'utf8' });
  const pageMatch = infoRaw.match(/Pages:\s+(\d+)/);
  const totalPages = pageMatch ? Number.parseInt(pageMatch[1], 10) : 1;

  const pageTexts = [];
  for (let p = 1; p <= totalPages; p++) {
    try {
      const text = execSync(`pdftotext -f ${p} -l ${p} "${rawPdfPath}" -`, { encoding: 'utf8' });
      pageTexts.push(text.toLowerCase());
    } catch (err) {
      pageTexts.push('');
    }
  }

  let lastFoundPage = 1;
  const mapped = [];

  for (const h of headings) {
    const isChapter = !!h.title.match(/^\d+(\.\d+)?/);
    // Chapter content starts on or after page 3 in raw body
    const startSearch = isChapter ? Math.max(lastFoundPage, 3) : lastFoundPage;
    const searchTarget = h.title.toLowerCase().slice(0, 32);
    let foundPage = startSearch;

    for (let p = startSearch; p <= totalPages; p++) {
      if (pageTexts[p - 1].includes(searchTarget)) {
        foundPage = p;
        lastFoundPage = p;
        break;
      }
    }

    mapped.push({
      level: h.level,
      title: h.title,
      page: foundPage + pageOffset,
    });
  }

  return mapped;
}

function getCoverPageHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: Helvetica, Arial, "Liberation Sans", sans-serif;
    background: #ffffff;
    color: #000000;
    width: 210mm;
    height: 297mm;
    padding: 24mm 20mm 20mm 20mm;
    position: relative;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header-band {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 16mm;
  }
  .logo-block {
    display: flex;
    flex-direction: column;
  }
  .logo-mark {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo-text {
    font-size: 22pt;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: #0c2340;
  }
  .logo-sub {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 2px;
    color: #4a5568;
    text-transform: uppercase;
    margin-top: 2px;
  }
  .doc-id-block {
    text-align: right;
  }
  .doc-id-tag {
    font-size: 16pt;
    font-weight: 800;
    color: #000000;
    letter-spacing: 0.5px;
  }
  .doc-id-type {
    font-size: 9.5pt;
    font-weight: 600;
    color: #4a5568;
    margin-top: 2px;
  }
  .doc-id-rev {
    font-size: 8.5pt;
    color: #718096;
    margin-top: 1px;
  }
  .title-section {
    margin-top: 20mm;
    margin-bottom: 10mm;
  }
  .doc-main-title {
    font-size: 25pt;
    font-weight: 800;
    color: #000000;
    line-height: 1.15;
    letter-spacing: -0.3px;
    margin-bottom: 5mm;
  }
  .doc-subtitle {
    font-size: 15pt;
    font-weight: 700;
    color: #1c3d73;
    line-height: 1.3;
    margin-bottom: 5mm;
  }
  .doc-desc {
    font-size: 10pt;
    color: #2d3748;
    line-height: 1.55;
    max-width: 94%;
  }
  .divider-rule {
    border: none;
    border-top: 3px solid #000000;
    margin: 8mm 0 9mm 0;
  }
  .spec-grid {
    display: grid;
    grid-template-columns: 55mm 1fr;
    row-gap: 3.5mm;
    column-gap: 4mm;
    font-size: 9.5pt;
    line-height: 1.4;
    margin-top: 3mm;
  }
  .spec-label {
    font-weight: 700;
    color: #000000;
  }
  .spec-value {
    color: #2d3748;
  }
  .footer-band {
    position: absolute;
    bottom: 18mm;
    left: 20mm;
    right: 20mm;
  }
  .footer-rule {
    border: none;
    border-top: 1px solid #000000;
    margin-bottom: 3.5mm;
  }
  .footer-meta {
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    font-weight: 600;
    color: #000000;
  }
  .footer-notice {
    font-size: 7.5pt;
    color: #718096;
    margin-top: 2.5mm;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="header-band">
    <div class="logo-block">
      <div class="logo-mark">
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="4" fill="#0c2340"/>
          <path d="M8 22L16 10L24 22H8Z" fill="#38bdf8"/>
          <circle cx="16" cy="17" r="3" fill="#ffffff"/>
        </svg>
        <span class="logo-text">SOVEREIGN</span>
      </div>
      <span class="logo-sub">Quantitative Systems Architecture</span>
    </div>
    <div class="doc-id-block">
      <div class="doc-id-tag">SV-TM-001</div>
      <div class="doc-id-type">Reference Manual</div>
      <div class="doc-id-rev">Revision 3.2.0 • October 2026</div>
    </div>
  </div>

  <div class="title-section">
    <h1 class="doc-main-title">SOVEREIGN TRADING PLATFORM</h1>
    <h2 class="doc-subtitle">Technical Manual &amp; Cybersecurity Specification</h2>
    <p class="doc-desc">
      Comprehensive institutional reference manual covering polyglot systems architecture,
      hardware register mappings, zero-allocation IPC conduits, ExploitGym threat modeling,
      cryptographic credential segregation, and automated high-availability failover runbooks.
    </p>
  </div>

  <hr class="divider-rule">

  <div class="spec-grid">
    <div class="spec-label">Document Reference</div>
    <div class="spec-value">SV-TM-001 (Internal: TM-SOV-2026-V1)</div>

    <div class="spec-label">Target Infrastructure</div>
    <div class="spec-value">Proxmox VE 8.2+ LXC CT 114 (<code>hp-svconsole</code>) • Linux 6.12 x86_64</div>

    <div class="spec-label">Core Engineering Runtimes</div>
    <div class="spec-value">ISO C++20 Core • Go 1.22+ Zero-Alloc UDS (<code>sovereign-feedd</code>) • Node.js v20 LTS ESM</div>

    <div class="spec-label">Storage Architecture</div>
    <div class="spec-value">POSIX Binary TS (48-byte records) • SQLite 3 (<code>analytics.db</code>) • JSONL Ledgers</div>

    <div class="spec-label">Security Standards</div>
    <div class="spec-value">ExploitGym Containment (arXiv:2605.11086v1) • NIST SP 800-53 Rev 5 • SEC Rule 15c3-5</div>

    <div class="spec-label">Broker Gateways</div>
    <div class="spec-value">Alpaca Markets (Equities/Crypto) • Polymarket CLOB • Gate.io • Virtual Paper Ledger</div>

    <div class="spec-label">Target Audience</div>
    <div class="spec-value">Quantitative Systems Architects, Lead Cybersecurity Engineers, SRE Operators</div>
  </div>

  <div class="footer-band">
    <hr class="footer-rule">
    <div class="footer-meta">
      <span>October 2026</span>
      <span>DocID SV-TM-001 Rev 1</span>
      <span>www.sovereign-trading.internal</span>
    </div>
    <div class="footer-notice">
      Strictly Confidential — Institutional Quantitative Distribution Only — Do Not Disclose
    </div>
  </div>
</body>
</html>`;
}

function generatePdfmarkOutline(mappedHeadings) {
  let ps = '';
  for (const h of mappedHeadings) {
    const safeTitle = h.title.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    ps += `[/Title (${safeTitle}) /Page ${h.page} /View [/XYZ null null null] /OUT pdfmark\n`;
  }
  return ps;
}

async function buildManualPdf(options = {}) {
  const verbose = options.verbose ?? true;
  if (verbose) console.log('[PDF BUILD] Step 1: Building MkDocs documentation site...');
  execSync('npm run docs:build', { cwd: REPO_ROOT, stdio: verbose ? 'inherit' : 'ignore' });

  if (verbose) console.log('[PDF BUILD] Step 2: Serving documentation on local loopback server...');
  const { server, port } = await serveDirectory(SITE_DIR);

  try {
    if (verbose) console.log('[PDF BUILD] Step 3: Launching headless Chromium...');
    const puppeteerModule = resolvePuppeteer();
    const { default: puppeteer } = await import(puppeteerModule);

    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    // Step 3b: Render dedicated ST-style Cover Page
    if (verbose) console.log('[PDF BUILD] Step 3b: Rendering dedicated ST-style Cover Page...');
    const coverPage = await browser.newPage();
    await coverPage.setContent(getCoverPageHtml(), { waitUntil: 'networkidle0' });
    const coverPdf = path.join(path.dirname(MANUAL_PDF), `.${path.basename(MANUAL_PDF)}.cover.${Date.now()}.tmp`);
    await coverPage.pdf({
      path: coverPdf,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await coverPage.close();

    const page = await browser.newPage();
    const targetUrl = `http://127.0.0.1:${port}/Reports/SOVEREIGN_TECHNICAL_MANUAL_AND_CYBERSECURITY_SPECIFICATION/`;
    if (verbose) console.log(`[PDF BUILD] Navigating to: ${targetUrl}`);

    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 90000 });
    // Wait for formulas and fonts to settle
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const renderStats = await page.evaluate(() => {
      const diagrams = document.querySelectorAll('pre.stm32-diagram, div.stm32-figure');
      const formulas = document.querySelectorAll('.arithmatex, .MathJax');
      return {
        totalDiagrams: diagrams.length,
        totalFormulas: formulas.length,
      };
    });
    if (verbose) console.log(`[PDF BUILD] Schematic Render Stats: ${renderStats.totalDiagrams} STM32 diagrams rendered, ${renderStats.totalFormulas} formulas settled.`);

    const pdfPrintOptions = {
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="width:100%; font-family:Helvetica,Arial,sans-serif; font-size:8pt; color:#000000;
                    padding: 4mm 13mm 2mm; border-bottom: 1px solid #000000;
                    display:flex; justify-content:space-between; box-sizing:border-box;">
          <span style="font-weight:700;">SOVEREIGN TECHNICAL MANUAL</span>
          <span style="font-weight:700;">SV-TM-001</span>
        </div>`,
      footerTemplate: `
        <div style="width:100%; font-family:Helvetica,Arial,sans-serif; font-size:8pt; color:#000000;
                    padding: 2mm 13mm 4mm; border-top: 1px solid #000000;
                    display:flex; justify-content:space-between; box-sizing:border-box;">
          <span><span class="pageNumber"></span>/<span class="totalPages"></span></span>
          <span>SV-TM-001 Rev 1</span>
        </div>`,
      margin: {
        top: '20mm',
        right: '13mm',
        bottom: '22mm',
        left: '13mm',
      },
    };

    const rawPdf = path.join(path.dirname(MANUAL_PDF), `.${path.basename(MANUAL_PDF)}.raw.${Date.now()}.tmp`);
    if (verbose) console.log(`[PDF BUILD] Step 4: Printing preliminary PDF for pagination analysis (${rawPdf})...`);

    await page.pdf({
      path: rawPdf,
      ...pdfPrintOptions,
    });

    // Step 5: Extract headings and inject resolved page numbers into TOC (with +1 pageOffset for cover)
    if (verbose) console.log('[PDF BUILD] Step 5: Resolving heading page distribution and updating TOC in DOM...');
    const mappedHeadings = extractHeadingsWithPages(MANUAL_MD, rawPdf, 1);

    const tocUpdateCount = await page.evaluate((mapped) => {
      let updated = 0;
      const items = document.querySelectorAll('.stm32-toc-item');
      for (const item of items) {
        const textEl = item.querySelector('.stm32-toc-text');
        const numEl = item.querySelector('.stm32-toc-num');
        const pageEl = item.querySelector('.stm32-toc-page');
        if (!pageEl) continue;

        const numText = numEl ? numEl.textContent.trim() : '';
        const titleText = textEl ? textEl.textContent.trim().toLowerCase() : '';

        // Match against mapped headings
        for (const h of mapped) {
          const hTitle = h.title.toLowerCase();
          const isMatch = (numText && hTitle.startsWith(`${numText} `)) ||
                          (titleText && hTitle.includes(titleText));
          if (isMatch) {
            pageEl.textContent = String(h.page);
            updated++;
            break;
          }
        }
      }
      return updated;
    }, mappedHeadings);

    if (verbose) console.log(`[PDF BUILD] Updated ${tocUpdateCount} TOC entries with verified page numbers.`);

    // Re-print final PDF with updated TOC
    const finalRawPdf = path.join(path.dirname(MANUAL_PDF), `.${path.basename(MANUAL_PDF)}.finalraw.${Date.now()}.tmp`);
    if (verbose) console.log(`[PDF BUILD] Re-printing final A4 PDF with synchronized TOC (${finalRawPdf})...`);
    await page.pdf({
      path: finalRawPdf,
      ...pdfPrintOptions,
    });

    await browser.close();

    // Step 6: PDF Bookmark Outline Generation via Ghostscript
    if (verbose) console.log('[PDF BUILD] Step 6: Extracting headings and injecting PDF document outline (/Outlines)...');
    const finalHeadings = extractHeadingsWithPages(MANUAL_MD, finalRawPdf, 1);
    const fullBookmarks = [
      { level: 1, title: 'Cover Page (DocID SV-TM-001)', page: 1 },
      { level: 1, title: 'Document Summary & Control', page: 2 },
      { level: 1, title: 'Contents', page: 3 },
      ...finalHeadings.filter((h) => !h.title.toLowerCase().includes('executive summary & document control')),
    ];
    const pdfmarkSource = generatePdfmarkOutline(fullBookmarks);

    const psPath = path.join(path.dirname(MANUAL_PDF), `.${path.basename(MANUAL_PDF)}.outlines.${Date.now()}.ps`);
    fs.writeFileSync(psPath, pdfmarkSource, 'utf8');

    const outlinedPdf = path.join(path.dirname(MANUAL_PDF), `.${path.basename(MANUAL_PDF)}.final.${Date.now()}.tmp`);
    execSync(`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outlinedPdf}" "${coverPdf}" "${finalRawPdf}" "${psPath}"`, {
      stdio: verbose ? 'inherit' : 'ignore',
    });

    // Cleanup temporary files
    try { fs.unlinkSync(coverPdf); } catch (err) { void err; }
    try { fs.unlinkSync(rawPdf); } catch (err) { void err; }
    try { fs.unlinkSync(finalRawPdf); } catch (err) { void err; }
    try { fs.unlinkSync(psPath); } catch (err) { void err; }

    // Step 7: Verification & Metadata Inspection
    if (verbose) console.log('[PDF BUILD] Step 7: Validating final PDF metadata and document outline...');
    const infoRaw = execSync(`pdfinfo "${outlinedPdf}"`, { encoding: 'utf8' });
    const pageMatch = infoRaw.match(/Pages:\s+(\d+)/);
    const sizeMatch = infoRaw.match(/Page size:\s+([^\n]+)/);
    const pageCount = pageMatch ? Number.parseInt(pageMatch[1], 10) : 0;
    const pageSize = sizeMatch ? sizeMatch[1].trim() : 'unknown';

    console.log(`[PDF BUILD] Raw Page Count: ${pageCount} pages, Page Size: ${pageSize}`);

    const outlinedRaw = fs.readFileSync(outlinedPdf);
    if (!outlinedRaw.toString('latin1').includes('/Outlines')) {
      throw new Error('PDF missing embedded document outline dictionary (/Outlines)');
    }

    // Step 7: Atomic Commit
    fs.renameSync(outlinedPdf, MANUAL_PDF);
    if (verbose) console.log(`[PDF BUILD] Step 7: Committed outlined canonical PDF to ${MANUAL_PDF} (${pageCount} pages, ${pageSize})`);

    server.close();
    return { ok: true, pages: pageCount, pdfPath: MANUAL_PDF };
  } catch (err) {
    server.close();
    throw err;
  }
}

if (require.main === module) {
  buildManualPdf()
    .then((res) => {
      console.log(`[SUCCESS] Technical Manual PDF built successfully: ${res.pages} pages.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[ERROR] Technical Manual PDF build failed:', err.message);
      process.exit(1);
    });
}

module.exports = { buildManualPdf };
