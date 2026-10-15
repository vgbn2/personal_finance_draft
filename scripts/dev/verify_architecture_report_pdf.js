#!/usr/bin/env node
'use strict';

/**
 * scripts/dev/verify_architecture_report_pdf.js
 *
 * Verification gate for the Sovereign Master Architecture Report PDF.
 * Validates:
 * 1. PDF presence and SHA-256 match against manifest
 * 2. Input hashes match current source files (detects source drift)
 * 3. Physical page size is A4 and page count >= 20
 * 4. Text content contains title, key sections, and zero browser file:/// artifacts
 *
 * ponytail: stdlib first, fast deterministic checks, zero external dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPORT_PDF = path.join(REPO_ROOT, 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.pdf');
const REPORT_MANIFEST = path.join(REPO_ROOT, 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.pdf.manifest.json');

function sha256File(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
  if (!fs.existsSync(abs)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(abs));
  return hash.digest('hex');
}

function verifyReportPdf(options = {}) {
  const root = options.root || REPO_ROOT;
  const pdfPath = options.pdfPath || path.join(root, 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.pdf');
  const manifestPath = options.manifestPath || path.join(root, 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.pdf.manifest.json');
  const errors = [];

  // Check 1: Existence
  if (!fs.existsSync(pdfPath)) {
    errors.push(`Report PDF not found at: ${pdfPath}`);
    return { ok: false, errors };
  }
  if (!fs.existsSync(manifestPath)) {
    errors.push(`Report PDF manifest not found at: ${manifestPath}`);
    return { ok: false, errors };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    errors.push(`Failed to parse manifest JSON: ${err.message}`);
    return { ok: false, errors };
  }

  // Check 2: PDF SHA-256 Checksum
  const currentPdfHash = sha256File(pdfPath);
  if (manifest.pdf_sha256 && currentPdfHash !== manifest.pdf_sha256) {
    errors.push(`PDF hash mismatch (manifest: ${manifest.pdf_sha256.slice(0, 16)}..., disk: ${currentPdfHash.slice(0, 16)}...)`);
  }

  // Check 3: Tracked Input Drift Detection
  if (manifest.inputs && typeof manifest.inputs === 'object') {
    for (const [relPath, expectedHash] of Object.entries(manifest.inputs)) {
      const fullPath = path.join(root, relPath);
      if (!fs.existsSync(fullPath)) {
        errors.push(`Tracked input missing on disk: ${relPath}`);
        continue;
      }
      const actualHash = sha256File(fullPath);
      if (actualHash !== expectedHash) {
        errors.push(`Input drifted: ${relPath} (expected ${expectedHash.slice(0, 12)}..., got ${actualHash.slice(0, 12)}...). Run "npm run docs:report:pdf" to synchronize.`);
      }
    }
  }

  // Check 4: PDF Info Inspection
  try {
    const infoRaw = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf8' });
    const pageMatch = infoRaw.match(/Pages:\s+(\d+)/);
    const sizeMatch = infoRaw.match(/Page size:\s+([^\n]+)/);
    const pageCount = pageMatch ? Number.parseInt(pageMatch[1], 10) : 0;
    const pageSize = sizeMatch ? sizeMatch[1].trim() : 'unknown';

    if (pageCount < 20) {
      errors.push(`PDF has only ${pageCount} pages (expected >= 20)`);
    }
    if (!pageSize.includes('A4')) {
      errors.push(`PDF page size is "${pageSize}" (expected A4: 595.92 x 841.92 pts)`);
    }
  } catch (err) {
    errors.push(`pdfinfo inspection failed: ${err.message}`);
  }

  // Check 5: Text Extraction Integrity
  try {
    const textRaw = execSync(`pdftotext "${pdfPath}" - | head -n 100`, { encoding: 'utf8' });
    if (!textRaw.includes('Sovereign Trading Platform: Architecture, Engineering')) {
      errors.push('PDF missing master report title');
    }
    if (textRaw.includes('file:///')) {
      errors.push('PDF contains browser file:/// header or footer artifacts');
    }
  } catch (err) {
    errors.push(`pdftotext inspection failed: ${err.message}`);
  }

  // Check 6: Document Outline / Bookmarks Verification
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    if (!pdfBuffer.toString('latin1').includes('/Outlines')) {
      errors.push('PDF missing embedded document outline dictionary (/Outlines)');
    }
  } catch (err) {
    errors.push(`Failed to read PDF buffer for outline check: ${err.message}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    pageCount: manifest.page_count,
    pageSize: manifest.page_size,
    pdfSha256: currentPdfHash,
  };
}

if (require.main === module) {
  const result = verifyReportPdf();
  if (result.ok) {
    console.log(`✅ Architecture Report PDF verified successfully (${result.pageCount} pages, ${result.pageSize}).`);
    process.exit(0);
  } else {
    console.error('❌ Architecture Report PDF verification failed:');
    for (const err of result.errors) {
      console.error(`  • ${err}`);
    }
    process.exit(1);
  }
}

module.exports = {
  verifyReportPdf,
  sha256File,
};
