#!/usr/bin/env node
'use strict';

/**
 * scripts/dev/build_architecture_report_pdf.js
 *
 * Deterministic A4 PDF generator for the Sovereign Master Architecture Report.
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
const REPORT_MD = path.join(REPO_ROOT, 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.md');
const REPORT_PDF = path.join(REPO_ROOT, 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.pdf');
const REPORT_MANIFEST = path.join(REPO_ROOT, 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.pdf.manifest.json');
const SITE_DIR = path.join(REPO_ROOT, 'site');

const TRACKED_INPUTS = [
  'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.md',
  'docs/stylesheets/architecture-report.css',
  'docs/javascripts/mermaid-report.js',
  'mkdocs.yml',
];

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

function extractHeadingsWithPages(markdownPath, rawPdfPath) {
  const mdContent = fs.readFileSync(markdownPath, 'utf8');
  const lines = mdContent.split('\n');
  const headings = [];

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    let title = match[2].trim();
    // Clean title
    title = title.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    title = title.replace(/[`*_]/g, '');
    if (title.toLowerCase() === 'table of contents') continue;
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
    const searchTarget = h.title.toLowerCase().slice(0, 35);
    let foundPage = lastFoundPage;

    for (let p = lastFoundPage; p <= totalPages; p++) {
      if (pageTexts[p - 1].includes(searchTarget)) {
        foundPage = p;
        lastFoundPage = p;
        break;
      }
    }

    mapped.push({
      level: h.level,
      title: h.title,
      page: foundPage,
    });
  }

  return mapped;
}

function generatePdfmarkOutline(mappedHeadings) {
  let ps = '';
  for (const h of mappedHeadings) {
    const safeTitle = h.title.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    ps += `[/Title (${safeTitle}) /Page ${h.page} /View [/XYZ null null null] /OUT pdfmark\n`;
  }
  return ps;
}

async function buildReportPdf(options = {}) {
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

    const page = await browser.newPage();
    const targetUrl = `http://127.0.0.1:${port}/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT/`;
    if (verbose) console.log(`[PDF BUILD] Navigating to: ${targetUrl}`);

    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    // Wait for Mermaid flowcharts and MathJax formulas to settle
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const renderStats = await page.evaluate(() => {
      const divs = document.querySelectorAll('div.mermaid');
      const svgs = document.querySelectorAll('div.mermaid svg:not([aria-roledescription="error"])');
      return {
        totalDivs: divs.length,
        renderedSvgs: svgs.length,
      };
    });
    if (verbose) console.log(`[PDF BUILD] Diagram Render Stats: ${renderStats.renderedSvgs}/${renderStats.totalDivs} SVGs generated.`);

    const rawPdf = path.join(path.dirname(REPORT_PDF), `.${path.basename(REPORT_PDF)}.raw.${Date.now()}.tmp`);
    if (verbose) console.log(`[PDF BUILD] Step 4: Printing to A4 PDF (${rawPdf})...`);

    await page.pdf({
      path: rawPdf,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: {
        top: '14mm',
        right: '13mm',
        bottom: '16mm',
        left: '13mm',
      },
    });

    await browser.close();

    // Step 5: PDF Bookmark Outline Generation via Ghostscript
    if (verbose) console.log('[PDF BUILD] Step 5: Extracting headings and injecting PDF document outline (/Outlines)...');
    const mappedHeadings = extractHeadingsWithPages(REPORT_MD, rawPdf);
    const pdfmarkSource = generatePdfmarkOutline(mappedHeadings);

    const psPath = path.join(path.dirname(REPORT_PDF), `.${path.basename(REPORT_PDF)}.outlines.${Date.now()}.ps`);
    fs.writeFileSync(psPath, pdfmarkSource, 'utf8');

    const outlinedPdf = path.join(path.dirname(REPORT_PDF), `.${path.basename(REPORT_PDF)}.final.${Date.now()}.tmp`);
    execSync(`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outlinedPdf}" "${rawPdf}" "${psPath}"`, {
      stdio: verbose ? 'inherit' : 'ignore',
    });

    // Cleanup temporary files
    try { fs.unlinkSync(rawPdf); } catch (err) { void err; }
    try { fs.unlinkSync(psPath); } catch (err) { void err; }

    // Step 6: Verification & Metadata Inspection
    if (verbose) console.log('[PDF BUILD] Step 6: Validating final PDF metadata and document outline...');
    const infoRaw = execSync(`pdfinfo "${outlinedPdf}"`, { encoding: 'utf8' });
    const pageMatch = infoRaw.match(/Pages:\s+(\d+)/);
    const sizeMatch = infoRaw.match(/Page size:\s+([^\n]+)/);
    const pageCount = pageMatch ? Number.parseInt(pageMatch[1], 10) : 0;
    const pageSize = sizeMatch ? sizeMatch[1].trim() : 'unknown';

    if (pageCount < 20) {
      throw new Error(`Generated PDF has only ${pageCount} pages (expected >= 20)`);
    }
    if (!pageSize.includes('A4')) {
      throw new Error(`Generated PDF page size is "${pageSize}" (expected A4)`);
    }

    const outlinedRaw = fs.readFileSync(outlinedPdf);
    if (!outlinedRaw.toString('latin1').includes('/Outlines')) {
      throw new Error('PDF missing embedded document outline dictionary (/Outlines)');
    }

    const textRaw = execSync(`pdftotext "${outlinedPdf}" - | head -n 30`, { encoding: 'utf8' });
    if (!textRaw.includes('Sovereign Trading Platform: Architecture, Engineering')) {
      throw new Error('PDF missing master report title');
    }

    // Step 7: Atomic Commit
    fs.renameSync(outlinedPdf, REPORT_PDF);
    if (verbose) console.log(`[PDF BUILD] Step 7: Committed outlined canonical PDF to ${REPORT_PDF} (${pageCount} pages, ${pageSize})`);

    // Step 8: Write Drift Manifest
    const inputHashes = {};
    for (const rel of TRACKED_INPUTS) {
      inputHashes[rel] = sha256File(rel);
    }
    const pdfSha256 = sha256File(REPORT_PDF);

    const manifestData = {
      schema_version: 'sovereign.report-pdf/v1',
      source: 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.md',
      output: 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.pdf',
      generator: 'npm run docs:report:pdf',
      inputs: inputHashes,
      pdf_sha256: pdfSha256,
      page_size: pageSize,
      page_count: pageCount,
      has_outline: true,
      outline_entries: mappedHeadings.length,
      generated_at: new Date().toISOString(),
    };

    fs.writeFileSync(REPORT_MANIFEST, JSON.stringify(manifestData, null, 2) + '\n', 'utf8');
    if (verbose) console.log(`[PDF BUILD] Step 8: Updated drift manifest at ${REPORT_MANIFEST} (${mappedHeadings.length} outline entries)`);

    return {
      ok: true,
      pdfPath: REPORT_PDF,
      manifestPath: REPORT_MANIFEST,
      pageCount,
      pageSize,
      pdfSha256,
      outlineEntries: mappedHeadings.length,
    };
  } finally {
    server.close();
  }
}

if (require.main === module) {
  buildReportPdf()
    .then((res) => {
      console.log(`\n🎉 PDF Build Succeeded! ${res.pageCount} pages generated with ${res.outlineEntries} outline bookmarks.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ PDF Build Failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  TRACKED_INPUTS,
  sha256File,
  serveDirectory,
  buildReportPdf,
};
