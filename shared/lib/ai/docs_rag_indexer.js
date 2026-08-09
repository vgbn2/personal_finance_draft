'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const INDEX_CACHE_PATH = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'docs_rag_index.json');
const DOCUMENTATION_MANIFEST_PATH = path.join('docs', 'documentation_manifest.json');
const INDEX_VERSION = 'sovereign.docs_rag/v2';
const CORPUS_MODES = new Set(['canonical', 'historical', 'all']);

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d',
  'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more',
  'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought',
  'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t',
  'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s',
  'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself',
  'yourselves', 'const', 'function', 'return', 'let', 'var', 'import', 'require', 'export', 'module', 'class', 'type'
]);

function tokenize(text) {
  if (typeof text !== 'string') return [];
  const words = text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ') // Strip code blocks
    .replace(/`([^`]+)`/g, '$1') // Strip inline code backticks
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return words;
}

function chunkMarkdownFile(filePath, repoRoot = REPO_ROOT) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  if (!content.trim()) return [];

  const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  const lines = content.split(/\r?\n/);
  const chunks = [];
  let currentHeader = 'Preamble';
  let currentLine = 1;
  let buffer = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const headerMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headerMatch) {
      if (buffer.length > 0) {
        const text = buffer.join('\n').trim();
        if (text) {
          chunks.push({
            file: relPath,
            header: currentHeader,
            line: currentLine,
            content: text,
            tokens: tokenize(text),
          });
        }
      }
      currentHeader = headerMatch[1].trim();
      currentLine = lineNum;
      buffer = [line];
    } else {
      buffer.push(line);
    }
  });

  if (buffer.length > 0) {
    const text = buffer.join('\n').trim();
    if (text) {
      chunks.push({
        file: relPath,
        header: currentHeader,
        line: currentLine,
        content: text,
        tokens: tokenize(text),
      });
    }
  }

  return chunks;
}

function scanMarkdownFiles(dirs = ['docs', 'workspace'], repoRoot = REPO_ROOT) {
  const filePaths = [];
  function walk(dir) {
    const fullDir = path.join(repoRoot, dir);
    if (!fs.existsSync(fullDir)) return;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(fullDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'target' && entry.name !== 'build' && entry.name !== '.git') {
          walk(path.relative(repoRoot, fullPath));
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        filePaths.push(fullPath);
      }
    }
  }
  dirs.forEach(walk);
  return filePaths.sort();
}

function readDocumentationManifest(repoRoot = REPO_ROOT) {
  const manifestPath = path.join(repoRoot, DOCUMENTATION_MANIFEST_PATH);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schema_version !== 'sovereign.documentation_manifest/v1' || !Array.isArray(manifest.documents)) {
    throw new Error('docs/documentation_manifest.json has an unsupported schema');
  }
  return manifest;
}

function resolveCorpusFiles(corpus, repoRoot = REPO_ROOT) {
  if (!CORPUS_MODES.has(corpus)) {
    throw new Error(`Unsupported documentation corpus: ${corpus}`);
  }
  const manifest = readDocumentationManifest(repoRoot);
  const canonical = manifest.documents
    .filter((document) => ['canonical', 'supporting'].includes(document.status))
    .map((document) => path.join(repoRoot, document.path))
    .filter((filePath) => filePath.endsWith('.md') && fs.existsSync(filePath));
  const historical = scanMarkdownFiles(manifest.historical_corpus?.roots || [], repoRoot);
  const files = corpus === 'canonical'
    ? canonical
    : corpus === 'historical'
      ? historical
      : [...canonical, ...historical];
  return [...new Set(files)].sort();
}

function buildDocsIndex(opts = {}) {
  const repoRoot = opts.repoRoot || REPO_ROOT;
  const manifest = opts.dirs ? null : readDocumentationManifest(repoRoot);
  const corpus = opts.dirs ? 'explicit' : (opts.corpus || manifest.default_corpus || 'canonical');
  const filePaths = opts.dirs
    ? scanMarkdownFiles(opts.dirs, repoRoot)
    : resolveCorpusFiles(corpus, repoRoot);

  const chunks = [];
  filePaths.forEach((filePath) => {
    const fileChunks = chunkMarkdownFile(filePath, repoRoot);
    chunks.push(...fileChunks);
  });

  // TF-IDF Index Construction
  const N = chunks.length;
  const docFreq = new Map();

  chunks.forEach((chunk, chunkId) => {
    chunk.id = chunkId;
    const uniqueTokens = new Set(chunk.tokens);
    uniqueTokens.forEach((token) => {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    });
  });

  const termIndex = {};
  docFreq.forEach((df, token) => {
    const idf = Math.log((N + 1) / (df + 1)) + 1;
    termIndex[token] = { df, idf };
  });

  const indexPayload = {
    version: INDEX_VERSION,
    corpus,
    input_roots: opts.dirs ? [...opts.dirs].sort() : [],
    created_at: new Date().toISOString(),
    total_docs: N,
    file_count: filePaths.length,
    term_count: Object.keys(termIndex).length,
    terms: termIndex,
    chunks: chunks.map((c) => ({
      id: c.id,
      file: c.file,
      header: c.header,
      line: c.line,
      content: c.content,
      tokenCount: c.tokens.length,
    })),
  };

  if (opts.save !== false) {
    const savePath = opts.indexPath || INDEX_CACHE_PATH;
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, JSON.stringify(indexPayload, null, 2));
  }

  return indexPayload;
}

function loadOrBuildIndex(opts = {}) {
  const indexPath = opts.indexPath || INDEX_CACHE_PATH;
  const requestedCorpus = opts.dirs ? 'explicit' : (opts.corpus || readDocumentationManifest(opts.repoRoot || REPO_ROOT).default_corpus || 'canonical');
  const requestedRoots = opts.dirs ? [...opts.dirs].sort() : [];
  if (!opts.forceRebuild) {
    try {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const cachedRoots = Array.isArray(data?.input_roots) ? data.input_roots : [];
      const rootsMatch = JSON.stringify(cachedRoots) === JSON.stringify(requestedRoots);
      if (data && data.version === INDEX_VERSION && data.corpus === requestedCorpus && rootsMatch && Array.isArray(data.chunks)) {
        return data;
      }
    } catch {}
  }
  return buildDocsIndex(opts);
}

function searchDocs(query, opts = {}) {
  const index = opts.index || loadOrBuildIndex(opts);
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return { ok: true, query, results: [], total_results: 0 };
  }

  const scores = new Map();

  queryTokens.forEach((token) => {
    const termData = index.terms[token];
    if (!termData) return;
    const idf = termData.idf;

    index.chunks.forEach((chunk) => {
      // Calculate Term Frequency (TF)
      const chunkTokens = tokenize(chunk.content);
      const tf = chunkTokens.filter((t) => t === token).length;
      if (tf > 0) {
        const score = (tf / (chunkTokens.length || 1)) * idf;
        scores.set(chunk.id, (scores.get(chunk.id) || 0) + score);
      }
    });
  });

  const limit = Math.max(1, opts.limit || 5);
  const results = Array.from(scores.entries())
    .map(([id, score]) => {
      const chunk = index.chunks[id];
      return {
        score: Math.round(score * 10000) / 10000,
        file: chunk.file,
        header: chunk.header,
        line: chunk.line,
        snippet: chunk.content.slice(0, 300) + (chunk.content.length > 300 ? '...' : ''),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    ok: true,
    query,
    results,
    total_results: results.length,
  };
}

module.exports = {
  tokenize,
  chunkMarkdownFile,
  scanMarkdownFiles,
  readDocumentationManifest,
  resolveCorpusFiles,
  buildDocsIndex,
  loadOrBuildIndex,
  searchDocs,
  DOCUMENTATION_MANIFEST_PATH,
  INDEX_CACHE_PATH,
  INDEX_VERSION,
};
