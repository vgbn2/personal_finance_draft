'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTimedText } = require('../../shared/lib/analysis/youtube_ingestor');

test('youtube_ingestor: parseTimedText handles XML srv1 and JSON3 formats', () => {
  // 1. XML srv1 / srv3 TimedText
  const xmlSample = `
    <?xml version="1.0" encoding="utf-8" ?>
    <transcript>
      <text start="0.5" dur="2.1">hello world</text>
      <text start="2.6" dur="1.8">testing &amp; verified</text>
      <text start="4.5" dur="3.0">bitcoin breaking 68k</text>
    </transcript>
  `;

  const parsedXml = parseTimedText(xmlSample);
  assert.equal(parsedXml.length, 3);
  assert.equal(parsedXml[0].startMs, 500);
  assert.equal(parsedXml[0].durMs, 2100);
  assert.equal(parsedXml[0].text, 'hello world');
  assert.equal(parsedXml[1].text, 'testing & verified');
  assert.equal(parsedXml[2].text, 'bitcoin breaking 68k');

  // 2. JSON3 format
  const jsonSample = JSON.stringify({
    events: [
      { tStartMs: 100, dDurationMs: 1200, segs: [{ utf8: 'eurusd ' }, { utf8: 'dumping' }] },
      { tStartMs: 1400, dDurationMs: 1800, segs: [{ utf8: 'support at 1.0800' }] }
    ]
  });

  const parsedJson = parseTimedText(jsonSample);
  assert.equal(parsedJson.length, 2);
  assert.equal(parsedJson[0].startMs, 100);
  assert.equal(parsedJson[0].durMs, 1200);
  assert.equal(parsedJson[0].text, 'eurusd dumping');
  assert.equal(parsedJson[1].text, 'support at 1.0800');
});
